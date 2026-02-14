import express from "express";
import crypto from "crypto";
import { pool } from "./db";
import { insertOutboxEvent } from "./outbox";
import { v4 as uuidv4 } from "uuid";
import { publishOutboxBatch } from "./publisher";



const app = express();
app.use(express.json());

const isProduction = process.env.NODE_ENV === "production";

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const errorResponse = (error: string, err: unknown): { error: string; message?: string } =>
  isProduction ? { error } : { error, message: errorMessage(err) };

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/db-health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT 1 as ok");
    res.json({ db: "ok", result: result.rows[0] });
  } catch (err) {
    console.error("db health check failed", err);
    res.status(500).json({ db: "error", ...errorResponse("db health check failed", err) });
  }
});

app.get("/documents", async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, title, body, created_at, updated_at
      FROM documents
      ORDER BY created_at DESC
      `
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("failed to fetch documents", err);
    return res.status(500).json(errorResponse("failed to fetch documents", err));
  }
});

app.get("/documents/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT id, title, body, created_at, updated_at
      FROM documents
      WHERE id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "document not found" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("failed to fetch document", err);
    return res.status(500).json(errorResponse("failed to fetch document", err));
  }
});

app.get("/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 10;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10;
  // Add offset parsing
  const offsetRaw = typeof req.query.offset === "string" ? Number(req.query.offset) : 0;
  const offset = Number.isFinite(offsetRaw) ? Math.min(Math.max(offsetRaw, 0), 1000) : 0;

  if (!q) {
    return res.status(400).json({ error: "query parameter 'q' is required" });
  }
  const totalResult = await pool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM search_documents
    WHERE search_tsv @@ websearch_to_tsquery('english', $1)
    `,
    [q]
  );

  const total = totalResult.rows[0]?.total ?? 0;

  try {
  
    // Time the full search operation for logging purposes
    const t0 = Date.now();

    const result = await pool.query(
      `
      SELECT
        document_id,
        title,
        body,
        updated_at,
        indexed_at,
        ts_rank(search_tsv, websearch_to_tsquery('english', $1)) AS rank,
        ts_headline(
          'english',
          body,
          websearch_to_tsquery('english', $1),
          'MaxWords=30, MinWords=10, ShortWord=3, HighlightAll=true'
        ) AS snippet
      FROM search_documents
      WHERE search_tsv @@ websearch_to_tsquery('english', $1)
      ORDER BY rank DESC, updated_at DESC, document_id DESC
      LIMIT $2
      OFFSET $3
      `,
      [q, limit, offset]
    );

    let mode: "fts" | "trgm" = "fts";
    let rows = result.rows;

    if (rows.length === 0) {
      mode = "trgm";

      const trgm = await pool.query(
        `
        SELECT
          document_id,
          title,
          body,
          updated_at,
          indexed_at,
          similarity(title, $1) AS title_sim
        FROM search_documents
        WHERE similarity(title, $1) > 0.2
        ORDER BY similarity(title, $1) DESC,
                updated_at DESC,
                document_id DESC
        LIMIT $2
        OFFSET $3
        `,
        [q, limit, offset]
      );
      rows = trgm.rows;
    }

    const responseTotal = mode === "fts" ? total : null;

    // Log the search query and results in a structured format
    const t1 = Date.now();

    console.log(
      JSON.stringify({
        level: "info",
        msg: "search",
        requestId: (req as any).requestId,
        q,
        mode,
        limit,
        offset,
        total: responseTotal,
        results: rows.length,
        durationMs: t1 - t0
      })
    );

    return res.json({
      query: q,
      mode,
      total: responseTotal,
      limit,
      offset,
      count: rows.length,
      results: rows
    });

  } catch (err) {
    console.error("failed to search documents", err);
    return res.status(500).json(errorResponse("failed to search documents", err));
  }

});

app.post("/documents", async (req, res) => {
  const { title, body } = req.body ?? {};

  if (typeof title !== "string" || title.trim() === "") {
    return res.status(400).json({ error: "title is required" });
  }
  if (typeof body !== "string") {
    return res.status(400).json({ error: "body is required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const id = uuidv4();

    const docResult = await client.query(
      `
      INSERT INTO documents (id, title, body)
      VALUES ($1, $2, $3)
      RETURNING id, title, body, created_at, updated_at
      `,
      [id, title, body]
    );

    const row = docResult.rows[0];
    const outboxId = uuidv4();

    const payload = {
      type: "document.upserted.v1",
      meta: {
        event_id: uuidv4(),
        producer: "api",
        occurred_at: new Date().toISOString(),
        schema_version: 1
      },
      data: {
        document_id: row.id,
        title: row.title,
        body: row.body,
        updated_at: row.updated_at
      }
    };

    await insertOutboxEvent(client, {
      id: outboxId,
      event_type: "document.upserted.v1",
      payload
    });

    await client.query("COMMIT");
    return res.status(201).json(row);
  } catch (err) {
    console.error("create document failed", err);
    await client.query("ROLLBACK");
    return res.status(500).json(errorResponse("failed to create document", err));
  } finally {
    client.release();
  }
});

app.post("/outbox/publish-once", async (req, res) => {
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 10;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await publishOutboxBatch(client, Number.isFinite(limit) ? limit : 10);
    await client.query("COMMIT");
    return res.json(result);
  } catch (err) {
    console.error("failed to publish outbox batch", err);
    await client.query("ROLLBACK");
    return res.status(500).json(errorResponse("failed to publish outbox batch", err));
  } finally {
    client.release();
  }
});

// Middleware to assign a unique request ID for tracing
app.use((req, res, next) => {
  const requestId = req.header("x-request-id") ?? crypto.randomUUID();
  (req as any).requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});
app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1_000_000;

    const requestId = (req as any).requestId;

    // Structured log (JSON line)
    console.log(
      JSON.stringify({
        level: "info",
        msg: "request",
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(ms * 100) / 100
      })
    );
  });

  next();
});

// Not Found Response Handler
app.use((req, res) => {
  res.status(404).json({
    error: "not_found",
    message: `Route ${req.method} ${req.path} does not exist`
  });
});

// Global Error Handler
app.use((
  err: unknown,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction
) => {
  console.error("Unhandled error:", err);

  res.status(500).json({
    error: "internal_server_error",
    message: "An unexpected error occurred"
  });
});

const port = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));

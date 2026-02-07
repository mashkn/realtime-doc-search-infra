import express from "express";
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

  if(!q) {
    return res.status(400).json({ error: "query parameter 'q' is required" });
  }

  try {
    // Simple search: case-insensitive substring match on title or body
    const result = await pool.query(
      `
      SELECT document_id, title, body, updated_at, indexed_at
      FROM search_documents
      WHERE title ILIKE '%' || $1 || '%'
          OR body ILIKE '%' || $1 || '%'
      ORDER BY updated_at DESC
      LIMIT $2
      `,
      [q, limit]
    );
    return res.json({ query: q, count: result.rowCount ?? 0, results: result.rows });
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

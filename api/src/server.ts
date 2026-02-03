import express from "express";
import { pool } from "./db";
import { insertOutboxEvent } from "./outbox";
import { v4 as uuidv4 } from "uuid";



const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/db-health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT 1 as ok");
    res.json({ db: "ok", result: result.rows[0] });
  } catch (err) {
    res.status(500).json({ db: "error" });
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
    return res.status(500).json({ error: "failed to fetch documents" });
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
    return res.status(500).json({ error: "failed to fetch document" });
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

    const eventId = uuidv4();
    const payload = {
      type: "document.upserted",
      data: {
        document_id: row.id,
        title: row.title,
        body: row.body,
        updated_at: row.updated_at
      }
    };

    await insertOutboxEvent(client, {
      id: eventId,
      event_type: "document.upserted",
      payload
    });

    await client.query("COMMIT");
    return res.status(201).json(row);
  } catch (err) {
  console.error("create document failed", err);
  await client.query("ROLLBACK");
  return res.status(500).json({ error: "failed to create document" });
} finally {
    client.release();
  }
});




const port = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));

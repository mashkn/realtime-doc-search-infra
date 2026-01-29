import express from "express";
import { pool } from "./db";
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

  const id = uuidv4();

  try {
    const result = await pool.query(
      `
      INSERT INTO documents (id, title, body)
      VALUES ($1, $2, $3)
      RETURNING id, title, body, created_at, updated_at
      `,
      [id, title, body]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: "failed to create document" });
  }
});



const port = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));

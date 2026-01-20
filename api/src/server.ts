import express from "express";
import { pool } from "./db";

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

const port = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));

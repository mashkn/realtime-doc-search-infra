import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString: DATABASE_URL });

type OutboxRow = {
  id: string;
  event_type: string;
  payload: any;
};

async function processOnce(limit = 10) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Grab published events that we haven't indexed yet.
    // For now we’ll use a simple approach: index everything that is published.
    const { rows } = await client.query<OutboxRow>(
      `
      SELECT id, event_type, payload
      FROM outbox_events
      WHERE published_at IS NOT NULL
      AND indexed_at IS NULL
      ORDER BY published_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED

      `,
      [limit]
    );

    for (const r of rows) {
      if (r.event_type !== "document.upserted.v1") {
    await client.query(`UPDATE outbox_events SET indexed_at = now() WHERE id = $1`, [r.id]);
    continue;
  }

  const data = r.payload?.data;
  if (!data?.document_id) {
    await client.query(`UPDATE outbox_events SET indexed_at = now() WHERE id = $1`, [r.id]);
    continue;
  }
      await client.query(
        `
        INSERT INTO search_documents (document_id, title, body, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (document_id) DO UPDATE
        SET title = EXCLUDED.title,
            body = EXCLUDED.body,
            updated_at = EXCLUDED.updated_at,
            indexed_at = now()
        `,
        [data.document_id, data.title, data.body, data.updated_at]
      );

      // IMPORTANT: we need a way to not re-index the same event forever.
      // We'll mark it as "consumed" by the indexer.
      await client.query(
        `
        UPDATE outbox_events
        SET indexed_at = now()
        WHERE id = $1
        `,
        [r.id]
      );
    }

    await client.query("COMMIT");
    return rows.length;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  console.log("Indexer starting...");
  while (true) {
    try {
      const processed = await processOnce(10);
      if (processed > 0) console.log(`Indexed ${processed} events`);
    } catch (e) {
      console.error("Indexer error:", e);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

main();

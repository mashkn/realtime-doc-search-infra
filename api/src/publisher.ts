import { PoolClient } from "pg";

type OutboxRow = {
  id: string;
  event_type: string;
  payload: any;
};

export async function publishOutboxBatch(client: PoolClient, limit = 10) {
  // 1) lock a batch so concurrent calls don't double-process
  const { rows } = await client.query<OutboxRow>(
    `
    SELECT id, event_type, payload
    FROM outbox_events
    WHERE published_at IS NULL
    ORDER BY created_at ASC
    LIMIT $1
    FOR UPDATE SKIP LOCKED
    `,
    [limit]
  );

  // Nothing to do
  if (rows.length === 0) return { published: 0 };

  // 2) "Publish" (for now: log)
  for (const r of rows) {
    console.log("[PUBLISH]", r.event_type, r.id, r.payload);
  }

  // 3) Mark published
  const ids = rows.map((r) => r.id);
  await client.query(
    `
    UPDATE outbox_events
    SET published_at = now()
    WHERE id = ANY($1::uuid[])
    `,
    [ids]
  );

  return { published: rows.length };
}

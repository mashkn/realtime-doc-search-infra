import { PoolClient } from "pg";

export async function insertOutboxEvent(
  client: PoolClient,
  event: { id: string; event_type: string; payload: unknown }
) {
  await client.query(
    `
    INSERT INTO outbox_events (id, event_type, payload)
    VALUES ($1, $2, $3::jsonb)
    `,
    [event.id, event.event_type, JSON.stringify(event.payload)]
  );
}

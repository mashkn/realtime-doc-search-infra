CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ NULL
);

-- Helps the publisher find “next events to publish”
CREATE INDEX IF NOT EXISTS outbox_events_unpublished_idx
ON outbox_events (created_at)
WHERE published_at IS NULL;

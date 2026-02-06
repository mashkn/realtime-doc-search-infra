ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS indexed_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_events_pending_index
ON outbox_events (published_at)
WHERE published_at IS NOT NULL AND indexed_at IS NULL;

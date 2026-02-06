CREATE TABLE IF NOT EXISTS search_documents (
  document_id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Simple search acceleration (we’ll improve later with full-text)
CREATE INDEX IF NOT EXISTS search_documents_updated_at_idx
ON search_documents (updated_at DESC);

-- Enable trigram matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Indexes to accelerate ILIKE / similarity searches
CREATE INDEX IF NOT EXISTS search_documents_title_trgm_idx
ON search_documents USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS search_documents_body_trgm_idx
ON search_documents USING GIN (body gin_trgm_ops);

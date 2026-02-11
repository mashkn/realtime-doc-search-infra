-- 1) Add generated-ish column we maintain via trigger
ALTER TABLE search_documents
  ADD COLUMN IF NOT EXISTS search_tsv tsvector;

-- 2) Backfill existing rows
UPDATE search_documents
SET search_tsv =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(body,  '')), 'B')
WHERE search_tsv IS NULL;

-- 3) Index for fast full-text search
CREATE INDEX IF NOT EXISTS search_documents_search_tsv_gin
ON search_documents USING GIN (search_tsv);

-- 4) Trigger to keep tsvector updated on insert/update
CREATE OR REPLACE FUNCTION search_documents_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.body,  '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_search_documents_tsv ON search_documents;

CREATE TRIGGER trg_search_documents_tsv
BEFORE INSERT OR UPDATE OF title, body
ON search_documents
FOR EACH ROW
EXECUTE FUNCTION search_documents_tsv_trigger();

-- Remove pgvector embedding column and index
-- This migration is idempotent and will skip if the column/index don't exist

-- Drop index first if it exists
DROP INDEX IF EXISTS articles_embedding_idx;

-- Drop column if it exists
ALTER TABLE articles
  DROP COLUMN IF EXISTS embedding;


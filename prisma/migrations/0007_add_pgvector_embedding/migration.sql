-- Enable pgvector extension (optional - will skip if not available)
-- Note: If pgvector is not installed for your PostgreSQL version, this migration will skip vector features.
-- To install pgvector on macOS: brew install pgvector (then restart PostgreSQL)
-- To install pgvector on Linux: Follow instructions at https://github.com/pgvector/pgvector
-- After installing, you can manually run: CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  -- Try to create extension - will fail gracefully if not available
  PERFORM 1 FROM pg_available_extensions WHERE name = 'vector';
  
  IF FOUND THEN
    CREATE EXTENSION IF NOT EXISTS vector;

    -- Add embedding column (assume 768 dims typical for GTE/E5)
    ALTER TABLE articles
      ADD COLUMN IF NOT EXISTS embedding vector(768);

    -- HNSW or IVFFlat index depending on pgvector version; use ivfflat here
    -- Requires REINDEX if lists change; choose a conservative lists parameter
    CREATE INDEX IF NOT EXISTS articles_embedding_idx
      ON articles
      USING ivfflat (embedding vector_l2_ops)
      WITH (lists = 100);
  ELSE
    RAISE NOTICE 'pgvector extension not available for this PostgreSQL version. Skipping embedding column creation.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- If extension creation fails for any reason, log and continue
  RAISE NOTICE 'Could not set up pgvector: %. Skipping embedding column creation.', SQLERRM;
END $$;



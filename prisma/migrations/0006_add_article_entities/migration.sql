-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Article entities table
CREATE TABLE IF NOT EXISTS article_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  text text NOT NULL,
  canonical text NULL,
  type text NOT NULL,
  salience double precision NULL,
  start integer NULL,
  "end" integer NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS article_entities_article_id_idx ON article_entities(article_id);
CREATE INDEX IF NOT EXISTS article_entities_text_idx ON article_entities USING gin (to_tsvector('simple', text));
CREATE INDEX IF NOT EXISTS article_entities_canonical_idx ON article_entities(canonical);
CREATE INDEX IF NOT EXISTS article_entities_type_idx ON article_entities(type);

-- Denormalized tsvector on articles for entity boosting
ALTER TABLE articles ADD COLUMN IF NOT EXISTS entities_tsv tsvector NULL;
CREATE INDEX IF NOT EXISTS articles_entities_tsv_idx ON articles USING gin (entities_tsv);



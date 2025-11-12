CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TYPE feed_status AS ENUM ('idle', 'fetching', 'success', 'warning', 'error');
CREATE TYPE article_status AS ENUM ('pending', 'ingested', 'enriched', 'failed');
CREATE TYPE enrichment_status AS ENUM ('pending', 'processing', 'success', 'failed');
CREATE TYPE fetch_status AS ENUM ('scheduled', 'running', 'success', 'failure', 'skipped');

CREATE TABLE feeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    category TEXT,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    fetch_interval_minutes INTEGER NOT NULL DEFAULT 30,
    last_fetch_status feed_status DEFAULT 'idle',
    last_fetch_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_id UUID NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    canonical_url TEXT,
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT,
    author TEXT,
    language TEXT,
    keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
    status article_status NOT NULL DEFAULT 'pending',
    content_hash TEXT,
    published_at TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    search_vector TSVECTOR
);

CREATE UNIQUE INDEX articles_feed_source_url_idx ON articles (feed_id, source_url);
CREATE UNIQUE INDEX articles_content_hash_uidx ON articles (content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX articles_canonical_url_idx ON articles (canonical_url);
CREATE INDEX articles_published_at_idx ON articles (published_at DESC);
CREATE INDEX articles_language_idx ON articles (language);
CREATE INDEX articles_status_idx ON articles (status);
CREATE INDEX articles_fetched_at_idx ON articles (fetched_at DESC);
CREATE INDEX articles_search_vector_idx ON articles USING GIN (search_vector);

CREATE TABLE article_metadata (
    article_id UUID PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
    enrichment_status enrichment_status NOT NULL DEFAULT 'pending',
    enriched_at TIMESTAMPTZ,
    retries INTEGER NOT NULL DEFAULT 0,
    open_graph JSONB,
    twitter_card JSONB,
    metadata JSONB,
    favicon_url TEXT,
    hero_image_url TEXT,
    content_type TEXT,
    language_confidence JSONB,
    reading_time_seconds INTEGER,
    word_count INTEGER,
    error_message TEXT
);

CREATE TABLE fetch_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_id UUID NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    status fetch_status NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    error_message TEXT,
    error_stack TEXT,
    metrics JSONB,
    context JSONB
);

CREATE INDEX fetch_logs_feed_id_idx ON fetch_logs (feed_id);
CREATE INDEX fetch_logs_status_idx ON fetch_logs (status);
CREATE INDEX fetch_logs_started_at_idx ON fetch_logs (started_at DESC);


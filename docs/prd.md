PRD: RSS Ingestion & Enrichment API
1. Overview
Goal: Deliver a backend service that ingests RSS feeds, normalizes and enriches article data, stores it in PostgreSQL, and exposes queryable APIs for search, filters, and metadata consumers.
Users: Internal product teams building dashboards or customer-facing interfaces; data science teams needing curated news datasets; integration partners consuming structured feeds.
2. Objectives & Success Metrics
Primary Objectives
Automate ingest of selected RSS feeds on a schedule with error resiliency.
Normalize and deduplicate articles globally by `source_url`, capturing references to source feeds.
Enrich articles with metadata (Open Graph, title/description, favicon, canonical URL, content type, language, word count, etc.).
Provide RESTful/GraphQL APIs with search and filter capabilities (date ranges, source, topic, language, keywords).
Support pagination, sorting, and simple relevance scoring.
Success Metrics
99% of scheduled ingestions succeed over rolling 7 days.
Metadata enrichment success rate ≥95% of unique URLs.
API p95 latency ≤300ms for typical filter/search queries.
Support at least 50 feeds and 100k stored articles without degradation.
Monitoring alerts for feed failures and enrichment errors with actionable logs.
3. Scope
In Scope
Feed Management
Admin list of RSS feeds with metadata (URL, title, category, frequency, tags).
CRUD operations on feed catalog via internal admin API or config file.
Operational Admin Interface
Next.js dashboard for feed management, article exploration, metrics, logs, and API key controls.
Ingestion Pipeline
Scheduled or on-demand fetch of RSS feeds (cron, queue-based).
Parsing of standard RSS/Atom formats; graceful handling of malformed feeds.
Duplicate detection using URL canonicalization plus global `source_url` checks; retain the newest record and surface maintenance scripts to prune older duplicates.
Retry policy for transient fetch errors.
Data Model
PostgreSQL schemas for feeds, articles, enrichment metadata, fetch logs.
Indexing strategy for query performance (GIN for full-text, B-Tree for filters).
Enrichment
HTTP fetch with default UA, fallback options, and rate limiting.
Parse HTML metadata (Open Graph, Twitter cards, <meta> tags).
Extract canonical URL, reading time, language detection, publish date normalization, image URLs, favicon, authors, categories/topics if present.
Store enrichment status (success/failure/retry count) and timestamp.
API Layer
REST API endpoints (and optional GraphQL) for:
Listing feeds with stats (last fetch status, number of articles).
Querying articles with filters: feed, feed category, date range, language, keyword search, author, enrichment status.
Full-text search on title & summary (Postgres full-text, ts_vector).
Sorting by publish date, relevance, recency.
Pagination with cursor or limit/offset.
Response shape includes enrichment metadata and raw article fields.
Security & Access
API key or OAuth2 token support.
Rate limiting per consumer.
Monitoring & Observability
Metrics for ingestion latency, errors, enrichment success rate.
Structured logs for fetch errors, parsing failures, enrichment failures.
Basic dashboard (Grafana/New Relic) with alerts.
Infrastructure
Worker service for ingestion and enrichment (could be same service with background jobs).
Deployment on preferred platform (Vercel, AWS, etc.), but not in scope to automate infrastructure.
Out of Scope
Advanced ML-based categorization beyond metadata.
Multi-language translation or summarization.
Real-time push notifications/webhooks.
Public API documentation site (initial draft can be internal README).
4. Requirements
Functional Requirements
Feed Catalog
POST /feeds to add feed (URL, name, category, default fetch interval).
GET /feeds to list feeds with last fetch time/status, article count.
PATCH /feeds/:id and DELETE /feeds/:id.
Ingestion Worker
Cron runs per feed interval.
Fetch uses ETag/Last-Modified headers when available.
Parse entries into canonical article schema.
Queue deduplicated new article URLs for enrichment and expose operator tooling to retry failed enrichments without manual DB intervention.
Article Storage
Schema: article id, feed id, source URL, canonical URL, title, summary, content snippet, published_at, fetched_at, language, tags.
Metadata table: article id, enrichment payload (type-safe JSONB), status, attempts, enriched_at.
Logs table for fetch/enrichment errors.
Enrichment Service
Fetches URL HTML; handles redirects (max 5).
Respect robots.txt? (decision: obey by default and log).
Extract metadata w/ fallback defaults.
Detect content type (article, video, etc.).
Persist results and mark status.
API Endpoints
GET /articles: filters (feedId, feedCategory, language, fromDate, toDate, keywords, hasMedia, enrichmentStatus).
GET /articles/:id: returns article and metadata.
Query results include pagination info, highlight matched keywords.
Support partial text match via q param (maps to full-text search).
Sort options: publishedAt, relevance, fetchedAt.
Admin Interface
Feed catalogue view with create/edit/delete flows, optimistic updates, stats, and an explicit “Ingest feed” trigger for on-demand runs.
Article explorer with filters (feed, language, enrichment status, media, date range) and detail inspector for metadata/debug data, including a “Retry enrichment” control for failed items.
Metrics dashboard visualizing Prometheus counters/latency and queue health.
Fetch log viewer with filterable status/search and detail panels exposing metrics and stack traces.
Settings page for API key rotation, connection testing, and client-side rate limiting guardrails.
Overview screen surfaces pipeline KPIs, feed alerts, recent activity, API route health, article throughput, timeframe controls, and quick remediation actions (add feed, retry enrichment).
Search Behavior
Default sort by publishedAt desc.
Keyword search uses Postgres ts_rank with simple stemming.
Authentication
Simple API key header: X-API-Key.
Admin-only endpoints for feed management.
Monitoring
Expose /health including DB connectivity.
Metrics endpoint (Prometheus format) for ingestion/enrichment counts & durations.
Admin UI surfaces metrics snapshots and log viewers for on-call triage.
Non-Functional Requirements
Performance: ingest <5 seconds per feed (excluding network latency) under normal conditions.
Scalability: design for horizontal scaling of worker/enrichment services.
Reliability: 3 retries for failed fetch/enrichment with exponential backoff.
Maintainability: modular services, typed interfaces, configuration via env vars. Clear logging and error handling.
5. Data Model Sketch
feeds: id, url, name, category, tags[], fetch_interval_minutes, created_at, updated_at, last_fetch_status, last_fetch_at.
articles: id (UUID), feed_id FK, source_url, canonical_url, title, summary, article_body (optional), author, published_at, fetched_at, language, keywords[], created_at.
article_metadata: article_id FK, open_graph JSONB, twitter_card JSONB, favicon_url, hero_image_url, reading_time_seconds, word_count, content_type, enrichment_status, enriched_at, retries.
fetch_logs: id, feed_id, status, error_message, started_at, completed_at.
6. System Architecture
Components
Scheduler (cron) triggers ingestion jobs.
Ingestion service fetches feeds, inserts new articles, enqueues URLs.
Message queue (e.g., Redis, SQS) for enrichment tasks.
Enrichment worker fetches metadata and updates DB.
REST API service (Next.js API routes or dedicated server) for client access.
Tech Choices
Postgres 15 with pgvector? optional (future).
Redis for queues & caching search results.
Worker orchestrator (BullMQ, Temporal, custom).
Node/TypeScript stack with Prisma or Drizzle ORM.
7. Risks & Mitigations
Feed variability: Some feeds may be malformed → implement robust parser, maintain per-feed overrides.
Rate limiting / blocking: Respect robots, set custom user agent, throttle requests, use proxies if necessary.
Duplicate articles: Use canonical URL/resolved URL hash to dedupe.
HTML metadata failures: Cache per-domain rules, degrade gracefully.
Operational load: Add monitoring/alerts before scaling feed count.
8. Future Enhancements (Not in MVP)
Webhook notifications for new articles.
Topic classification and tagging using NLP.
Embedding-based semantic search.
Integration with external analytics.
Role-based access control for multi-team admin usage.
9. Testing & Validation
Unit tests for RSS parsing, dedupe logic, metadata extraction.
Integration tests using mocked feeds and HTTP responses.
Performance tests for API search under load.
End-to-end tests simulating feed ingestion → enrichment → API retrieval.
Monitoring validation: simulate failure to trigger alerts.
10. Rollout Plan
Phase 1: Implement core schema and ingestion for a single feed cohort.
Phase 2: Add enrichment worker and validation.
Phase 3: Expose API endpoints; integrate with internal consumer.
Phase 4: Harden monitoring, add rate limiting, onboarding flow for new feeds.
Go/No-Go: Validate ingestion success rate and API latency targets before expanding feed list.
11. Documentation
Developer setup with env vars, running migrations, local ingestion runners.
API documentation (OpenAPI spec).
Ops playbook: how to add feeds, rotate API keys, handle failures.
Admin UI usage guide covering feed management, article exploration, metrics, and log analysis.

## Recent Updates (2025-11-13)

- Rebuilt the admin `/feeds` experience with a server-driven explorer (dual-pane layout, debounced search, filter drawer for categories/tags/health, cursor-based pagination, and per-feed action shortcuts).
- Added dedicated `/feeds/[feedId]/articles` view reusing the articles tooling with the feed locked in context, plus quick navigation from feed details.
- Extended feeds API to support structured query parameters, aggregate summaries, per-feed lookups, and feed-article convenience endpoints to back the new UI flows.
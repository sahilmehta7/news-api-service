# Architecture Overview

## Services

- `apps/api`: Fastify-based HTTP API serving article, feed, metrics, and operational endpoints. It now exposes task triggers such as `/feeds/:id/ingest` and `/articles/:id/retry-enrichment` to support on-demand recovery workflows.
- `apps/worker`: Background worker that handles scheduled ingestion and enrichment pipelines. The worker performs global deduplication on `sourceUrl`, queues only fresh articles for enrichment, and honours manual ingestion requests published through the API.

## Shared Packages

- `@news-api/config`: Centralized configuration loader using `dotenv` + `zod` for schema validation. Ensures consistent defaults for server, database, ingestion, and enrichment settings.
- `@news-api/logger`: Provides a pre-configured Pino logger with sensible defaults for development and production environments. All services log structured dedupe and retry events through this package.
- `@news-api/db`: Shared Prisma client wrapper exporting generated types and helpers for the `feeds`, `articles`, `article_metadata`, and `fetch_logs` tables. This layer powers the global dedupe queries and cleanup utilities.
- `@news-api/shared`: Placeholder for cross-cutting utilities, domain types, and constants to be expanded as the system evolves.

## Tooling

- Monorepo managed with npm workspaces and Turborepo pipelines for `build`, `dev`, `lint`, `typecheck`, and `test` scripts. Operational scripts (for example `npm run cleanup:dedupe-articles`) live under `scripts/` and can be executed from the workspace root.
- TypeScript configuration shared via `tsconfig.base.json` with path aliases for package imports.
- Each package/service ships with individual `tsconfig.json` files to support isolated builds and type-checking.
- Database migrations managed with Prisma (`npm run prisma:generate`, `npm run prisma:migrate`) with SQL artifacts committed under `prisma/migrations`.

- Manual operations toolkit:
  - `POST /feeds/:id/ingest` schedules a specific feed for immediate processing without restarting workers.
  - `POST /articles/:id/retry-enrichment` resets failed articles back to the queue after clearing their metadata error state.
  - `npm run cleanup:dedupe-articles` removes historic duplicates based solely on `source_url`, keeping the newest record and pruning metadata for the rest.

## Next Steps

- Expand the enrichment pipeline with domain-specific heuristics (language overrides, per-domain rate limits).
- Integrate scheduled execution of maintenance scripts (dedupe, stale article cleanup) into the operational calendar.


# Architecture Overview

## Services

- `apps/api`: Fastify-based HTTP API serving article and feed endpoints. Runs as a separate process and depends on shared logging and configuration packages.
- `apps/worker`: Background worker responsible for ingestion and enrichment pipelines. Currently bootstrapped with structured logging and configuration loading; job orchestration will be implemented in later phases.

## Shared Packages

- `@news-api/config`: Centralized configuration loader using `dotenv` + `zod` for schema validation. Ensures consistent defaults for server, database, ingestion, and enrichment settings.
- `@news-api/logger`: Provides a pre-configured Pino logger with sensible defaults for development and production environments.
- `@news-api/db`: Shared Prisma client wrapper exporting generated types and helpers for the `feeds`, `articles`, `article_metadata`, and `fetch_logs` tables.
- `@news-api/shared`: Placeholder for cross-cutting utilities, domain types, and constants to be expanded as the system evolves.

## Tooling

- Monorepo managed with npm workspaces and Turborepo pipelines for `build`, `dev`, `lint`, `typecheck`, and `test` scripts.
- TypeScript configuration shared via `tsconfig.base.json` with path aliases for package imports.
- Each package/service ships with individual `tsconfig.json` files to support isolated builds and type-checking.
- Database migrations managed with Prisma (`npm run prisma:generate`, `npm run prisma:migrate`) with SQL artifacts committed under `prisma/migrations`.

## Next Steps

- Implement PostgreSQL schema migrations (`Phase 1 · db-schema`).
- Flesh out ingestion and enrichment job runners.
- Expose API routes aligning with the PRD once data layer is complete.


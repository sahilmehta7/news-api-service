#!/usr/bin/env tsx
/**
 * Script to resolve a failed Prisma migration
 * 
 * This marks the failed migration as rolled back so new migrations can be applied.
 * 
 * Usage:
 *   npx tsx scripts/resolve-failed-migration.ts <migration_name>
 * 
 * Example:
 *   npx tsx scripts/resolve-failed-migration.ts 0007_add_pgvector_embedding
 */

import { PrismaClient } from "@news-api/db";

const migrationName = process.argv[2];

if (!migrationName) {
  console.error("Error: Migration name is required");
  console.error("Usage: npx tsx scripts/resolve-failed-migration.ts <migration_name>");
  console.error("Example: npx tsx scripts/resolve-failed-migration.ts 0007_add_pgvector_embedding");
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient();

  try {
    // Find the failed migration
    const failedMigration = await prisma.$queryRaw<Array<{
      migration_name: string;
      finished_at: Date | null;
      applied_steps_count: number;
    }>>`
      SELECT migration_name, finished_at, applied_steps_count
      FROM _prisma_migrations
      WHERE migration_name = ${migrationName}
      ORDER BY started_at DESC
      LIMIT 1
    `;

    if (failedMigration.length === 0) {
      console.error(`Migration ${migrationName} not found in _prisma_migrations table`);
      process.exit(1);
    }

    const migration = failedMigration[0];

    if (migration.finished_at !== null) {
      console.log(`Migration ${migrationName} is already marked as finished`);
      console.log(`Finished at: ${migration.finished_at}`);
      process.exit(0);
    }

    console.log(`Found failed migration: ${migrationName}`);
    console.log(`Applied steps: ${migration.applied_steps_count}`);

    // Mark the migration as rolled back
    await prisma.$executeRaw`
      UPDATE _prisma_migrations
      SET finished_at = NOW(),
          rolled_back_at = NOW()
      WHERE migration_name = ${migrationName}
        AND finished_at IS NULL
    `;

    console.log(`✓ Migration ${migrationName} marked as rolled back`);
    console.log(`You can now re-run: npx prisma migrate deploy`);
  } catch (error) {
    console.error("Error resolving migration:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();


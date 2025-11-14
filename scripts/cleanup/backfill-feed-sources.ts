import { prisma, disconnectPrisma } from "@news-api/db";
import { createLogger } from "@news-api/logger";

const logger = createLogger({ name: "cleanup" }).child({
  task: "backfill-feed-sources"
});

function extractBaseUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch (error) {
    logger.warn(
      {
        url,
        error: error instanceof Error ? error.message : String(error)
      },
      "Failed to parse feed URL"
    );
    return null;
  }
}

async function backfillFeedSources() {
  const feeds = await prisma.feed.findMany({
    select: {
      id: true,
      url: true,
      sourceId: true
    }
  });

  if (feeds.length === 0) {
    logger.info("No feeds found, nothing to backfill");
    return;
  }

  const existingSources = await prisma.source.findMany({
    select: {
      id: true,
      baseUrl: true
    }
  });

  const sourceByBaseUrl = new Map<string, string>(
    existingSources.map((source) => [source.baseUrl, source.id])
  );

  let createdSources = 0;
  let updatedFeeds = 0;
  let skippedFeeds = 0;

  for (const feed of feeds) {
    const baseUrl = extractBaseUrl(feed.url);
    if (!baseUrl) {
      skippedFeeds += 1;
      continue;
    }

    let sourceId = sourceByBaseUrl.get(baseUrl);

    if (!sourceId) {
      const source = await prisma.source.upsert({
        where: { baseUrl },
        update: { updatedAt: new Date() },
        create: {
          baseUrl
        }
      });
      sourceId = source.id;
      sourceByBaseUrl.set(baseUrl, sourceId);
      createdSources += 1;
    }

    if (feed.sourceId === sourceId) {
      continue;
    }

    await prisma.feed.update({
      where: { id: feed.id },
      data: { sourceId }
    });
    updatedFeeds += 1;
  }

  logger.info(
    {
      feeds: feeds.length,
      createdSources,
      updatedFeeds,
      skippedFeeds
    },
    "Feed source backfill complete"
  );
}

async function main() {
  try {
    await backfillFeedSources();
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      "Failed to backfill feed sources"
    );
    process.exitCode = 1;
  } finally {
    await disconnectPrisma();
  }
}

void main();


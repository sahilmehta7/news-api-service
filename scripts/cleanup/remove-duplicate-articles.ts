import { prisma, disconnectPrisma } from "@news-api/db";
import { createLogger } from "@news-api/logger";

const logger = createLogger({ name: "cleanup" });

async function removeDuplicateArticles() {
  const duplicates = await prisma.$queryRaw<
    Array<{ feed_id: string; source_url: string; duplicate_count: bigint }>
  >`
    SELECT feed_id, source_url, COUNT(*) AS duplicate_count
    FROM articles
    GROUP BY feed_id, source_url
    HAVING COUNT(*) > 1
  `;

  if (duplicates.length === 0) {
    logger.info("No duplicate articles found");
    return;
  }

  logger.info({ duplicateGroups: duplicates.length }, "Removing duplicate articles");

  let deletedCount = 0;

  for (const duplicate of duplicates) {
    const articles = await prisma.article.findMany({
      where: {
        feedId: duplicate.feed_id,
        sourceUrl: duplicate.source_url
      },
      orderBy: [
        {
          fetchedAt: "desc"
        },
        {
          createdAt: "desc"
        }
      ],
      select: {
        id: true,
        fetchedAt: true,
        createdAt: true
      }
    });

    if (articles.length <= 1) {
      continue;
    }

    const [latest, ...outdated] = articles;
    const outdatedIds = outdated.map((article) => article.id);

    await prisma.articleMetadata.deleteMany({
      where: {
        articleId: {
          in: outdatedIds
        }
      }
    });

    const { count } = await prisma.article.deleteMany({
      where: {
        id: {
          in: outdatedIds
        }
      }
    });

    deletedCount += count;

    logger.info(
      {
        feedId: duplicate.feed_id,
        sourceUrl: duplicate.source_url,
        keptArticleId: latest.id,
        deletedArticleIds: outdatedIds
      },
      "Removed duplicate articles"
    );
  }

  logger.info({ deletedCount }, "Duplicate article cleanup complete");
}

async function main() {
  try {
    await removeDuplicateArticles();
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      "Failed to remove duplicate articles"
    );
    process.exitCode = 1;
  } finally {
    await disconnectPrisma();
  }
}

void main();


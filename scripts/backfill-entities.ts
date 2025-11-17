import { PrismaClient } from "@news-api/db";
import { extractEntities } from "../apps/worker/src/lib/entities.js";

const prisma = new PrismaClient();

async function main() {
  const batchSize = Number(process.env.BATCH_SIZE ?? 200);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await prisma.$queryRaw<
      { id: string; content_plain: string | null; language: string | null }[]
    >`
      SELECT a.id, am.content_plain, a.language
      FROM articles a
      LEFT JOIN article_metadata am ON am.article_id = a.id
      WHERE a.id NOT IN (SELECT DISTINCT article_id FROM article_entities)
        AND am.content_plain IS NOT NULL
      ORDER BY a.fetched_at ASC
      LIMIT ${batchSize}
    `;

    if (rows.length === 0) break;

    for (const row of rows) {
      const entities = await extractEntities(row.content_plain ?? "", row.language);
      await prisma.$transaction([
        prisma.articleEntity.deleteMany({ where: { articleId: row.id } }),
        ...(entities.length > 0
          ? [
              prisma.articleEntity.createMany({
                data: entities.map((e) => ({
                  articleId: row.id,
                  text: e.text,
                  canonical: e.canonical ?? null,
                  type: e.type,
                  salience: e.salience ?? null,
                  start: e.start ?? null,
                  end: e.end ?? null
                }))
              }),
              prisma.$executeRawUnsafe(
                `UPDATE articles SET entities_tsv = to_tsvector('simple', $1) WHERE id = $2::uuid`,
                entities.map((e) => e.text).join(" "),
                row.id
              )
            ]
          : [])
      ]);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});



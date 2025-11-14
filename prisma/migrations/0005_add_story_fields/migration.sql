-- AlterTable
ALTER TABLE "articles" ADD COLUMN "story_id" TEXT;

-- CreateIndex
CREATE INDEX "articles_story_id_idx" ON "articles"("story_id");

-- CreateTable
CREATE TABLE "stories" (
    "id" UUID NOT NULL,
    "title_rep" TEXT,
    "summary" TEXT,
    "keywords" JSONB,
    "time_range_start" TIMESTAMPTZ(6),
    "time_range_end" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);


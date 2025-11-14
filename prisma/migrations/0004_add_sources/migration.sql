-- CreateTable
CREATE TABLE "sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "base_url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sources_base_url_key" ON "sources"("base_url");

-- AlterTable
ALTER TABLE "feeds"
ADD COLUMN "source_id" UUID;

-- CreateIndex
CREATE INDEX "feeds_source_id_idx" ON "feeds"("source_id");

-- AddForeignKey
ALTER TABLE "feeds"
ADD CONSTRAINT "feeds_source_id_fkey"
FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;


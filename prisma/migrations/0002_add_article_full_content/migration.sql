-- Add columns to store raw and cleaned article content
ALTER TABLE "article_metadata"
ADD COLUMN "raw_content_html" TEXT,
ADD COLUMN "content_plain" TEXT;


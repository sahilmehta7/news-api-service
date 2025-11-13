CREATE TYPE log_operation AS ENUM ('fetch', 'feed_import');

ALTER TABLE "fetch_logs"
ADD COLUMN "operation" log_operation NOT NULL DEFAULT 'fetch';

ALTER TABLE "fetch_logs"
ALTER COLUMN "feed_id" DROP NOT NULL;


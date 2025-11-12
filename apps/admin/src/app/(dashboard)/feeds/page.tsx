"use client";

import { FeedStats } from "@/components/feeds/feed-stats";
import { FeedTable } from "@/components/feeds/feed-table";
import { useFeeds } from "@/lib/api/feeds";

export default function FeedsPage() {
  const { data } = useFeeds();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Feeds</h1>
        <p className="text-sm text-muted-foreground">
          Manage RSS sources, review ingestion status, and monitor enrichment throughput.
        </p>
      </div>
      <FeedStats feeds={data} />
      <FeedTable />
    </div>
  );
}


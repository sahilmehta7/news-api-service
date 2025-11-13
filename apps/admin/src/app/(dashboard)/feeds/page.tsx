"use client";

import Link from "next/link";

import { FeedStats } from "@/components/feeds/feed-stats";
import { FeedTable } from "@/components/feeds/feed-table";
import { Button } from "@/components/ui/button";
import { useFeeds } from "@/lib/api/feeds";

export default function FeedsPage() {
  const { data } = useFeeds();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Feeds</h1>
          <p className="text-sm text-muted-foreground">
            Manage RSS sources, review ingestion status, and monitor enrichment throughput.
          </p>
        </div>
        <Button asChild size="sm" className="w-full sm:w-auto">
          <Link href="/feeds/import">Bulk import feeds</Link>
        </Button>
      </div>
      <FeedStats feeds={data} />
      <FeedTable />
    </div>
  );
}


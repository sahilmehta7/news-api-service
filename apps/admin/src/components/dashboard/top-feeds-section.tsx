import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { DashboardSnapshot } from "@/lib/dashboard/types";

type TopFeedsSectionProps = {
  pipeline: DashboardSnapshot["pipeline"];
};

export function TopFeedsSection({ pipeline }: TopFeedsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Top feeds by ingestion volume
        </CardTitle>
        <CardDescription>
          Highest article throughput across the reporting window.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pipeline.topFeeds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No feed throughput data available yet.
          </p>
        ) : (
          <ul className="space-y-4">
            {pipeline.topFeeds.map((feed) => (
              <li key={feed.feedId}>
                <div className="flex items-center justify-between text-sm font-medium">
                  <span className="truncate">{feed.feedId}</span>
                  <span>{formatNumber(feed.articles)}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{
                      width: `${computeBarWidth(feed.articles, pipeline.topFeeds)}%`
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/dashboard/feeds"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Manage feeds
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}

function computeBarWidth(
  value: number,
  feeds: DashboardSnapshot["pipeline"]["topFeeds"]
) {
  const max = feeds.reduce((acc, feed) => Math.max(acc, feed.articles), 0);
  if (max === 0) return 0;
  const percentage = Math.round((value / max) * 100);
  return Math.max(8, percentage);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}


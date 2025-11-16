import { Suspense } from "react";
import Link from "next/link";

import { ActivityFeedSection } from "@/components/dashboard/activity-feed-section";
import { AlertsSection } from "@/components/dashboard/alerts-section";
import { ApiOverviewSection } from "@/components/dashboard/api-overview-section";
import { ArticlesThroughputSection } from "@/components/dashboard/articles-throughput-section";
import { PipelineHealthSection } from "@/components/dashboard/pipeline-health-section";
import { RetryFailedEnrichmentButton } from "@/components/dashboard/retry-failed-enrichment-button";
import { TimeframeControls } from "@/components/dashboard/timeframe-controls";
import { TopFeedsSection } from "@/components/dashboard/top-feeds-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DashboardWindow } from "@/lib/dashboard/get-dashboard-snapshot";
import { getDashboardSnapshot } from "@/lib/dashboard/get-dashboard-snapshot";

export const revalidate = 30;

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function DashboardSections({ snapshot }: { snapshot: Awaited<ReturnType<typeof getDashboardSnapshot>> }) {
  return (
    <>
      <PipelineHealthSection pipeline={snapshot.pipeline} />

      <div className="grid gap-4 xl:grid-cols-[2fr,1fr]">
        <ArticlesThroughputSection articles={snapshot.articles} />
        <AlertsSection alerts={snapshot.feedAlerts} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr,1fr]">
        <ActivityFeedSection activity={snapshot.activity} />
        <TopFeedsSection pipeline={snapshot.pipeline} />
      </div>

      <ApiOverviewSection api={snapshot.api} />
    </>
  );
}

export default async function DashboardPage(props: DashboardPageProps) {
  const searchParams = await props.searchParams;
  const windowParam = parseWindow(searchParams?.window);
  const snapshot = await getDashboardSnapshot(windowParam);

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
            <p className="text-sm text-muted-foreground">
              Monitor ingestion throughput, enrichment backlog, and API health at a
              glance.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <TimeframeControls />
            <div className="flex items-center gap-2">
              <Button asChild size="sm">
                <Link href="/dashboard/feeds">Add feed</Link>
              </Button>
              <RetryFailedEnrichmentButton size="sm" />
            </div>
          </div>
        </div>
        <TimeframeSummary
          window={snapshot.meta.window.label}
          generatedAt={snapshot.meta.generatedAt}
        />
      </header>

      <Suspense fallback={<DashboardLoadingSkeleton />}>
        <DashboardSections snapshot={snapshot} />
      </Suspense>

      <Card>
        <CardContent className="py-4 text-xs text-muted-foreground">
          Last refreshed:{" "}
          {snapshot.meta.generatedAt
            ? new Date(snapshot.meta.generatedAt).toLocaleString()
            : "—"}
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-32 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-4 xl:grid-cols-[2fr,1fr]">
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[2fr,1fr]">
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="h-32 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

function parseWindow(
  value: string | string[] | undefined
): DashboardWindow {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (normalized === "12h" || normalized === "24h" || normalized === "7d") {
    return normalized;
  }
  return "24h";
}

function TimeframeSummary({
  window,
  generatedAt
}: {
  window: DashboardWindow;
  generatedAt: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/30 px-4 py-2 text-xs">
      <span className="font-medium uppercase tracking-wide text-muted-foreground">
        Window
      </span>
      <span className="rounded bg-background px-2 py-1 font-medium">
        {window.toUpperCase()}
      </span>
      <span className="text-muted-foreground">
        Refreshed {new Date(generatedAt).toLocaleTimeString()}
      </span>
    </div>
  );
}


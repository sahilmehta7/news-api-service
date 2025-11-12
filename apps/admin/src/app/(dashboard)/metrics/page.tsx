"use client";

import { useMemo } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useMetricsSummary } from "@/lib/metrics/summary";

export default function MetricsPage() {
  const { data, error, isLoading } = useMetricsSummary();

  const maxIngestion = useMemo(
    () =>
      Math.max(
        1,
        ...(data?.worker.topFeeds.map((feed) => feed.articles) ?? [1])
      ),
    [data?.worker.topFeeds]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Metrics</h1>
        <p className="text-sm text-muted-foreground">
          Monitor ingestion throughput, enrichment health, and API performance.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/60 bg-destructive/10 p-4 text-sm text-destructive">
          Unable to load metrics. Verify that the API and worker metrics endpoints are reachable.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Ingestion success"
          description="Completed ingestion runs"
          value={formatNumber(data?.worker.ingestionByStatus.success ?? 0)}
          isLoading={isLoading}
        />
        <MetricCard
          title="Ingestion failures"
          description="Failed ingestion attempts"
          value={formatNumber(data?.worker.ingestionByStatus.failed ?? 0)}
          accent="text-destructive"
          isLoading={isLoading}
        />
        <MetricCard
          title="Enrichment success"
          description="Articles enriched successfully"
          value={formatNumber(data?.worker.enrichmentByStatus.success ?? 0)}
          isLoading={isLoading}
        />
        <MetricCard
          title="Enrichment failures"
          description="Failed enrichment attempts"
          value={formatNumber(data?.worker.enrichmentByStatus.failed ?? 0)}
          accent="text-destructive"
          isLoading={isLoading}
        />
        <MetricCard
          title="Queue size"
          description="Enrichment jobs awaiting processing"
          value={formatNumber(data?.worker.queueSize ?? 0)}
          isLoading={isLoading}
        />
        <MetricCard
          title="API error rate"
          description="Share of requests returning 4xx/5xx"
          value={formatPercent(data?.api.errorRate ?? 0)}
          accent={(data?.api.errorRate ?? 0) > 0.05 ? "text-destructive" : undefined}
          isLoading={isLoading}
        />
        <MetricCard
          title="API avg latency"
          description="Mean HTTP response duration"
          value={
            data?.api.avgLatencyMs != null
              ? `${data.api.avgLatencyMs.toFixed(1)} ms`
              : "—"
          }
          isLoading={isLoading}
        />
        <MetricCard
          title="API requests"
          description="Total routed requests observed"
          value={formatNumber(data?.api.totalRequests ?? 0)}
          isLoading={isLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top feeds by ingestion volume</CardTitle>
            <CardDescription>
              Highest article throughput across the last reporting window.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <SkeletonRows />
            ) : data?.worker.topFeeds.length ? (
              <div className="space-y-3">
                {data.worker.topFeeds.map((feed) => (
                  <div key={feed.feedId}>
                    <div className="flex items-center justify-between text-sm font-medium">
                      <span>{feed.feedId}</span>
                      <span>{formatNumber(feed.articles)}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary transition-all"
                        style={{
                          width: `${Math.max(
                            4,
                            Math.round((feed.articles / maxIngestion) * 100)
                          )}%`
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No ingestion data available yet." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API routes</CardTitle>
            <CardDescription>
              Highest throughput endpoints with error rates.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <SkeletonRows />
            ) : data?.api.routes.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Route</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Error rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.api.routes.map((route) => (
                    <TableRow key={route.route}>
                      <TableCell className="font-medium">{route.route}</TableCell>
                      <TableCell className="text-right text-sm">
                        {formatNumber(route.total)}
                      </TableCell>
                      <TableCell
                        className={`text-right text-sm ${
                          route.errorRate > 0.05 ? "text-destructive font-medium" : "text-muted-foreground"
                        }`}
                      >
                        {formatPercent(route.errorRate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-6">
                <EmptyState message="No API requests recorded yet." />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="text-xs text-muted-foreground">
        Last refreshed: {data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : "—"}
      </div>
    </div>
  );
}

function MetricCard({
  title,
  description,
  value,
  accent,
  isLoading
}: {
  title: string;
  description: string;
  value: string;
  accent?: string;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-8 w-24 rounded bg-muted animate-pulse" />
        ) : (
          <div className={`text-3xl font-semibold ${accent ?? ""}`}>{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(Math.round(value));
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function SkeletonRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-5 w-full rounded bg-muted animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground">{message}</p>;
}


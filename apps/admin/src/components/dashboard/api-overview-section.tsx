import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { DashboardSnapshot } from "@/lib/dashboard/types";

type ApiOverviewSectionProps = {
  api: DashboardSnapshot["api"];
};

export function ApiOverviewSection({ api }: ApiOverviewSectionProps) {
  const cards = [
    {
      title: "Total requests",
      value: formatNumber(api.totalRequests),
      description: "Requests observed in the current window"
    },
    {
      title: "Error rate",
      value: formatPercent(api.errorRate),
      description: "Share of requests returning 4xx/5xx",
      accent: api.errorRate > 0.05 ? "text-destructive" : undefined
    },
    {
      title: "Avg latency",
      value: api.avgLatencyMs != null ? `${api.avgLatencyMs.toFixed(1)} ms` : "—",
      description: "Mean HTTP response time"
    }
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">API health</CardTitle>
          <CardDescription>
            High-level service performance metrics.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {cards.map((card) => (
              <div key={card.title} className="rounded-lg border border-border/80 p-4">
                <p className="text-xs text-muted-foreground">{card.title}</p>
                <p className={`mt-2 text-2xl font-semibold ${card.accent ?? ""}`}>
                  {card.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Top API routes</CardTitle>
          <CardDescription>
            Throughput and error rates for active endpoints.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-0">
          {api.topRoutes.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No API traffic recorded for this window.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Error rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {api.topRoutes.map((route) => (
                  <TableRow key={route.route}>
                    <TableCell className="font-medium">{route.route}</TableCell>
                    <TableCell className="text-right text-sm">
                      {formatNumber(route.total)}
                    </TableCell>
                    <TableCell
                      className={`text-right text-sm ${route.errorRate > 0.05 ? "text-destructive font-medium" : "text-muted-foreground"}`}
                    >
                      {formatPercent(route.errorRate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Link
            href="/dashboard/metrics"
            className="mb-4 inline-flex items-center gap-1 px-6 text-xs font-medium text-primary hover:underline"
          >
            View detailed metrics
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(Math.round(value));
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}


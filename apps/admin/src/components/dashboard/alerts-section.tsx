import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardSnapshot } from "@/lib/dashboard/types";

type AlertsSectionProps = {
  alerts: DashboardSnapshot["feedAlerts"];
};

export function AlertsSection({ alerts }: AlertsSectionProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold">Feed alerts</CardTitle>
        <Badge variant="secondary">
          {alerts.length > 0 ? `${alerts.length} open` : "Healthy"}
        </Badge>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-muted p-4 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            All feeds are healthy. No intervention required.
          </div>
        ) : (
          <div className="space-y-4">
            <ul className="space-y-3">
              {alerts.map((alert) => (
                <li
                  key={alert.feedId}
                  className="rounded-lg border border-border/80 bg-muted/30 p-4"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      className={`mt-0.5 h-4 w-4 ${
                        alert.severity === "error"
                          ? "text-destructive"
                          : "text-amber-500"
                      }`}
                    />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span>{alert.message}</span>
                        <Badge
                          variant={alert.severity === "error" ? "destructive" : "outline"}
                        >
                          {alert.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Last observed {formatRelativeTime(alert.lastSeenAt)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Link
              href="/dashboard/feeds"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Review affected feeds
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatRelativeTime(timestamp: string) {
  try {
    const date = new Date(timestamp);
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    const diffMs = date.getTime() - Date.now();
    const diffMinutes = Math.round(diffMs / (60 * 1000));
    if (Math.abs(diffMinutes) < 60) {
      return formatter.format(diffMinutes, "minutes");
    }
    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) {
      return formatter.format(diffHours, "hours");
    }
    const diffDays = Math.round(diffHours / 24);
    return formatter.format(diffDays, "days");
  } catch {
    return "recently";
  }
}


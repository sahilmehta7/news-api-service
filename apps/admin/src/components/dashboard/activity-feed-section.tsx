import { ArrowUpRight, History } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardSnapshot } from "@/lib/dashboard/types";

type ActivityFeedSectionProps = {
  activity: DashboardSnapshot["activity"];
};

const STATUS_STYLES: Record<
  DashboardSnapshot["activity"][number]["status"],
  string
> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-destructive"
};

export function ActivityFeedSection({ activity }: ActivityFeedSectionProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-semibold">
            Recent activity
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Latest ingestion, enrichment, and system events.
          </p>
        </div>
        <Link
          href="/dashboard/logs"
          className="text-xs font-medium text-primary hover:underline"
        >
          View all
        </Link>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-muted p-4 text-sm text-muted-foreground">
            <History className="h-4 w-4" />
            No recent events recorded for this window.
          </div>
        ) : (
          <ul className="space-y-5">
            {activity.map((item) => (
              <li key={item.id} className="relative pl-6">
                <span
                  className={`absolute left-0 top-2 h-2 w-2 rounded-full ${STATUS_STYLES[item.status]}`}
                />
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>{item.title}</span>
                  <time className="text-xs text-muted-foreground">
                    {formatTimestamp(item.occurredAt)}
                  </time>
                </div>
                {item.detail ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.detail}
                  </p>
                ) : null}
                {item.href ? (
                  <Link
                    href={item.href}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Inspect in logs
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function formatTimestamp(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}


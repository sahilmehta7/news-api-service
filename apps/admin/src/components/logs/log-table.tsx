import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type { LogEntry } from "@/lib/api/types";
import { formatRelativeTime } from "@/lib/utils/format-relative-time";
import { formatErrorMessage } from "@/lib/utils/format-error-message";

type LogTableProps = {
  logs: LogEntry[] | undefined;
  loading?: boolean;
  error?: Error;
  onSelectLog?: (log: LogEntry) => void;
};

const formatOperation = (operation: LogEntry["operation"]) => {
  if (operation === "feed_import") {
    return "Bulk import";
  }

  return "Fetch";
};

export function LogTable({ logs, loading, error, onSelectLog }: LogTableProps) {
  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
        Loading logs…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-sm text-destructive">
        Failed to load logs. Please try again.
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Feed</TableHead>
            <TableHead>Operation</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Error</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs && logs.length > 0 ? (
            logs.map((log) => (
              <TableRow
                key={log.id}
                className={onSelectLog ? "cursor-pointer hover:bg-muted/40" : undefined}
                onClick={() => onSelectLog?.(log)}
              >
                <TableCell>
                  <div className="font-medium">
                    {log.feedName ??
                      (log.operation === "feed_import" ? "Bulk import" : "Unknown feed")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {log.feedId ?? (log.operation === "feed_import" ? "N/A" : "—")}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {formatOperation(log.operation)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={log.status} />
                </TableCell>
                <TableCell className="text-sm">
                  {formatRelativeTime(log.startedAt)}
                </TableCell>
                <TableCell className="text-sm">
                  {log.durationMs != null ? `${Math.round(log.durationMs)} ms` : "—"}
                </TableCell>
                <TableCell className="max-w-sm text-sm">
                  {log.errorMessage ? (
                    <span className="text-destructive">{formatErrorMessage(log.errorMessage)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                No fetch logs found for the selected filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  if (normalized === "success") {
    return <Badge>Success</Badge>;
  }
  if (normalized === "failure") {
    return <Badge variant="destructive">Failure</Badge>;
  }
  if (normalized === "running") {
    return <Badge variant="secondary">Running</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}


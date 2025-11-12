"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { LogEntry } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { Copy } from "lucide-react";

type LogDetailProps = {
  log: LogEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function LogDetail({ log, open, onOpenChange }: LogDetailProps) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setCopied(false);
    }
  }, [open]);

  async function handleCopyStack() {
    if (!log?.errorStack) return;
    try {
      await navigator.clipboard.writeText(log.errorStack);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        {log ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between gap-2">
                <span>Fetch attempt · {log.feedName ?? log.feedId}</span>
                <Badge variant={badgeVariant(log.status)}>{log.status}</Badge>
              </DialogTitle>
              <DialogDescription>
                Started {formatDistanceToNow(new Date(log.startedAt), { addSuffix: true })} ·{" "}
                Duration {log.durationMs != null ? `${Math.round(log.durationMs)} ms` : "—"}
              </DialogDescription>
            </DialogHeader>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase text-muted-foreground">Context</h2>
              <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Feed ID</dt>
                  <dd className="font-medium">{log.feedId}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Started at</dt>
                  <dd className="font-medium">{new Date(log.startedAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Finished at</dt>
                  <dd className="font-medium">
                    {log.finishedAt ? new Date(log.finishedAt).toLocaleString() : "—"}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase text-muted-foreground">Metrics</h2>
              <JsonPanel data={log.metrics} emptyMessage="No metrics recorded for this run." />
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase text-muted-foreground">Context payload</h2>
              <JsonPanel data={log.context} emptyMessage="No context payload attached." />
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase text-muted-foreground">Errors</h2>
              {log.errorMessage ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {log.errorMessage}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No errors recorded.</p>
              )}
              {log.errorStack ? (
                <div className="space-y-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={handleCopyStack}>
                    <Copy className="h-4 w-4" />
                    {copied ? "Copied stack trace" : "Copy stack trace"}
                  </Button>
                  <pre className="max-h-60 overflow-auto rounded-md bg-muted/30 p-3 text-xs leading-relaxed">
                    {log.errorStack}
                  </pre>
                </div>
              ) : null}
            </section>
          </>
        ) : (
          <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
            Select a log entry to inspect details.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function JsonPanel({
  data,
  emptyMessage
}: {
  data: Record<string, unknown> | null | undefined;
  emptyMessage: string;
}) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <pre className="max-h-60 overflow-auto rounded-md bg-muted/30 p-3 text-xs leading-relaxed">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function badgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const normalized = status.toLowerCase();
  if (normalized === "success") {
    return "default";
  }
  if (normalized === "running") {
    return "secondary";
  }
  if (normalized === "failure") {
    return "destructive";
  }
  return "outline";
}


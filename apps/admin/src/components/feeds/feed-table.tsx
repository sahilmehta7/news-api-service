import * as React from "react";
import {
  Badge,
  BadgeProps
} from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { CreateFeedDialog, EditFeedDialog } from "@/components/feeds/feed-dialogs";
import { useFeedList, deleteFeed, requestFeedIngestion } from "@/lib/api/feeds";
import { formatDistanceToNow } from "date-fns";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function FeedTable() {
  const {
    data: feedList,
    error,
    isLoading,
    mutate
  } = useFeedList({
    limit: 50,
    sort: "name",
    order: "asc"
  });
  const feeds = feedList?.data ?? [];
  const [ingestingId, setIngestingId] = React.useState<string | null>(null);

  const handleDelete = React.useCallback(
    async (id: string) => {
      const confirmed = window.confirm(
        "Are you sure you want to deactivate this feed? The feed will be marked as inactive and will no longer be fetched, but its articles will be preserved."
      );
      if (!confirmed) return;

      try {
        await deleteFeed(id);
        toast.success("Feed deactivated");
        void mutate();
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error ? error.message : "Failed to deactivate feed"
        );
      }
    },
    [mutate]
  );

  const handleIngest = React.useCallback(
    async (id: string) => {
      setIngestingId(id);
      try {
        await requestFeedIngestion(id);
        toast.success("Feed ingestion requested");
        void mutate();
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error ? error.message : "Failed to request ingestion"
        );
      } finally {
        setIngestingId(null);
      }
    },
    [mutate]
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-sm text-destructive">
        Failed to load feeds. Ensure the API key is valid and the API server is running.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Feed catalogue</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void mutate();
            }}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <CreateFeedDialog
            onCreated={() => {
              void mutate();
            }}
          />
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Articles</TableHead>
              <TableHead>Last fetch</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {feeds.length > 0 ? (
              feeds.map((feed) => (
                <TableRow key={feed.id}>
                  <TableCell>
                    <div className="font-medium">{feed.name}</div>
                    <div className="space-y-0.5 text-xs text-muted-foreground">
                      <div>{feed.category ?? "Uncategorized"}</div>
                      {feed.source ? <div>{feed.source.baseUrl}</div> : null}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                    {feed.url}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={feed.lastFetchStatus ?? "idle"} />
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">
                      {feed.stats.articleCount}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {feed.tags.length ? feed.tags.join(", ") : "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {feed.lastFetchAt
                      ? formatDistanceToNow(new Date(feed.lastFetchAt), {
                          addSuffix: true
                        })
                      : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={() => void handleIngest(feed.id)}
                        disabled={ingestingId === feed.id}
                      >
                        <RefreshCw className="h-4 w-4" />
                        <span className="sr-only">Ingest feed</span>
                      </Button>
                      <EditFeedDialog
                        feed={feed}
                        onUpdated={() => {
                          void mutate();
                        }}
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => void handleDelete(feed.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete feed</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No feeds registered yet. Add your first feed to start ingesting articles.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: BadgeProps["variant"] =
    status === "success"
      ? "default"
      : status === "fetching"
      ? "secondary"
      : status === "warning"
      ? "secondary"
      : status === "error"
      ? "destructive"
      : "outline";

  const label =
    status === "idle"
      ? "Idle"
      : status === "fetching"
      ? "Fetching"
      : status === "success"
      ? "Success"
      : status === "warning"
      ? "Warning"
      : status === "error"
      ? "Error"
      : status;

  return <Badge variant={variant}>{label}</Badge>;
}


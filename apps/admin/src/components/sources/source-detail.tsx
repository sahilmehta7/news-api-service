"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Link2, Loader2 } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type { SourceListItem } from "@/lib/api/types";
import { useSourceFeeds } from "@/lib/api/sources";
import { formatDistanceToNow } from "date-fns";

type SourceDetailSheetProps = {
  source: SourceListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SourceDetailSheet({ source, open, onOpenChange }: SourceDetailSheetProps) {
  const { data: feedsData, isLoading: feedsLoading } = useSourceFeeds(
    source?.id ?? null,
    { limit: 20 }
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Source details</SheetTitle>
          <SheetDescription>
            Review feed coverage and navigate to the associated feed catalogue.
          </SheetDescription>
        </SheetHeader>

        {source ? (
          <div className="mt-6 space-y-6">
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase text-muted-foreground">Base URL</h2>
              <p className="break-all text-sm font-medium text-foreground">{source.baseUrl}</p>
            </section>

            <section className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-2">
              <Stat label="Feeds" value={source.stats.feedCount.toLocaleString()} />
              <Stat label="Active feeds" value={source.stats.activeFeedCount.toLocaleString()} />
              <Stat label="Created" value={formatDate(source.createdAt)} />
              <Stat label="Updated" value={formatDate(source.updatedAt)} />
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase text-muted-foreground">
                Quick actions
              </h3>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm" className="gap-2">
                  <Link href={`/feeds?q=${encodeURIComponent(source.baseUrl)}`}>
                    <Link2 className="h-4 w-4" />
                    View related feeds
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    void navigator.clipboard?.writeText(source.baseUrl).catch(() => {});
                  }}
                >
                  <ExternalLink className="h-4 w-4" />
                  Copy base URL
                </Button>
              </div>
            </section>

            {source.stats.feedCount > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase text-muted-foreground">
                  Associated feeds ({source.stats.feedCount})
                </h3>
                {feedsLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : feedsData?.data && feedsData.data.length > 0 ? (
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>URL</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Last fetch</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {feedsData.data.map((feed) => (
                          <TableRow key={feed.id}>
                            <TableCell className="font-medium">{feed.name}</TableCell>
                            <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                              {feed.url}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {feed.category ?? "—"}
                            </TableCell>
                            <TableCell>
                              <StatusBadge
                                status={feed.isActive ? "active" : "inactive"}
                                fetchStatus={feed.lastFetchStatus}
                              />
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {feed.lastFetchAt
                                ? formatDate(feed.lastFetchAt)
                                : "Never"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No feeds found
                  </div>
                )}
              </section>
            )}
          </div>
        ) : (
          <div className="mt-6 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Select a source from the list to view details.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return "Unknown";
  }
}

function StatusBadge({
  status,
  fetchStatus
}: {
  status: "active" | "inactive";
  fetchStatus?: string | null;
}) {
  const variant: BadgeProps["variant"] =
    status === "active" ? "default" : "secondary";

  return (
    <Badge variant={variant} className="text-xs">
      {status === "active" ? "Active" : "Inactive"}
      {fetchStatus && ` • ${fetchStatus}`}
    </Badge>
  );
}


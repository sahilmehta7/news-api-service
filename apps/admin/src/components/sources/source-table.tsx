import * as React from "react";
import { formatRelativeTime } from "@/lib/utils/format-relative-time";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type { SourceListItem } from "@/lib/api/types";

type SourceTableProps = {
  sources: SourceListItem[];
  onSelect?: (source: SourceListItem) => void;
};

export function SourceTable({ sources, onSelect }: SourceTableProps) {
  if (sources.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No sources found. Adjust your search or check back later.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Base URL</TableHead>
            <TableHead className="text-right">Feeds</TableHead>
            <TableHead className="text-right">Active feeds</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.map((source) => (
            <TableRow key={source.id}>
              <TableCell className="max-w-md break-all font-medium">
                {source.baseUrl}
              </TableCell>
              <TableCell className="text-right text-sm font-medium">
                {source.stats.feedCount.toLocaleString()}
              </TableCell>
              <TableCell className="text-right text-sm text-muted-foreground">
                {source.stats.activeFeedCount.toLocaleString()}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatRelative(source.createdAt)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatRelative(source.updatedAt)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => onSelect?.(source)}
                >
                  <ExternalLink className="h-4 w-4" />
                  Details
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function SourceTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableBody>
          {Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={index}>
              <TableCell colSpan={6}>
                <div className="h-12 w-full animate-pulse rounded-md bg-muted/40" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function formatRelative(date: string) {
  try {
    return formatRelativeTime(date);
  } catch {
    return "Unknown";
  }
}


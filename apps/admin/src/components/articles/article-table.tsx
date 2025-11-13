import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { ArrowDown, ArrowUp, ExternalLink, Loader2, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type { Article } from "@/lib/api/types";
import { cn } from "@/lib/utils";

type SortKey = "publishedAt" | "fetchedAt" | "relevance";

type ArticleTableProps = {
  articles: Article[] | undefined;
  loading?: boolean;
  error?: Error;
  sort?: SortKey;
  order?: "asc" | "desc";
  onSortChange?: (sort: SortKey, order: "asc" | "desc") => void;
  onSelectArticle?: (article: Article) => void;
  onResetFilters?: () => void;
  isRefetching?: boolean;
};

export function ArticleTable({
  articles,
  loading,
  error,
  sort,
  order = "desc",
  onSortChange,
  onSelectArticle,
  onResetFilters,
  isRefetching
}: ArticleTableProps) {
  if (loading && !articles) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
        Loading articles…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-sm text-destructive">
        Failed to load articles. Please try again.
      </div>
    );
  }

  const isSorted = (key: SortKey) => sort === key;

  return (
    <div className="relative overflow-hidden rounded-lg border bg-background overflow-x-auto">
      {isRefetching ? (
        <div className="absolute inset-x-0 top-0 z-10 flex h-9 items-center justify-center bg-muted/70 text-xs text-muted-foreground backdrop-blur-sm">
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          Updating results…
        </div>
      ) : null}
      <Table className="min-w-full table-fixed lg:min-w-[900px]">
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="w-[360px]">Title</TableHead>
            <TableHead className="w-[180px]">Feed</TableHead>
            <TableHead className="w-[120px]">Status</TableHead>
            <SortableHead
              label="Published"
              active={isSorted("publishedAt")}
              order={order}
              onClick={() => {
                if (!onSortChange) return;
                const nextOrder = isSorted("publishedAt") && order === "desc" ? "asc" : "desc";
                onSortChange("publishedAt", nextOrder);
              }}
            />
            <SortableHead
              label="Fetched"
              active={isSorted("fetchedAt")}
              order={order}
              onClick={() => {
                if (!onSortChange) return;
                const nextOrder = isSorted("fetchedAt") && order === "desc" ? "asc" : "desc";
                onSortChange("fetchedAt", nextOrder);
              }}
            />
            <TableHead className="w-[100px]">Language</TableHead>
            <TableHead className="w-[120px] text-right">Reading time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {articles && articles.length > 0 ? (
            articles.map((article) => (
              <TableRow
                key={article.id}
                className={cn("align-top", onSelectArticle && "cursor-pointer hover:bg-muted/50")}
                onClick={() => onSelectArticle?.(article)}
              >
                <TableCell>
                  <div className="flex gap-3">
                    <div className="hidden h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border bg-muted sm:block">
                      {article.heroImageUrl ? (
                        <img
                          src={article.heroImageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                          No image
                        </span>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-start gap-2">
                        <div className="line-clamp-2 font-medium leading-snug">{article.title}</div>
                        <button
                          type="button"
                          className="mt-0.5 text-muted-foreground transition hover:text-foreground"
                          onClick={(event) => {
                            event.stopPropagation();
                            window.open(article.sourceUrl, "_blank", "noopener,noreferrer");
                          }}
                          aria-label="Open article"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{article.summary ?? "No summary available"}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium leading-tight">{article.feedName}</div>
                  <div className="text-xs text-muted-foreground">
                    {article.feedCategory ?? "Uncategorized"}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={article.enrichmentStatus ?? "pending"} />
                </TableCell>
                <TableCell className="text-sm">
                  {article.publishedAt
                    ? formatDistanceToNow(new Date(article.publishedAt), {
                        addSuffix: true
                      })
                    : "Unknown"}
                </TableCell>
                <TableCell className="text-sm">
                  {formatDistanceToNow(new Date(article.fetchedAt), {
                    addSuffix: true
                  })}
                </TableCell>
                <TableCell className="text-sm uppercase">{article.language ?? "—"}</TableCell>
                <TableCell className="text-right text-sm">
                  {article.readingTimeSeconds
                    ? `${Math.max(1, Math.round(article.readingTimeSeconds / 60))} min`
                    : "—"}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={7} className="py-12 text-center text-sm">
                <div className="mx-auto max-w-sm space-y-3">
                  <div className="text-base font-medium text-foreground">No articles match these filters</div>
                  <p className="text-sm text-muted-foreground">
                    Try adjusting your filters or clearing them to see more results.
                  </p>
                  {onResetFilters ? (
                    <button
                      type="button"
                      onClick={onResetFilters}
                      className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      Reset filters
                    </button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

type SortableHeadProps = {
  label: string;
  active: boolean;
  order: "asc" | "desc";
  onClick: () => void;
};

function SortableHead({ label, active, order, onClick }: SortableHeadProps) {
  return (
    <TableHead>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex items-center gap-1 text-left text-sm font-medium transition hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground"
        )}
        aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}
      >
        <span>{label}</span>
        <SortIcon active={active} order={order} />
      </button>
    </TableHead>
  );
}

function SortIcon({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active) {
    return <Minus className="h-3.5 w-3.5 opacity-60" aria-hidden />;
  }
  return order === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5" aria-hidden />
  ) : (
    <ArrowDown className="h-3.5 w-3.5" aria-hidden />
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") {
    return <Badge>Success</Badge>;
  }
  if (status === "failed") {
    return <Badge variant="destructive">Failed</Badge>;
  }
  if (status === "processing") {
    return <Badge variant="secondary">Processing</Badge>;
  }
  return <Badge variant="outline">Pending</Badge>;
}


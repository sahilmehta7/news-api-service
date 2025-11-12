import * as React from "react";
import { formatDistanceToNow } from "date-fns";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { ExternalLink } from "lucide-react";
import type { Article } from "@/lib/api/types";

type ArticleTableProps = {
  articles: Article[] | undefined;
  loading?: boolean;
  error?: Error;
  onSelectArticle?: (article: Article) => void;
};

export function ArticleTable({
  articles,
  loading,
  error,
  onSelectArticle
}: ArticleTableProps) {
  if (loading) {
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

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Feed</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Published</TableHead>
            <TableHead>Fetched</TableHead>
            <TableHead>Language</TableHead>
            <TableHead className="text-right">Reading time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {articles && articles.length > 0 ? (
            articles.map((article) => (
              <TableRow
                key={article.id}
                className={onSelectArticle ? "cursor-pointer hover:bg-muted/40" : undefined}
                onClick={() => onSelectArticle?.(article)}
              >
                <TableCell>
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border bg-muted">
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
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium truncate">{article.title}</div>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={(event) => {
                            event.stopPropagation();
                            window.open(article.sourceUrl, "_blank", "noopener,noreferrer");
                          }}
                          aria-label="Open article"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{article.feedName}</div>
                  <div className="text-xs text-muted-foreground">
                    {article.feedCategory ?? "—"}
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
                <TableCell className="text-sm">{article.language ?? "—"}</TableCell>
                <TableCell className="text-right text-sm">
                  {article.readingTimeSeconds
                    ? `${Math.round(article.readingTimeSeconds / 60)}m`
                    : "—"}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                No articles found with the current filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
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


"use client";

import * as React from "react";
import Image from "next/image";
import { ExternalLink, Clock } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils/format-relative-time";
import type { Article } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type ArticleCardProps = {
  article: Article;
  onClick?: (article: Article) => void;
  className?: string;
  showStoryBadge?: boolean; // Show badge for story count when in groupByStory mode
};

export function ArticleCard({ article, onClick, className, showStoryBadge = false }: ArticleCardProps) {
  const publishedAt = article.publishedAt ? new Date(article.publishedAt) : null;
  const relativeTime = publishedAt ? formatRelativeTime(publishedAt) : null;
  const hasMoreArticles = (article.moreCount ?? 0) > 0 && showStoryBadge;

  return (
    <article
      onClick={() => onClick?.(article)}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-all hover:shadow-lg hover:shadow-black/5 cursor-pointer",
        className
      )}
    >
      {/* Hero Image */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {article.heroImageUrl ? (
          <Image
            src={article.heroImageUrl}
            alt=""
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <ExternalLink className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        {/* Source and Time */}
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">{article.feedName}</span>
          {article.feedCategory && (
            <>
              <span>•</span>
              <span className="truncate">{article.feedCategory}</span>
            </>
          )}
          {relativeTime && (
            <>
              <span>•</span>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{relativeTime}</span>
              </div>
            </>
          )}
        </div>

        {/* Title */}
        <h3 className="mb-2 line-clamp-2 text-lg font-semibold leading-tight text-foreground group-hover:text-primary transition-colors">
          {article.title}
        </h3>

        {/* Excerpt/Summary */}
        {(article.summary || article.contentPlain) && (
          <p className="mb-3 line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">
            {article.summary || article.contentPlain}
          </p>
        )}

        {/* Metadata */}
        <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {hasMoreArticles && (
            <Badge variant="secondary" className="text-xs font-medium">
              {article.moreCount} more {article.moreCount === 1 ? "article" : "articles"}
            </Badge>
          )}
          {article.language && (
            <Badge variant="outline" className="text-xs">
              {article.language.toUpperCase()}
            </Badge>
          )}
          {article.readingTimeSeconds && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{Math.round(article.readingTimeSeconds / 60)} min read</span>
            </span>
          )}
          {article.wordCount && (
            <span>{article.wordCount.toLocaleString()} words</span>
          )}
        </div>
      </div>
    </article>
  );
}


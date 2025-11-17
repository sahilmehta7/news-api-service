"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Layers } from "lucide-react";
import { ArticleCard } from "./article-card";
import type { Article } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { useStoryDetail } from "@/lib/api/stories";

type StoryCardProps = {
  article: Article;
  relatedArticles?: Article[];
  onClick?: (article: Article) => void;
  className?: string;
};

export function StoryCard({
  article,
  relatedArticles = [],
  onClick,
  className
}: StoryCardProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const hasRelated = (article.moreCount ?? 0) > 0 || relatedArticles.length > 0;
  const totalCount = (article.moreCount ?? 0) + relatedArticles.length;
  
  // Fetch related articles when expanded and storyId is available
  const storyId = article.storyId ?? null;
  const shouldFetchStory = Boolean(isExpanded && storyId);
  const { data: storyDetail, isLoading: isLoadingRelated } = useStoryDetail(
    shouldFetchStory && storyId ? storyId : "",
    1,
    10
  );
  
  // Use provided relatedArticles or fetch from story detail
  const actualRelatedArticles = React.useMemo(() => {
    if (relatedArticles.length > 0) return relatedArticles;
    if (storyDetail?.articles && isExpanded) {
      // Exclude the current article from related articles
      return storyDetail.articles
        .filter((a) => a.id !== article.id)
        .map((a) => ({
          ...a,
          // Map story detail article format to full Article format
          feedId: a.feedId,
          feedName: a.feedName,
          feedCategory: a.feedCategory,
          content: null,
          contentPlain: null,
          rawContentHtml: undefined,
          hasFullContent: false,
          canonicalUrl: null,
          author: null,
          language: null,
          keywords: [],
          fetchedAt: "",
          enrichmentStatus: null,
          readingTimeSeconds: null,
          wordCount: null,
          heroImageUrl: null,
          faviconUrl: null,
          contentType: null,
          openGraph: null,
          twitterCard: null,
          metadata: null,
          errorMessage: null,
          relevance: undefined,
          moreCount: undefined,
          storyId: storyId ?? null,
          createdAt: "",
          updatedAt: ""
        })) as Article[];
    }
    return [];
  }, [relatedArticles, storyDetail, isExpanded, article.id, storyId]);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Main Article - Larger/Prominent */}
      <div className="relative">
        <ArticleCard
          article={article}
          onClick={onClick}
          className="relative border-primary/20"
        />
        {/* Story Badge - Always show when grouping is enabled, even if no related articles */}
        {hasRelated ? (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-primary/90 px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-md backdrop-blur-sm">
            <Layers className="h-3 w-3" />
            <span>
              {totalCount} {totalCount === 1 ? "article" : "articles"}
            </span>
          </div>
        ) : (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-muted/90 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-md backdrop-blur-sm border border-border">
            <Layers className="h-3 w-3" />
            <span>Single article</span>
          </div>
        )}
      </div>

      {/* Related Articles - Expandable */}
      {hasRelated && (
        <div className="rounded-lg border border-border bg-muted/30">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span>
                {isExpanded ? "Hide" : "Show"} {totalCount} related {totalCount === 1 ? "article" : "articles"} and perspectives
              </span>
            </div>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {isExpanded && (
            <div className="border-t border-border bg-card p-4">
              {isLoadingRelated && !actualRelatedArticles.length ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Loading related articles...
                </div>
              ) : actualRelatedArticles.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {actualRelatedArticles.map((relatedArticle) => (
                    <ArticleCard
                      key={relatedArticle.id}
                      article={relatedArticle}
                      onClick={onClick}
                      className="border-muted"
                    />
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {totalCount > 0
                    ? `${totalCount} more ${totalCount === 1 ? "article" : "articles"} available in this story`
                    : "No related articles available"}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


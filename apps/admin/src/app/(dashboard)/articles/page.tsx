"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";

import { ArticleFilters, type ArticleFiltersValue } from "@/components/articles/article-filters";
import { ArticleTable } from "@/components/articles/article-table";
import { ArticleDetail } from "@/components/articles/article-detail";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import {
  useArticles,
  type ArticleQuery,
  retryFailedArticlesEnrichment
} from "@/lib/api/articles";
import type { ApiError } from "@/lib/api/client";
import { useDebounce } from "@/hooks/use-debounce";
import type { Article } from "@/lib/api/types";
import { toast } from "sonner";

const DEFAULT_PAGE_SIZE = 20;

export default function ArticlesPage() {
  const [page, setPage] = React.useState(1);
  const [filters, setFilters] = React.useState<ArticleFiltersValue>({});
  const [selectedArticle, setSelectedArticle] = React.useState<Article | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [isBulkRetrying, setIsBulkRetrying] = React.useState(false);
  const debouncedFilters = useDebounce(filters, 300);

  React.useEffect(() => {
    if (!detailOpen) {
      const timeout = window.setTimeout(() => setSelectedArticle(null), 200);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [detailOpen]);

  const query: ArticleQuery = {
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    ...cleanFilters(debouncedFilters)
  };

  const { data, error, isLoading, mutate } = useArticles(query);

  const pagination = data?.pagination;

  async function handleRetryFailedEnrichment() {
    try {
      setIsBulkRetrying(true);
      const result = await retryFailedArticlesEnrichment();
      if (result.updated > 0) {
        toast.success(
          `Queued ${result.updated} failed article${result.updated === 1 ? "" : "s"} for enrichment`
        );
        void mutate();
      } else {
        toast.info("No failed articles found to retry");
      }
    } catch (error) {
      const message =
        isApiError(error)
          ? error.message
          : error instanceof Error
            ? error.message
            : "Failed to retry failed articles";
      console.error("Bulk enrichment retry failed", error);
      toast.error(message);
    } finally {
      setIsBulkRetrying(false);
    }
  }

  function handleFiltersChange(values: ArticleFiltersValue) {
    setFilters(values);
    setPage(1);
  }

  function handleSelectArticle(article: Article) {
    setSelectedArticle(article);
    setDetailOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Articles</h1>
          <p className="text-sm text-muted-foreground">
            Search and inspect ingested articles, enrichment metadata, and source signals.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={handleRetryFailedEnrichment}
          disabled={isBulkRetrying}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          {isBulkRetrying ? "Retrying..." : "Retry failed enrichment"}
        </Button>
      </div>

      <ArticleFilters initialFilters={filters} onChange={handleFiltersChange} />

      <ArticleTable
        articles={data?.data}
        loading={isLoading}
        error={error as Error | undefined}
        onSelectArticle={handleSelectArticle}
      />

      {pagination ? (
        <Pagination
          page={page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onPageChange={setPage}
        />
      ) : null}

      <ArticleDetail
        article={selectedArticle}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onRefresh={() => {
          void mutate();
        }}
      />
    </div>
  );
}

function cleanFilters(filters: ArticleFiltersValue): ArticleQuery {
  const normalized: Record<string, string | boolean> = {};

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    if (key === "hasMedia") {
      normalized[key] = value === "true";
      return;
    }

    normalized[key] = value;
  });

  return normalized as ArticleQuery;
}

function isApiError(error: unknown): error is ApiError {
  if (error && typeof error === "object") {
    const candidate = error as { status?: unknown; message?: unknown };
    return (
      typeof candidate.status === "number" && typeof candidate.message === "string"
    );
  }
  return false;
}

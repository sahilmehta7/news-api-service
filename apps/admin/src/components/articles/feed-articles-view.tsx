"use client";

import * as React from "react";
import Link from "next/link";
import {
  useQueryStates,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum
} from "nuqs";
import { RefreshCw, ArrowLeft } from "lucide-react";

import { ArticleFilters, type ArticleFiltersValue } from "@/components/articles/article-filters";
import { ArticleTable } from "@/components/articles/article-table";
import { ArticleToolbar, type SortKey } from "@/components/articles/article-toolbar";
import { ArticleDetail } from "@/components/articles/article-detail";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Pagination } from "@/components/ui/pagination";
import {
  useArticles,
  type ArticleQuery,
  retryFailedArticlesEnrichment
} from "@/lib/api/articles";
import type { ApiError } from "@/lib/api/client";
import type { Article, Feed } from "@/lib/api/types";
import { useDebounce } from "@/hooks/use-debounce";
import { toast } from "sonner";

import { buildArticleQuery, filtersFromState } from "@/lib/articles-query";

const DEFAULT_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

export function FeedArticlesView({ feed }: { feed: Feed }) {
  const searchParamConfig = React.useMemo(
    () => ({
      page: parseAsInteger.withDefault(1),
      q: parseAsString,
      feedId: parseAsString.withDefault(feed.id),
      enrichmentStatus: parseAsString,
      language: parseAsString,
      hasMedia: parseAsString,
      fromDate: parseAsString,
      toDate: parseAsString,
      sort: parseAsStringEnum(["publishedAt", "fetchedAt", "relevance"]).withDefault("publishedAt"),
      order: parseAsStringEnum(["asc", "desc"]).withDefault("desc")
    }),
    [feed.id]
  );

  const [{ page, ...searchState }, setSearchParams] = useQueryStates(searchParamConfig, {
    history: "replace"
  });
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [selectedArticle, setSelectedArticle] = React.useState<Article | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [isBulkRetrying, setIsBulkRetrying] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState(searchState.q ?? "");
  const debouncedSearch = useDebounce(searchInput, SEARCH_DEBOUNCE_MS);

  React.useEffect(() => {
    if (searchState.feedId !== feed.id) {
      void setSearchParams({ feedId: feed.id });
    }
  }, [feed.id, searchState.feedId, setSearchParams]);

  React.useEffect(() => {
    if (!detailOpen) {
      const timeout = window.setTimeout(() => setSelectedArticle(null), 200);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [detailOpen]);

  React.useEffect(() => {
    setSearchInput(searchState.q ?? "");
  }, [searchState.q]);

  React.useEffect(() => {
    const trimmed = debouncedSearch.trim();
    const current = searchState.q ?? "";
    if (trimmed === current) {
      return;
    }

    void setSearchParams({
      q: trimmed.length > 0 ? trimmed : null,
      page: 1
    });
  }, [debouncedSearch, searchState.q, setSearchParams]);

  React.useEffect(() => {
    const hasSearch = Boolean((searchState.q ?? "").trim().length);
    if (hasSearch && searchState.sort !== "relevance") {
      void setSearchParams({ sort: "relevance", order: "desc" });
    }
    if (!hasSearch && searchState.sort === "relevance") {
      void setSearchParams({ sort: "publishedAt", order: "desc" });
    }
  }, [searchState.q, searchState.sort, setSearchParams]);

  const filtersValue = React.useMemo<ArticleFiltersValue>(
    () =>
      filtersFromState({
        feedId: feed.id,
        enrichmentStatus: searchState.enrichmentStatus,
        language: searchState.language,
        hasMedia: searchState.hasMedia,
        fromDate: searchState.fromDate,
        toDate: searchState.toDate
      }),
    [
      feed.id,
      searchState.enrichmentStatus,
      searchState.language,
      searchState.hasMedia,
      searchState.fromDate,
      searchState.toDate
    ]
  );

  const query: ArticleQuery = buildArticleQuery(
    {
      page,
      ...searchState,
      feedId: feed.id
    },
    DEFAULT_PAGE_SIZE
  );

  const { data, error, isLoading, isValidating, mutate } = useArticles(query);

  const pagination = data?.pagination;
  const filtersCount = React.useMemo(
    () => countActiveFilters(filtersValue),
    [filtersValue]
  );
  const activeFilters = React.useMemo(
    () => createActiveFiltersSummary(filtersValue),
    [filtersValue]
  );

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

  function handleSelectArticle(article: Article) {
    setSelectedArticle(article);
    setDetailOpen(true);
  }

  function handleFiltersChange(partial: Partial<ArticleFiltersValue>) {
    const sanitized: Partial<ArticleFiltersValue> = { ...partial };
    if ("feedId" in sanitized) {
      sanitized.feedId = feed.id;
    }

    const values = Object.fromEntries(
      Object.entries(sanitized).map(([key, value]) => [
        key,
        value === undefined || value === "" ? null : value
      ])
    );
    void setSearchParams({
      ...(values as Partial<typeof searchState>),
      feedId: feed.id,
      page: 1
    });
  }

  function handleResetFilters() {
    void setSearchParams({
      feedId: feed.id,
      enrichmentStatus: null,
      language: null,
      hasMedia: null,
      fromDate: null,
      toDate: null,
      page: 1
    });
    setFiltersOpen(false);
  }

  function handleRemoveFilter(key: keyof ArticleFiltersValue) {
    if (key === "feedId") return;
    void setSearchParams({ [key]: null, page: 1 });
  }

  function handleSortChange(nextSort: SortKey, nextOrder?: "asc" | "desc") {
    void setSearchParams({
      sort: nextSort,
      order: nextOrder ?? (searchState.order ?? "desc"),
      page: 1
    });
  }

  function handleToggleSortOrder() {
    const currentOrder = searchState.order === "asc" ? "asc" : "desc";
    const nextOrder = currentOrder === "asc" ? "desc" : "asc";
    void setSearchParams({ order: nextOrder });
  }

  const isRefetching = isValidating && !isLoading;
  const hasSearchTerm = Boolean(searchInput.trim().length);
  const showSearchSpinner = hasSearchTerm && (isLoading || isRefetching);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="gap-2">
              <Link href="/feeds">
                <ArrowLeft className="h-4 w-4" />
                Back to feeds
              </Link>
            </Button>
            <span className="text-xs uppercase text-muted-foreground">
              Feed ID: {feed.id}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{feed.name}</h1>
          <p className="text-sm text-muted-foreground">
            Explore articles ingested from this feed. Filters apply only to this source.
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

      <ArticleToolbar
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onSearchClear={() => {
          setSearchInput("");
          void setSearchParams({ q: null, page: 1 });
        }}
        isSearching={showSearchSpinner}
        sort={(searchState.sort as SortKey) ?? "publishedAt"}
        order={(searchState.order as "asc" | "desc") ?? "desc"}
        onSortChange={(nextSort) => {
          const currentOrder = searchState.order ?? "desc";
          handleSortChange(nextSort, nextSort === searchState.sort ? currentOrder : "desc");
        }}
        onToggleOrder={handleToggleSortOrder}
        onToggleFilters={() => setFiltersOpen((prev) => !prev)}
        filtersOpen={filtersOpen}
        filtersCount={filtersCount}
        activeFilters={activeFilters}
        onRemoveFilter={(key) => handleRemoveFilter(key as keyof ArticleFiltersValue)}
        onResetFilters={handleResetFilters}
      />

      <div className="lg:hidden">
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>Refine the articles shown in the table.</SheetDescription>
            </SheetHeader>
            <div className="mt-6">
              <ArticleFilters
                values={filtersValue}
                onChange={handleFiltersChange}
                onReset={handleResetFilters}
                feedSelectDisabled
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="hidden lg:block">
        {filtersOpen ? (
          <ArticleFilters
            values={filtersValue}
            onChange={handleFiltersChange}
            onReset={handleResetFilters}
            className="bg-card"
            feedSelectDisabled
          />
        ) : null}
      </div>

      <ArticleTable
        articles={data?.data}
        loading={isLoading}
        error={error as Error | undefined}
        sort={(searchState.sort as SortKey) ?? "publishedAt"}
        order={(searchState.order as "asc" | "desc") ?? "desc"}
        onSortChange={handleSortChange}
        isRefetching={isRefetching}
        onResetFilters={filtersCount > 0 ? handleResetFilters : undefined}
        onSelectArticle={handleSelectArticle}
      />

      {pagination ? (
        <Pagination
          page={page ?? 1}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onPageChange={(nextPage) => {
            if (nextPage <= 0) return;
            void setSearchParams({ page: nextPage });
          }}
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

function isApiError(error: unknown): error is ApiError {
  if (error && typeof error === "object") {
    const candidate = error as { status?: unknown; message?: unknown };
    return (
      typeof candidate.status === "number" && typeof candidate.message === "string"
    );
  }
  return false;
}

function countActiveFilters(filters: ArticleFiltersValue) {
  return Object.entries(filters)
    .filter(([key, value]) => key !== "feedId" && value !== undefined && value !== "")
    .length;
}

function createActiveFiltersSummary(filters: ArticleFiltersValue) {
  const entries: Array<{ key: keyof ArticleFiltersValue; label: string; value: string }> = [];

  if (filters.enrichmentStatus) {
    entries.push({
      key: "enrichmentStatus",
      label: "Status",
      value: capitalize(filters.enrichmentStatus)
    });
  }

  if (filters.language) {
    entries.push({ key: "language", label: "Language", value: filters.language });
  }

  if (filters.hasMedia) {
    entries.push({
      key: "hasMedia",
      label: "Media",
      value: filters.hasMedia === "true" ? "Has media" : "No media"
    });
  }

  if (filters.fromDate) {
    entries.push({ key: "fromDate", label: "From", value: filters.fromDate });
  }

  if (filters.toDate) {
    entries.push({ key: "toDate", label: "To", value: filters.toDate });
  }

  return entries;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}



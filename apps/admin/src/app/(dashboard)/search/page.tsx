"use client";

import * as React from "react";
import { useQueryStates, parseAsInteger, parseAsString, parseAsStringEnum } from "nuqs";
import dynamic from "next/dynamic";

import { ArticleCard } from "@/components/articles/article-card";
import { ArticleCardSkeleton } from "@/components/articles/article-card-skeleton";
import { StoryCard } from "@/components/articles/story-card";
import { ArticleToolbar, type SortKey } from "@/components/articles/article-toolbar";
import type { ArticleFiltersValue } from "@/components/articles/article-filters";
import { CategoryTabs } from "@/components/search/category-tabs";
import { Layers } from "lucide-react";

// Dynamically import heavy components to reduce initial bundle size
const ArticleDetail = dynamic(
  () => import("@/components/articles/article-detail").then((mod) => ({ default: mod.ArticleDetail })),
  {
    loading: () => null,
    ssr: false,
  }
);

const ArticleFilters = dynamic(
  () => import("@/components/articles/article-filters").then((mod) => ({ default: mod.ArticleFilters })),
  {
    loading: () => (
      <div className="rounded-lg border p-4">
        <div className="text-sm text-muted-foreground">Loading filters...</div>
      </div>
    ),
    ssr: false,
  }
);

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Pagination } from "@/components/ui/pagination";
import { useSearchArticles, type SearchQuery } from "@/lib/api/search";
import type { ApiError } from "@/lib/api/client";
import { useDebounce } from "@/hooks/use-debounce";
import type { Article } from "@/lib/api/types";
import { useFeedList } from "@/lib/api/feeds";
import { filtersFromState } from "@/lib/articles-query";

const DEFAULT_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

const searchParamConfig = {
  page: parseAsInteger.withDefault(1),
  q: parseAsString,
  feedId: parseAsString,
  feedCategory: parseAsString,
  language: parseAsString,
  fromDate: parseAsString,
  toDate: parseAsString,
  groupByStory: parseAsString
} as const;

export default function SearchPage() {
  const [{ page, ...searchState }, setSearchParams] = useQueryStates(searchParamConfig, {
    history: "replace"
  });
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [selectedArticle, setSelectedArticle] = React.useState<Article | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState(searchState.q ?? "");
  const debouncedSearch = useDebounce(searchInput, SEARCH_DEBOUNCE_MS);
  const { data: feedList } = useFeedList({
    limit: 200,
    sort: "name",
    order: "asc"
  });
  const feeds = feedList?.data ?? [];
  
  // Extract categories from feeds for category tabs
  const availableCategories = React.useMemo(() => {
    const categories = new Set<string>();
    feeds.forEach((feed) => {
      if (feed.category && feed.category.trim()) {
        categories.add(feed.category.trim());
      }
    });
    return Array.from(categories).sort();
  }, [feeds]);

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

  const filtersValue = React.useMemo<ArticleFiltersValue>(
    () =>
      filtersFromState({
        feedId: searchState.feedId,
        feedCategory: searchState.feedCategory,
        language: searchState.language,
        fromDate: searchState.fromDate,
        toDate: searchState.toDate
      }),
    [
      searchState.feedId,
      searchState.feedCategory,
      searchState.language,
      searchState.fromDate,
      searchState.toDate
    ]
  );

  // Convert page to offset for /search endpoint
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;
  const searchQuery: SearchQuery = React.useMemo(
    () => ({
      q: searchState.q ?? undefined,
      from: searchState.fromDate ?? undefined,
      to: searchState.toDate ?? undefined,
      language: searchState.language ?? undefined,
      feedId: searchState.feedId ?? undefined,
      feedCategory: searchState.feedCategory ?? undefined,
      size: DEFAULT_PAGE_SIZE,
      offset,
      groupByStory: searchState.groupByStory === "true"
    }),
    [
      searchState.q,
      searchState.fromDate,
      searchState.toDate,
      searchState.language,
      searchState.feedId,
      searchState.feedCategory,
      searchState.groupByStory,
      offset
    ]
  );

  const { data, error, isLoading, isValidating } = useSearchArticles(searchQuery);
  
  // Track if we're loading new data (different from initial load)
  const isInitialLoad = isLoading && !data;
  const isRefetching = isValidating && data;

  const pagination = data?.pagination;
  const filtersCount = React.useMemo(() => countActiveFilters(filtersValue), [filtersValue]);
  const activeFilters = React.useMemo(() => createActiveFiltersSummary(filtersValue, feeds), [filtersValue, feeds]);

  function handleSelectArticle(article: Article) {
    setSelectedArticle(article);
    setDetailOpen(true);
  }

  function handleFiltersChange(partial: Partial<ArticleFiltersValue>) {
    const values = Object.fromEntries(
      Object.entries(partial).map(([key, value]) => [
        key,
        value === undefined || value === "" ? null : value
      ])
    );
    void setSearchParams({
      ...(values as Partial<typeof searchState>),
      page: 1
    });
  }

  function handleResetFilters() {
    void setSearchParams({
      feedId: null,
      feedCategory: null,
      language: null,
      fromDate: null,
      toDate: null,
      page: 1
    });
    setFiltersOpen(false);
  }

  function handleRemoveFilter(key: keyof ArticleFiltersValue) {
    void setSearchParams({ [key]: null, page: 1 });
  }

  // Search endpoint doesn't support sort - results are always by relevance
  function handleSortChange(_nextSort: SortKey, _nextOrder?: "asc" | "desc") {
    // No-op: search is always sorted by relevance
  }

  function handleToggleSortOrder() {
    // No-op: search is always sorted by relevance
  }

  const hasSearchTerm = Boolean(searchInput.trim().length);
  const showSearchSpinner = hasSearchTerm && (isLoading || isValidating);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Search Articles</h1>
        <p className="text-sm text-muted-foreground">
          Search articles using Elasticsearch with hybrid BM25 + vector search. Results are sorted by relevance.
        </p>
      </div>

      {/* Enhanced Search Bar */}
      <div className="flex flex-col gap-4">
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search articles..."
            className="h-14 w-full rounded-lg border-2 border-border bg-background px-4 pr-12 text-base shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            aria-label="Search articles"
            spellCheck={false}
          />
          {showSearchSpinner ? (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <svg
                className="h-5 w-5 animate-spin text-muted-foreground"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          ) : searchInput.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                void setSearchParams({ q: null, page: 1 });
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 transition hover:bg-muted"
              aria-label="Clear search"
            >
              <svg
                className="h-5 w-5 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          ) : (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Toolbar with group by story option */}
        <ArticleToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          onSearchClear={() => {
            setSearchInput("");
            void setSearchParams({ q: null, page: 1 });
          }}
          isSearching={showSearchSpinner}
          sort="relevance"
          order="desc"
          onSortChange={handleSortChange}
          onToggleOrder={handleToggleSortOrder}
          onToggleFilters={() => {}}
          filtersOpen={false}
          filtersCount={0}
          activeFilters={[]}
          onRemoveFilter={() => {}}
          onResetFilters={() => {}}
          groupByStory={searchState.groupByStory === "true"}
          onGroupByStoryChange={(enabled) => {
            void setSearchParams({ groupByStory: enabled ? "true" : null, page: 1 });
          }}
          hideSort={true}
          hideSearch={true}
          hideFilters={true}
        />
      </div>

      {/* Category Tabs */}
      <CategoryTabs
        categories={availableCategories}
        selectedCategory={searchState.feedCategory ?? null}
        onCategoryChange={(category) => {
          void setSearchParams({ feedCategory: category, page: 1 });
        }}
      />

      {/* Results Grid */}
      <div className="space-y-6">
        {error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-sm text-destructive">
            Failed to load articles. Please try again.
          </div>
        ) : isInitialLoad ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: DEFAULT_PAGE_SIZE }).map((_, i) => (
              <ArticleCardSkeleton key={i} />
            ))}
          </div>
        ) : data?.data && data.data.length > 0 ? (
          <div className="relative">
            {/* Loading overlay when refetching */}
            {isRefetching && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-2">
                  <svg
                    className="h-6 w-6 animate-spin text-primary"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span className="text-sm text-muted-foreground">Updating results…</span>
                </div>
              </div>
            )}
            {/* Render with story grouping if enabled */}
            {searchState.groupByStory === "true" ? (
              <div className="space-y-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Layers className="h-4 w-4" />
                  <span>Articles grouped by story - showing one article per story with related articles indicator</span>
                </div>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {data.data.map((article) => (
                    <StoryCard
                      key={article.id}
                      article={article}
                      onClick={handleSelectArticle}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {data.data.map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    onClick={handleSelectArticle}
                    showStoryBadge={false}
                  />
                ))}
              </div>
            )}
            {pagination && (
              <div className="mt-4 flex items-center justify-center text-sm text-muted-foreground">
                Showing {((page - 1) * DEFAULT_PAGE_SIZE) + 1} - {Math.min(page * DEFAULT_PAGE_SIZE, pagination.total)} of {pagination.total} results
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 p-12 text-center">
            <div className="mb-4 text-4xl">📰</div>
            <h3 className="mb-2 text-lg font-semibold">No articles found</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              {searchState.q
                ? "Try adjusting your search terms or filters to find more articles."
                : "Start by entering a search query above or adjusting your filters."}
            </p>
          </div>
        )}
      </div>

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
          // Refresh handled by SWR automatically
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
  return Object.values(filters).filter((value) => value !== undefined && value !== "").length;
}

function createActiveFiltersSummary(
  filters: ArticleFiltersValue,
  feeds: { id: string; name: string }[] | undefined
) {
  const entries: Array<{ key: keyof ArticleFiltersValue; label: string; value: string }> = [];

  if (filters.feedId) {
    const feedName = feeds?.find((feed) => feed.id === filters.feedId)?.name ?? "Selected feed";
    entries.push({ key: "feedId", label: "Feed", value: feedName });
  }

  if (filters.feedCategory) {
    entries.push({
      key: "feedCategory",
      label: "Category",
      value: filters.feedCategory
    });
  }

  if (filters.language) {
    entries.push({ key: "language", label: "Language", value: filters.language });
  }

  if (filters.fromDate) {
    entries.push({ key: "fromDate", label: "From", value: filters.fromDate });
  }

  if (filters.toDate) {
    entries.push({ key: "toDate", label: "To", value: filters.toDate });
  }

  return entries;
}


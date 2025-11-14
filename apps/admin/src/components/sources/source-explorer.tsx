"use client";

import * as React from "react";
import { SWRConfig } from "swr";
import { useQueryStates } from "nuqs";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { SourceToolbar } from "@/components/sources/source-filters";
import { SourceDetailSheet } from "@/components/sources/source-detail";
import { SourceTable, SourceTableSkeleton } from "@/components/sources/source-table";
import { Button } from "@/components/ui/button";
import type { SourceListItem } from "@/lib/api/types";
import {
  getSourceListKey,
  useSourceList,
  type SourceListParams,
  type SourceListOrder,
  type SourceListSort
} from "@/lib/api/sources";
import { SOURCE_LIST_DEFAULT_LIMIT, popSourceTrail, sourceSearchStateToParams, updateSourceTrail } from "@/lib/sources-query";
import { sourceSearchConfig } from "@/lib/sources-search-config";
import type { SourceListResponse } from "@/lib/api/types";
import { useDebounce } from "@/hooks/use-debounce";

type SourceExplorerProps = {
  initialParams: SourceListParams;
  initialTrail: string[];
  initialData: SourceListResponse;
};

export function SourceExplorer({
  initialParams,
  initialTrail,
  initialData
}: SourceExplorerProps) {
  const fallbackKey = getSourceListKey(initialParams);

  return (
    <SWRConfig
      value={{
        fallback: {
          [fallbackKey]: initialData
        }
      }}
    >
      <SourceExplorerContent
        initialTrail={initialTrail}
      />
    </SWRConfig>
  );
}

type SourceExplorerContentProps = {
  initialTrail: string[];
};

function SourceExplorerContent({ initialTrail }: SourceExplorerContentProps) {
  const [
    { q, hasFeeds, sort, order, limit, cursor, trail },
    setSearchState
  ] = useQueryStates(sourceSearchConfig, {
    history: "replace"
  });

  const [searchInput, setSearchInput] = React.useState(q ?? "");
  const debouncedSearch = useDebounce(searchInput, 250);

  const [detailSource, setDetailSource] = React.useState<SourceListItem | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  React.useEffect(() => {
    setSearchInput(q ?? "");
  }, [q]);

  React.useEffect(() => {
    if (trail.length === 0 && initialTrail.length > 0) {
      setSearchState({ trail: initialTrail });
    }
  }, [initialTrail, setSearchState, trail.length]);

  React.useEffect(() => {
    const trimmed = debouncedSearch.trim();
    const current = q ?? "";
    if (trimmed === current) {
      return;
    }

    setSearchState({
      q: trimmed.length > 0 ? trimmed : null,
      cursor: "",
      trail: []
    });
  }, [debouncedSearch, q, setSearchState]);

  const searchStateParams = React.useMemo(
    () =>
      sourceSearchStateToParams({
        q: q ?? null,
        hasFeeds: hasFeeds ?? null,
        sort: (sort ?? "createdAt") as SourceListSort,
        order: (order ?? "desc") as SourceListOrder,
        limit: limit ?? SOURCE_LIST_DEFAULT_LIMIT,
        cursor: cursor ? cursor : null,
        trail
      }),
    [cursor, limit, order, q, hasFeeds, sort, trail]
  );

  const { data, error, isLoading, isValidating, mutate } = useSourceList(searchStateParams, {
    keepPreviousData: true,
    onError(err) {
      const message = err instanceof Error ? err.message : "Failed to load sources";
      toast.error(message);
    }
  });

  const sources = data?.data ?? [];
  const pagination = data?.pagination;
  const isRefetching = isValidating && !isLoading;

  const handleClearSearch = React.useCallback(() => {
    setSearchInput("");
    setSearchState({
      q: null,
      cursor: "",
      trail: []
    });
  }, [setSearchState]);

  const handleSortChange = React.useCallback(
    (nextSort: SourceListSort) => {
      if (nextSort === sort) return;
      setSearchState({
        sort: nextSort,
        cursor: "",
        trail: []
      });
    },
    [setSearchState, sort]
  );

  const handleOrderToggle = React.useCallback(() => {
    const nextOrder = (order ?? "desc") === "asc" ? "desc" : "asc";
    setSearchState({
      order: nextOrder,
      cursor: "",
      trail: []
    });
  }, [order, setSearchState]);

  const handleLimitChange = React.useCallback(
    (nextLimit: number) => {
      if (nextLimit === limit) return;
      setSearchState({
        limit: nextLimit,
        cursor: "",
        trail: []
      });
    },
    [limit, setSearchState]
  );

  const goToNextPage = React.useCallback(() => {
    if (!pagination?.hasNextPage || !pagination.nextCursor) return;
    setSearchState({
      cursor: pagination.nextCursor,
      trail: updateSourceTrail(trail, cursor && cursor.length > 0 ? cursor : null)
    });
  }, [cursor, pagination, setSearchState, trail]);

  const goToPreviousPage = React.useCallback(() => {
    const { previousCursor, trail: nextTrail } = popSourceTrail(trail);
    setSearchState({
      cursor: previousCursor ?? "",
      trail: nextTrail
    });
  }, [setSearchState, trail]);

  const handleSelectSource = React.useCallback((source: SourceListItem) => {
    setDetailSource(source);
    setDetailOpen(true);
  }, []);

  const handleCloseDetail = React.useCallback(
    (open: boolean) => {
      setDetailOpen(open);
      if (!open) {
        setDetailSource(null);
      }
    },
    []
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Sources</h1>
        <p className="text-sm text-muted-foreground">
          Manage unique base URLs powering your feed catalogue. Review coverage, freshness, and
          drill into related feeds.
        </p>
      </header>

      <section className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
        <SourceToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          onClearSearch={handleClearSearch}
          hasFeeds={hasFeeds ?? null}
          onHasFeedsChange={(value) => {
            setSearchState({
              hasFeeds: value,
              cursor: "",
              trail: []
            });
          }}
          sort={(sort ?? "createdAt") as SourceListSort}
          order={(order ?? "desc") as SourceListOrder}
          limit={limit ?? SOURCE_LIST_DEFAULT_LIMIT}
          onSortChange={handleSortChange}
          onOrderToggle={handleOrderToggle}
          onLimitChange={handleLimitChange}
          onRefresh={() => void mutate()}
          isRefreshing={isRefetching}
        />
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">
            Sources ({pagination?.total ?? sources.length})
          </h2>
          {isRefetching ? (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating…
            </span>
          ) : null}
        </div>

        {isLoading ? (
          <SourceTableSkeleton />
        ) : error ? (
          <ErrorState
            error={error}
            onRetry={() => void mutate()}
          />
        ) : (
          <SourceTable sources={sources} onSelect={handleSelectSource} />
        )}

        <PaginationControls
          hasPreviousPage={(trail?.length ?? 0) > 0}
          hasNextPage={pagination?.hasNextPage ?? false}
          onPrevious={goToPreviousPage}
          onNext={goToNextPage}
        />
      </section>

      <SourceDetailSheet
        source={detailSource}
        open={detailOpen}
        onOpenChange={handleCloseDetail}
      />
    </div>
  );
}

function PaginationControls({
  hasPreviousPage,
  hasNextPage,
  onPrevious,
  onNext
}: {
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">
        Navigate between pages to explore additional sources.
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrevious} disabled={!hasPreviousPage}>
          Previous
        </Button>
        <Button variant="outline" size="sm" onClick={onNext} disabled={!hasNextPage}>
          Next
        </Button>
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm">
      <p className="font-medium text-destructive">Failed to load sources.</p>
      <p className="mt-1 text-destructive">
        {error instanceof Error ? error.message : "Ensure the API server is reachable."}
      </p>
      <Button variant="destructive" size="sm" className="mt-3" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}


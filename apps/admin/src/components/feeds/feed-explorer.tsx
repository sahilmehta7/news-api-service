"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import { SWRConfig } from "swr";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  RefreshCw,
  Search
} from "lucide-react";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/utils/format-relative-time";

import { FeedStats } from "@/components/feeds/feed-stats";
import { CreateFeedDialog, EditFeedDialog } from "@/components/feeds/feed-dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  useFeedList,
  getFeedListKey,
  requestFeedIngestion
} from "@/lib/api/feeds";
import type { FeedListParams } from "@/lib/api/feeds";
import type { Feed, FeedListResponse } from "@/lib/api/types";
import { FEED_LIST_DEFAULT_LIMIT, feedSearchStateToParams, parseFeedSearchParams } from "@/lib/feeds-query";
import { feedSearchConfig } from "@/lib/feeds-search-config";
import { deleteFeed } from "@/lib/api/feeds";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

type FeedExplorerProps = {
  initialParams: FeedListParams;
  initialTrail: string[];
  initialData: FeedListResponse;
  initialSearchParams: Record<string, string | string[] | undefined>;
};

const STATUS_OPTIONS = [
  { value: "idle", label: "Idle" },
  { value: "fetching", label: "Fetching" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" }
] as const;

const ORDER_LABELS: Record<"asc" | "desc", string> = {
  asc: "Ascending",
  desc: "Descending"
};

export function FeedExplorer({
  initialParams,
  initialTrail,
  initialData,
  initialSearchParams
}: FeedExplorerProps) {
  return (
    <SWRConfig
      value={{
        fallback: {
          [getFeedListKey(initialParams)]: initialData
        }
      }}
    >
      <FeedExplorerContent
        initialTrail={initialTrail}
        initialSearchParams={initialSearchParams}
      />
    </SWRConfig>
  );
}

function FeedExplorerContent({
  initialTrail,
  initialSearchParams
}: {
  initialTrail: string[];
  initialSearchParams: Record<string, string | string[] | undefined>;
}) {
  const initialStateRef = React.useRef(parseFeedSearchParams(initialSearchParams));
  const hasSetInitialTrailRef = React.useRef(false);

  const [{ q, categories, tags, lastFetchStatuses, isActive, hasIssues, sort, order, limit, cursor, trail }, setSearchState] =
    useQueryStates(feedSearchConfig, {
      history: "replace"
    });

  React.useEffect(() => {
    if (hasSetInitialTrailRef.current) return;
    const parsedTrail = initialStateRef.current.trail;
    if (parsedTrail.length > 0 && (!trail || trail.length === 0)) {
      setSearchState({ trail: parsedTrail });
      hasSetInitialTrailRef.current = true;
    } else if (initialTrail.length > 0 && (!trail || trail.length === 0)) {
      setSearchState({ trail: initialTrail });
      hasSetInitialTrailRef.current = true;
    } else {
      hasSetInitialTrailRef.current = true;
    }
  }, [initialTrail, setSearchState, trail]);

  const [searchInput, setSearchInput] = React.useState(q ?? "");
  const debouncedSearch = useDebounce(searchInput, 300);

  React.useEffect(() => {
    setSearchInput(q ?? "");
  }, [q]);

  React.useEffect(() => {
    const trimmed = debouncedSearch.trim();
    const current = q ?? "";
    if (trimmed === current) {
      return;
    }

    setSearchState({
      q: trimmed.length > 0 ? trimmed : null,
      cursor: null,
      trail: []
    });
  }, [debouncedSearch, q, setSearchState]);

  const feedParams = React.useMemo(() => {
    const activeFilter =
      isActive === "true" || isActive === "false" ? isActive : "all";
    const issueFilter =
      hasIssues === "true" || hasIssues === "false" ? hasIssues : "all";
    return feedSearchStateToParams({
      q: q ?? null,
      categories: categories ?? [],
      tags: tags ?? [],
      lastFetchStatuses: lastFetchStatuses ?? [],
      isActive: activeFilter,
      hasIssues: issueFilter,
      sort: sort ?? "createdAt",
      order: order ?? "desc",
      limit: limit ?? FEED_LIST_DEFAULT_LIMIT,
      cursor: cursor ?? null,
      trail: trail ?? []
    });
  }, [q, categories, tags, lastFetchStatuses, isActive, hasIssues, sort, order, limit, cursor, trail]);

  const { data, error, isLoading, isValidating, mutate } = useFeedList(feedParams, {
    keepPreviousData: true
  });

  const feeds = React.useMemo(() => data?.data ?? [], [data]);
  const summary = data?.summary;
  const pagination = data?.pagination;

  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [ingestingId, setIngestingId] = React.useState<string | null>(null);
  const [pendingDeletionId, setPendingDeletionId] = React.useState<string | null>(null);
  const [expandedFeedId, setExpandedFeedId] = React.useState<string | null>(null);

  const isRefetching = isValidating && !isLoading;
  const hasNextPage = pagination?.hasNextPage ?? false;
  const hasPreviousPage = (trail?.length ?? 0) > 0;

  React.useEffect(() => {
    if (!expandedFeedId) return;
    if (!feeds.some((feed) => feed.id === expandedFeedId)) {
      setExpandedFeedId(null);
    }
  }, [expandedFeedId, feeds]);

  const availableCategories = data?.facets.categories ?? [];
  const availableTags = data?.facets.tags ?? [];

  const activeFilters = React.useMemo(
    () => buildActiveFilters({ categories, tags, lastFetchStatuses, isActive, hasIssues }),
    [categories, tags, lastFetchStatuses, isActive, hasIssues]
  );

  const activeFiltersCount = activeFilters.length;

  async function handleIngest(feedId: string) {
    setIngestingId(feedId);
    try {
      await requestFeedIngestion(feedId);
      toast.success("Feed ingestion requested");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to request ingestion");
    } finally {
      setIngestingId(null);
    }
  }

  async function handleDelete(feedId: string) {
    const confirmed = window.confirm(
      "Are you sure you want to deactivate this feed? The feed will be marked as inactive and will no longer be fetched, but its articles will be preserved."
    );
    if (!confirmed) {
      return;
    }
    setPendingDeletionId(feedId);
    try {
      await deleteFeed(feedId);
      toast.success("Feed deactivated");
      void mutate();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to deactivate feed");
    } finally {
      setPendingDeletionId(null);
    }
  }

  function handleSortChange(nextSort: FeedListParams["sort"]) {
    if (nextSort === sort) return;
    setSearchState({
      sort: nextSort,
      cursor: null,
      trail: []
    });
  }

  function handleOrderToggle() {
    const nextOrder = (order ?? "desc") === "asc" ? "desc" : "asc";
    setSearchState({
      order: nextOrder,
      cursor: null,
      trail: []
    });
  }

  function handleLimitChange(nextLimit: number) {
    setSearchState({
      limit: nextLimit,
      cursor: null,
      trail: []
    });
  }

  function toggleArrayValue(key: "categories" | "tags" | "lastFetchStatuses", value: string) {
    const current = (getArrayValue(key) ?? []).slice();
    const index = current.indexOf(value);
    if (index >= 0) {
      current.splice(index, 1);
    } else {
      current.push(value);
    }
    setSearchState({
      [key]: current,
      cursor: null,
      trail: []
    });
  }

  function getArrayValue(key: "categories" | "tags" | "lastFetchStatuses") {
    if (key === "categories") return categories;
    if (key === "tags") return tags;
    return lastFetchStatuses;
  }

  function handleIsActiveChange(value: "true" | "false" | null) {
    setSearchState({
      isActive: value,
      cursor: null,
      trail: []
    });
  }

  function handleHasIssuesChange(value: "true" | "false" | null) {
    setSearchState({
      hasIssues: value,
      cursor: null,
      trail: []
    });
  }

  function resetFilters() {
    setSearchState({
      categories: [],
      tags: [],
      lastFetchStatuses: [],
      isActive: null,
      hasIssues: null,
      cursor: null,
      trail: []
    });
  }

  function handleRemoveFilter(filter: ActiveFilter) {
    switch (filter.key) {
      case "categories":
      case "tags":
      case "lastFetchStatuses": {
        const current = (getArrayValue(filter.key) ?? []).filter(
          (value) => value !== filter.value
        );
        setSearchState({
          [filter.key]: current,
          cursor: null,
          trail: []
        });
        break;
      }
      case "isActive":
        handleIsActiveChange(null);
        break;
      case "hasIssues":
        handleHasIssuesChange(null);
        break;
    }
  }

  function handleClearSearch() {
    setSearchInput("");
    setSearchState({
      q: null,
      cursor: null,
      trail: []
    });
  }

  function goToNextPage() {
    if (!hasNextPage || !pagination?.nextCursor) return;
    const nextTrail = [...(trail ?? [])];
    nextTrail.push(cursor ?? "");
    setSearchState({
      cursor: pagination.nextCursor,
      trail: nextTrail
    });
  }

  function goToPreviousPage() {
    const currentTrail = trail ?? [];
    if (currentTrail.length === 0) return;
    const nextTrail = currentTrail.slice(0, -1);
    const previousCursor = currentTrail[currentTrail.length - 1] ?? "";
    setSearchState({
      cursor: previousCursor.length > 0 ? previousCursor : null,
      trail: nextTrail
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Feeds</h1>
          <p className="text-sm text-muted-foreground">
            Monitor ingestion health, search sources, and open feed-specific article streams.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            asChild
            variant="outline"
            className="w-full sm:w-auto"
          >
            <Link href="/feeds/import">Bulk import</Link>
          </Button>
          <CreateFeedDialog
            trigger={
              <Button className="w-full gap-2 sm:w-auto">
                <ArrowRight className="h-4 w-4" />
                Add feed
              </Button>
            }
            onCreated={() => {
              void mutate();
            }}
          />
        </div>
      </header>

      <FeedStats summary={summary} />

      <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative w-full lg:w-80">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                placeholder="Search feeds by name or URL"
                onChange={(event) => setSearchInput(event.target.value)}
                className="pl-8"
              />
              {searchInput.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={handleClearSearch}
                >
                  Clear
                </Button>
              ) : null}
            </div>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setFiltersOpen(true)}
            >
              <Filter className="h-4 w-4" />
              Filters
              {activeFiltersCount > 0 ? (
                <Badge variant="secondary" className="ml-1">
                  {activeFiltersCount}
                </Badge>
              ) : null}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SortDropdown
              sort={sort ?? "createdAt"}
              order={order ?? "desc"}
              onSortChange={handleSortChange}
              onOrderToggle={handleOrderToggle}
            />
            <LimitSelector value={limit ?? FEED_LIST_DEFAULT_LIMIT} onChange={handleLimitChange} />
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => {
                void mutate();
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {activeFiltersCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {activeFilters.map((filter) => (
              <Badge
                key={`${filter.key}:${filter.value}`}
                variant="secondary"
                className="flex items-center gap-2"
              >
                {filter.label}
                <button
                  type="button"
                  className="text-muted-foreground transition hover:text-foreground"
                  onClick={() => handleRemoveFilter(filter)}
                >
                  ×
                </button>
              </Badge>
            ))}
            <Button variant="link" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">
            Feeds ({pagination?.total ?? feeds.length})
          </h2>
          <span className="text-xs text-muted-foreground">
            {isRefetching ? "Updating…" : null}
          </span>
        </div>
        {isLoading ? (
          <FeedTableSkeleton />
        ) : error ? (
          <FeedErrorState error={error} onRetry={() => mutate()} />
        ) : feeds.length === 0 ? (
          <EmptyState
            title="No feeds found"
            description="Adjust filters or search to find matching feeds."
            onReset={resetFilters}
          />
        ) : (
          <FeedTable
            feeds={feeds}
            expandedFeedId={expandedFeedId}
            onToggleDetails={(feedId) =>
              setExpandedFeedId((current) => (current === feedId ? null : feedId))
            }
            ingestingId={ingestingId}
            onRequestIngest={handleIngest}
            pendingDeletionId={pendingDeletionId}
            onDelete={handleDelete}
            onUpdated={() => {
              void mutate();
            }}
          />
        )}
        <PaginationControls
          hasNextPage={hasNextPage}
          hasPreviousPage={hasPreviousPage}
          onNext={goToNextPage}
          onPrevious={goToPreviousPage}
          limit={limit ?? FEED_LIST_DEFAULT_LIMIT}
          total={pagination?.total ?? feeds.length}
        />
      </section>

      <FilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        categories={categories ?? []}
        tags={tags ?? []}
        lastFetchStatuses={lastFetchStatuses ?? []}
        isActive={isActive}
        hasIssues={hasIssues}
        availableCategories={availableCategories}
        availableTags={availableTags}
        onToggleArray={toggleArrayValue}
        onIsActiveChange={handleIsActiveChange}
        onHasIssuesChange={handleHasIssuesChange}
        onReset={() => {
          resetFilters();
          setFiltersOpen(false);
        }}
      />
    </div>
  );
}

type FeedTableProps = {
  feeds: Feed[];
  expandedFeedId: string | null;
  onToggleDetails: (feedId: string) => void;
  ingestingId: string | null;
  onRequestIngest: (feedId: string) => void;
  pendingDeletionId: string | null;
  onDelete: (feedId: string) => void;
  onUpdated: () => void;
};

function FeedTable({
  feeds,
  expandedFeedId,
  onToggleDetails,
  ingestingId,
  onRequestIngest,
  pendingDeletionId,
  onDelete,
  onUpdated
}: FeedTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Activity</TableHead>
            <TableHead>Articles</TableHead>
            <TableHead>Last fetch</TableHead>
            <TableHead>Interval</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {feeds.map((feed) => {
            const isExpanded = expandedFeedId === feed.id;
            const isIngesting = ingestingId === feed.id;
            const isDeleting = pendingDeletionId === feed.id;
            return (
              <React.Fragment key={feed.id}>
                <TableRow className={cn(isExpanded ? "bg-muted/40" : undefined)}>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium leading-tight">{feed.name}</span>
                        <StatusPill status={feed.lastFetchStatus ?? "idle"} />
                        {!feed.isActive ? (
                          <Badge variant="outline" className="text-xs">
                            Inactive
                          </Badge>
                        ) : null}
                      </div>
                      <p className="break-all text-xs text-muted-foreground">{feed.url}</p>
                      {feed.source ? (
                        <p className="text-xs text-muted-foreground">
                          Source:{" "}
                          <span className="font-medium">{feed.source.baseUrl}</span>
                        </p>
                      ) : null}
                      {feed.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {feed.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px] font-normal">
                              #{tag}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {feed.category ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {feed.isActive ? "Active" : "Inactive"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {feed.stats.articleCount.toLocaleString()}
                  </TableCell>
                    <TableCell className="text-sm">
                      {feed.lastFetchAt ? formatRelativeTime(feed.lastFetchAt) : "Never"}
                    </TableCell>
                  <TableCell className="text-sm">
                    {feed.fetchIntervalMinutes} min
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => onRequestIngest(feed.id)}
                        disabled={isIngesting}
                      >
                        {isIngesting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        Ingest
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={() => onToggleDetails(feed.id)}
                      >
                        Details
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform",
                            isExpanded ? "rotate-180" : ""
                          )}
                        />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {isExpanded ? (
                  <TableRow className="bg-muted/40">
                    <TableCell colSpan={FEED_TABLE_COLUMN_COUNT}>
                      <FeedDetailDrop
                        feed={feed}
                        ingesting={isIngesting}
                        deleting={isDeleting}
                        onIngest={() => onRequestIngest(feed.id)}
                        onDelete={() => onDelete(feed.id)}
                        onUpdated={onUpdated}
                      />
                    </TableCell>
                  </TableRow>
                ) : null}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

const FEED_TABLE_COLUMN_COUNT = 7;

function StatusPill({ status }: { status: string }) {
  const { label, variant } = resolveStatusLabel(status);
  return (
    <Badge variant={variant} className="text-xs font-medium capitalize">
      {label}
    </Badge>
  );
}

type FeedDetailDropProps = {
  feed: Feed;
  ingesting: boolean;
  deleting: boolean;
  onIngest: () => void;
  onDelete: () => void;
  onUpdated: () => void;
};

function FeedDetailDrop({
  feed,
  ingesting,
  deleting,
  onIngest,
  onDelete,
  onUpdated
}: FeedDetailDropProps) {
  return (
    <div className="space-y-4 rounded-md border border-dashed border-border bg-background p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold leading-tight">{feed.name}</h3>
            <StatusPill status={feed.lastFetchStatus ?? "idle"} />
            {!feed.isActive ? (
              <Badge variant="outline" className="text-xs">
                Inactive
              </Badge>
            ) : null}
          </div>
          <p className="break-all text-sm text-muted-foreground">{feed.url}</p>
          {feed.source ? (
            <p className="text-xs text-muted-foreground">
              Source: <span className="font-medium">{feed.source.baseUrl}</span>
            </p>
          ) : null}
          {feed.category ? (
            <p className="text-xs text-muted-foreground">
              Category: <span className="font-medium">{feed.category}</span>
            </p>
          ) : null}
          {feed.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {feed.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs font-normal">
                  #{tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={onIngest}
            disabled={ingesting}
          >
            {ingesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {ingesting ? "Requesting…" : "Ingest now"}
          </Button>
          <Link href={`/feeds/${feed.id}/articles`}>
            <Button variant="secondary" size="sm" className="gap-2">
              View articles
            </Button>
          </Link>
          <EditFeedDialog
            feed={feed}
            onUpdated={onUpdated}
            trigger={
              <Button variant="outline" size="sm" className="gap-2">
                Edit
              </Button>
            }
          />
          <Button variant="destructive" size="sm" onClick={onDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
      <div className="grid gap-3 rounded-md border bg-muted/40 p-3 text-sm md:grid-cols-2">
        <DetailStat label="Articles" value={feed.stats.articleCount.toLocaleString()} />
        <DetailStat
          label="Last article"
          value={
            feed.stats.lastArticlePublishedAt
              ? formatRelativeTime(feed.stats.lastArticlePublishedAt)
              : "Unknown"
          }
        />
        <DetailStat
          label="Last fetch"
          value={feed.lastFetchAt ? formatRelativeTime(feed.lastFetchAt) : "Never"}
        />
        <DetailStat label="Fetch interval" value={`${feed.fetchIntervalMinutes} min`} />
      </div>
      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <span>Created {formatRelativeTime(feed.createdAt)}</span>
        <span>Updated {formatRelativeTime(feed.updatedAt)}</span>
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function FeedTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableBody>
          {Array.from({ length: 4 }).map((_, index) => (
            <TableRow key={index}>
              <TableCell colSpan={FEED_TABLE_COLUMN_COUNT}>
                <div className="h-10 w-full animate-pulse rounded-md bg-muted/40" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function FeedErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm">
      <p className="font-medium text-destructive">Failed to load feeds.</p>
      <p className="mt-1 text-destructive">
        {error instanceof Error ? error.message : "Ensure the API server is reachable."}
      </p>
      <Button variant="destructive" size="sm" className="mt-3" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function EmptyState({
  title,
  description,
  onReset
}: {
  title: string;
  description: string;
  onReset: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onReset}>
        Reset filters
      </Button>
    </div>
  );
}

type PaginationControlsProps = {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onNext: () => void;
  onPrevious: () => void;
  limit: number;
  total: number;
};

function PaginationControls({
  hasNextPage,
  hasPreviousPage,
  onNext,
  onPrevious,
  limit,
  total
}: PaginationControlsProps) {
  const pageDescription = total > 0 ? `Showing up to ${limit} of ${total}` : "No results";

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">{pageDescription}</p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={onPrevious}
          disabled={!hasPreviousPage}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={onNext}
          disabled={!hasNextPage}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function SortDropdown({
  sort,
  order,
  onSortChange,
  onOrderToggle
}: {
  sort: FeedListParams["sort"];
  order: FeedListParams["order"];
  onSortChange: (sort: FeedListParams["sort"]) => void;
  onOrderToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={sort}
        onChange={(event) =>
          onSortChange(event.target.value as FeedListParams["sort"])
        }
        className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <option value="createdAt">Newest</option>
        <option value="name">Name</option>
        <option value="lastFetchAt">Last fetch</option>
        <option value="articleCount">Article count</option>
      </select>
      <Button variant="outline" size="sm" className="gap-2" onClick={onOrderToggle}>
        <ChevronDown
          className={`h-4 w-4 transition ${order === "asc" ? "rotate-180" : ""}`}
        />
        {ORDER_LABELS[order ?? "desc"]}
      </Button>
    </div>
  );
}

function LimitSelector({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Page size</span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {[10, 20, 30, 50].map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

type FilterSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  tags: string[];
  lastFetchStatuses: string[];
  isActive: string | null;
  hasIssues: string | null;
  availableCategories: string[];
  availableTags: string[];
  onToggleArray: (key: "categories" | "tags" | "lastFetchStatuses", value: string) => void;
  onIsActiveChange: (value: "true" | "false" | null) => void;
  onHasIssuesChange: (value: "true" | "false" | null) => void;
  onReset: () => void;
};

function FilterSheet({
  open,
  onOpenChange,
  categories,
  tags,
  lastFetchStatuses,
  isActive,
  hasIssues,
  availableCategories,
  availableTags,
  onToggleArray,
  onIsActiveChange,
  onHasIssuesChange,
  onReset
}: FilterSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Refine the feeds shown in the list.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 flex-1 space-y-6 overflow-y-auto text-sm">
          <FilterSection title="Category">
            {availableCategories.length === 0 ? (
              <p className="text-xs text-muted-foreground">No category metadata available.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableCategories.map((category) => {
                  const active = categories.includes(category);
                  return (
                    <Button
                      key={category}
                      variant={active ? "secondary" : "outline"}
                      size="sm"
                      className="rounded-full"
                      onClick={() => onToggleArray("categories", category)}
                    >
                      {category}
                    </Button>
                  );
                })}
              </div>
            )}
          </FilterSection>

          <FilterSection title="Tags">
            {availableTags.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tags detected for this page.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => {
                  const active = tags.includes(tag);
                  return (
                    <Button
                      key={tag}
                      variant={active ? "secondary" : "outline"}
                      size="sm"
                      className="rounded-full"
                      onClick={() => onToggleArray("tags", tag)}
                    >
                      #{tag}
                    </Button>
                  );
                })}
              </div>
            )}
          </FilterSection>

          <FilterSection title="Fetch status">
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((option) => {
                const active = lastFetchStatuses.includes(option.value);
                return (
                  <Button
                    key={option.value}
                    variant={active ? "default" : "outline"}
                    size="sm"
                    onClick={() => onToggleArray("lastFetchStatuses", option.value)}
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </FilterSection>

          <FilterSection title="Activity">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={!isActive ? "default" : "outline"}
                size="sm"
                onClick={() => onIsActiveChange(null)}
              >
                All
              </Button>
              <Button
                variant={isActive === "true" ? "default" : "outline"}
                size="sm"
                onClick={() => onIsActiveChange("true")}
              >
                Active
              </Button>
              <Button
                variant={isActive === "false" ? "default" : "outline"}
                size="sm"
                onClick={() => onIsActiveChange("false")}
              >
                Inactive
              </Button>
            </div>
          </FilterSection>

          <FilterSection title="Health">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={!hasIssues ? "default" : "outline"}
                size="sm"
                onClick={() => onHasIssuesChange(null)}
              >
                All feeds
              </Button>
              <Button
                variant={hasIssues === "true" ? "default" : "outline"}
                size="sm"
                onClick={() => onHasIssuesChange("true")}
              >
                With issues
              </Button>
              <Button
                variant={hasIssues === "false" ? "default" : "outline"}
                size="sm"
                onClick={() => onHasIssuesChange("false")}
              >
                Healthy
              </Button>
            </div>
          </FilterSection>

          <div className="pt-4">
            <Button variant="outline" className="w-full" onClick={onReset}>
              Clear filters
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

type ActiveFilter =
  | { key: "categories"; label: string; value: string }
  | { key: "tags"; label: string; value: string }
  | { key: "lastFetchStatuses"; label: string; value: string }
  | { key: "isActive"; label: string; value: string }
  | { key: "hasIssues"; label: string; value: string };

function buildActiveFilters({
  categories,
  tags,
  lastFetchStatuses,
  isActive,
  hasIssues
}: {
  categories?: string[];
  tags?: string[];
  lastFetchStatuses?: string[];
  isActive?: string | null;
  hasIssues?: string | null;
}): ActiveFilter[] {
  const filters: ActiveFilter[] = [];

  for (const category of categories ?? []) {
    filters.push({ key: "categories", label: `Category: ${category}`, value: category });
  }
  for (const tag of tags ?? []) {
    filters.push({ key: "tags", label: `#${tag}`, value: tag });
  }
  for (const status of lastFetchStatuses ?? []) {
    const { label } = resolveStatusLabel(status);
    filters.push({ key: "lastFetchStatuses", label: `Status: ${label}`, value: status });
  }
  if (isActive === "true") {
    filters.push({ key: "isActive", label: "Active feeds", value: "true" });
  } else if (isActive === "false") {
    filters.push({ key: "isActive", label: "Inactive feeds", value: "false" });
  }
  if (hasIssues === "true") {
    filters.push({ key: "hasIssues", label: "Feeds with issues", value: "true" });
  } else if (hasIssues === "false") {
    filters.push({ key: "hasIssues", label: "Healthy feeds", value: "false" });
  }

  return filters;
}

function resolveStatusLabel(status: string): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  switch (status) {
    case "success":
      return { label: "Success", variant: "default" };
    case "fetching":
      return { label: "Fetching", variant: "secondary" };
    case "warning":
      return { label: "Warning", variant: "secondary" };
    case "error":
      return { label: "Error", variant: "destructive" };
    case "idle":
    default:
      return { label: status, variant: "outline" };
  }
}



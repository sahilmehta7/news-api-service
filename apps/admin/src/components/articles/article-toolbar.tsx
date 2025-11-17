"use client";

import * as React from "react";
import { Filter, Loader2, Search, SlidersHorizontal, X, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SortKey = "publishedAt" | "fetchedAt" | "relevance";

type ActiveFilter = {
  key: string;
  label: string;
  value: string;
};

type ArticleToolbarProps = {
  searchValue: string;
  placeholder?: string;
  onSearchChange: (value: string) => void;
  onSearchClear: () => void;
  onSubmitSearch?: () => void;
  isSearching?: boolean;
  sort: SortKey;
  order: "asc" | "desc";
  onSortChange: (nextSort: SortKey) => void;
  onToggleOrder: () => void;
  onToggleFilters: () => void;
  filtersOpen: boolean;
  filtersCount: number;
  activeFilters: ActiveFilter[];
  onRemoveFilter: (key: string) => void;
  onResetFilters: () => void;
  groupByStory?: boolean;
  onGroupByStoryChange?: (enabled: boolean) => void;
  hideSort?: boolean;
  hideSearch?: boolean;
  hideFilters?: boolean;
};

function ArticleToolbarComponent({
  searchValue,
  placeholder = "Search articles…",
  onSearchChange,
  onSearchClear,
  onSubmitSearch,
  isSearching,
  sort,
  order,
  onSortChange,
  onToggleOrder,
  onToggleFilters,
  filtersOpen,
  filtersCount,
  activeFilters,
  onRemoveFilter,
  onResetFilters,
  groupByStory = false,
  onGroupByStoryChange,
  hideSort = false,
  hideSearch = false,
  hideFilters = false
}: ArticleToolbarProps) {
  const hasActiveFilters = activeFilters.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full flex-1 gap-2">
          {!hideSearch && (
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onSubmitSearch?.();
                }
              }}
              placeholder={placeholder}
              className={cn(
                "h-10 w-full rounded-md border border-input bg-background pl-9 pr-10 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isSearching ? "pr-9" : "pr-10"
              )}
              aria-label="Search articles"
              spellCheck={false}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-2 text-muted-foreground">
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : searchValue.length > 0 ? (
                <button
                  type="button"
                  onClick={onSearchClear}
                  className="rounded-full p-1 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>
          )}

          {!hideSort && (
            <>
              <Select value={sort} onValueChange={(value: string) => onSortChange(value as SortKey)}>
                <SelectTrigger className="w-[160px] text-sm">
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="publishedAt">Newest published</SelectItem>
                  <SelectItem value="fetchedAt">Newest fetched</SelectItem>
                  <SelectItem value="relevance">Best match</SelectItem>
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Toggle sort direction (${order === "desc" ? "descending" : "ascending"})`}
                onClick={onToggleOrder}
              >
                <SortChevron order={order} />
              </Button>
            </>
          )}

          {!hideFilters && (
            <Button
              type="button"
              variant={filtersOpen ? "default" : "outline"}
              onClick={onToggleFilters}
              aria-expanded={filtersOpen}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              Filters
              {filtersCount > 0 ? (
                <span className="rounded-full bg-primary-foreground/15 px-1.5 py-0.5 text-xs font-medium text-primary">
                  {filtersCount}
                </span>
              ) : null}
            </Button>
          )}
        </div>
      </div>

      {onGroupByStoryChange && (
        <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2">
            <Switch
              id="group-by-story"
              checked={groupByStory}
              onCheckedChange={onGroupByStoryChange}
            />
            <Label htmlFor="group-by-story" className="text-sm font-normal cursor-pointer">
              Group similar articles
            </Label>
          </div>
        </div>
      )}

      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map((filter) => (
            <button
              type="button"
              key={filter.key}
              onClick={() => onRemoveFilter(filter.key)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="uppercase text-[10px] text-muted-foreground/80">{filter.label}</span>
              <span className="font-medium text-foreground">
                {truncateValue(filter.value)}
              </span>
              <X className="h-3 w-3" />
            </button>
          ))}
          <Button type="button" variant="link" className="px-0 text-xs" onClick={onResetFilters}>
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SortChevron({ order }: { order: "asc" | "desc" }) {
  return order === "desc" ? (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        d="M7 10l5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        d="M7 14l5-5 5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function truncateValue(value: string) {
  if (value.length <= 24) {
    return value;
  }
  return `${value.slice(0, 21)}…`;
}

// Memoize ArticleToolbar to prevent unnecessary re-renders
export const ArticleToolbar = React.memo(ArticleToolbarComponent);

ArticleToolbar.displayName = "ArticleToolbar";


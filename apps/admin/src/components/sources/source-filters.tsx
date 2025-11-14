"use client";

import * as React from "react";
import { Search, RefreshCw, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SourceListOrder, SourceListSort } from "@/lib/api/sources";

type SourceToolbarProps = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  hasFeeds: string | null;
  onHasFeedsChange: (value: string | null) => void;
  sort: SourceListSort;
  order: SourceListOrder;
  limit: number;
  onSortChange: (sort: SourceListSort) => void;
  onOrderToggle: () => void;
  onLimitChange: (limit: number) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
};

export function SourceToolbar({
  searchValue,
  onSearchChange,
  onClearSearch,
  hasFeeds,
  onHasFeedsChange,
  sort,
  order,
  limit,
  onSortChange,
  onOrderToggle,
  onLimitChange,
  onRefresh,
  isRefreshing
}: SourceToolbarProps) {
  const handleSortChange = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onSortChange(event.target.value as SourceListSort);
    },
    [onSortChange]
  );

  const handleLimitChange = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const next = Number(event.target.value);
      if (Number.isFinite(next)) {
        onLimitChange(next);
      }
    },
    [onLimitChange]
  );

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex w-full flex-1 items-center gap-2">
        <div className="relative w-full lg:w-80">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            placeholder="Search sources by base URL"
            onChange={(event) => onSearchChange(event.target.value)}
            className="pl-8"
          />
          {searchValue.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={onClearSearch}
            >
              Clear
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="has-feeds-filter">
            Has feeds
          </label>
          <select
            id="has-feeds-filter"
            value={hasFeeds ?? "all"}
            onChange={(e) => {
              const value = e.target.value;
              onHasFeedsChange(value === "all" ? null : value);
            }}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">All</option>
            <option value="true">Has feeds</option>
            <option value="false">No feeds</option>
          </select>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="source-sort">
            Sort by
          </label>
          <select
            id="source-sort"
            value={sort}
            onChange={handleSortChange}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="createdAt">Created</option>
            <option value="updatedAt">Updated</option>
            <option value="baseUrl">Base URL</option>
          </select>
          <Button variant="outline" size="sm" className="gap-2" onClick={onOrderToggle}>
            <ChevronDown
              className={`h-4 w-4 transition ${order === "asc" ? "rotate-180" : ""}`}
            />
            {order === "asc" ? "Ascending" : "Descending"}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Page size</span>
          <select
            value={limit}
            onChange={handleLimitChange}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {[10, 20, 30, 50].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}


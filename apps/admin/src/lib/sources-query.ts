import type { SourceListOrder, SourceListParams, SourceListSort } from "@/lib/api/sources";

export const SOURCE_LIST_DEFAULT_LIMIT = 20;

export type SourceSearchState = {
  q: string | null;
  hasFeeds: string | null;
  sort: SourceListSort;
  order: SourceListOrder;
  limit: number;
  cursor: string | null;
  trail: string[];
};

export function parseSourceSearchParams(
  searchParams: Record<string, string | string[] | undefined>
): SourceSearchState {
  const readFirst = (key: string) => {
    const value = searchParams[key];
    if (Array.isArray(value)) {
      return value.at(-1) ?? null;
    }
    return value ?? null;
  };

  const readArray = (key: string): string[] => {
    const value = searchParams[key];
    if (Array.isArray(value)) {
      return value.flatMap((entry) => splitValue(entry));
    }
    if (typeof value === "string") {
      return splitValue(value);
    }
    return [];
  };

  const readSort = (value: string | null): SourceListSort => {
    if (value === "baseUrl" || value === "createdAt" || value === "updatedAt") {
      return value;
    }
    return "createdAt";
  };

  const readOrder = (value: string | null): SourceListOrder => {
    if (value === "asc" || value === "desc") {
      return value;
    }
    return "desc";
  };

  const limitValue = Number(readFirst("limit"));
  const limit =
    Number.isFinite(limitValue) && limitValue > 0 && limitValue <= 100
      ? Math.floor(limitValue)
      : SOURCE_LIST_DEFAULT_LIMIT;

  return {
    q: readFirst("q"),
    hasFeeds: readFirst("hasFeeds"),
    sort: readSort(readFirst("sort")),
    order: readOrder(readFirst("order")),
    limit,
    cursor: readFirst("cursor"),
    trail: readArray("trail")
  };
}

export function sourceSearchStateToParams(state: SourceSearchState): SourceListParams {
  return {
    q: normalizeString(state.q),
    hasFeeds: state.hasFeeds === "true" ? true : state.hasFeeds === "false" ? false : undefined,
    sort: state.sort,
    order: state.order,
    limit: state.limit,
    cursor: normalizeString(state.cursor)
  };
}

export function updateSourceTrail(trail: string[], cursor: string | null): string[] {
  if (!cursor) {
    return trail;
  }
  return [...trail, cursor];
}

export function popSourceTrail(trail: string[]): {
  previousCursor: string | null;
  trail: string[];
} {
  if (trail.length === 0) {
    return { previousCursor: null, trail: [] };
  }
  const nextTrail = [...trail];
  const previousCursor = nextTrail.pop() ?? null;
  return { previousCursor, trail: nextTrail };
}

function normalizeString(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function splitValue(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}


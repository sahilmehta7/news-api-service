import type { FeedListOrder, FeedListParams, FeedListSort } from "@/lib/api/feeds";

export const FEED_LIST_DEFAULT_LIMIT = 20;

export type FeedSearchState = {
  q: string | null;
  categories: string[];
  tags: string[];
  lastFetchStatuses: string[];
  isActive: "true" | "false" | "all";
  hasIssues: "true" | "false" | "all";
  sort: FeedListSort;
  order: FeedListOrder;
  limit: number;
  cursor: string | null;
  trail: string[];
};

export function parseFeedSearchParams(
  searchParams: Record<string, string | string[] | undefined>
): FeedSearchState {
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

  const readBooleanString = (key: string): "true" | "false" | "all" => {
    const value = readFirst(key);
    if (value === "true" || value === "false") {
      return value;
    }
    return "all";
  };

  const readSort = (value: string | null): FeedListSort => {
    if (value === "name" || value === "lastFetchAt" || value === "createdAt") {
      return value;
    }
    return "createdAt";
  };

  const readOrder = (value: string | null): FeedListOrder => {
    if (value === "asc" || value === "desc") {
      return value;
    }
    return "desc";
  };

  const limitValue = Number(readFirst("limit"));
  const limit =
    Number.isFinite(limitValue) && limitValue > 0 && limitValue <= 100
      ? Math.floor(limitValue)
      : FEED_LIST_DEFAULT_LIMIT;

  return {
    q: readFirst("q"),
    categories: readArray("categories"),
    tags: readArray("tags"),
    lastFetchStatuses: readArray("lastFetchStatuses"),
    isActive: readBooleanString("isActive"),
    hasIssues: readBooleanString("hasIssues"),
    sort: readSort(readFirst("sort")),
    order: readOrder(readFirst("order")),
    limit,
    cursor: readFirst("cursor"),
    trail: readArray("trail")
  };
}

export function feedSearchStateToParams(state: FeedSearchState): FeedListParams {
  return {
    q: normalizeString(state.q),
    categories: normalizeArray(state.categories),
    tags: normalizeArray(state.tags),
    lastFetchStatuses: normalizeArray(state.lastFetchStatuses),
    isActive: normalizeBoolean(state.isActive),
    hasIssues: normalizeBoolean(state.hasIssues),
    sort: state.sort,
    order: state.order,
    limit: state.limit,
    cursor: normalizeString(state.cursor)
  };
}

export function updateTrail(trail: string[], cursor: string | null): string[] {
  if (!cursor) {
    return trail;
  }
  return [...trail, cursor];
}

export function popTrail(trail: string[]): {
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

function normalizeBoolean(value: "true" | "false" | "all"): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function normalizeString(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeArray(values: string[]): string[] | undefined {
  const filtered = values.map((value) => value.trim()).filter(Boolean);
  return filtered.length > 0 ? Array.from(new Set(filtered)) : undefined;
}

function splitValue(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}



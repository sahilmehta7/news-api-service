import type { ArticleQuery } from "@/lib/api/articles";
import type { ArticleFiltersValue } from "@/components/articles/article-filters";

export type RawArticleSearchState = {
  page?: number | null;
  q?: string | null;
  feedId?: string | null;
  enrichmentStatus?: string | null;
  language?: string | null;
  hasMedia?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  sort?: string | null;
  order?: string | null;
};

const SORT_KEYS = new Set<ArticleQuery["sort"]>(["publishedAt", "fetchedAt", "relevance"]);

export function buildArticleQuery(state: RawArticleSearchState, pageSize: number): ArticleQuery {
  const safePage = typeof state.page === "number" && state.page > 0 ? state.page : 1;
  const normalized: ArticleQuery = {
    page: safePage,
    pageSize,
    sort: normalizeSort(state.sort, state.q ?? undefined),
    order: state.order === "asc" ? "asc" : "desc"
  };

  if (hasValue(state.q)) {
    normalized.q = state.q.trim();
  }

  if (hasValue(state.feedId)) {
    normalized.feedId = state.feedId!;
  }

  if (hasValue(state.enrichmentStatus)) {
    normalized.enrichmentStatus = state.enrichmentStatus!;
  }

  if (hasValue(state.language)) {
    normalized.language = state.language!;
  }

  if (hasValue(state.fromDate)) {
    normalized.fromDate = state.fromDate!;
  }

  if (hasValue(state.toDate)) {
    normalized.toDate = state.toDate!;
  }

  if (state.hasMedia === "true") {
    normalized.hasMedia = true;
  } else if (state.hasMedia === "false") {
    normalized.hasMedia = false;
  }

  return normalized;
}

export function filtersFromState(state: RawArticleSearchState): ArticleFiltersValue {
  return {
    feedId: normalizeString(state.feedId),
    enrichmentStatus: normalizeString(state.enrichmentStatus),
    language: normalizeString(state.language),
    hasMedia:
      state.hasMedia === "true" || state.hasMedia === "false"
        ? (state.hasMedia as "true" | "false")
        : undefined,
    fromDate: normalizeString(state.fromDate),
    toDate: normalizeString(state.toDate)
  };
}

function normalizeSort(sort: string | null | undefined, q: string | undefined): ArticleQuery["sort"] {
  if (sort && SORT_KEYS.has(sort as ArticleQuery["sort"])) {
    if (sort === "relevance" && !q) {
      return "publishedAt";
    }
    return sort as ArticleQuery["sort"];
  }
  if (q) {
    return "relevance";
  }
  return "publishedAt";
}

function hasValue(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }
  return value.trim().length > 0;
}

function normalizeString(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}



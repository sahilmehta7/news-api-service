"use client";

import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum
} from "nuqs";

import { FEED_LIST_DEFAULT_LIMIT } from "@/lib/feeds-query";

export const feedSearchConfig = {
  q: parseAsString,
  categories: parseAsArrayOf(parseAsString).withDefault([]),
  tags: parseAsArrayOf(parseAsString).withDefault([]),
  lastFetchStatuses: parseAsArrayOf(parseAsString).withDefault([]),
  isActive: parseAsString.withDefault("all"),
  hasIssues: parseAsString.withDefault("all"),
  sort: parseAsStringEnum(["createdAt", "lastFetchAt", "name", "articleCount"]).withDefault("createdAt"),
  order: parseAsStringEnum(["asc", "desc"]).withDefault("desc"),
  limit: parseAsInteger.withDefault(FEED_LIST_DEFAULT_LIMIT),
  cursor: parseAsString.withDefault(""),
  trail: parseAsArrayOf(parseAsString).withDefault([])
} as const;



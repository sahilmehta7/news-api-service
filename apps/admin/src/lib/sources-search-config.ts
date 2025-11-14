"use client";

import { parseAsArrayOf, parseAsInteger, parseAsString, parseAsStringEnum } from "nuqs";

import { SOURCE_LIST_DEFAULT_LIMIT } from "@/lib/sources-query";

export const sourceSearchConfig = {
  q: parseAsString,
  hasFeeds: parseAsString,
  sort: parseAsStringEnum(["createdAt", "updatedAt", "baseUrl"]).withDefault("createdAt"),
  order: parseAsStringEnum(["asc", "desc"]).withDefault("desc"),
  limit: parseAsInteger.withDefault(SOURCE_LIST_DEFAULT_LIMIT),
  cursor: parseAsString.withDefault(""),
  trail: parseAsArrayOf(parseAsString).withDefault([])
} as const;


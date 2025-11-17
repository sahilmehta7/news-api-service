"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ArticleCardSkeletonProps = {
  className?: string;
};

export function ArticleCardSkeleton({ className }: ArticleCardSkeletonProps) {
  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card",
        className
      )}
    >
      {/* Hero Image Skeleton */}
      <div className="relative aspect-video w-full animate-pulse bg-muted" />

      {/* Content Skeleton */}
      <div className="flex flex-1 flex-col p-4">
        {/* Source and Time Skeleton */}
        <div className="mb-2 flex items-center gap-2">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        </div>

        {/* Title Skeleton */}
        <div className="mb-2 space-y-2">
          <div className="h-5 w-full animate-pulse rounded bg-muted" />
          <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
        </div>

        {/* Excerpt Skeleton */}
        <div className="mb-3 space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
        </div>

        {/* Metadata Skeleton */}
        <div className="mt-auto flex items-center gap-2">
          <div className="h-5 w-12 animate-pulse rounded bg-muted" />
          <div className="h-5 w-20 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}


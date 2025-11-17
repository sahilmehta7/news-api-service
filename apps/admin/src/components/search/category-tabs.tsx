"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const COMMON_NEWS_CATEGORIES = [
  "All",
  "World",
  "Business",
  "Technology",
  "Sports",
  "Entertainment",
  "Science",
  "Health",
  "Politics",
  "Finance",
  "Local"
] as const;

type CategoryTabsProps = {
  categories: string[]; // Available categories from feeds
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  className?: string;
};

export function CategoryTabs({
  categories,
  selectedCategory,
  onCategoryChange,
  className
}: CategoryTabsProps) {
  // Combine common categories with feed categories, remove duplicates
  const allCategories = React.useMemo(() => {
    const commonSet = new Set(COMMON_NEWS_CATEGORIES);
    const feedSet = new Set(categories.filter(Boolean));
    const combined = Array.from(commonSet).concat(Array.from(feedSet));
    return Array.from(new Set(combined)).sort((a, b) => {
      // Keep "All" first
      if (a === "All") return -1;
      if (b === "All") return 1;
      // Sort common categories by their order in COMMON_NEWS_CATEGORIES
      const aIndex = COMMON_NEWS_CATEGORIES.indexOf(a as typeof COMMON_NEWS_CATEGORIES[number]);
      const bIndex = COMMON_NEWS_CATEGORIES.indexOf(b as typeof COMMON_NEWS_CATEGORIES[number]);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      // Alphabetical for others
      return a.localeCompare(b);
    });
  }, [categories]);

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <div className="flex gap-1 border-b border-border">
        {allCategories.map((category) => {
          const isActive = (selectedCategory === category) || (category === "All" && !selectedCategory);
          return (
            <button
              key={category}
              type="button"
              onClick={() => onCategoryChange(category === "All" ? null : category)}
              className={cn(
                "relative whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors",
                "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {category}
              {isActive && (
                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}


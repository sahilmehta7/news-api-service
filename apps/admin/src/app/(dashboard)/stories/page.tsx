"use client";

import * as React from "react";
import { useQueryStates, parseAsInteger, parseAsString } from "nuqs";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useStories, type StoryQuery } from "@/lib/api/stories";
import { useDebounce } from "@/hooks/use-debounce";
import { toast } from "sonner";

const DEFAULT_PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

const searchParamConfig = {
  cursor: parseAsString,
  limit: parseAsInteger.withDefault(DEFAULT_PAGE_SIZE),
  q: parseAsString,
  from: parseAsString,
  to: parseAsString,
  language: parseAsString,
  categories: parseAsString,
  tags: parseAsString
} as const;

export default function StoriesPage() {
  const [searchState, setSearchState] = useQueryStates(searchParamConfig);
  const debouncedQuery = useDebounce(searchState.q ?? "", SEARCH_DEBOUNCE_MS);

  const query: StoryQuery = {
    q: debouncedQuery || undefined,
    from: searchState.from || undefined,
    to: searchState.to || undefined,
    language: searchState.language || undefined,
    limit: searchState.limit,
    cursor: searchState.cursor || null,
    categories: searchState.categories || undefined,
    tags: searchState.tags || undefined
  };

  const { data, error, isLoading, mutate } = useStories(query);

  const handleRefresh = React.useCallback(() => {
    void mutate();
    toast.success("Stories refreshed");
  }, [mutate]);

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-destructive mb-4">Failed to load stories</p>
          <Button onClick={handleRefresh}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stories</h1>
          <p className="text-muted-foreground">
            Clustered articles grouped by similar content
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            type="text"
            placeholder="Search stories..."
            value={searchState.q ?? ""}
            onChange={(e) => setSearchState({ q: e.target.value || null, cursor: null })}
            className="flex-1 px-3 py-2 border rounded-md"
          />
          <input
            type="text"
            placeholder="Categories (CSV)"
            value={searchState.categories ?? ""}
            onChange={(e) => setSearchState({ categories: e.target.value || null, cursor: null })}
            className="px-3 py-2 border rounded-md"
          />
          <input
            type="text"
            placeholder="Tags (CSV)"
            value={searchState.tags ?? ""}
            onChange={(e) => setSearchState({ tags: e.target.value || null, cursor: null })}
            className="px-3 py-2 border rounded-md"
          />
        </div>

        {isLoading ? (
          <div className="text-center p-8">Loading stories...</div>
        ) : data?.data.length === 0 ? (
          <div className="text-center p-8 text-muted-foreground">
            No stories found
          </div>
        ) : (
          <div className="space-y-4">
            {data?.data.map((story) => (
              <div
                key={story.story_id}
                className="border rounded-lg p-4 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">
                      {story.title_rep || "Untitled Story"}
                    </h3>
                    {story.summary && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {story.summary}
                      </p>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {story.article_count} articles
                  </div>
                </div>

                {story.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {story.keywords.slice(0, 5).map((keyword) => (
                      <span
                        key={keyword}
                        className="px-2 py-1 bg-secondary text-secondary-foreground rounded text-xs"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                )}

                {story.top_articles.length > 0 && (
                  <div className="space-y-1 pt-2 border-t">
                    <p className="text-xs font-medium text-muted-foreground">
                      Top Articles:
                    </p>
                    {story.top_articles.map((article) => (
                      <a
                        key={article.id}
                        href={article.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-sm hover:underline"
                      >
                        {article.title}
                      </a>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
                  {story.time_range_start && (
                    <span>
                      From: {new Date(story.time_range_start).toLocaleDateString()}
                    </span>
                  )}
                  {story.time_range_end && (
                    <span>
                      To: {new Date(story.time_range_end).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {data?.pagination.hasNextPage && (
              <div className="flex justify-center pt-4">
                <Button
                  onClick={() => {
                    if (data?.pagination.nextCursor) {
                      setSearchState({ cursor: data.pagination.nextCursor });
                    }
                  }}
                  variant="outline"
                >
                  Load More
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


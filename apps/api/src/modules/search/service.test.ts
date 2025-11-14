import { describe, expect, it } from "vitest";
import { diversifyByStory } from "./service.js";
import type { ArticleDocument } from "@news-api/search";

describe("diversifyByStory", () => {
  it("groups articles by story and returns top article per story", () => {
    const results = [
      {
        id: "1",
        article: {
          id: "1",
          story_id: "story-1"
        } as ArticleDocument,
        combinedScore: 0.9
      },
      {
        id: "2",
        article: {
          id: "2",
          story_id: "story-1"
        } as ArticleDocument,
        combinedScore: 0.8
      },
      {
        id: "3",
        article: {
          id: "3",
          story_id: "story-2"
        } as ArticleDocument,
        combinedScore: 0.85
      }
    ];

    const result = diversifyByStory(results, 10);

    expect(result).toHaveLength(2); // Two stories
    expect(result[0].id).toBe("1"); // First article from story-1 (highest score)
    expect(result[1].id).toBe("3"); // First article from story-2
    expect(result[0].moreCount).toBe(1); // One more article in story-1
    expect(result[1].moreCount).toBeUndefined(); // No more articles in story-2
  });

  it("respects maxResults limit", () => {
    const results = Array.from({ length: 20 }, (_, i) => ({
      id: `article-${i}`,
      article: {
        id: `article-${i}`,
        story_id: `story-${i}`
      } as ArticleDocument,
      combinedScore: 0.9 - i * 0.01
    }));

    const result = diversifyByStory(results, 5);

    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("handles articles without storyId", () => {
    const results = [
      {
        id: "1",
        article: {
          id: "1",
          story_id: null
        } as ArticleDocument,
        combinedScore: 0.9
      },
      {
        id: "2",
        article: {
          id: "2",
          story_id: "story-1"
        } as ArticleDocument,
        combinedScore: 0.8
      }
    ];

    const result = diversifyByStory(results, 10);

    // Articles without storyId should be included as individual stories (grouped as "none")
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("handles empty array", () => {
    const result = diversifyByStory([], 10);
    expect(result).toHaveLength(0);
  });

  it("calculates moreCount correctly", () => {
    const results = Array.from({ length: 5 }, (_, i) => ({
      id: `article-${i}`,
      article: {
        id: `article-${i}`,
        story_id: "story-1"
      } as ArticleDocument,
      combinedScore: 0.9 - i * 0.01
    }));

    const result = diversifyByStory(results, 10);

    expect(result[0].moreCount).toBe(4); // 4 more articles in story-1
  });
});


import { describe, expect, it } from "vitest";
import {
  extractShingles,
  jaccardSimilarity,
  titleJaccardSimilarity,
  extractNamedEntities,
  entityOverlap,
  combinedSimilarity
} from "./similarity.js";

describe("extractShingles", () => {
  it("extracts bigrams from text", () => {
    const shingles = extractShingles("the quick brown fox", 2);
    expect(shingles).toContain("the quick");
    expect(shingles).toContain("quick brown");
    expect(shingles).toContain("brown fox");
    expect(shingles.size).toBe(3);
  });

  it("extracts trigrams from text", () => {
    const shingles = extractShingles("the quick brown fox", 3);
    expect(shingles).toContain("the quick brown");
    expect(shingles).toContain("quick brown fox");
    expect(shingles.size).toBe(2);
  });

  it("handles empty text", () => {
    const shingles = extractShingles("", 2);
    expect(shingles.size).toBe(0);
  });

  it("normalizes text to lowercase", () => {
    const shingles = extractShingles("The Quick Brown", 2);
    expect(shingles).toContain("the quick");
    expect(shingles).toContain("quick brown");
  });

  it("removes punctuation", () => {
    const shingles = extractShingles("hello, world!", 2);
    expect(shingles).toContain("hello world");
  });
});

describe("jaccardSimilarity", () => {
  it("computes Jaccard similarity for identical sets", () => {
    const setA = new Set(["a", "b", "c"]);
    const setB = new Set(["a", "b", "c"]);
    expect(jaccardSimilarity(setA, setB)).toBe(1.0);
  });

  it("computes Jaccard similarity for disjoint sets", () => {
    const setA = new Set(["a", "b"]);
    const setB = new Set(["c", "d"]);
    expect(jaccardSimilarity(setA, setB)).toBe(0.0);
  });

  it("computes Jaccard similarity for partially overlapping sets", () => {
    const setA = new Set(["a", "b", "c"]);
    const setB = new Set(["b", "c", "d"]);
    // Intersection: {b, c} = 2
    // Union: {a, b, c, d} = 4
    // Jaccard = 2/4 = 0.5
    expect(jaccardSimilarity(setA, setB)).toBe(0.5);
  });

  it("handles empty sets", () => {
    const setA = new Set<string>([]);
    const setB = new Set<string>([]);
    expect(jaccardSimilarity(setA, setB)).toBe(1.0);
  });

  it("handles one empty set", () => {
    const setA = new Set(["a", "b"]);
    const setB = new Set<string>([]);
    expect(jaccardSimilarity(setA, setB)).toBe(0.0);
  });
});

describe("titleJaccardSimilarity", () => {
  it("computes similarity for identical titles", () => {
    const similarity = titleJaccardSimilarity(
      "Breaking News: Major Event",
      "Breaking News: Major Event"
    );
    expect(similarity).toBeGreaterThan(0.9);
  });

  it("computes similarity for similar titles", () => {
    const similarity = titleJaccardSimilarity(
      "Breaking News: Major Event",
      "Breaking News Major Event Happens"
    );
    expect(similarity).toBeGreaterThan(0.5);
  });

  it("computes low similarity for different titles", () => {
    const similarity = titleJaccardSimilarity(
      "Technology Update",
      "Sports News Today"
    );
    expect(similarity).toBeLessThan(0.3);
  });

  it("handles empty titles", () => {
    const similarity = titleJaccardSimilarity("", "Some Title");
    expect(similarity).toBe(0);
  });
});

describe("extractNamedEntities", () => {
  it("extracts person names", () => {
    const entities = extractNamedEntities("John Smith and Jane Doe met");
    expect(entities.size).toBeGreaterThan(0);
  });

  it("extracts organization names", () => {
    const entities = extractNamedEntities("Apple Inc announced new products");
    expect(entities.size).toBeGreaterThan(0);
  });

  it("extracts location names", () => {
    const entities = extractNamedEntities("New York City and Los Angeles");
    expect(entities.size).toBeGreaterThan(0);
  });

  it("handles empty text", () => {
    const entities = extractNamedEntities("");
    expect(entities.size).toBe(0);
  });
});

describe("entityOverlap", () => {
  it("computes high overlap for texts with same entities", () => {
    const overlap = entityOverlap(
      "John Smith works at Apple Inc",
      "John Smith from Apple Inc"
    );
    expect(overlap).toBeGreaterThan(0.3);
  });

  it("computes low overlap for texts with different entities", () => {
    const overlap = entityOverlap(
      "John Smith in New York",
      "Jane Doe in Los Angeles"
    );
    expect(overlap).toBeLessThan(0.5);
  });

  it("handles empty texts", () => {
    const overlap = entityOverlap("", "Some text");
    expect(overlap).toBe(0);
  });
});

describe("combinedSimilarity", () => {
  it("computes weighted average correctly", () => {
    const similarity = combinedSimilarity(0.8, 0.6, 0.4, {
      cosine: 0.5,
      jaccard: 0.3,
      entity: 0.2
    });
    // Expected: 0.5*0.8 + 0.3*0.6 + 0.2*0.4 = 0.4 + 0.18 + 0.08 = 0.66
    expect(similarity).toBeCloseTo(0.66, 2);
  });

  it("normalizes weights automatically", () => {
    const similarity1 = combinedSimilarity(0.8, 0.6, 0.4, {
      cosine: 0.5,
      jaccard: 0.3,
      entity: 0.2
    });
    const similarity2 = combinedSimilarity(0.8, 0.6, 0.4, {
      cosine: 1.0,
      jaccard: 0.6,
      entity: 0.4
    });
    expect(similarity1).toBe(similarity2);
  });

  it("handles default weights", () => {
    const similarity = combinedSimilarity(0.8, 0.6, 0.4);
    expect(similarity).toBeGreaterThan(0);
    expect(similarity).toBeLessThanOrEqual(1);
  });

  it("returns value between 0 and 1", () => {
    const similarity = combinedSimilarity(1.0, 1.0, 1.0);
    // Account for floating point precision issues
    expect(similarity).toBeLessThanOrEqual(1.0001);
    expect(similarity).toBeGreaterThanOrEqual(0.0);
  });
});


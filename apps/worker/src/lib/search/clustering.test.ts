import { describe, expect, it } from "vitest";
import { cosineSimilarity } from "./clustering.js";

describe("cosineSimilarity", () => {
  it("computes cosine similarity for identical vectors", () => {
    const a = [1, 2, 3];
    const b = [1, 2, 3];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(1.0, 5);
  });

  it("computes cosine similarity for orthogonal vectors", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(0.0, 5);
  });

  it("computes cosine similarity for opposite vectors", () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(-1.0, 5);
  });

  it("handles zero vectors", () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBe(0);
  });

  it("handles vectors of different lengths", () => {
    const a = [1, 2, 3];
    const b = [1, 2];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBe(0);
  });

  it("handles empty vectors", () => {
    const a: number[] = [];
    const b: number[] = [];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBe(0);
  });

  it("handles normalized vectors", () => {
    // Normalized vectors should have similarity close to dot product
    const a = [0.5, 0.5, 0.5, 0.5];
    const b = [0.5, 0.5, 0.5, 0.5];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(1.0, 5);
  });

  it("handles vectors with undefined values", () => {
    const a = [1, 2, undefined as any, 4];
    const b = [1, 2, 3, 4];
    const similarity = cosineSimilarity(a, b);
    // Should handle undefined gracefully (treats as 0)
    expect(similarity).toBeGreaterThanOrEqual(-1);
    expect(similarity).toBeLessThanOrEqual(1);
  });
});


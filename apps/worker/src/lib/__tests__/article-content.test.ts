import { describe, expect, it } from "vitest";

import { extractArticleContent, __private__ } from "../article-content.js";

describe("extractArticleContent", () => {
  it("returns readability text content when available", () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>Sample Article</title>
        </head>
        <body>
          <article>
            <h1>Sample Article</h1>
            <p>The quick brown fox jumps over the lazy dog.</p>
            <p>Another paragraph for good measure.</p>
          </article>
        </body>
      </html>
    `;

    const result = extractArticleContent(html, "https://example.com/article");

    expect(result.rawHtml).toContain("<article>");
    expect(result.contentPlain).toContain(
      "The quick brown fox jumps over the lazy dog. Another paragraph for good measure."
    );
    expect(result.wordCount).toBeGreaterThanOrEqual(14);
  });

  it("handles empty html string", () => {
    const result = extractArticleContent("", "https://example.com/article");

    expect(result.rawHtml).toBeNull();
    expect(result.contentPlain).toBeNull();
    expect(result.wordCount).toBeNull();
  });

  it("truncates oversized values", () => {
    const veryLongHtml = `<div>${"x".repeat(2_100_000)}</div>`;

    const result = extractArticleContent(veryLongHtml, "https://example.com/article");

    expect(result.rawHtml?.length).toBeLessThanOrEqual(2_000_001);
    expect(result.rawHtml?.endsWith("…")).toBe(true);
  });
});

describe("__private__", () => {
  it("normalises whitespace", () => {
    expect(__private__.normaliseWhitespace("  Hello   world \n")).toBe("Hello world");
  });

  it("calculates word count", () => {
    expect(__private__.calculateWordCount("one two three")).toBe(3);
    expect(__private__.calculateWordCount("")).toBeNull();
  });
});


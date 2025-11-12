import { describe, expect, it } from "vitest";

import { extractMetadataFromHtml } from "../../apps/worker/src/lib/html-metadata.js";

describe("extractMetadataFromHtml", () => {
  it("extracts core metadata and computed fields", () => {
    const html = `
      <html lang="en">
        <head>
          <title>Sample Article</title>
          <meta name="description" content="A concise summary." />
          <meta property="og:title" content="Sample Article OG" />
          <meta property="og:description" content="OG description" />
          <meta property="og:image" content="https://cdn.example.com/hero.jpg" />
          <meta property="og:type" content="article" />
          <link rel="canonical" href="https://example.com/sample" />
          <link rel="icon" href="/favicon.ico" />
        </head>
        <body>
          <article>
            <h1>Sample Article</h1>
            <p>This is a body paragraph that should contribute to the word count.</p>
            <p>Another paragraph adds more words for reading time estimation.</p>
          </article>
        </body>
      </html>
    `;

    const metadata = extractMetadataFromHtml(html, "https://example.com/fallback");

    expect(metadata.title).toBe("Sample Article");
    expect(metadata.description).toBe("A concise summary.");
    expect(metadata.canonicalUrl).toBe("https://example.com/sample");
    expect(metadata.heroImageUrl).toBe("https://cdn.example.com/hero.jpg");
    expect(metadata.faviconUrl).toBe("/favicon.ico");
    expect(metadata.openGraph["og:type"]).toBe("article");
    expect(metadata.twitterCard).toEqual({});
    expect(metadata.language).toBe("en");
    expect(metadata.wordCount).toBeGreaterThan(10);
    expect(metadata.readingTimeSeconds).toBeGreaterThan(0);
  });
});


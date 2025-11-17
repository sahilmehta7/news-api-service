import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";

const RAW_HTML_MAX_LENGTH = 2_000_000;
const PLAIN_TEXT_MAX_LENGTH = 200_000;

export interface ArticleContentResult {
  rawHtml: string | null;
  contentPlain: string | null;
  wordCount: number | null;
}

export function extractArticleContent(
  html: string | null | undefined,
  url: string
): ArticleContentResult {
  if (!html || html.trim().length === 0) {
    return {
      rawHtml: null,
      contentPlain: null,
      wordCount: null
    };
  }

  const truncatedRaw = truncate(html, RAW_HTML_MAX_LENGTH);

  try {
    // Create a virtual console that suppresses CSS parsing errors
    // These errors are non-critical for content extraction
    const virtualConsole = new VirtualConsole();
    virtualConsole.on("error", (error) => {
      const message = error?.message ?? error?.toString() ?? "";
      // Suppress CSS-related errors - they don't affect content extraction
      if (
        message.includes("CSS") ||
        message.includes("stylesheet") ||
        message.includes("Could not parse CSS")
      ) {
        return; // Suppress CSS parsing errors silently
      }
      // For other errors, let them propagate normally
      // JSDOM will handle them or they'll be caught by the outer try-catch
    });

    const dom = new JSDOM(html, {
      url,
      contentType: "text/html",
      pretendToBeVisual: false,
      resources: "usable",
      runScripts: "outside-only",
      virtualConsole
    });

    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      const fallbackText = normaliseWhitespace(dom.window.document.body.textContent ?? "");
      return {
        rawHtml: truncatedRaw,
        contentPlain: truncate(fallbackText, PLAIN_TEXT_MAX_LENGTH) || null,
        wordCount: calculateWordCount(fallbackText)
      };
    }

    const textContent = normaliseWhitespace(article.textContent ?? "");

    return {
      rawHtml: truncatedRaw,
      contentPlain: truncate(textContent, PLAIN_TEXT_MAX_LENGTH) || null,
      wordCount: calculateWordCount(textContent)
    };
  } catch (error) {
    const plain = normaliseWhitespace(stripTags(html));
    return {
      rawHtml: truncatedRaw,
      contentPlain: truncate(plain, PLAIN_TEXT_MAX_LENGTH) || null,
      wordCount: calculateWordCount(plain)
    };
  }
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}…`;
}

function normaliseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripTags(html: string) {
  return html.replace(/<[^>]+>/g, " ");
}

function calculateWordCount(value: string): number | null {
  if (!value) {
    return null;
  }

  const matches = value.split(/\s+/).filter(Boolean);
  if (matches.length === 0) {
    return null;
  }

  return matches.length;
}

export const __private__ = {
  truncate,
  normaliseWhitespace,
  stripTags,
  calculateWordCount
};


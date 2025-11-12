import { parse } from "node-html-parser";
import type { HTMLElement } from "node-html-parser";
import { detectAll } from "tinyld";

export type ExtractedMetadata = {
  title: string | null;
  description: string | null;
  canonicalUrl: string | null;
  faviconUrl: string | null;
  heroImageUrl: string | null;
  contentType: string | null;
  openGraph: Record<string, string>;
  twitterCard: Record<string, string>;
  additional: Record<string, unknown>;
  language: string | null;
  languageConfidence: Record<string, number>;
  readingTimeSeconds: number | null;
  wordCount: number | null;
};

export function extractMetadataFromHtml(
  html: string,
  url: string
): ExtractedMetadata {
  const root = parse(html);

  for (const node of root.querySelectorAll("script,style,noscript")) {
    node.remove();
  }

  const title =
    root.querySelector("title")?.text?.trim() ??
    getMetaContent(root, "meta[property='og:title']", "content") ??
    null;

  const description =
    getMetaContent(root, "meta[name='description']", "content") ??
    getMetaContent(root, "meta[property='og:description']", "content") ??
    null;

  const canonicalUrl =
    getMetaContent(root, "link[rel='canonical']", "href") ??
    getMetaContent(root, "meta[property='og:url']", "content") ??
    null;

  const faviconUrl =
    getMetaContent(root, "link[rel~='icon']", "href") ?? null;

  const openGraph = collectMetaGroup(root, "property", "og:");
  const twitterCard = collectMetaGroup(root, "name", "twitter:");

  const heroImageCandidates = [
    openGraph["og:image:secure_url"],
    openGraph["og:image"],
    twitterCard["twitter:image"]
  ];
  const heroImageUrl =
    heroImageCandidates.find(
      (value): value is string => typeof value === "string" && value.length > 0
    ) ?? null;

  const contentType =
    (openGraph["og:type"] ?? twitterCard["twitter:card"] ?? null) ||
    null;

  const htmlLang =
    root.querySelector("html")?.getAttribute("lang") ??
    root.querySelector("meta[http-equiv='content-language']")?.getAttribute(
      "content"
    ) ??
    null;

  const ogLocale =
    openGraph["og:locale"] ?? openGraph["og:locale:alternate"] ?? null;
  const metaLanguage = getMetaContent(root, "meta[name='language']", "content");

  const textContent = normaliseWhitespace(root.text);
  const wordCount = countWords(textContent);
  const readingTimeSeconds =
    wordCount > 0 ? Math.ceil((wordCount / 200) * 60) : null;

  const languageConfidence: Record<string, number> = {};

  const preferLanguage = normaliseLanguage(htmlLang ?? metaLanguage);
  if (preferLanguage) {
    languageConfidence[preferLanguage] = 0.85;
  }

  const ogLanguage = normaliseLanguage(ogLocale);
  if (ogLanguage) {
    languageConfidence[ogLanguage] = Math.max(
      languageConfidence[ogLanguage] ?? 0,
      0.75
    );
  }

  if (textContent.length > 200) {
    const candidates = detectAll(textContent) as Array<{
      lang: string;
      accuracy: number;
    }>;

    for (const candidate of candidates.slice(0, 3)) {
      const lang = normaliseLanguage(candidate.lang);
      if (!lang) continue;
      const score = Math.min(1, Math.max(0, candidate.accuracy));
      languageConfidence[lang] = Math.max(languageConfidence[lang] ?? 0, score);
    }
  }

  const language =
    Object.entries(languageConfidence).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0] ?? null;

  const additional: Record<string, unknown> = {
    title,
    description,
    canonicalUrl: canonicalUrl ?? url,
    keywords: getMetaContent(root, "meta[name='keywords']", "content"),
    themeColor: getMetaContent(root, "meta[name='theme-color']", "content")
  };

  return {
    title,
    description,
    canonicalUrl,
    faviconUrl,
    heroImageUrl,
    contentType,
    openGraph,
    twitterCard,
    additional,
    language,
    languageConfidence,
    readingTimeSeconds,
    wordCount
  };
}

function getMetaContent(root: HTMLElement, selector: string, attr: string) {
  const node = root.querySelector(selector);
  if (!node) return null;
  const value = node.getAttribute(attr);
  return value ? value.trim() : null;
}

function collectMetaGroup(root: HTMLElement, attribute: string, prefix: string) {
  const entries: Record<string, string> = {};

  for (const meta of root.querySelectorAll(`meta[${attribute}]`)) {
    const key = meta.getAttribute(attribute);
    const content = meta.getAttribute("content");
    if (!key || !content) {
      continue;
    }
    if (!key.startsWith(prefix)) {
      continue;
    }
    entries[key] = content.trim();
  }

  return entries;
}

function normaliseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function countWords(value: string) {
  if (!value) return 0;
  return value.split(/\s+/).filter(Boolean).length;
}

function normaliseLanguage(value: string | null) {
  if (!value) return null;
  return value.toLowerCase().replace("_", "-");
}


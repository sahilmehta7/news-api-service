import Parser from "rss-parser";

const parser = new Parser({
  timeout: 10_000,
  headers: {
    "user-agent":
      "news-api-ingestor/0.1 (+https://github.com/sahilmehta/news-api)",
    accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8"
  }
});

export type ParsedFeed = Awaited<ReturnType<Parser["parseString"]>>;

export async function fetchFeed(url: string, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "news-api-ingestor/0.1 (+https://github.com/sahilmehta/news-api)",
        accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    return parser.parseString(xml);
  } finally {
    clearTimeout(timeout);
  }
}


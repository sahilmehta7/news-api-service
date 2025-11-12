export async function fetchHtml(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "news-api-enrichment/0.1 (+https://github.com/sahilmehta/news-api)",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9"
      },
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") ?? undefined;
    const html = await response.text();
    return { html, contentType };
  } finally {
    clearTimeout(timeout);
  }
}


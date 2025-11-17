import en from "./en.json" assert { type: "json" };

type ExpandOptions = {
  locale?: "en";
  maxTotalTerms?: number;
  maxSynonymsPerToken?: number;
};

function tokenize(query: string): string[] {
  return query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function normalise(token: string): string {
  return token.toLowerCase();
}

export function expandQueryWithSynonyms(
  query: string,
  options: ExpandOptions = {}
): string {
  const locale = options.locale ?? "en";
  const maxTotal = options.maxTotalTerms ?? 12;
  const maxSynonymsPerToken = options.maxSynonymsPerToken ?? 2;

  const dict = locale === "en" ? (en as Record<string, string[]>) : {};
  const tokens = tokenize(query);

  const expanded: string[] = [];

  for (const token of tokens) {
    const key = normalise(token);
    expanded.push(token);
    const syns = dict[key] ?? [];
    for (let i = 0; i < Math.min(syns.length, maxSynonymsPerToken); i++) {
      expanded.push(syns[i]);
    }
    if (expanded.length >= maxTotal) break;
  }

  // Join with spaces to let websearch_to_tsquery treat them as OR-able terms as needed
  return expanded.join(" ");
}



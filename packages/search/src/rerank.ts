export type RerankerCandidate = {
  id: string;
  title: string;
  summary?: string | null;
  content?: string | null;
  score?: number | null; // pre-rank (lexical/semantic) if available
};

// Placeholder reranker: boosts candidates with higher overlap of query tokens in title/content.
// Replace with a cross-encoder service; keep interface stable.
export async function rerankCandidates(
  query: string,
  candidates: RerankerCandidate[],
  options?: { topK?: number; timeoutMs?: number }
): Promise<RerankerCandidate[]> {
  const tokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter(Boolean);
  const tokenSet = new Set(tokens);

  const scored = candidates.map((c) => {
    const hay = `${c.title ?? ""} ${c.summary ?? ""} ${c.content ?? ""}`
      .toLowerCase()
      .split(/\W+/)
      .filter(Boolean);
    let overlap = 0;
    for (const t of hay) {
      if (tokenSet.has(t)) overlap++;
    }
    const base = typeof c.score === "number" ? c.score : 0;
    const rerank = base + Math.log1p(overlap);
    return { ...c, score: rerank };
  });

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const topK = options?.topK ?? scored.length;
  return scored.slice(0, topK);
}



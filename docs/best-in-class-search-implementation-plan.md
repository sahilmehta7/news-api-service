## Best-in-Class Search – Implementation Plan

### Objective
Elevate search quality, recall, and UX to “best in class” by incrementally enhancing lexical relevance, adding entity-aware and semantic retrieval, and layering advanced ranking and personalization—all with measurable KPIs and safe rollout.

### Non-Goals
- Full-blown public search portal UI (admin/operator UI improvements only).
- Heavy-weight knowledge graph beyond lightweight entity linking/canonicalization in Phase 2.

### Current Context
- Storage: Postgres with Prisma; articles + article_metadata.
- Retrieval: Postgres FTS (title/summary/content), filters, sorting.
- Enrichment: HTML metadata, reading-time, language, OG/Twitter, content/plain HTML (no entities).
- Docs to reference:
  - `docs/search-implementation-plan.md`
  - `docs/embeddings-implementation-plan.md`
  - `docs/gte-embeddings.md`, `docs/gte-embeddings-implementation.md`

---

## Phased Roadmap

### Phase 1 (1 week): Precision, UX, and Facets
Focus: Improve lexical ranking and usability without changing architecture.

Deliverables
- Field weighting and BM25 tuning: `title > entities (placeholder) > summary > content`.
- Recency decay on `publishedAt` with adjustable modes (“Latest”, “Balanced”, “All-time”).
- Query parsing:
  - Phrases with quotes, AND default, support OR/NOT and parentheses.
  - Safe fallback to AND when ambiguous.
- Typo tolerance:
  - Edit-distance fuzziness for short queries (cap fuzziness for long queries).
- Synonyms and aliases:
  - Lightweight synonym dictionary per language (org acronyms, US/UK).
- Facets and filters:
  - First-class filters for `feed`, `category`, `language`, `hasMedia`, `date`.
- Highlighting:
  - Passage-based highlighting (context window), improve density heuristics.
- Monitoring:
  - Track zero-result rate, query latency p95, highlight coverage.

Changes
- API: Extend articles list query with phrase/boolean syntax, optional fuzzy flag; facet counts endpoints (or enrich list response).
- Search service: Adjust FTS query, weights, decay; add synonyms; add typo tolerance (controlled).
- No schema changes required in Phase 1.

Success Metrics
- Reduce zero-result rate by 20–30%.
- Improve CTR@3 and nDCG@10 vs. baseline by ≥10%.
- Maintain p95 latency budget (target ≤300ms end-to-end).

Risks
- Over-aggressive fuzziness can hurt precision—gate behind flags and cap by token length.
- Synonym drift—log expansions and allow per-synonym toggles.

---

### Phase 2 (2–3 weeks): Entities, Hybrid Retrieval, and Reranking
Focus: Boost recall with embeddings and accuracy with entity-awareness and reranking.

Deliverables
- Entity extraction and indexing:
  - Add `ArticleEntity` table and optional `Article.entitiesTsv` (denormalized) for boosting.
  - Extract PERSON/ORG/GPE/PRODUCT/EVENT/WORK (start/end offsets optional), canonicalize (lowercase/simplify).
  - Filters: `entities[]`, `entityTypes[]`; boosts when query terms match entities.
- Hybrid lexical + vector retrieval:
  - Generate embeddings (gte-base/e5) for `title + summary + contentPlain`.
  - Store embeddings in Elasticsearch; candidate generation via `/search` endpoint combines FTS top-N with vector top-N; union + deduplicate.
- Cross-encoder reranker:
  - Apply a small cross-encoder (e.g., MiniLM-L6 cross-encoder) to top 50–100 candidates; output final top-k.
- Near-duplicate collapsing:
  - MinHash/SimHash clustering; show representative with “x similar” metadata.
- Multi-lingual handling:
  - Use language-aware analyzers, stopwords, and synonyms; optional cross-lingual embeddings if available.
- Observability:
  - Per-stage timings (FTS, vector search, rerank), candidate set sizes, vector coverage.

Changes
- Schema:
  - `ArticleEntity` and `Article.entitiesTsv` (see entity extraction plan); indexes for `text`, `canonical`, `type`, and GIN on `entitiesTsv`.
- Worker:
  - Enrich step to extract entities post content parsing; upsert entities and `entitiesTsv`.
  - Feature flag to enable/disable entity extraction and embeddings generation.
- Search:
  - Use Elasticsearch for vector storage and k-NN search; implement hybrid retrieval and reranking path via `/search` endpoint.
- API:
  - Extend list/search endpoints with `entities`, `entityTypes`, and optional semantic toggle/blend parameter.

Backfill
- Batch process `contentPlain IS NOT NULL AND entitiesTsv IS NULL` for entities.
- Elasticsearch embeddings are automatically indexed by the worker during enrichment; no separate backfill needed.

Success Metrics
- nDCG@10 improves ≥20% over Phase 1 baselines on curated eval sets.
- CTR@3 improves ≥10% on live traffic (A/B), stable or better zero-result rate.
- p95 latency within budget for top-k (allow +100ms for reranker path with timeouts/fallbacks).

Risks
- Reranker latency—apply timeouts, adaptive k, and fall back to hybrid score.
- Entity precision/recall variance by language—log type distribution and drift monitoring.

---

### Phase 3 (ongoing): Learning-to-Rank, Personalization, and Knowledge
Focus: Advanced relevance, learning from behavior, and structured understanding.

Deliverables
- Learning-to-Rank (LTR):
  - Train LambdaMART/LightGBM on offline judgments and click logs.
  - Features: BM25 scores, recency decay, entity overlap, source authority, content length, highlight density, semantic similarity, reranker score.
- Personalization (opt-in):
  - Session/topic affinity and source preferences; cold-start via trending boosts.
- Session-aware diversification:
  - Reduce redundancy with xQuAD/MMR; diversify entities/topics within session.
- Knowledge graph light:
  - Canonical entity linking; simple relationships (ORG–PERSON affiliation, ORG–PRODUCT).
  - Enable queries like “leadership changes at OpenAI” to boost ORG:openai + role-related PERSON.

Changes
- Data:
  - Click/dwell/saves logging (privacy safe, sampled); daily feature pipelines for LTR training.
- Ranker:
  - Model service to score candidates (feature vector assembly, feature store optional).
- API:
  - Personalization toggles, ranking mode selection, explain/debug endpoint for operators.

Success Metrics
- A/B lifts in CTR@1/3/10 and nDCG@10; reduced query reformulation rate.
- Stable latency budget with LTR; monitor tail with fallbacks.

Risks
- Feedback loop bias; ensure exploration (epsilon) and diversity constraints.
- Privacy and consent handling; provide clear opt-outs and data minimization.

---

## Technical Design Details

### Ranking and Scoring
- Phase 1: Weighted BM25 + recency decay; synonym-expanded query; optional fuzzy term with caps.
- Phase 2: Hybrid score = α·(normalized BM25) + β·(semantic similarity) + γ·(entity overlap/ts_rank); reranker adjusts final order for top M.
- Phase 3: LTR replaces linear blend for final ordering; reranker may remain as a feature.

### Entity Extraction
- Strategy: Begin with a lightweight service (spaCy or small transformer) via `apps/worker`.
- Schema:
  - `ArticleEntity(id, articleId, text, canonical, type, salience, start, end)`
  - `Article.entitiesTsv` (GIN index) for boosting/filtering.
- API filters:
  - `entities[]`, `entityTypes[]` (case-insensitive match on `text` or `canonical`).

### Semantic Retrieval
- Embedding model: `gte-base` (see `docs/gte-embeddings.md`).
- Storage: Elasticsearch stores embeddings and provides native k-NN search capabilities.
- Retrieval: `/search` endpoint uses Elasticsearch BM25 + k-NN hybrid search; top-N FTS ∪ top-N vector; dedupe; rerank.

### Query Parsing
- Tokenization: support quotes, parentheses, AND/OR/NOT.
- Safety: protect against pathological expansions, max terms, and timeout guards.

### Duplicate Handling
- SimHash or MinHash on `contentPlain`; cluster and collapse near-duplicates in results; expose “x similar” count.

### Observability
- Per-stage latency, candidate sizes, fallback counters.
- Relevance dashboards: CTR@k, nDCG@k, zero-results, reformulations.
- Quality traces for sampled queries with explain data (fields hit, boosts, rank contributions).

---

## API Changes (Summary)
- Query params:
  - `q` with phrase/boolean syntax.
  - `fuzzy=true|false` (guarded).
  - `entities[]=...`, `entityTypes[]=...`.
  - `rankingMode=latest|balanced|alltime|hybrid|semantic|ltr`.
  - `semanticBlend=0..1` (optional α/β tuning under feature flag).
  - `includeExplain=true` (operator-only).
- Responses:
  - Highlights: passage-based snippets with offsets.
  - Optional `explain` block (operator-only).

---

## Rollout & Testing

### A/B and Canary
- Route small % traffic to new rankers (Phase 1 → Phase 2 → Phase 3).
- Track lifts in CTR@k, nDCG@k, and zero-results; holdout control.

### Eval Sets
- Build curated evaluation sets (entity-centric, multilingual, long-tail).
- Offline evaluation for regressions before canary promotion.

### Backfills
- Entities and embeddings backfills with batch jobs (bounded memory, retries, id/time windows).
- Nightly catch-up to maintain freshness.

---

## Risks & Mitigations
- Reranker and LTR latency: strict timeouts, progressive enhancement (fallback to hybrid).
- Synonym and expansion drift: logging, blacklists, per-domain overrides.
- Entity quality variance: monitor per-language precision/recall proxies and adjust thresholds.
- Privacy/consent: minimize data, opt-in personalization, retention policies.

---

## Milestones & Ownership (Template)
- Phase 1 complete: field weights, parsing, synonyms, typo tolerance, facets, highlights, dashboards.
- Phase 2 complete: entity extraction + filters, hybrid retrieval, reranker, duplicates collapse, multi-lingual analyzers.
- Phase 3 alpha: LTR pipeline with offline judgments; personalization (opt-in), session diversification; KG light linking.

Owners
- Search backend: <owner>
- Worker/enrichment: <owner>
- Data/ML: <owner>
- Observability: <owner>

---

## Work Items (High-Level)
- Phase 1
  - Implement phrase/boolean parser and integrate with FTS.
  - Configure BM25 weights and recency decay.
  - Add synonyms (per-language) and guarded fuzzy matching.
  - Facet endpoints and passage-based highlights.
  - Dashboards and SLOs.
- Phase 2
  - Add `ArticleEntity` schema + indices; enrich-extract + backfill.
  - Generate embeddings and store in Elasticsearch (via worker indexing pipeline).
  - Implement hybrid retrieval pipeline and cross-encoder reranker.
  - Duplicate collapsing; language-aware analyzers and synonyms.
  - Feature flags, metrics, and A/B harness.
- Phase 3
  - Click/dwell logging; feature extraction; LTR model training/eval.
  - Personalization toggles and session diversification.
  - Lightweight KG linking and rule-based boosts.
  - Continuous evaluation and rollout.

---

## References
- `docs/search-implementation-plan.md`
- `docs/search-and-clustering.md`
- `docs/gte-embeddings.md`, `docs/gte-embeddings-implementation.md`
- `docs/phase*` series for embeddings and search phases

---

## Progress
- Phase 1 delivered:
  - Weighted FTS with websearch parsing and recency decay
  - Fuzzy matching (guarded) and synonym expansion
  - Passage-based highlights and facet aggregates
  - Search metrics: latency histogram and zero-results counter
- Phase 2 in progress:
  - Entity schema/migration, worker extraction (placeholder), and API filters

## Next Steps
- Complete entity extraction implementation and backfill
- Integrate reranker with timeouts and fallbacks
- Near-duplicate collapsing; multilingual analyzers and synonyms
- Backfills for entities and per-stage pipeline metrics



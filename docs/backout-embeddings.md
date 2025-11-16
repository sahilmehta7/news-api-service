## Backout & Recovery – Embeddings

Scenarios:
- High error rates or latency
- Circuit breaker remains OPEN
- Dimensionality mismatch

Immediate Backout:
1) Set `EMBEDDING_PROVIDER=mock` in worker environment.
2) Restart worker(s).
3) Monitor pipelines and backlog drain.

Dimensionality Mismatch Recovery:
1) Choose next version: bump `SEARCH_INDEX_VERSION` (e.g., v2 → v3).
2) Create indices with correct dims (`scripts/bootstrap-indices.ts`).
3) Backfill:
   - Run enrichment replay/backfill to (re)emit documents with correct embeddings, or write a targeted reindexer.
4) Cutover:
   - Update readers/queries (if alias strategy in place, flip alias; else ensure app reads new version).
5) Cleanup: remove old indices when safe.

Validation:
- Check p95 latencies and error rates return to baseline.
- Sample vectors in new index have expected length.



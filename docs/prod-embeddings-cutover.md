## Embeddings Prod Cutover Checklist

1) Preconditions
- Search indices exist with correct `dense_vector.dims`.
- Embedding service scaled and healthy (`scripts/check-embeddings-health.ts`).

2) Flip
- Set `EMBEDDING_PROVIDER=http` and `EMBEDDING_ENDPOINT` in worker env.
- Restart worker(s).

3) Verify
- Monitor metrics: errors, duration p95, circuit breaker state.
- Sample documents contain non-zero embeddings; k-NN queries respond < SLO.

4) Rollback
- Set `EMBEDDING_PROVIDER=mock` and restart worker(s).



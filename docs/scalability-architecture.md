# Scalability Architecture

> Phase 10 Prompt 91 — Preparing BillLens for large-scale growth.

This document describes the scalability architecture for BillLens: how
the platform grows from a single-region deployment to a multi-region,
horizontally-scaled, self-healing system that can serve 10× to 100× the
current load without re-architecture.

## 1. Capacity Planning

**Module:** `src/domain/scalability/capacity-model.ts`

12 capacity metrics are tracked, each with a current value, a 12-month
projected value (compound growth), a hard capacity limit, and a
recommended scaling action.

| # | Metric | Limit (default) | Threshold | Notes |
|---|--------|-----------------|-----------|-------|
| 1 | `db_connections` | 500 | 70% | Supabase pool |
| 2 | `db_storage_gb` | 500 | 75% | Disk usage |
| 3 | `api_rps` | 5 000 | 70% | Requests/sec |
| 4 | `sync_queue_depth` | 20 000 | 65% | Sync outbox |
| 5 | `ocr_queue_depth` | 10 000 | 65% | OCR jobs |
| 6 | `attachment_storage_gb` | 2 000 | 75% | Receipt images |
| 7 | `search_index_size_gb` | 500 | 70% | FTS5 index |
| 8 | `cache_hit_rate_percent` | 100 (inverted) | 80% | Lower = worse |
| 9 | `background_workers` | 64 | 70% | Active workers |
| 10 | `push_notification_throughput_per_min` | 20 000 | 70% | Push fan-out |
| 11 | `webhook_delivery_per_min` | 5 000 | 70% | Outbound webhooks |
| 12 | `analytics_event_volume_per_day` | 50M | 75% | Ingested events |

**Scaling actions:**
- `none` — utilisation < 50% of threshold
- `monitor` — 50%..threshold
- `plan` — threshold..(threshold + 20)
- `scale_now` — above (threshold + 20) OR ≥ 100%

The `getMetricsRequiringAction()` helper returns the subset of metrics
that need attention; capacity-planning dashboards call this on a 5-min
schedule.

## 2. Caching Strategy

**Module:** `src/domain/scalability/caching-strategy.ts`

Three cache layers, four invalidation strategies, six canonical policies.

| Layer | Latency | Scope | TTL range |
|-------|---------|-------|-----------|
| `memory` | sub-ms | per-process | 5min |
| `redis` | 1-2ms | cross-instance | 1min-24h |
| `cdn` | 20-50ms | edge | 24h |

| Invalidation | When to use |
|--------------|-------------|
| `ttl` | Slow-changing data (OCR results, static assets) |
| `version` | **Financial data** (balances) — bumped on mutation |
| `event` | User-triggered changes (profile, group members) |
| `manual` | Admin-only invalidation |

**Financial safety:** the `balance:{groupId}:{currency}` policy uses
`version` invalidation so that any mutation to expenses, splits, or
settlements bumps the version tag and evicts stale entries. This works
in concert with `domain/performance/balance-cache-safety.ts`.

`computeCacheKey(prefix, params)` produces stable, sortable keys like
`balance:currency=INR;groupId=g_1` that are easy to grep in logs and
to invalidate by prefix.

## 3. Rate Limiting

**Module:** `src/domain/scalability/rate-limiter.ts`

Five tiers, each with per-minute / per-hour / per-day limits + burst
size:

| Tier | Per-min | Per-hour | Per-day | Burst |
|------|---------|----------|---------|-------|
| `anonymous` | 30 | 500 | 2 000 | 10 |
| `authenticated` | 120 | 5 000 | 25 000 | 30 |
| `premium` | 300 | 15 000 | 100 000 | 60 |
| `enterprise` | 1 200 | 60 000 | 500 000 | 200 |
| `internal` | unlimited | — | — | 1 000 |

**Critical financial operations are EXEMPT from rate limiting:**
- `settlement_create`
- `settlement_confirm`
- `settlement_cancel`
- `expense_create_offline_flush`
- `sync_conflict_resolve`

The application layer MUST call `isCriticalOperation(op)` before
applying any rate-limit decision. This prevents a stuck settlement
that would otherwise leave a balance in an inconsistent state.

## 4. Disaster Recovery

**Module:** `src/domain/scalability/disaster-recovery.ts`

Seven scenarios with RTO (Recovery Time Objective) and RPO (Recovery
Point Objective) targets:

| Scenario | RTO | RPO | Cadence |
|----------|-----|-----|---------|
| `region_failure` | 30min | 5min | quarterly |
| `database_failure` | 15min | 1min | quarterly |
| `storage_failure` | 45min | 15min | semi-annual |
| `api_outage` | 20min | 0 | monthly |
| `data_corruption` | 60min | 60min | semi-annual |
| `ransomware` | 240min | 60min | annual |
| `cdns_failure` | 15min | 0 | semi-annual |

Each plan includes:
- Ordered recovery steps
- Backup strategy (WAL streaming, PITR, immutable air-gapped)
- Failover strategy (DNS-level, PgBouncer retarget, full IaC rebuild)
- Testing cadence

## 5. Search Indexing

**Module:** `src/domain/scalability/search-indexing.ts`

Five FTS5 indexes:

| Index | Fields | Tokenizer | Filters |
|-------|--------|-----------|---------|
| `expenses_fts` | description, merchant_name, note, category | standard | lowercase, stopwords |
| `groups_fts` | name, description | standard | lowercase, stopwords |
| `members_fts` | display_name, email, phone | standard | lowercase |
| `activity_fts` | event_type, summary, actor_name | whitespace | lowercase |
| `settlements_fts` | payer_name, payee_name, note | standard | lowercase, stopwords |

**Security:** `generateSearchQuery(userInput)` is the ONLY sanctioned
way to turn user input into an FTS5 query. It:
1. Trims + collapses whitespace
2. Strips FTS5 special characters (`"`, `*`, `(`, `)`, `:`, `^`)
3. Drops empty tokens and English stopwords
4. Wraps each remaining token in double-quotes
5. Joins with implicit AND (space-separated)

This prevents query-injection via the search box.

## 6. Horizontal Scaling

**Module:** `src/domain/scalability/horizontal-scaling.ts`

Six autoscaling configs for stateless workers:

| Service | Min | Max | CPU% | Mem% | Scale-up cd | Scale-down cd |
|---------|-----|-----|------|------|-------------|---------------|
| `api` | 3 | 60 | 60 | 65 | 60s | 300s |
| `sync_worker` | 2 | 30 | 70 | 70 | 90s | 600s |
| `ocr_worker` | 2 | 40 | 75 | 80 | 120s | 600s |
| `push_worker` | 1 | 20 | 60 | 60 | 120s | 300s |
| `webhook_worker` | 1 | 15 | 65 | 65 | 120s | 300s |
| `analytics_worker` | 1 | 12 | 70 | 75 | 180s | 600s |

`computeDesiredInstances()` is a pure function:

```
desired = round(currentInstances * (currentLoad / targetLoad))
```

clamped to `[minInstances, maxInstances]`. Special cases:
- `currentLoad <= 0` → `minInstances` (no demand)
- `targetLoad <= 0` → `maxInstances` (defensive)
- `currentInstances <= 0` → `minInstances` (cold start)

Cooldowns are enforced by the orchestrator (not by this pure module).

## 7. Multi-Region Topology

Active-passive multi-region with DNS-level traffic steering:

```
                    ┌─────────────────┐
                    │   DNS / Traffic │
                    │   Manager (60s) │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
    ┌─────────────────┐           ┌─────────────────┐
    │  Primary region │           │  Failover region│
    │  (active)       │           │  (passive hot   │
    │                 │           │   standby)      │
    │  • API          │           │  • API          │
    │  • Workers      │           │  • Workers      │
    │  • DB primary   │◄──WAL────│  • DB replica   │
    │  • Redis        │  streaming│  • Redis replica│
    └─────────────────┘           └─────────────────┘
              │
              ▼
    ┌─────────────────┐
    │  Object storage │
    │  (cross-region  │
    │   replication)  │
    └─────────────────┘
```

## 8. Database Scalability

- **Read replicas**: 1 hot standby per region; PgBouncer routes reads.
- **Connection pooling**: PgBouncer transaction-mode, 500 max conns.
- **Partitioning**: `expenses` and `expense_splits` partitioned by
  `created_at` month once > 50M rows.
- **Indexing**: every foreign key has an index; every query in
  `domain/repositories/queries.ts` is EXPLAIN ANALYZE'd quarterly.
- **VACUUM**: autovacuum tuned for high-write tables.

## 9. Queue Scalability

Sync + OCR queues run on Redis Streams (consumer groups):
- Each consumer group has a min + max autoscaling config.
- Dead-letter stream catches poison messages after 3 retries.
- Backpressure: when queue depth > 80% of limit, the API returns HTTP
  503 with `Retry-After` and the mobile client backs off (exponential
  with jitter).

## 10. Background Jobs

- **OCR worker**: pulls from OCR queue, calls capture processor.
- **Sync worker**: pulls from sync queue, applies remote → local and
  local → remote diffs.
- **Push worker**: fans out Expo Push Notifications.
- **Webhook worker**: delivers outbound webhooks with retry.
- **Analytics worker**: aggregates + buckets events nightly.

Each worker is independently scalable. None hold session state.

## 11. API Scalability

- **Stateless**: every API request carries a JWT; no server-side
  session.
- **Idempotency**: write endpoints accept `Idempotency-Key` header;
  Redis caches responses for 24h.
- **Backpressure**: API returns 503 + `Retry-After` when capacity
  thresholds are exceeded.
- **CDN**: static assets served from CDN; API responses for GET-only
  public endpoints are CDN-cacheable for 60s.

## 12. Storage Scalability

- **Object storage**: S3-compatible, cross-region replication.
- **Receipts**: stored as WebP (quality 80), max 1MB per image.
- **Lifecycle**: receipts > 2 years old are moved to cold storage.
- **Quarantine**: corrupted attachments are quarantined + flagged.

## 13. Monitoring + Alerting

The capacity-planning dashboard (built on `domain/monitoring/`) shows:
- All 12 capacity metrics with current + projected values.
- Recommended action per metric.
- Recent alerts from `alerting-rules.ts`.
- Recent recovery-plan tests.

Alerts fire when:
- Any metric's action becomes `scale_now`
- RTO/RPO targets are missed in a recovery test
- Queue depth exceeds 80% of limit

## 14. Capacity-Planning Cadence

| Cadence | Activity |
|---------|----------|
| Daily | Capacity dashboard snapshot; auto-filed to S3 |
| Weekly | Engineering review of `monitor` metrics |
| Monthly | Load test against staging |
| Quarterly | Full DR rehearsal (one scenario) |
| Annually | Full ransomware rehearsal + IaC rebuild |

## 15. Financial Safety Under Load

Critical financial invariants are preserved regardless of load:

1. **Split calculations** are never approximated under load — they
   always use integer minor units + the same algorithms as the
   split-engine.
2. **Balance caches** use `version` invalidation; a stale cache entry
   is impossible once a mutation lands.
3. **Rate limiting** exempts settlements and conflict resolution.
4. **Disaster recovery** preserves the zero-sum + payer-total
   invariants: `data_corruption` plan explicitly calls for a balance-
   engine invariant check before cutover.
5. **Horizontal scaling** adds stateless workers only; the database
   remains a single writer per region to preserve serialisability for
   financial mutations.

## 16. Future Work

- Read-replica-based read/write splitting for non-financial reads.
- Database sharding by `org_id` once enterprise scale requires it.
- Multi-active region (active-active) once the financial invariant
   tests prove safe under cross-region write conflicts.
- Edge function offloading for OCR pre-processing.

# Relay deployment

**Status: reference implementation only (`src/infrastructure/relay-reference`).
Not deployed. Production remote sync is still disabled unless Supabase is
configured.**

## Contract

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /health` | none | liveness |
| `POST /v1/devices` | none | register device public keys |
| `POST /v1/groups/:id/members` | device-signed | add a device; first caller creates the group |
| `GET /v1/groups/:id/members` | member | public keys for key wrapping |
| `DELETE /v1/groups/:id/members/:deviceId` | creator | remove a member |
| `POST /v1/groups/:id/events` | member | submit an encrypted envelope |
| `GET /v1/groups/:id/events` | member | unacknowledged envelopes |
| `POST /v1/groups/:id/acks` | member | per-device acknowledgement |
| `POST /v1/groups/:id/invites` | member | store an invitation hash + expiry |
| `POST /v1/groups/:id/join` | invitee | redeem a one-time token |
| `POST/GET /v1/groups/:id/keys` | member | per-device encrypted group-key wraps |
| `DELETE /v1/groups/:id/keys/:mailboxId` | recipient | consume a key wrap |

Invitation redemption is unauthenticated but requires a registered device and
a live one-time token hash. Every other authenticated request signs
`METHOD\nPATH\nsha256(body)` with the device's Ed25519 key. The relay stores only envelopes, membership ids and
acks. Limits: 64 KB bodies, 5,000 events/group, 120 requests/minute/device,
30-day event TTL (all configurable).

## Hosting options (evaluate before spending)

| Option | Free tier (typical) | Fit | Risks |
|---|---|---|---|
| Cloudflare Workers + KV/D1 | 100k requests/day, small KV/D1 quotas | Best fit: stateless HTTP + small blobs | KV eventual consistency; D1 row limits; paid overage |
| Fly.io / Railway | Trial credits, then paid | Simple Node deploy of this server | Sleep/cold starts; credit expiry |
| Supabase Edge + table | Generous free DB | Reuses existing project | Not E2E unless payloads stay encrypted; DB is a permanent store |
| Self-hosted VPS | None (≈$5/mo) | Full control | Ops, TLS, backups, abuse handling |

**Expected usage** for a small group: ~10–50 events/day, each <2 KB, so
<100 KB/day and <5 MB/month. Bandwidth is negligible; request count is the
constraint on free tiers.

**Do not activate paid infrastructure without approval.** The current app
keeps Supabase optional and does not call this relay.

## Deployment requirements

1. TLS termination (HTTPS only), HSTS.
2. Persistent storage for devices/groups/events if more than one instance
   (the reference uses memory).
3. Scheduled expiry (cron or storage TTL) — do not rely on request-time sweeps
   alone.
4. Rate limiting at the edge *and* in the service.
5. Abuse handling: registration limits, per-IP caps, blocklists.
6. Backups only of metadata; payloads are short-lived ciphertext.
7. Migration path: export device/group ids and unacknowledged envelopes; the
   client keeps its SQLite data, so a relay move only affects pending events.

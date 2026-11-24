# Stride — Verified Free-Tier Provider Limits & Design Constraints

Verified against official 2026 provider documentation during planning:

| Provider | Free Tier Allowances | How Stride Stays Safely Within Limits |
|---|---|---|
| **Neon Postgres** | 100 projects, 1 GB storage per project, 100 CU-hours/month compute, 5 GB egress, scale-to-zero after 5 min idle, full PostGIS support | Encoded polylines + compact `raw_points_json` JSONB instead of per-point SQL rows; simplified `LINESTRING` geometries; KV caching on leaderboards and heatmaps; retry wrapper on scale-to-zero wakeup |
| **Cloudflare Workers & KV** | 100,000 Worker requests/day, 10 ms CPU/invocation, 100,000 KV reads/day, 1,000 KV writes/day, 1 GB KV storage | Background segment matching via `ctx.waitUntil`; short-TTL KV cache (60s leaderboards, 300s heatmap, 24h geocode) avoiding excess KV writes; Web Crypto PBKDF2/JWT keeping CPU <5ms |
| **Brevo (Email)** | 300 transactional emails/day (no credit card required) | Only essential verification/reset emails sent by default; weekly digest opt-in (off by default); KV daily counter capped at 290 with graceful 503 error before cap |
| **Firebase Cloud Messaging (FCM)** | Unlimited push notifications on Spark free plan (HTTP v1 API) | Batching/deduplication (`kudos` grouped per activity); quiet hours respect; auto-pruning invalid/unregistered tokens on 404/400 |
| **Ola Maps / OpenFreeMap** | Ola Maps: 100,000 free monthly API events (prepaid beyond free allowance). OpenFreeMap: free vector styles with zero API key or limits | All geocoding proxied & KV-cached 24h; no external routing APIs used for route discovery (PostGIS `ST_DWithin` instead); automatic OpenFreeMap fallback |
| **GitHub Actions** | 2,000 free CI minutes/month for private repos (unlimited for public repos) | Lean cached Node + Flutter CI jobs |

---
name: cloud-service-recovery
description: Diagnose, wake, restore, or migrate paused, sleeping, or disconnected external backends and databases (paused Supabase free-tier projects, suspended Neon compute, expired API keys, broken RLS/webhooks, or archived databases) without breaking working application code. Use when resuming a project whose Supabase/DB/cloud service is paused or unreachable.
---

# Cloud Service & Paused Database Recovery

Follow `core/SECURITY.md`, `core/STATE_PROTOCOL.md`, and `skills/provider-onboarding/SKILL.md`.

## 1. Golden Rule — Never Break Working Code When Infrastructure Is Paused
- Inspect `.env*` variable names (without printing secret values), `supabase/config.toml`, `supabase/migrations/`, ORM configs (`prisma/`, `drizzle.config.*`), and real runtime/network errors first.
- Recognize paused or sleeping cloud service signatures:
  - **Supabase paused free-tier project**: `HTTP 540`, `ENOTFOUND db.<ref>.supabase.co`, `PGRST` connection timeout, paused REST/Auth/Storage endpoints, or Dashboard showing `INACTIVE` / `PAUSED`.
  - **Neon / Serverless Postgres sleeping compute**: cold-start timeout, suspended endpoint, or expired branch connection string.
  - **Upstash / Redis / External APIs**: archived free-tier database, expired webhook secret, or revoked/rotated API key.
- **Never** tear down working database queries, delete migrations, or replace real persistence with fake hardcoded mocks just because the cloud service is paused.

## 2. Wake or Restore Paused Supabase Projects
- Check whether Supabase MCP tools (`list_projects`, `get_project`, `restore_project`) or authenticated Supabase CLI are available in your active agent environment:
  - Inspect project status (`INACTIVE` / `PAUSED` vs `ACTIVE_HEALTHY`) without printing secrets or touching unrelated user projects.
  - If authorized by the owner's resume prompt and `restore_project` is available, trigger project restoration and wait for health checks to become active.
- If MCP/CLI cannot restore it directly (or auth is not signed in), give the owner **one plain-English numbered step at a time**:
  1. Open the Supabase Dashboard (`https://supabase.com/dashboard/project/<project-ref>` if ref is known from `.env.local` URL or `supabase/config.toml`).
  2. Click **Restore project** and wait 1–3 minutes for Postgres, Auth, Storage, and Realtime to become active.
  3. Reply when restored so the agent can re-verify connections and flows.

## 3. Migrate or Rebuild If Permanently Archived or Switching Projects
- If a paused free-tier project was archived beyond restoration or the owner wants to connect a fresh Supabase / Neon / database project:
  1. Keep all working application code intact and point `.env.local` to the new project URL/keys (instruct the owner where to paste keys locally—never ask for secrets in chat).
  2. Apply repository migrations (`supabase/migrations/*.sql`, `prisma migrate deploy` / `db push`, `drizzle-kit push`) idempotently without losing existing schemas.
  3. Recreate or verify Row Level Security (`RLS`) policies, Postgres functions/triggers, Storage buckets + policies, Auth redirect URLs, and OAuth/SMTP settings.
  4. Run or write idempotent seed scripts (`supabase/seed.sql` or app seed script) so the resumed app starts with realistic working data.

## 4. Verify End-to-End & Update State
- Test real database reads/writes, Auth login/session refresh, RLS isolation (`401`/`403` for unauthorized access), and API endpoints locally.
- Update `.vibekit/STATE.md` (`Workflow Status: READY FOR MY REVIEW`), `CHECKLIST.md`, and `QUALITY_CASES.md` with honest verification evidence (or exact remaining external blocker if waiting on owner restore/keys).
- Start the local preview server and **stop before deployment** unless deployment was explicitly authorized (`DEPLOY MY PROJECT`).

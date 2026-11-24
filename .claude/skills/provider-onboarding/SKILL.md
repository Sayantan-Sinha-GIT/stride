---
name: provider-onboarding
description: Set up PRD-selected external services (Neon, Supabase, Firebase, Cloudflare, Brevo, Stripe, AI APIs, hosting) safely with one-step-at-a-time owner prompts only when unavoidable and strict account/secret isolation. Use when integrating or configuring external services.
---

# Provider Onboarding & Account Isolation

Follow `core/SECURITY.md` (§2 Account, Data & Billing Safety) and `PRD.md`.

## Steps
1. **Inspect Existing Setup First**:
   - Check `PRD.md`, existing repo configs, `.env.example`, `.env.local` variable names (without printing secrets), and CLI auth status (`gh api user`, `vercel whoami`, etc.) before asking the owner anything.
   - If an existing project's Supabase, Neon, or external backend appears paused, sleeping, or unreachable (`HTTP 540`, `ENOTFOUND`, connection timeout), follow `skills/cloud-service-recovery/SKILL.md` (via Supabase MCP `restore_project` or a 1-step dashboard restore) instead of misdiagnosing paused infrastructure as broken code.
   - For Cloudflare or Brevo integrations, read `references/cloudflare-brevo.txt`.
   - If the project is intended for sale or client handover, follow `skills/sell-ready-website/SKILL.md` so personal accounts/refs stay isolated and `.env.example` stays buyer-ready.
2. **Respect Account Ownership (Personal vs. Friend/Client)**:
   - Confirm whether this project belongs to the owner or a friend/client (`SPECIAL CASE 4`). Never silently attach personal accounts to a friend/client project.
3. **Protect Existing Services & Free Tiers**:
   - Default to free tiers when `PRD.md` allows discretion. Never provision paid plans without explicit approval.
   - Never pause, delete, or overwrite existing portfolio databases or deployments.
4. **Prepare Code & Env Templates First**:
   - Wire SDKs, server-side routes, `.env.example` keys, and helpful error handling first so the owner only performs truly unavoidable external dashboard/key steps.
5. **One Owner Action at a Time**:
   - If an external key, OAuth login, or dashboard click is required, give exact numbered steps for **one step at a time** in plain English.
   - Tell the owner where to paste keys locally (`.env.local` or host dashboard)—never ask them to paste live keys in chat.
6. **Verify Integration**:
   - Test the live integration end-to-end (or mark `blocked` cleanly in `CHECKLIST.md` / `QUALITY_CASES.md` during local preview if waiting on an owner key).

---
name: github-deploy-debug
description: Diagnose and repair CI/CD or live hosting failures when an app works locally but fails online, inspecting build/deployment logs and commit SHAs without force-pushing or bypassing errors.
---

# Live Deployment & CI/CD Debugging

Follow `core/RULES.md` and `core/SECURITY.md`. **Never blame caching without evidence, never force-push (`--force`), and never silence errors (`|| true`).**

## Steps
1. **Locate Exact Failing Revision & Logs**:
   - Check `git status -sb`, `git rev-parse HEAD`, CI status (`gh run list --commit <SHA>`, `gh run view <RUN_ID> --log-failed`), or hosting provider build/runtime logs (`vercel logs`, Cloudflare/Netlify/Render logs, etc.).
   - Identify the **first causal error** (missing env var, Node/Python runtime mismatch, case-sensitive import path on Linux vs. Windows, build step failure, DB migration gap, or wrong live commit SHA).
2. **Reproduce & Fix Cleanly Locally**:
   - Reproduce with the stack's production build command locally (`core/STACK_DETECTION.md`).
   - Apply the clean root-cause fix without downgrading UI, security, or features, and re-verify locally.
3. **Redeploy Within Authorization Scope**:
   - If live redeployment is authorized, push/deploy and confirm the live revision matches the fixed commit SHA; otherwise ask the owner before pushing to a production-triggering branch.
4. **Verify Live**:
   - Confirm the failed flow now succeeds on the live URL with real observed evidence and update `.vibekit/STATE.md`.

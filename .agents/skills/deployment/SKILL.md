---
name: deployment
description: Execute the unified DEPLOY MY PROJECT workflow (Stage 6 production readiness checks + Stage 7 authorized live deployment) when explicitly authorized by the owner, verifying the live application and URL.
---

# Production Preparation & Authorized Live Deployment (`Stages 6–7`)

Follow `core/WORKFLOW.md` (Stages 6–7), `core/SECURITY.md`, and `skills/production-readiness/SKILL.md`. **Only execute when deployment has been explicitly authorized in the current request (`DEPLOY MY PROJECT` or explicit deploy approval).**

## Steps
1. **Authorize & Load Context**:
   - Update `.vibekit/STATE.md` to `Workflow Status: DEPLOYMENT AUTHORIZED`.
   - Read the project PRD (`PRD.md` / `PRD.txt`), `CHECKLIST.md`, `QUALITY_CASES.md`, `.vibekit/DECISIONS.md`, and actual repo manifests (`core/STACK_DETECTION.md`).
2. **Execute Production Readiness (`Stage 6`)**:
   - Run the production build, typechecks, linters, and full functional + regression tests.
   - Audit security (`skills/security-audit/SKILL.md`), validate `.env.example` and host runtime environment variables, and verify integrations without leaking secrets.
   - Run `./CHECK_QUALITY_CASES.ps1 -Mode Release` (or `node scripts/validation/check-quality.mjs --mode release`).
   - Investigate and fix any build, config, security, or functional defects cleanly without downgrading UI, motion, 3D, or required features.
3. **Verify Target, Ownership & Safe Gate**:
   - Determine the intended hosting provider and environment from the PRD, repo config, and `.vibekit/DECISIONS.md`.
   - Confirm active CLI/account matches the project owner (`gh api user`, `vercel whoami`, etc.)—never silently deploy a friend/client project to personal accounts, and never silently create paid resources.
   - If an unresolvable critical failure, missing owner login/credential, payment, unclear target, or destructive action blocks safe release, **STOP and explain the exact blocker** rather than deploying a broken app.
4. **Deploy & Verify Live (`Stage 7`)**:
   - Protect existing live databases (non-destructive migrations only).
   - Deploy to the authorized destination and confirm the live site serves the expected revision/commit.
   - Smoke-test primary live routes, assets, and core user flows (`skills/browser-verification/SKILL.md`).
   - Update `.vibekit/STATE.md` (`Workflow Status: DEPLOYED`) and report the actual live URL, deployed revision, verified checks, and any remaining limitations.

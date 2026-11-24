---
name: production-readiness
description: Verify production readiness (Stage 6) via production builds, full regression tests, security checks, env validation, and Release quality gates—used inside DEPLOY MY PROJECT prior to live deployment (or standalone when explicitly asked to check readiness only).
---

# Production Readiness Verification (Stage 6)

Follow `core/WORKFLOW.md` (Stages 6–7) and `core/SECURITY.md`. When invoked inside `DEPLOY MY PROJECT`, pass straight into `skills/deployment/SKILL.md` once readiness passes; when invoked standalone for readiness check only, stop before deploying.

## Steps
1. **Verify Context & Stack (`core/STACK_DETECTION.md`)**:
   - Read the project PRD (`PRD.md` / `PRD.txt`), `.vibekit/STATE.md`, `CHECKLIST.md`, and repo build/test manifests.
2. **Run Production Build & Tests**:
   - Run the stack's actual production build, typecheck, linter, and full functional + regression test suite.
   - Fix genuine TypeScript, bundler, SSR, migration, functional, or config bugs **without downgrading UI, 3D, motion, or security**.
3. **Environment & Provider Audit**:
   - Confirm `.env.example` lists all required runtime keys and verify production env vars/secrets exist (or document clearly which env vars must be configured on the host).
   - Confirm no secrets or local machine paths exist in git or client bundles.
4. **Security & Release Quality Gate**:
   - Run key checks from `skills/security-audit/SKILL.md` and `skills/browser-verification/SKILL.md` on the production preview if runnable locally.
   - Update `QUALITY_CASES.md` / `CHECKLIST.md` and run `CHECK_QUALITY_CASES.ps1 -Mode Release` (or `node scripts/validation/check-quality.mjs --mode release`).
5. **Proceed or Gate**:
   - Update `.vibekit/STATE.md` and `.vibekit/HANDOFF.md`.
   - If critical checks fail or an unavoidable owner credential/action blocks release, stop and explain cleanly. Otherwise proceed to authorized Stage 7 deployment if `DEPLOYMENT AUTHORIZED`, or report readiness and stop if readiness-only was requested.

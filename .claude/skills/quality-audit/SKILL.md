---
name: quality-audit
description: Independently verify whether all PRD requirements and CHECKLIST.md items genuinely work end-to-end without dead buttons, stubbed flows, or missing persistence, updating QUALITY_CASES.md and running CHECK_QUALITY_CASES. Use for full functional audits.
---

# Independent Functional Quality Audit

Follow `core/QUALITY_STANDARD.md`, `UI-UX Preferences.txt`, and `core/UI_UX_PREFERENCES.md`. **Never trust prior "done" claims without direct evidence.**

## Steps
1. **Reconcile Requirements**:
   - Read the project PRD (`PRD.md` / `PRD.txt`) and `CHECKLIST.md`. Ensure every required page, role, flow, and interactive control has a `REQ-*` row and priority (`high`/`must`/`standard`/`optional`).
2. **Hunt for Fake Completeness**:
   - Inspect handlers, API routes, DB queries, and forms for:
     - Dead buttons (`() => {}`, `href="#"`, un-wired `onClick`/`onSubmit`).
     - Static hardcoded mock arrays pretending to be dynamic database results.
     - Success toasts fired without awaiting server confirmation.
     - Missing error, empty, or loading states.
     - Client-side-only auth or permission checks.
3. **Exercise Real User Flows & UI/UX Standard**:
   - Run automated tests, API requests, and browser flows (`skills/browser-verification/SKILL.md`).
   - Verify created/updated/deleted data persists across reloads.
   - Verify the rendered UI honors `UI-UX Preferences.txt` & `core/UI_UX_PREFERENCES.md` (unless the PRD explicitly mentions a simplistic UI/UX): crisp `1440px–1920px` desktop & `390px` mobile layout, zero overlapping text, clipped controls, missing 3D model parts, empty hero voids, or underwhelming static sections.
4. **Fix & Record Evidence**:
   - Fix confirmed defects cleanly, re-test, and update `CHECKLIST.md` and `QUALITY_CASES.md` with honest observed evidence.
   - Run `./CHECK_QUALITY_CASES.ps1` (or `node scripts/validation/check-quality.mjs`) to confirm ledger consistency and update `.vibekit/STATE.md` (`Workflow Status: READY FOR MY REVIEW`).
   - Report exact **Verified**, **Failed**, and **Blocked** counts honestly and stop at local preview without deploying.

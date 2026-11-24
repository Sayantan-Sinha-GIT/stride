# Quality Standard & Risk-Based Verification

> **Core Rule:** Code existing on disk is **not** proof that a feature works. Every required feature must be verified with honest evidence before it is marked complete.

## 1. Zero Dead Functionality Checklist
Evaluate every applicable surface in the product:
- [ ] **Navigation & Links**: Every route, menu item, anchor link (`#section`), breadcrumb, and external link resolves cleanly (no dead `href="#"` placeholders).
- [ ] **Buttons & Actions**: Every button triggers real state updates, navigation, or backend actions (zero empty `() => {}` handlers or "Coming soon" stubs on required features).
- [ ] **Forms & Validation**: Client and server validation, clear error messages, loading/disabled submit states, and real persistence on submit.
- [ ] **Search, Filter, Sort, Pagination**: Actually alter results accurately and handle zero-result empty states.
- [ ] **Modals, Drawers & Menus**: Open/close via button, Escape key, and backdrop; focus management and no offscreen clipping.
- [ ] **Authentication & Authorization**: Signup, login, logout, session persistence across reloads, password reset/error flows, protected routes, and role/tenant permissions enforced server-side.
- [ ] **Data Persistence**: Created/edited/deleted records survive full page reload or process restart.
- [ ] **Integrations & Uploads**: Real provider calls, upload size/type limits, graceful error handling when external services fail or return rate limits.
- [ ] **Payments (Test Mode Only by Default)**: Proper checkout/webhook state handling without bypassing server verification.
- [ ] **Responsive & 3D**: Crisp `1440px–1920px` desktop, `768px` tablet, and `390px` mobile usability; real interactive 3D navigation/selection where 3D is a core feature.

## 2. Requirement Status Lifecycle
Track every requirement in `CHECKLIST.md` using these exact statuses:
- `planned` — Extracted from `PRD.md` or user request; not yet built.
- `implementing` — Currently under development.
- `implemented-unverified` — Code written, not yet tested end-to-end.
- `verified` (or `passed`) — Tested and confirmed working with recorded evidence.
- `failed` — Tested and found broken; needs repair.
- `blocked` — Cannot be verified locally due to a documented external blocker (e.g., awaiting owner API key or DNS setup).

## 3. Risk-Based Verification Tiers
Do not manufacture fake multi-round paperwork for small tasks, and do not skip edge cases on critical paths:

| Risk Tier | Applies To | Minimum Verification Required |
|---|---|---|
| `high` | Auth, permissions, payments, destructive mutations, security boundaries, core 3D/interactive engines | Happy path **plus** negative/error/boundary/authorization verification (at least 2 distinct checks before release). |
| `must` | Mandatory core PRD features & primary user journeys | End-to-end happy path + key validation/empty-state verification with real command/browser evidence. |
| `standard` | Secondary flows, non-critical UI enhancements, preferences | Functional check + visual/responsive check. |
| `artifact` | Docs, configs, schemas, static assets | Structural/syntax/existence verification. |
| `optional` | Nice-to-have features | Verify if implemented; clearly note if deferred. |

## 4. Tracking Formats (`CHECKLIST.md` & `QUALITY_CASES.md`)
`CHECK_QUALITY_CASES.ps1` and `scripts/validation/check-quality.mjs` support both the modern VibeKit format below and legacy 10-column + `REGRESSION_RUNS.md` ledgers.

### `CHECKLIST.md` Standard Table
```markdown
| ID | Category | Requirement | Priority | Status | Verification | Evidence |
|---|---|---|---|---|---|---|
| REQ-01 | Auth | User can sign up and log in | high | verified | POST /api/auth/login + reload test | Playwright & API 200 OK; cookie persists |
```

### `QUALITY_CASES.md` Standard Table
```markdown
| ID | Requirement | Risk | Scenario | Method | Result | Status | Evidence |
|---|---|---|---|---|---|---|---|
| QC-01 | REQ-01 | high | Valid login redirects to dashboard and persists session | HTTP + Browser | Redirects to /dashboard; reload stays signed in | passed | `npm test` + screenshot check 2026-11-17 |
| QC-02 | REQ-01 | high | Invalid password returns 401 without creating session | HTTP | Returns 401 JSON error; UI shows inline error | passed | `curl -i` returned HTTP 401 |
```

## 5. Evidence Integrity Rules
1. **Never fabricate** test runs, screenshots, HTTP statuses, or browser checks.
2. When running in **Preview Mode (`Stage 5`)**, an external-key-dependent feature may be marked `blocked` **only** if its blocker and exact owner step are documented in `Evidence`.
3. When running in **Release Mode (`Stage 6`)**, every `high` and `must` requirement must be `passed`/`verified` (no unresolved `failed`, `planned`, or `implemented-unverified` items).
4. Keep repair loops bounded: after 2 unsuccessful fixes on the same root cause, pause, re-examine assumptions from logs/reproduction, and pivot cleanly rather than guessing blindly.

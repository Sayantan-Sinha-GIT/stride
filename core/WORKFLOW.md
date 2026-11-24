# Universal Software Development Lifecycle & Adaptive Execution

## 1. Execution Modes (Conceptual)
Use **AUTO — Quality-First Adaptive Execution** as the default mode unless a specific scope calls for another:

- **`AUTO` (Default)**: Assess task scope, codebase state, and available agent capabilities (`core/CAPABILITIES.md`). Choose the leanest path that achieves full quality and real verification.
- **`SOLO`**: A single agent executes all necessary specialist roles sequentially (`core/roles/`). Always works on any platform, even with zero subagents, MCP servers, or browser automation.
- **`TEAM`**: Uses real, supported subagents (or optional Antigravity `/swarm` when explicitly appropriate) for parallel independent modules or independent QA verification. Never fake delegation.
- **`DEEP`**: Applies thorough investigation, security review, edge-case testing, and independent verification for high-risk, architectural, or persistently failing work.
- **`FOCUSED`**: Direct execution for small, well-scoped fixes or minor UI/copy updates without running heavy multi-stage ceremonies.

## 2. Owner Workflow States (`BUILD -> REVIEW/REVISE -> DEPLOY`)
Every project tracks its owner-facing lifecycle boundary explicitly in `.vibekit/STATE.md` under `- **Workflow Status**:`:

1. **`BUILDING`**: Agent is implementing the initial application from the PRD.
2. **`READY FOR MY REVIEW`**: Local implementation and available checks are complete, a real local preview is running, and the agent is waiting for owner feedback.
3. **`REVISING`**: Agent is applying requested features, bug fixes, UI/UX refinements, or audits while preserving working functionality and returning to local preview (`READY FOR MY REVIEW`).
4. **`DEPLOYMENT AUTHORIZED`**: Owner explicitly pasted `DEPLOY MY PROJECT` (or explicitly authorized live deployment in the current session).
5. **`DEPLOYED`**: Production readiness checks passed, deployment succeeded, and the live URL was verified.

**Strict Boundary Rules:**
- `BUILD MY PROJECT`, `CONTINUE PROJECT`, `ADD OR MODIFY FEATURE`, `DEBUG & OVERHAUL EXISTING PROJECT`, `DEBUG ONLY — STRICT BUG FIX`, `IMPROVE UI/UX`, `FULL PROJECT AUDIT`, `SWITCH CODING AGENT`, `RESUME PAUSED SUPABASE OR SLEEPING CLOUD BACKEND`, `PREPARE WEBSITE FOR SALE / BUYER HANDOVER`, `MONETIZE WEBSITE`, `REBRAND OR PIVOT EXISTING WEBSITE`, `ADOPT EXISTING REPO OR TEMPLATE`, `DATABASE, SUPABASE RLS, MIGRATIONS & RICH SEED DATA`, and `SEO, PERFORMANCE, LIGHTHOUSE & CONVERSION POLISH` must **never** authorize deployment or push to a production-triggering branch.
- Only `DEPLOY MY PROJECT` (or explicit deployment authorization in the current session) permits entering `DEPLOYMENT AUTHORIZED` and executing live deployment.

## 3. The 8-Stage Universal Lifecycle

### Stage 0 — Understand & Auto-Connect
1. If VibeKit files (`AGENTS.md`, `core/`, `skills/`) are missing from a target project folder, automatically locate the kit via `~/.vibekit/kit-path.txt` (or standard kit folders) and install project-locally (`SETUP_ANTIGRAVITY.ps1 -Project "<dir>"` or `node "<kit>/scripts/setup/vibekit.mjs" install --project "<dir>"`) without asking the owner to run terminal commands.
2. Read `AGENTS.md`, the project PRD (`PRD.md`, `PRD.txt`, or another clearly identifiable PRD file), `.vibekit/STATE.md`, `CHECKLIST.md` (and legacy `PROGRESS.md` if present).
3. Inspect the actual repository files (`core/STACK_DETECTION.md`).
4. Classify the request (`BUILDING`, `REVISING`, `DEPLOYMENT AUTHORIZED`, or standalone audit/PRD).
5. **Never scaffold a new project over an existing codebase** unless explicitly instructed to replace it.

### Stage 1 — Product Planning
1. Extract user roles, core journeys, functional requirements, screens/routes, data rules, external integrations, constraints, and acceptance criteria from the PRD.
2. Write or update `CHECKLIST.md` with stable IDs (`REQ-01`, `REQ-02`, ...), priorities (`high` / `must` / `standard` / `optional`), and initial statuses (`planned`).
3. Resolve low-risk ambiguity independently and mark assumptions `(default)`. Ask the owner only about materially blocking decisions (e.g., paid service vs. free tier, destructive data migration, conflicting product requirements).

### Stage 2 — Architecture & Design Direction
1. Select or confirm the stack based on the PRD and existing repo manifests (`core/STACK_DETECTION.md`).
2. Establish visual direction from `UI-UX Preferences.txt` and `core/UI_UX_PREFERENCES.md` alongside the PRD, `my-design/` (if supplied), and `design-inspire/` (mood only, never copy). Enforce the owner's full UI/UX preferences and flagship ambition by default—ignore them ONLY when the PRD explicitly mentions a simplistic UI/UX.
3. Record significant architectural/design choices in `.vibekit/DECISIONS.md` and initialize `.vibekit/STATE.md` (`Workflow Status: BUILDING`).

### Stage 3 — Core Implementation
1. Build in coherent vertical slices (UI + state + API + validation + persistence + auth + error/empty/loading states).
2. Wire 100% of interactive controls (`core/QUALITY_STANDARD.md`). Zero dead buttons, empty handlers, or silent mock fallbacks masquerading as working features.
3. Update `CHECKLIST.md` statuses (`implementing` -> `implemented-unverified`) and `.vibekit/STATE.md` at meaningful milestones.

### Stage 4 — Design Refinement
1. Evaluate the actual rendered application using browser tools (`skills/browser-verification/SKILL.md`, `skills/chrome-devtools/SKILL.md`, `skills/reference-ui-analysis/references/browser-layout-probe.js`) when available.
2. Enforce `UI-UX Preferences.txt` and `core/UI_UX_PREFERENCES.md` (ignoring them ONLY when the PRD explicitly mentions a simplistic UI/UX): refine typography, rich density without empty hero/section voids, layered/living backgrounds, responsiveness (`1440px–1920px` desktop, `768px` tablet, `390px` mobile), WCAG AA contrast, immediate capability discoverability, bold scroll & interactive choreography (`skills/frontend-design/SKILL.md`, `skills/cinematic-web-motion/SKILL.md`), convincing real 3D where part of the product's promise, and `BookMyShow`-grade mobile ergonomics.
3. If `my-design/home.html` exists, verify alignment with its approved visual identity while fixing any responsiveness, contrast, or usability defects.

### Stage 5 — Local Verification & Preview *(CRITICAL DEFAULT STOP)*
1. Run stack-appropriate type checks, linters, unit/integration tests, and interactive smoke checks. (Normal local builds or compilation checks required for testing are allowed; do **not** run a separate final release deployment workflow.)
2. Update `QUALITY_CASES.md` and `CHECKLIST.md` with real verification evidence. Run `CHECK_QUALITY_CASES.ps1 -Mode Preview` (or `node scripts/validation/check-quality.mjs --mode preview`) when applicable.
3. Start the appropriate local dev/preview server (detected from project manifests—never blindly assuming `npm run dev`).
4. Update `.vibekit/STATE.md` to `Workflow Status: READY FOR MY REVIEW` and save `.vibekit/HANDOFF.md`.
5. **STOP here by default.** Do **not** deploy, publish, or push to a live deployment-triggering branch. Never invent a preview URL or claim verification that did not run. Ask the owner to review clearly:
   ```text
   Your application is ready for local preview.
   Open: [actual preview URL]
   I've implemented the required features and completed the available local checks.
   Please try the application and tell me what you want changed.
   When you're completely satisfied, use the DEPLOY MY PROJECT prompt from START_HERE.txt.
   ```
   *(If a genuine external blocker prevents previewing or completing a feature, explain the exact blocker and next step instead of claiming it works.)*

### Stages 6–7 — Production Readiness & Authorized Deployment *(Unified via `DEPLOY MY PROJECT`)*
Triggered when the owner pastes `DEPLOY MY PROJECT` (`PROMPT 2` in `START_HERE.txt`) or explicitly authorizes deployment (`Workflow Status: DEPLOYMENT AUTHORIZED`):
1. **Production Readiness (`Stage 6`)**:
   - Read the PRD, `CHECKLIST.md`, `QUALITY_CASES.md`, `.vibekit/DECISIONS.md`, and `.vibekit/STATE.md`.
   - Run the stack's production build, typechecks, linters, and full functional & regression test suite.
   - Run security audit (`skills/security-audit/SKILL.md`, `core/SECURITY.md`), validate `.env.example` and runtime environment variables, and verify external integrations.
   - Run `CHECK_QUALITY_CASES.ps1 -Mode Release` (or `node scripts/validation/check-quality.mjs --mode release`).
   - Fix any build, configuration, security, or functionality issues autonomously without downgrading UI, motion, 3D, or features.
   - If an unresolved critical failure, missing owner credential/login, payment requirement, unclear deployment target, or destructive action blocks safe deployment, **stop and explain** rather than publishing a broken app.
2. **Authorized Live Deployment (`Stage 7`)**:
   - Determine the intended hosting provider and environment from the PRD, repo config, and `.vibekit/DECISIONS.md`.
   - Confirm active CLI/account ownership matches the project owner (never deploy a friend/client project under personal accounts, and never silently create paid resources).
   - Deploy to the authorized destination, confirm the live site serves the expected revision/commit, and smoke-test primary live flows safely.
   - Update `.vibekit/STATE.md` to `Workflow Status: DEPLOYED` and report the real live URL, deployed revision, and verification evidence.

*(Note: If someone explicitly asks for Stage 6 readiness checks ONLY without deploying, run Stage 6 and stop before Stage 7.)*

## 4. Legacy 3-Step Compatibility Mapping
VibeKit runs `BUILD -> REVIEW/REVISE -> DEPLOY` seamlessly in `AUTO` mode without requiring multiple tabs:

| Legacy Stage | Modern VibeKit Equivalent |
|---|---|
| **Step 1 (`@workhorse` / `@flash-workhorse`)** | Stages 0–3 + Stage 5 local preview stop (`skills/build-from-prd/SKILL.md`) |
| **Step 2 (`@ui-beautifier`)** | Stage 4 functional + UI/UX refinement (`REVISING` -> `READY FOR MY REVIEW`) |
| **Step 3 (`@qa-surgeon`)** | Unified `PROMPT 2 — DEPLOY MY PROJECT` (Stage 6 readiness + Stage 7 authorized deployment) |

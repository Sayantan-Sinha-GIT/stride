---
name: build-from-prd
description: Build a complete working application from PRD.md, PRD.txt, or another clearly identifiable PRD across auto-setup, planning, architecture, implementation, design refinement, and local verification, stopping at a local preview without deploying. Use when starting a project from a PRD.
---

# Build Application from PRD (`BUILDING` -> `READY FOR MY REVIEW`)

Follow `core/RULES.md`, `core/WORKFLOW.md`, `core/QUALITY_STANDARD.md`, `core/SECURITY.md`, `UI-UX Preferences.txt`, and `core/UI_UX_PREFERENCES.md`.

## Steps
1. **Auto-Setup & Detect (`Stage 0`)**:
   - If VibeKit files (`AGENTS.md`, `core/`, `skills/`) are missing from the target workspace, locate the kit via `~/.vibekit/kit-path.txt` (or standard kit folders) and run project-local installation automatically without asking the owner to run setup scripts manually.
   - Locate and read the entire PRD (`PRD.md`, `PRD.txt`, or any clearly identifiable PRD file), `.vibekit/STATE.md` (if present), and existing repo manifests (`core/STACK_DETECTION.md`).
   - Check for `my-design/` (supplied design reference) and `design-inspire/` (optional visual inspiration).
   - Never overwrite existing working code if resuming or upgrading; reconcile state first.
2. **Plan Requirements (`Stage 1`)**:
   - Extract all roles, flows, screens, data models, integrations, and constraints into `CHECKLIST.md` (`REQ-01`, `REQ-02`, ... with `high`/`must`/`standard`/`optional` priority).
   - Initialize `.vibekit/STATE.md` (`Workflow Status: BUILDING`) and `.vibekit/DECISIONS.md` (`core/STATE_PROTOCOL.md`).
   - Resolve routine technical decisions independently with `(default)`; ask the owner only about materially blocking choices or paid dependencies.
3. **Architect & Select Design Direction (`Stage 2`)**:
   - Choose a lean, reliable stack honoring the PRD and free tiers where unspecified.
   - Establish visual identity from `UI-UX Preferences.txt` and `core/UI_UX_PREFERENCES.md` (mandatory unless the PRD explicitly mentions a simplistic UI/UX), honoring PRD functional specifics, `my-design/`, and `skills/frontend-design/SKILL.md`.
4. **Implement Core Vertical Slices (`Stage 3`)**:
   - Build frontend, state, backend routes, validation, auth, persistence, and provider wiring (`skills/provider-onboarding/SKILL.md`).
   - Wire 100% of interactive controls—zero dead buttons, fake handlers, or undisclosed stubs.
5. **Refine Design & Verify Locally (`Stages 4–5`)**:
   - Inspect rendered views (`skills/browser-verification/SKILL.md`) and verify crisp desktop (`1440px–1920px`) and mobile (`390px`) layouts plus authentic 3D if central to the product.
   - Run stack checks (`lint`, `typecheck`, `tests`, and local test builds if needed), fix discovered issues, and record real evidence in `QUALITY_CASES.md` and `CHECKLIST.md`.
   - Start the local preview server detected from the project stack.
   - Update `.vibekit/STATE.md` (`Workflow Status: READY FOR MY REVIEW`) and `.vibekit/HANDOFF.md`.
6. **Stop at Local Preview (`CRITICAL STOP RULE`)**:
   - Do **not** deploy, publish, push to a live/deployment-triggering branch, or run the final release deployment stage.
   - Never invent a preview URL or falsely claim completion. If blocked (e.g., missing external key), state the exact blocker clearly.
   - Ask the owner to review the local preview and explain that when satisfied they can paste `DEPLOY MY PROJECT` from `START_HERE.txt`.

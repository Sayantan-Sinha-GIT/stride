<!-- VIBEKIT:START -->
# VibeKit — Universal Agent Instructions

This repository uses **VibeKit**. Follow these rules regardless of which coding agent or model you run on.

## 1. Core Priority & Execution Mode
- **Philosophy**: **QUALITY FIRST. INTELLIGENT EXECUTION. ZERO UNNECESSARY WORK.**
- **Priority Order**:
  1. Security, data integrity, and explicit owner constraints (`core/SECURITY.md`).
  2. Complete, genuinely working functionality — zero dead buttons or fake handlers (`core/QUALITY_STANDARD.md`).
  3. Owner UI/UX Preferences & Standard (`core/UI_UX_PREFERENCES.md` & `UI-UX Preferences.txt` — mandatory across all builds, overhauls, feature work, and UI/UX improvements; ignored ONLY when the PRD explicitly specifies a simplistic UI/UX).
  4. Reliable architecture & stack fit (`core/STACK_DETECTION.md`).
  5. Honest verification with observed evidence.
  6. Quota efficiency (do not read irrelevant files or write long chat essays; never drop quality or testing).
- **Default Execution Mode**: **AUTO** (`core/WORKFLOW.md`). Scale effort to the task (`FOCUSED` for small fixes; full Stages 0–5 for new builds). Use native orchestration or subagents only if available; otherwise execute roles sequentially in `SOLO` mode without pretending unavailable tools exist.

## 2. Non-Negotiable Safety & Lifecycle Boundaries
- **Inspect Existing Code First**: Never scaffold a new project over an existing codebase unless asked to replace it. Preserve working code during feature additions, resumes, or `DEBUG ONLY — STRICT BUG FIX` (weaker models); in `DEBUG & OVERHAUL EXISTING PROJECT` (strong agents), fix root causes and freely overhaul weak code, UI/UX, and strategic PRD sections while respecting the 3 guardrails.
- **Stack Independence**: Detect actual commands from `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pubspec.yaml`, etc. (`core/STACK_DETECTION.md`). Never blindly run `npm run dev`.
- **Stop at Local Preview by Default (Stage 5 — `READY FOR MY REVIEW`)**: Do **not** run final release deployment, publish, or push to a live branch unless explicitly authorized (`DEPLOY MY PROJECT`). Normal local builds/compilations needed for testing are allowed.
- **Unified Authorized Deployment (`DEPLOY MY PROJECT`)**: When the owner pastes `DEPLOY MY PROJECT` (explicitly authorizing deployment), execute Stage 6 production readiness checks (production build, regression suite, security checks, env validation, auto-fixing issues) AND Stage 7 live deployment + live verification in one coherent flow. (If asked separately to check readiness only, stop before deploying.)
- **Flexible PRD & Auto-Setup**: Read `PRD.md`, `PRD.txt`, or any clearly identifiable PRD file. If VibeKit files are missing in a workspace, install them automatically from `~/.vibekit/kit-path.txt` without asking the owner to run manual terminal setup commands.
- **Secrets & Accounts**: Keep `.env*` secrets out of chat and git. Ask the owner for at most one unavoidable external dashboard/key action at a time. Never use personal accounts on a friend/client project, and never pause/delete existing cloud projects.

## 3. Progressive Context Loading (Load Only What This Task Needs)
Read `core/RULES.md` once when starting substantial work. Then load **only** the task-relevant docs and `skills/<name>/SKILL.md`:

| Task Type | Read Core Files | Load Skill(s) |
|---|---|---|
| Rough idea / draft PRD | `core/RULES.md`, `core/UI_UX_PREFERENCES.md`, `UI-UX Preferences.txt` | `skills/improve-prd/SKILL.md` |
| New build from PRD (`PRD.md` / `PRD.txt`) | `core/WORKFLOW.md`, `core/STACK_DETECTION.md`, `core/UI_UX_PREFERENCES.md`, `UI-UX Preferences.txt`, `core/QUALITY_STANDARD.md` | `skills/build-from-prd/SKILL.md`, `skills/project-planning/SKILL.md` |
| Resume / Switch agent | `core/STATE_PROTOCOL.md`, `core/UI_UX_PREFERENCES.md`, `UI-UX Preferences.txt` | `skills/project-resume/SKILL.md` |
| Add feature | `core/STACK_DETECTION.md`, `core/QUALITY_STANDARD.md`, `core/UI_UX_PREFERENCES.md`, `UI-UX Preferences.txt` | `skills/feature-development/SKILL.md`, `skills/frontend-design/SKILL.md` |
| Fix bug / Recovery | `core/QUALITY_STANDARD.md`, `core/UI_UX_PREFERENCES.md`, `UI-UX Preferences.txt` (Mode A overhaul) | `skills/debugging/SKILL.md` |
| UI design / Redesign / 3D | `core/UI_UX_PREFERENCES.md`, `UI-UX Preferences.txt` | `skills/frontend-design/SKILL.md`, `skills/cinematic-web-motion/SKILL.md`, `skills/reference-ui-analysis/SKILL.md` |
| Backend / Auth / Providers | `core/SECURITY.md`, `core/STACK_DETECTION.md` | `skills/backend-engineering/SKILL.md`, `skills/provider-onboarding/SKILL.md` |
| Paused Supabase / sleeping DB / broken provider | `core/STATE_PROTOCOL.md`, `core/SECURITY.md` | `skills/cloud-service-recovery/SKILL.md`, `skills/provider-onboarding/SKILL.md`, `skills/project-resume/SKILL.md` |
| Sell website / White-label / Buyer handover / Rebrand | `core/QUALITY_STANDARD.md`, `core/SECURITY.md`, `core/UI_UX_PREFERENCES.md`, `UI-UX Preferences.txt` | `skills/sell-ready-website/SKILL.md`, `skills/production-readiness/SKILL.md` |
| Visual / Browser QA | `core/QUALITY_STANDARD.md`, `core/UI_UX_PREFERENCES.md`, `UI-UX Preferences.txt` | `skills/browser-verification/SKILL.md`, `skills/chrome-devtools/SKILL.md` |
| Functional / Security Audit | `core/QUALITY_STANDARD.md`, `core/SECURITY.md`, `core/UI_UX_PREFERENCES.md`, `UI-UX Preferences.txt` | `skills/quality-audit/SKILL.md`, `skills/security-audit/SKILL.md` |
| Deploy my project (Readiness + Deploy) | `core/WORKFLOW.md`, `core/QUALITY_STANDARD.md`, `core/SECURITY.md` | `skills/production-readiness/SKILL.md`, `skills/security-audit/SKILL.md`, `skills/deployment/SKILL.md` |
| Fix live deployment | `core/WORKFLOW.md`, `core/SECURITY.md` | `skills/github-deploy-debug/SKILL.md`, `skills/deployment/SKILL.md` |

## 4. Persistent Project Memory (`.vibekit/`)
- Maintain concise state in `.vibekit/STATE.md`, `.vibekit/DECISIONS.md`, `.vibekit/HANDOFF.md`, `CHECKLIST.md`, and `QUALITY_CASES.md`.
- When resuming (`core/STATE_PROTOCOL.md`), reconcile saved state against actual files and git status before continuing from the first unfinished task.
<!-- VIBEKIT:END -->

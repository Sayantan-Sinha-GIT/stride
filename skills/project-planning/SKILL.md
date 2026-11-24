---
name: project-planning
description: Extract testable requirements, initialize CHECKLIST.md, detect technology stack, and set up .vibekit project state before coding. Use during Stages 0-2 of new or newly-adopted projects.
---

# Project Planning & Initialization

Follow `core/WORKFLOW.md` (Stages 0–2), `core/STACK_DETECTION.md`, and `core/STATE_PROTOCOL.md`.

## Steps
1. **Inspect Existing Workspace**:
   - Check for the project PRD (`PRD.md`, `PRD.txt`, or another clearly identifiable PRD file), source files, manifests (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pubspec.yaml`, etc.), `my-design/`, and `.vibekit/`.
2. **Initialize Tracking Files Safely** (do not overwrite existing ledgers):
   - Create `CHECKLIST.md` decomposing every PRD requirement (`REQ-01`, ...) with `Priority` (`high`, `must`, `standard`, `optional`) and initial status `planned`.
   - Create `QUALITY_CASES.md` starter table (`| ID | Requirement | Risk | Scenario | Method | Result | Status | Evidence |`) or run `CHECK_QUALITY_CASES.ps1 -Init` / `node scripts/validation/check-quality.mjs --init`.
   - Create `.vibekit/STATE.md` and `.vibekit/DECISIONS.md`.
3. **Record Architecture & Design Decisions**:
   - Document chosen stack, data layer, external providers, authentication strategy, and visual direction in `.vibekit/DECISIONS.md`.
   - Note any unresolved external dependencies (API keys, owner dashboard actions) so they do not silently block completion later.
4. **Scope Clarification Gate**:
   - Only ask the owner questions that materially impact scope, money, or irreversible data structure. Proceed autonomously on ordinary engineering choices.

---
name: feature-development
description: Implement new features cleanly inside an existing project in coherent vertical slices (UI, state, backend, persistence, validation, and regression tests) without breaking existing functionality. Use when adding features to an existing codebase.
---

# Feature Development in Existing Projects

Follow `core/RULES.md` (§2 Code Preservation), `core/QUALITY_STANDARD.md`, `UI-UX Preferences.txt`, and `core/UI_UX_PREFERENCES.md`.

## Steps
1. **Inspect Before Editing**:
   - Read `.vibekit/STATE.md`, `CHECKLIST.md`, the project PRD (`PRD.md` / `PRD.txt` if present), `UI-UX Preferences.txt`, `core/UI_UX_PREFERENCES.md`, and existing modules touching the feature area. Set `Workflow Status: REVISING`.
   - Match the project's established patterns, folder layout, design tokens, and package manager (`core/STACK_DETECTION.md`).
2. **Design & Implement Vertical Slice**:
   - Add or update database schema/migrations, server validation, authorization checks, API handlers, client state, UI states (loading, empty, error, success), and tests.
   - Enforce `UI-UX Preferences.txt` and `core/UI_UX_PREFERENCES.md` across all added or modified UI/UX (rich visual presence, bold purposeful motion, immediate discoverability, convincing 3D if applicable, `BookMyShow`-grade mobile ergonomics, crisp `1440px–1920px` desktop proportions, zero dead controls or overlapping elements)—ignore these UI/UX preferences ONLY when the PRD explicitly mentions a simplistic UI/UX.
3. **Update Tracking & Verify**:
   - Add or update `REQ-*` row(s) in `CHECKLIST.md` and case(s) in `QUALITY_CASES.md`.
   - Run relevant tests, typechecks, and adjacent regression checks; verify in browser (`skills/browser-verification/SKILL.md`) when UI changes.
   - Update `.vibekit/STATE.md` (`Workflow Status: READY FOR MY REVIEW`), refresh local preview, and stop without deploying unless explicitly authorized.

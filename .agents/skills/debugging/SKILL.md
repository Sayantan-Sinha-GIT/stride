---
name: debugging
description: Diagnose and fix bugs from root cause using reproduction, logs, and bounded repair cycles without hiding errors, weakening tests, or replacing real logic with mocks. Supports both Unrestricted Debug & Overhaul (flagship agents) and Strict Debug-Only (weaker models).
---

# Root-Cause Debugging, Repair & Overhaul

Follow `core/RULES.md`, `core/QUALITY_STANDARD.md`, `UI-UX Preferences.txt`, `core/UI_UX_PREFERENCES.md`, and the active debugging mode requested by the owner.

## Choose Execution Mode
- **Mode A — Unrestricted Debug & Overhaul (Default for Strong / Flagship Agents)**:
  - Fix every bug, crash, broken flow, persistence failure, and dead control at its root cause first.
  - Exercise **zero creative or architectural boundaries**: if existing layouts, components, motion, 3D, or architecture feel weak, generic, or limiting, tear them down and overhaul them cleanly to fulfill `UI-UX Preferences.txt` & `core/UI_UX_PREFERENCES.md` (`skills/frontend-design/SKILL.md`, `skills/cinematic-web-motion/SKILL.md`)—ignore these UI/UX preferences ONLY when the PRD explicitly mentions a simplistic UI/UX.
  - You may strategically refine or upgrade `PRD.md` / `PRD.txt` and `CHECKLIST.md` to make the product extraordinary while keeping its core purpose intact.
  - Keep desktop proportions crisp (`1440px–1920px`) and `390px` mobile clean, preserve `prefers-reduced-motion`, and ensure 100% of buttons/features work.
- **Mode B — Strict Debug-Only (For Weaker AI Models)**:
  - Apply **surgical root-cause fixes only** to the reported issue.
  - Do **not** redesign or overhaul UI/UX, do **not** rewrite working architecture or unrelated modules, do **not** add unrequested features/animations, and do **not** edit `PRD.md` / `PRD.txt`.

## Core Steps (Both Modes)
1. **Reproduce & Observe**:
   - Clarify expected vs. actual behavior and reproduce the defect locally (test case, CLI command, API request, or browser check).
   - Capture the exact error message, stack trace, HTTP status, or console output.
2. **Isolate Root Cause**:
   - Trace execution from trigger to failure; inspect recent changes (`git diff`), environment variables, schema mismatches, or race conditions.
   - **Never patch symptoms blindly** or silence errors (`catch {}`, `|| true`, `as any`) or delete failing assertions.
3. **Apply Sound Repair (and Overhaul if Mode A)**:
   - Fix the true root cause cleanly without fake mock fallbacks.
   - In **Mode A**, elevate weak flows, architecture, and visuals after diagnosing root causes; update `PRD.md` / `CHECKLIST.md` / `.vibekit/DECISIONS.md` to match intentional improvements.
   - In **Mode B**, make the smallest sound repair and keep everything unrelated untouched.
   - For badly broken projects (`SPECIAL CASE 5` recovery), separate working layers from broken builds/schemas and stabilize foundations incrementally.
4. **Verify & Bound Repairs**:
   - Re-run reproduction steps, visual checks (if Mode A or UI-impacting), and surrounding regression tests.
   - Record evidence in `QUALITY_CASES.md` and `.vibekit/STATE.md` (`Workflow Status: READY FOR MY REVIEW`), keep local preview working, and **stop without deploying**.
   - **Bounded Repair Rule**: If 2 genuine fix attempts fail on the same root cause, stop, re-read logs from scratch, and reassess assumptions (or hand back in Orchestrator mode).

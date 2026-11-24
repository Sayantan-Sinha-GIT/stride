---
name: project-resume
description: Resume an interrupted project across fresh conversations, quota resets, or different coding agents by reconciling saved .vibekit state, CHECKLIST.md, and actual repository files without repeating work or inferring deployment approval. Use whenever continuing existing work.
---

# Project Resume & Cross-Agent Handoff

Follow `core/STATE_PROTOCOL.md` and `core/RULES.md`.

## Steps
1. **Load Project Context**:
   - Read `AGENTS.md`, the project PRD (`PRD.md` / `PRD.txt`), `.vibekit/STATE.md`, `.vibekit/DECISIONS.md`, `.vibekit/HANDOFF.md`, `CHECKLIST.md`, and `QUALITY_CASES.md`.
   - If a legacy `PROGRESS.md` exists, read it too.
2. **Inspect Code Reality & Cloud Health**:
   - Run `git status -sb` (if git repo) and inspect key manifests/source directories to see what is actually built on disk.
   - If the project uses Supabase, Neon, Firebase, or another external database/API, verify whether the service is active vs. paused/sleeping (`HTTP 540`, `ENOTFOUND`, auth/REST unreachable). If paused or disconnected, restore or migrate cleanly using `skills/cloud-service-recovery/SKILL.md` before changing working application code.
3. **Reconcile State vs. Code**:
   - Identify any mismatch between saved state and actual files:
     - Completed code missing from state -> update `.vibekit/STATE.md` and `CHECKLIST.md` without redoing finished work or rebuilding from scratch.
     - Tasks marked done in state that are broken, stubbed, or edited since last test -> downgrade status honestly (`failed` or `implemented-unverified`) and re-run verification.
   - Respect previous sound architectural decisions unless a concrete bug forces a change.
4. **Continue Forward**:
   - Start immediately on the first incomplete priority task.
   - **Never store secrets** in `.vibekit/` files.
   - **Deployment Boundary**: Do **not** assume authorization to deploy just because a prior conversation discussed deployment; stop at local verification/preview (`READY FOR MY REVIEW`) unless deployment is explicitly authorized in the current session.
5. **Save Progress**:
   - Update `.vibekit/STATE.md` (all 8 state sections + `Workflow Status`), `CHECKLIST.md`, `QUALITY_CASES.md`, and `.vibekit/HANDOFF.md` at milestones and before finishing.

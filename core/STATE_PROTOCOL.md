# Persistent Project Memory & Resume Protocol (`.vibekit/`)

VibeKit stores concise, readable project state inside the target repository's `.vibekit/` directory so work survives quota limits, fresh conversations, computer restarts, and switching between coding agents (Antigravity, Claude Code, Codex, Cursor, Copilot, etc.).

## 1. Directory Layout
```text
<project-root>/
  PRD.md (or PRD.txt)     # Product specification (never overwritten by kit)
  CHECKLIST.md              # Requirement tracking table (IDs, statuses, evidence)
  QUALITY_CASES.md          # Risk-based verification ledger
  .vibekit/
    STATE.md                # Workflow Status, stage, completed/remaining work, blockers, next actions
    DECISIONS.md            # Key architectural, provider, and design choices
    HANDOFF.md              # Latest session summary & verification notes
    install-manifest.json   # Kit-managed file hashes for safe updates/uninstall
```
*(Legacy compatibility: If a project already has `PROGRESS.md`, read it during resume and summarize its status into `.vibekit/STATE.md` without deleting user history.)*

## 2. `.vibekit/STATE.md` Template
Keep `.vibekit/STATE.md` concise and accurate (updated after every meaningful milestone):
```markdown
# Project State

- **Project**: <name>
- **Objective**: <1-2 sentence goal>
- **PRD**: <PRD.md | PRD.txt | actual PRD filename>
- **Stack**: <detected or chosen stack & package manager>
- **Workflow Status**: <BUILDING | READY FOR MY REVIEW | REVISING | DEPLOYMENT AUTHORIZED | DEPLOYED>
- **Current Stage**: Stage <0-7> — <name>
- **Execution Mode**: AUTO
- **Preview URL**: <local URL or "None yet">
- **Live URL**: <live URL or "Not deployed">
- **Last Updated**: <YYYY-MM-DD HH:MM>

## Completed Requirements
- <completed requirement IDs and verified features>

## Remaining Requirements
- <ordered checklist of incomplete requirements or tasks>

## Important Decisions
- <key stack, provider, security, and UI/UX choices (also in .vibekit/DECISIONS.md)>

## Current Implementation State
- <brief summary of modules, routes, DB, and UI state on disk>

## Known Bugs
- <none, or concrete open bugs>

## Test Results
- <exact command/check + timestamp/outcome; mark stale if code changed since run>

## External Blockers
- <none, or exact owner key/account/decision needed>

## Next Actions
- <single clearest next step for the next agent or session>
```

## 3. Five-Step Resume & Reconciliation Protocol
Whenever starting a fresh conversation or switching agents (`CONTINUE PROJECT` or `SWITCH CODING AGENT`):
1. **Read project rules**: Read `AGENTS.md` (and `core/RULES.md` if needed).
2. **Read saved state**: Read the project PRD (`PRD.md` / `PRD.txt`), `.vibekit/STATE.md`, `CHECKLIST.md`, `QUALITY_CASES.md`, `.vibekit/DECISIONS.md`, and `PROGRESS.md` (if legacy).
3. **Inspect actual codebase**: Check `git status -sb`, file tree, manifest (`package.json`, `pyproject.toml`, etc.), and key implementation files.
4. **Reconcile state against reality**:
   - Never blindly trust stale status notes or redo completed work unnecessarily.
   - Never reconstruct the project from scratch when working modules already exist.
   - Never claim previous test results still apply after relevant code changed—re-run checks before claiming passing status.
   - Update `.vibekit/STATE.md` and `CHECKLIST.md` honestly if disk reality differs.
5. **Continue forward & enforce boundaries**:
   - Pick up at the first unfinished task and update `.vibekit/STATE.md`, `CHECKLIST.md`, and `.vibekit/HANDOFF.md` at milestones and before finishing.
   - Do **not** infer deployment authorization from prior sessions—stop at local preview (`READY FOR MY REVIEW`) unless deployment is explicitly authorized in the current conversation.

## 4. Rules for Project Memory
- **Never store secrets**, passwords, API keys, tokens, or PII in `.vibekit/` files.
- **Never store model lock requirements** (e.g., "Requires Model X to continue"). Any capable model or agent can continue from `.vibekit/`.
- **Never promise background continuation** unless an actual scheduled task or supported asynchronous job was started.

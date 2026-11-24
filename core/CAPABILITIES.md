# Platform Capabilities, Antigravity Orchestrator & Universal Fallback

VibeKit adapts automatically to the coding agent and runtime environment available. **Never pretend to use or invoke a tool, subagent, or command that is not present in the active session.**

## 1. Google Antigravity Native Integration

### Orchestrator (Argon)
- **What it is**: Antigravity's native two-phase planning and execution orchestration mode. When selected by the owner in the Antigravity model dropdown, the platform itself separates planning/review turns (planning model) from implementation/verification turns (execution model) via `exit_plan_mode` and `enter_plan_mode`.
- **How VibeKit works with it**:
  - Do **not** construct a duplicate manual model router or tell the owner to manually switch dropdown models mid-workflow when Orchestrator is active.
  - Keep `.agents/agents/*.md` configured with `model: inherit` so whatever model or orchestrator the owner chooses works cleanly.
  - Standalone models (Pro, Sonnet, Opus, Flash, GPT, etc.) remain 100% supported without modification.

### Native Subagents (`invoke_subagent`)
When running in Antigravity with subagent tools enabled, delegate selectively only when isolation or specialization genuinely improves quality:
- `research`: Read-only codebase/docs survey across many files to keep the primary context window clean.
- `browser`: Live webview inspection, visual layout verification, and interactive user-journey testing against local or deployed URLs.
- `image-generator`: Bespoke visual assets when needed (stored cleanly in project assets).
- Custom workspace agents (`.agents/agents/workhorse.md`, `ui-beautifier.md`, `qa-surgeon.md`) remain available as role shortcuts (`@workhorse`, `@ui-beautifier`, `@qa-surgeon`) without locking models.

### Optional Native `/swarm`
- **Important**: Writing `/swarm` inside a Markdown file does **not** automatically trigger swarm mode. Swarm is launched by the owner typing `/swarm` in the Antigravity chat composer (or when the coordinator's `swarm` toolset is actively mounted).
- **Quota Note**: Every swarm worker runs its own conversation and consumes additional Google AI Pro quota. Never spawn a swarm for routine tasks.
- **Good candidates for `/swarm`**:
  - Multi-module features with clean file/directory boundaries.
  - Parallel independent investigations or large codebase migrations.
  - Comprehensive multi-angle audits (`SPECIAL CASE 6` in `START_HERE.txt`: Functional QA + Security + UI/UX + Architecture).
- **Poor candidates for `/swarm`**:
  - Small bug fixes, minor CSS/copy changes, tightly coupled single-file refactors.
- **Required Swarm Protocol**:
  1. Designate a **Coordinator** who splits non-overlapping file/area ownership (`workspace: "share"` or `"branch"` for parallel editors; `"inherit"` for readers/verifiers).
  2. Define explicit interface contracts, shared requirements, dependencies, and acceptance criteria in each worker's brief.
  3. Require a dedicated verification pass after integration before declaring completion.
- **Fallback**: If `/swarm` is unavailable or quota is tight, run the same audit or implementation slices sequentially in `SOLO` or `TEAM` subagent mode.

### Optional `/boost`, `/teamwork`, and Dynamic Workflows (`run_workflow`)
- **`/boost` and `/teamwork`**: Useful Antigravity slash commands the user may invoke for deeply coupled hard reasoning problems (`/boost`) or massive multi-milestone initiatives (`/teamwork`). Do not require them for normal work or assume they are present on non-Antigravity agents.
- **Dynamic Workflows (`run_workflow`)**: Useful for deterministic Python-orchestrated fan-out/pipeline tasks inside Antigravity when the `run_workflow` tool is available. Keep sequential execution as the portable fallback.

## 2. Other Supported Coding Agents
VibeKit provides native entry bridges under `adapters/` and at project root:
- **Claude Code**: `CLAUDE.md` + `.claude/skills/` (progressive `SKILL.md` loading).
- **OpenAI Codex**: `AGENTS.md` (open hierarchy standard, concise always-loaded instructions pointing to `core/` and `skills/`).
- **Cursor**: `AGENTS.md` + `.cursor/rules/vibekit.mdc`.
- **GitHub Copilot**: `AGENTS.md` + `.github/copilot-instructions.md`.
- **Generic Coding Agents**: `AGENTS.md` + `adapters/generic/BOOTSTRAP_PROMPT.md` (works with any agent capable of reading/writing repository files).

## 3. Universal Single-Agent Fallback (`SOLO` Mode)
Every VibeKit workflow must succeed when executed by **one standalone agent** that has:
- No orchestrator.
- No subagents or `/swarm`.
- No browser automation or Chrome DevTools MCP.
- No image generation tool.
- No persistent cross-chat conversation memory.

In `SOLO` mode:
1. One agent assumes the logical specialist roles (`core/roles/*.md`) in sequence: Plan -> Architect -> Implement -> Refine -> Verify -> Update `.vibekit/STATE.md`.
2. When automated browser tools are absent, verify layout/styles via static DOM/CSS checks, unit/DOM tests, build checks, and provide clear manual browser verification steps for the owner.
3. Persist progress cleanly in `.vibekit/STATE.md` and `CHECKLIST.md` so any future session or different coding agent can resume seamlessly.

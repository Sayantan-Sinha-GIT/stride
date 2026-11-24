<!-- VIBEKIT:START -->
# VibeKit Antigravity Bridge (`GEMINI.md`)

Read `AGENTS.md` first for VibeKit's core operating rules, priority order, progressive skill loading, and `.vibekit/` state protocol.

## Antigravity-Specific Notes
- Workspace skills are discovered in `.agents/skills/` (and `skills/` via `.agents/skills.json`).
- Custom role agents in `.agents/agents/` (`@workhorse`, `@ui-beautifier`, `@qa-surgeon`) use `model: inherit` so Orchestrator (Argon) or any selected model runs without locks.
- Use native Orchestrator, `browser` / `research` subagents, or optional `/swarm` only when genuinely appropriate; single-agent fallback (`SOLO`) is always valid.
- Stop at a verified local preview (`Stage 5` / `READY FOR MY REVIEW`) by default; deploy only when `DEPLOY MY PROJECT` (or explicit deployment authorization) runs Stages 6 and 7 together.
<!-- VIBEKIT:END -->

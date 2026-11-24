<!-- VIBEKIT:START -->
# VibeKit Claude Code Bridge (`CLAUDE.md`)

Read `AGENTS.md` for canonical VibeKit rules, the 8-stage workflow, stack detection, and `.vibekit/` project state.

## Claude Code Notes
- Task-specific procedures are packaged as Agent Skills under `.claude/skills/` and `skills/`.
- Keep instructions concise; load `core/*.md` and `skills/*/SKILL.md` only when relevant to the current task.
- Always inspect repository manifests (`core/STACK_DETECTION.md`) before running commands.
- Stop at local preview (`READY FOR MY REVIEW`) by default; never deploy or push to production unless explicitly authorized (`DEPLOY MY PROJECT`, which runs Stage 6 readiness checks and Stage 7 deployment together).
<!-- VIBEKIT:END -->

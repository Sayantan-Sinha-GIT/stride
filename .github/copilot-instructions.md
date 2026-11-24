<!-- VIBEKIT:START -->
# VibeKit Repository Instructions for GitHub Copilot

Read and follow `AGENTS.md` at the root of this repository for VibeKit's core standards, lifecycle stages, and `.vibekit/` project state protocol.

- Load task-specific runbooks from `skills/<name>/SKILL.md` and `core/*.md` only when relevant to the current task.
- Detect project commands from actual manifests (`core/STACK_DETECTION.md`) rather than assuming `npm run dev`.
- Ensure zero dead buttons, real validation/persistence, crisp desktop (`1440px–1920px`) & mobile (`390px`) layouts, and honest test reporting.
- Stop at local verification/preview (`Stage 5` / `READY FOR MY REVIEW`); do not deploy or push production changes unless `DEPLOY MY PROJECT` (or explicit authorization) triggers Stage 6 readiness + Stage 7 deployment.
<!-- VIBEKIT:END -->

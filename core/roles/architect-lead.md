# Role: Architect / Lead

**Scope:** Stages 0–2, cross-module integration, and final coherence. One agent can fulfill this role in `SOLO` mode or coordinate specialists in `TEAM`/optional `/swarm` mode.

## Responsibilities
1. **Understand Context**: Inspect `PRD.md`, `.vibekit/STATE.md`, existing source code, and repository manifests (`core/STACK_DETECTION.md`).
2. **Plan Requirements**: Populate `CHECKLIST.md` with clear, testable `REQ-*` items, risk tiers (`high`, `must`, `standard`, `optional`), and acceptance criteria.
3. **Choose Lean Architecture**: Respect `PRD.md` constraints and existing conventions. Avoid premature complexity (unnecessary microservices, heavy tooling, paid plans).
4. **Coordinate Boundaries**: When delegating to subagents or `/swarm`, define strict non-overlapping file ownership, interface contracts, and post-integration verification.
5. **Maintain Continuity**: Record key architectural choices in `.vibekit/DECISIONS.md` and keep `.vibekit/STATE.md` accurate.

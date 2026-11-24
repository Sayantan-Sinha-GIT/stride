---
name: improve-prd
description: Transform a rough product idea or incomplete draft PRD into a clear, testable, implementation-ready PRD.md without writing application code. Use when asked to refine, audit, or generate a PRD before building.
---

# Improve or Create PRD

Turn a rough idea or incomplete PRD into one complete, concise, implementation-ready `PRD.md`. **Do not write application code.**

## Rules
- Preserve the owner's core product idea, features, and names.
- Never invent fake customer metrics, testimonials, or business commitments.
- Flag anything requiring payment or a credit card and suggest a free-tier alternative unless the owner explicitly requires a paid service.
- Mark independent reasonable assumptions clearly as `(default)`.
- Keep the resulting specification tight and actionable (prefer tables and short bullets over prose essays).

## Output Structure
Produce one complete Markdown document covering:
0. **What Changed / Clarified** (if upgrading an existing draft: gaps, risks, or paid items resolved).
1. **Product Summary** (what it does, target audience, platform).
2. **Core Problem & Value**.
3. **Users & Roles** (permissions and access boundaries).
4. **Goals & Non-Goals** (clear v1 scope).
5. **Functional Requirements** (table with ID, Feature, Priority: `Must` / `Should` / `Nice`, Acceptance Criteria).
6. **Core User Journeys** (step-by-step happy paths plus empty, loading, error, and invalid-input states).
7. **Pages / Screens & Navigation**.
8. **Data Model & Rules** (entities, relationships, ownership, retention, invariants).
9. **Integrations & Constraints** (free tiers, auth, email, AI, maps, hosting preferences).
10. **Visual Direction & Signature Experience** (must embody `UI-UX Preferences.txt` and `core/UI_UX_PREFERENCES.md`—artistic high-budget flagship feel at `CodeSense (pr-reviewer)` / `Haan` ambition level, rich density with layered/animated backgrounds and zero empty voids, bold scroll/interactive motion transforming depth/scale/perspective/composition, immediate opening discoverability, rich dark or thoughtful light/dark themes, convincing real 3D like `TicketRaja` if 3D is part of the promise, and `BookMyShow`-grade mobile ergonomics—unless the owner's draft idea explicitly requests a simplistic UI/UX).
11. **Security, Accessibility & Non-Functional Requirements**.
12. **Resolved Defaults & Open Questions** (low-risk decisions marked `(default)`; true owner decisions highlighted concisely).

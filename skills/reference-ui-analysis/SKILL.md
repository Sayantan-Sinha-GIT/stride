---
name: reference-ui-analysis
description: Evaluate an existing UI, my-design/home.html prototype, or design-inspire assets, decide what to preserve vs. overhaul, and run automated DOM/layout probes. Use when building from a design reference or auditing an existing frontend.
---

# Reference UI Evaluation & Layout Analysis

## 1. Evaluating Supplied References
- **`my-design/home.html` (or similar approved prototype)**:
  - Inspect layout structure, typography, CSS tokens, themes, motion choreography, and responsive rules.
  - Determine if the owner requested close fidelity (`SPECIAL CASE 3`) or creative elevation. If close fidelity leaves responsive defects, accessibility gaps, or missing app states, fix those defects while preserving the core visual identity. If ambiguity between strict pixel matching vs. creative redesign materially changes the product, ask concisely.
- **`design-inspire/` media**:
  - Use strictly for craft/mood/motion ambition—never copy text, branding, or fixed layouts verbatim.
- **Existing Codebase UI (`IMPROVE UI/UX` Redesign)**:
  - Read `UI-UX Preferences.txt` and `core/UI_UX_PREFERENCES.md` first (mandatory unless the PRD explicitly mentions a simplistic UI/UX).
  - Diagnose specific visual failures first (empty hero, blank gaps, motionless backgrounds, flat generic cards, weak hierarchy, hidden capabilities behind toggles, subtle/missing scroll motion, downgraded 2D instead of real 3D, weak contrast, clipped mobile layout, overlapping text, or comically oversized headings) before refactoring. Preserve working business logic and routes.

## 2. Automated DOM & Layout Probe
When Chrome DevTools MCP or Playwright evaluation is available, execute `references/browser-layout-probe.js` inside the target page context to capture machine-readable evidence of:
- Horizontal overflow (`scrollWidth > clientWidth`).
- Collapsed or awkwardly wrapping headings (`h1`–`h3`).
- Broken internal anchor links (`missing_anchor`).
- Hidden or transparent elements left in tab order (`hidden_focusable`).
- Modal focus escaping (`modal_focus_outside`).
- Sticky/fixed header dimensions and font loading status.

Fix every genuine finding and re-run verification.

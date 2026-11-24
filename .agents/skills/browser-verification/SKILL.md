---
name: browser-verification
description: Visually and interactively verify a rendered web application across desktop (1440px-1920px), tablet (768px), and mobile (390px) viewports using the best available browser tool or honest manual fallback. Use in Stages 4-6 and UI/UX audits.
---

# Browser & Visual Verification

Follow `core/QUALITY_STANDARD.md` and `core/UI_UX_PREFERENCES.md` (§9 Finish & Visual Quality Bar).

## 1. Tool Selection (Best Available First)
1. **Chrome DevTools MCP** (`skills/chrome-devtools/SKILL.md`): Best for fast DOM probes, console/network inspection, viewport resizing, and screenshots.
2. **Antigravity `browser` Subagent**: Delegate multi-step live user journeys and visual review when active.
3. **Local Playwright / Browser Script**: Run existing E2E or smoke scripts if present in the repo.
4. **No Browser Tool Available (Fallback)**: Never invent visual inspection results! Perform static CSS/JSX/DOM/responsive-rule review, run unit/DOM tests, state clearly that live visual rendering could not be automated in this environment, and give the owner concise manual preview checks to run.

## 2. Visual & Interactive Inspection Matrix
Check every primary route/screen at:
- **Desktop (`1440x900` and `1920x1080`)**: Balanced proportions, readable typography, crisp navigation, no giant empty gaps, no horizontal scrollbar.
- **Tablet (`768x1024`)**: Clean grid/column collapse, accessible nav/drawers.
- **Mobile (`390x844`)**: No overflow, readable text, `>= 44px` tap targets, unobstructed sticky elements/modals.
- **Interactive States**: Hover/focus states, form validation errors, empty lists, loading skeletons/spinners, dark/light contrast, `prefers-reduced-motion` legibility, and 3D camera/zoom/selection (if 3D is present).
- **Runtime Health**: Zero uncaught page errors, zero 404 assets/broken images, zero failed core API calls.

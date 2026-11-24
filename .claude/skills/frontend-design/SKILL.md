---
name: frontend-design
description: Design and refine bespoke, high-craft UI/UX enforcing the owner's mandatory preferences (UI-UX Preferences.txt & core/UI_UX_PREFERENCES.md), ignored ONLY when the PRD explicitly mentions a simplistic UI/UX.
---

# Product-Specific Frontend & UI/UX Design

Follow `UI-UX Preferences.txt` and `core/UI_UX_PREFERENCES.md` as the **mandatory default standard** across every build, overhaul, feature addition, and UI/UX improvement. **Ignore these preferences ONLY when the project's PRD explicitly mentions a simplistic UI/UX.** (Words like "professional", "serious", or "clean" do NOT request simplistic UI/UX.)

## The 8 Mandatory Pillars (`UI-UX Preferences.txt`)
1. **Overall Feel**: Artistic, expressive, premium interfaces that feel like a high-budget advertisement or flagship interactive experience. Memorable, richly composed, and alive—never a restrained, static, underwhelming template.
2. **Density, Composition & Proportions (`1440px–1920px`)**: Substantial visual presence with minimal unused space—eliminate large empty heroes, long blank gaps, and motionless backgrounds using layered imagery, interesting backgrounds, depth, and purposeful detail while keeping hierarchy clear and actions obvious. Keep standard desktop proportions crisp (`1440px–1920px`), never oversized headings, bloated cards, or awkward scaling.
3. **Bold Scroll & Interactive Motion**: Bold, immediately noticeable animation including during ordinary scrolling that transforms composition, depth, scale, perspective, or element relationships (not tiny hover-only or click-only shifts). Use living/animated backgrounds where fitting, original choreography, smooth 60fps performance, and `prefers-reduced-motion: reduce`.
4. **Originality & Ambition Benchmarks**: Match the level of animation, richness, and polish of **CodeSense (`pr-reviewer`)** and **Haan** as ambition benchmarks—never templates to copy. Invent fresh typography, colors, materials, imagery, and interaction ideas tailored to the product.
5. **Discoverability & Themes**: Surface all main product capabilities and equally important categories immediately on the opening screen without forcing users to toggle through hidden alternatives to discover breadth. Favor rich dark aesthetics or thoughtful light/dark themes with consistent WCAG AA contrast throughout.
6. **3D & Spatial Interaction**: When 3D is part of the product's promise (e.g., aircraft seat selection where the plane looks like a plane and seats are distinguishable/selectable, or spatial products like **TicketRaja**), build recognizable, convincing interactive 3D with intuitive camera framing/zoom/orbit—never silently downgrade to a flat or Lite 2D mode.
7. **Mobile Apps (`BookMyShow` Consumer Standard)**: Deliver the polish and reliability of a serious consumer app such as **BookMyShow**—prioritizing speed, clear navigation, readable hierarchy, comfortable touch targets (`>= 44px`), subtle responsive feedback, and dependable task completion rather than a compressed promotional landing page.
8. **Finish & Zero Visual Defects**: Eliminate overlapping or truncated text, clipped controls, missing 3D model parts, broken states, horizontal overflow (`1440px`, `768px`, `390px`), confusing interactions, and features that look finished but do not work (`core/QUALITY_STANDARD.md`).

## Execution Steps
1. **Check PRD Single-Exception Rule**: Confirm whether `PRD.md`/`PRD.txt` explicitly requests a simplistic UI/UX; if not, apply all 8 pillars above in full. Inspect `design-inspire/` (mood only) and `my-design/` if present.
2. **Design & Refine**: Craft original typography, layered surfaces, complete states (loading, empty, error, validation), and standalone concepts (`my-design/home.html` for `SPECIAL CASE 2`).
3. **Pair with Motion & Visual Checks**: Activate `skills/cinematic-web-motion/SKILL.md` and verify visually across `1440px–1920px`, `768px`, and `390px` via `skills/browser-verification/SKILL.md`.

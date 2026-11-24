# Owner UI/UX Philosophy & Mandatory Standard

> **Mandatory UI/UX Standard & Single-Exception Rule:** The preferences in `UI-UX Preferences.txt` and this document define the owner's mandatory UI/UX standard across every build, UI/UX improvement, overhaul, redesign, feature addition, rebrand, sale preparation, and design audit. **You must ALWAYS apply this UI/UX standard—and shall ONLY ignore it when the project's PRD explicitly mentions or requests a simplistic UI/UX** (outside strict debug-only bug fixes). Words like "professional", "serious", or "clean" in a PRD are NOT a request for a simplistic UI/UX—make those professional, usable, AND flagship-level.

---

## Verbatim Owner Specification (`UI-UX Preferences.txt`)

```text
MY UI/UX PREFERENCES

This describes my taste, not a template, implementation recipe, or fixed design system. I want an agent to understand the level of ambition I enjoy and then bring its own creativity. Different products can deserve different visual languages.

OVERALL FEEL
I gravitate toward artistic, expressive, premium interfaces that feel like a high-budget advertisement or a flagship interactive experience. "Fancy" and "aesthetic" mean something memorable, richly composed, and alive to me. A restrained, very clean, almost static landing page usually feels underwhelming for the promotional websites I have in mind.

DENSITY AND COMPOSITION
I prefer substantial visual presence and relatively little unused space. Large empty heroes, long blank gaps, and motionless backgrounds tend to disappoint me. Layered imagery, interesting backgrounds, depth, and purposeful detail appeal to me. Density should still feel composed: readable text, clear hierarchy, and obvious actions matter more than filling every pixel. Fancy does not mean oversized headings, bloated cards, or awkward desktop proportions.

MOTION
I enjoy bold, immediately noticeable animation, including during ordinary scrolling. Effects that appear only after clicking, or tiny shifts that are barely visible, do not deliver the experience I am looking for. I like motion that changes composition, depth, scale, perspective, or the relationship between elements as I move through a page. An animated background can help the whole experience feel alive. These are possibilities, not a required list of effects. Original choreography matters more than piling on random animation. Readability, direct interaction, smooth performance, and comfortable reduced-motion options still matter.

ORIGINALITY AND REFERENCES
My CodeSense (pr-reviewer) and Haan projects illustrate the level of animation, richness, and polish that excites me. They are references for ambition, not templates to reproduce. I want new ideas rather than copied animations, compositions, motifs, or branding. I am open to unexpected typography, color, materials, imagery, and interaction ideas when they form a coherent whole. I do not have one mandatory palette, font, layout, framework, or animation technique for every project.

DISCOVERABILITY AND THEMES
I want to understand a product's main capabilities quickly. If it offers several equally important categories, an opening that makes it appear to offer only one feels misleading. I dislike having to toggle through hidden alternatives merely to discover the product's breadth. I often enjoy rich dark aesthetics and appreciate a thoughtful light/dark choice, with consistent contrast and legibility throughout.

3D AND SPATIAL INTERACTION
When 3D is part of a product's promise, I expect recognizable, convincing models and useful camera framing. A plane should look like a plane, and individual seats should be easy to distinguish and select. Zooming, moving around, and seeing relevant details should feel intuitive. In TicketRaja, real 3D is central; an automatic switch to a flat or Lite experience feels like losing the feature. This does not mean that every future project needs 3D.

MOBILE APPS
I want the polish and reliability of a serious consumer app such as BookMyShow. A phone app can have less animation than its promotional website, with more emphasis on speed, clear navigation, readable content, comfortable touch targets, and dependable task completion. Subtle mobile feedback can be excellent; distracting motion that delays an action is less appealing. Mobile deserves its own thoughtful design rather than a compressed promotional page.

FINISH AND CREATIVE FREEDOM
I notice obvious defects quickly: overlapping text, clipped controls, missing model parts, confusing interactions, and features that look finished but do not work. I value consistency across screens, screen sizes, themes, and interaction states. The aim is a complete, usable experience with a strong personality. These preferences describe the experience I enjoy; they leave room for an agent to invent a different and better solution for the product in front of it.
```

---

## Actionable Engineering Checklist

### 1. Overall Feel & Creative Originality
- Deliver artistic, expressive, premium interfaces that feel like a high-budget commercial advertisement or flagship interactive experience.
- Treat **CodeSense (pr-reviewer)** and **Haan** as benchmarks for ambition—never copy their branding, typography, layout, animation choreography, motifs, or color palettes.
- Invent a bespoke visual identity tailored to the product (distinctive display + legible body/mono typography, cohesive materials/colors, high-craft imagery, custom SVGs, shaders, canvas, or original visuals). Never ship restrained, static, generic SaaS template layouts.

### 2. Density, Composition & Desktop Proportions (`1440px–1920px`)
- Maintain substantial visual presence with minimal unused space: eliminate giant empty hero regions, long blank vertical gaps, lifeless flat backgrounds, and rows of identical generic cards.
- Use layered imagery, living/animated backgrounds, depth, and purposeful detail while keeping composition composed with clear hierarchy and obvious actions.
- **Crisp Proportions**: Keep standard desktop/laptop (`1440px–1920px`), tablet (`768px`), and mobile (`390px`) cleanly scaled—never comically oversized headings, bloated cards, or awkward desktop scaling.

### 3. Bold Motion & Choreography
- Deliver bold, immediately noticeable animation—including during ordinary scrolling—that transforms **composition, depth, scale, perspective, or visual relationships between elements** from top to bottom of the page. Tiny hover-only shifts or click-only effects are not enough.
- Use living/animated backgrounds where appropriate to help the whole experience feel alive.
- Prioritize original choreography over stacking random effects.
- **Performance & Accessibility Guardrails**:
  - Smooth 60fps GPU-friendly transforms/opacity without layout jank.
  - Clear readability and direct interaction (never trap scroll or hide controls).
  - Full `prefers-reduced-motion: reduce` support showing all content cleanly in its final visible state.

### 4. Discoverability & Themes
- Communicate the product's main capabilities within seconds on the opening screen. If the product offers several equally important categories, surface its breadth immediately instead of burying alternatives behind hidden tabs or toggles.
- Favor rich dark aesthetics when fitting, and offer thoughtful light/dark choices with consistent WCAG AA contrast, legible typography, crisp focus states, and unified surface tokens throughout.

### 5. Real 3D & Spatial Interaction
- When 3D is part of the product's promise (such as an aircraft cabin seat selector where the plane looks like a plane and individual seats are easy to distinguish and select, or a spatial product like **TicketRaja**), build **genuine, recognizable, convincing interactive 3D** with intuitive zooming, orbiting, camera framing, and selection.
- **Never silently downgrade mandatory 3D into a flat or Lite 2D experience.** Optimize geometry, lighting, and frame rate cleanly instead. (Projects where 3D is not part of the promise do not need gratuitous 3D.)

### 6. Mobile Applications (`BookMyShow` Consumer App Standard)
- Native and mobile-first applications (Android, iOS, Flutter, React Native, or mobile app views) must deliver the polish and reliability of a serious consumer app such as **BookMyShow**.
- Emphasize speed, clear navigation, readable content, comfortable touch targets (`>= 44px`), subtle responsive feedback, and dependable task completion rather than distracting motion that delays actions or a compressed promotional landing page.

### 7. Zero Visual or Functional Defects
Inspect and fix all obvious defects before stopping at local preview:
- Zero overlapping or truncated text.
- Zero clipped controls, broken navbars, or horizontal overflow at `1440px`, `768px`, and `390px`.
- Zero missing 3D model parts, broken images, or awkward camera angles.
- Zero confusing interactions, mismatched theme surfaces, or features that look finished but do not work (zero dead buttons).

### 8. Enforcement Rule (Single Exception Only)
1. **Check PRD for explicit simplistic UI/UX**: Only if `PRD.md` / `PRD.txt` explicitly mentions or requests a **simplistic UI/UX** may these preferences be skipped in favor of that explicit simplistic direction.
2. **Every other build, overhaul, UI/UX improvement, feature addition, rebrand, sale prep, or audit**: Apply `UI-UX Preferences.txt` and this document in full, honoring explicit PRD features/constraints while bringing maximum originality, visual richness, motion craft, discoverability, and finish.

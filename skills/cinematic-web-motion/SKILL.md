---
name: cinematic-web-motion
description: Engineer bold, immediately noticeable scroll and interactive choreography (GSAP, ScrollTrigger, Lenis, Framer Motion, WebGL/Canvas/3D) with living backgrounds, crisp 1440px-1920px proportions, 60fps performance, and prefers-reduced-motion support.
---

# Cinematic Web Motion & Interactive Craft

Read `UI-UX Preferences.txt` and `core/UI_UX_PREFERENCES.md` before implementing. **Apply these motion standards across every web build, UI/UX improvement, and overhaul—ignore them ONLY when the PRD explicitly mentions a simplistic UI/UX** (or tone down appropriately for mobile consumer apps modeled on **BookMyShow** speed).

## 1. Bold Motion Standard (`UI-UX Preferences.txt`)
- **Immediately Noticeable During Ordinary Scrolling**: Subtle hover-only effects or click-only transitions do not meet the standard. Motion must transform **composition, depth, scale, perspective, or visual relationships between elements** smoothly as the user moves from the top of the page down to the footer.
- **Living Backgrounds**: Use animated canvas, WebGL/GLSL shaders, spatial layers, or responsive kinetic backdrops so the experience feels alive rather than static text on a flat background.
- **Ambition Benchmark**: Target **CodeSense (`pr-reviewer`)** and **Haan** levels of animation richness and polish with 100% original choreography—never copy their motifs or stack random disconnected effects.
- **Mobile Consumer App Distinction**: On native or phone-focused apps (**BookMyShow** standard), prioritize speed, clear navigation, and subtle tactile feedback over heavy decorative motion that delays actions.

## 2. Choreography & Engineering Standards
- **Stacking & Techniques**: Choose libraries suited to the project stack (GSAP + ScrollTrigger, Lenis smooth scroll, Motion/Framer Motion, HTML5 Canvas, Three.js / WebGL shaders, or CSS scroll-driven transforms).
- **Performance Discipline**:
  - Animate GPU-friendly properties (`transform`, `opacity`, `clip-path`)—avoid animating layout properties (`top`, `left`, `width`, `height`) on scroll ticks.
  - Clean up timelines, ScrollTriggers, and `requestAnimationFrame` loops on unmount.
- **Accessibility & Proportions**:
  - Wrap motion safely with `prefers-reduced-motion: reduce` (e.g., `gsap.matchMedia()` or CSS media query) so reduced-motion users see everything cleanly in its final visible state with zero stuck `opacity: 0` blocks.
  - Keep `1440px–1920px` desktop typography and spacing crisp and well-proportioned; never trap scroll, clip controls, or break interactive features (`core/QUALITY_STANDARD.md`).

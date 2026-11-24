---
name: chrome-devtools
description: Use Chrome DevTools MCP for live browser inspection, screenshots across desktop and mobile viewports, console/network error diagnosis, DOM/style inspection, and running browser-layout-probe.js.
---

# Chrome DevTools MCP Verification

Use when `chrome-devtools` MCP tools (`new_page`, `list_pages`, `navigate_page`, `resize_page`, `take_screenshot`, `take_snapshot`, `evaluate_script`, `list_console_messages`, `list_network_requests`, `click`, `fill`) are available.

## Procedure
1. **Open Target**: Call `list_pages` or `new_page` to obtain `pageId`, then `navigate_page` to the local preview URL and `wait_for` key content.
2. **Test Multi-Viewport Proportions**:
   - `resize_page` to desktop (`1440x900`), tablet (`768x1024`), and mobile (`390x844`).
   - Call `take_screenshot` on key pages and inspect visually for overlap, clipping, contrast, or comically oversized headings.
3. **Inspect Console & Network**:
   - Call `list_console_messages` and `list_network_requests` to catch runtime JS errors, hydration mismatches, 404 assets, or failed API calls.
4. **Run Layout Probe & Interactive Smoke Checks**:
   - Pass `skills/reference-ui-analysis/references/browser-layout-probe.js` into `evaluate_script` to check overflow, collapsed headings, broken anchors, and focus traps.
   - Use `take_snapshot` + `click`/`fill` to exercise real user controls and confirm state changes persist.

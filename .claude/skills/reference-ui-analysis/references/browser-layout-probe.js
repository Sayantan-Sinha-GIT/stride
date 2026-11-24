() => {
  "use strict";
  const findings = [];
  const root = document.documentElement;
  const rounded = (n) => Math.round(n * 10) / 10;
  const label = (el) => {
    if (el.id) return "#" + el.id;
    const testId = el.getAttribute("data-testid");
    if (testId) return "[data-testid=" + JSON.stringify(testId) + "]";
    const classes = Array.from(el.classList || [])
      .filter((c) => /^[a-zA-Z_-][\w-]*$/.test(c)).slice(0, 2);
    return el.tagName.toLowerCase() + (classes.length ? "." + classes.join(".") : "");
  };
  const add = (kind, el, detail) => {
    if (findings.length < 80) findings.push({ kind, selector: el ? label(el) : "document", detail });
  };
  const rendered = (el) => {
    for (let node = el; node; node = node.parentElement) {
      const s = getComputedStyle(node);
      if (node.hidden || s.display === "none" ||
          s.visibility === "hidden" || s.visibility === "collapse" ||
          s.contentVisibility === "hidden") return false;
    }
    return el.getClientRects().length > 0;
  };
  const opacityHidden = (el) => {
    for (let node = el; node; node = node.parentElement) {
      if (Number(getComputedStyle(node).opacity) <= 0.01) return true;
    }
    return false;
  };
  const inert = (el) => !!el.closest("[inert]");
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: rounded(r.x), y: rounded(r.y), width: rounded(r.width), height: rounded(r.height) };
  };

  const viewport = {
    innerWidth, innerHeight, clientWidth: root.clientWidth,
    scrollWidth: root.scrollWidth, bodyScrollWidth: document.body ? document.body.scrollWidth : 0
  };
  if (viewport.scrollWidth > viewport.clientWidth + 1 ||
      viewport.bodyScrollWidth > viewport.clientWidth + 1) {
    add("horizontal_overflow", null, viewport);
  }

  const allHeadings = Array.from(document.querySelectorAll("h1,h2,h3"));
  const headings = allHeadings.slice(0, 100).filter(rendered).map((el) => {
    const s = getComputedStyle(el);
    const box = rect(el);
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    const fontSize = parseFloat(s.fontSize) || 16;
    const lineHeight = parseFloat(s.lineHeight) || fontSize * 1.2;
    if (text.length > 8 && s.writingMode === "horizontal-tb" &&
        box.width < Math.min(160, fontSize * 3) && box.height > lineHeight * 4) {
      add("collapsed_heading", el, { text: text.slice(0, 96), box, fontSize, lineHeight });
    }
    return {
      selector: label(el), text: text.slice(0, 96), box,
      fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight,
      lineHeight: s.lineHeight, marginTop: s.marginTop, marginBottom: s.marginBottom
    };
  });

  const allLinks = Array.from(document.querySelectorAll("a[href]"));
  for (const el of allLinks.slice(0, 500)) {
    if (!rendered(el) || inert(el) || el.closest('[aria-hidden="true"]')) continue;
    const href = el.getAttribute("href");
    let url;
    try { url = new URL(href, location.href); }
    catch { add("invalid_link", el, { message: "Could not parse href." }); continue; }
    if (url.origin !== location.origin || url.pathname !== location.pathname ||
        url.search !== location.search || !url.hash || url.hash === "#") continue;
    let target;
    try { target = decodeURIComponent(url.hash.slice(1)); }
    catch { add("invalid_anchor_encoding", el, { hash: url.hash }); continue; }
    if (!document.getElementById(target) && !document.getElementsByName(target).length) {
      add("missing_anchor", el, { hash: url.hash });
    }
  }

  const allControls = Array.from(document.querySelectorAll(
    'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"]'
  ));
  for (const el of allControls.slice(0, 600)) {
    if (el.matches(":disabled") || el.getAttribute("type") === "hidden" ||
        el.tabIndex < 0 || inert(el) || !rendered(el)) continue;
    const dialog = el.closest('[role="dialog"],[role="alertdialog"],dialog');
    const dialogRect = dialog ? dialog.getBoundingClientRect() : null;
    const offscreenDialog = dialogRect && (
      dialogRect.left >= innerWidth || dialogRect.right <= 0 ||
      dialogRect.top >= innerHeight || dialogRect.bottom <= 0
    );
    if (el.closest('[aria-hidden="true"]') || opacityHidden(el) || offscreenDialog) {
      add("hidden_focusable", el, {
        reason: el.closest('[aria-hidden="true"]') ? "aria-hidden without focus isolation" :
          opacityHidden(el) ? "transparent but tabbable" : "offscreen dialog but tabbable"
      });
    }
  }

  const modals = Array.from(document.querySelectorAll(
    '[role="dialog"][aria-modal="true"],[role="alertdialog"][aria-modal="true"],dialog[open]'
  )).filter((el) => rendered(el) && !el.closest('[aria-hidden="true"]') && !opacityHidden(el) && !inert(el));
  for (const el of modals) {
    if (!el.contains(document.activeElement)) {
      add("modal_focus_outside", el, { active: document.activeElement ? label(document.activeElement) : null });
    }
  }

  const headers = Array.from(document.querySelectorAll("header,[role='banner']"))
    .filter(rendered).slice(0, 12).map((el) => {
      const s = getComputedStyle(el);
      return {
        selector: label(el), box: rect(el), position: s.position,
        paddingTop: s.paddingTop, paddingBottom: s.paddingBottom
      };
    });
  return {
    purpose: "Read-only layout smoke evidence; not full design or accessibility certification.",
    page: location.origin + location.pathname, title: document.title,
    viewport, fontLoadingStatus: document.fonts ? document.fonts.status : "unknown",
    findings, headings: headings.slice(0, 30), headers,
    limitsReached: {
      headings: allHeadings.length > 100, links: allLinks.length > 500,
      controls: allControls.length > 600, findings: findings.length >= 80
    }
  };
}

---
name: sell-ready-website
description: Prepare, white-label, monetize, rebrand, or package a website/application for sale, flipping (Acquire.com, Flippa, marketplaces), or client handover—including centralized brand config, interactive buyer demo mode with rich seed data, SEO/legal pages, secret sanitization, and BUYER_HANDOVER.md generation. Use when building or preparing a website to sell or hand over.
---

# Sell-Ready, White-Label & Buyer Handover Engineering

Follow `core/RULES.md`, `core/QUALITY_STANDARD.md`, `core/SECURITY.md`, `UI-UX Preferences.txt`, and `core/UI_UX_PREFERENCES.md` (mandatory unless the PRD explicitly mentions a simplistic UI/UX).

## 1. Sanitize Personal Developer Footprint & Secrets
- Audit the repository for personal developer names, personal emails, hardcoded GitHub/Vercel/Supabase user IDs or project refs, debug `console.log` clutter, and local machine paths (`C:\Users\...`, `/Users/...`).
- Replace hardcoded personal references in UI copy, footer credits, `package.json` author/repo fields, and metadata with buyer-editable config or clean generic product branding.
- Verify `.gitignore` excludes `.env*`, build artifacts, and personal credentials, and ensure `.env.example` documents every runtime variable with safe placeholder values and brief setup comments.

## 2. Centralized White-Label Brand & Pricing Config
- Consolidate brand identity (product name, tagline, logo/SVG mark, domain URL, support email, social links, theme accent tokens, pricing plans, and analytics toggles) into one clear configuration file (e.g., `src/config/site.ts` or `config/brand.json` with safe env overrides).
- Eliminate scattered magic brand strings across components, emails, metadata, and legal pages so a buyer or client can rebrand the entire site in under 5 minutes.

## 3. Interactive Buyer Demo Mode & Rich Seed Data
- Ensure prospective buyers or marketplace reviewers can test every screen, dashboard, chart, filter, and core interactive flow immediately in local/preview demo mode—using realistic, domain-authentic seed data (zero `lorem ipsum` or fake user testimonials).
- Keep 100% of real database queries, authentication, and payment webhooks intact when production credentials are present; never replace real backend routes with dead stubs.

## 4. Commercial Polish, Monetization, Legal & Technical SEO
- Verify zero dead buttons or placeholder routes across desktop (`1440px–1920px`), tablet (`768px`), and mobile (`390px`).
- Verify technical SEO and launch essentials: dynamic `<title>` and meta descriptions, OpenGraph/Twitter tags, favicon/app icons, `robots.txt`, `sitemap.xml`, JSON-LD structured data where helpful, and a clean custom `404` page.
- Ensure routable, clearly styled **Privacy Policy**, **Terms of Service**, and **Contact / Support** pages wired to the centralized brand config.
- When adding monetization (`Stripe`, `Lemon Squeezy`, `Razorpay`, or lead capture), implement clean pricing tiers, server-verified checkout/webhook handling, and server-side plan entitlements.

## 5. Generate `BUYER_HANDOVER.md` & Clean Export Option
- Create or update `BUYER_HANDOVER.md` in the project root with:
  - Product & architecture summary (stack, database, auth, payments, hosting).
  - **5-Minute Rebrand Guide** (exact config file & logo/color assets to change).
  - **Environment Setup** (`.env.example` variable guide—never real secrets).
  - **Database & Seed Setup** (migration and seed commands).
  - **Deploy & Asset Transfer Checklist** (domain, Vercel/Cloudflare/Supabase ownership transfer).
- When the seller wants to zip or transfer a clean codebase stripped of internal VibeKit scaffolding, follow `SPECIAL CASE 8` (verify `BUYER_HANDOVER.md` and `.env.example` first, then run `SETUP_ANTIGRAVITY.ps1 -Project "<dir>" -Uninstall` or `node scripts/setup/vibekit.mjs uninstall --project "<dir>"`, which safely removes kit-managed files while keeping source code, `PRD.md`, and `BUYER_HANDOVER.md`).
- Stop at verified local preview (`Workflow Status: READY FOR MY REVIEW`) unless deployment is explicitly authorized (`DEPLOY MY PROJECT`).

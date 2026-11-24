# Project State

- **Project**: Stride
- **Objective**: GPS activity tracker, Hausdorff segment competition, and privacy-first social fitness platform (Flutter mobile app + Next.js flagship cinema website + Cloudflare Workers API + Neon PostGIS).
- **PRD**: PRD.md
- **Stack**: npm workspaces (`packages/track-engine`, `api` Hono + Cloudflare Workers + Neon Postgres 17 + PostGIS 3.5, `web` Next.js 15 + Tailwind v4 + GSAP + Lenis + Three.js GLSL + MapLibre GL + Web Lite PWA, `app` Flutter 3.50.1 Standard `24.6 MB`, `app-lite` Native Kotlin Android `86 KB`)
- **Workflow Status**: DEPLOYED
- **Current Stage**: Stage 7 — Deployed & Live-Verified
- **Execution Mode**: AUTO
- **Preview URL**: http://localhost:3000/en
- **Live URL**: https://stride-web.srimantasutapa123.workers.dev
- **API URL**: https://stride-api.srimantasutapa123.workers.dev
- **APK URL (Lite / Standard)**: https://stride-apk.srimantasutapa123.workers.dev/stride-lite-android.apk (`88,022` B) & `/stride-android.apk` (`25,791,329` B)
- **GitHub Repository**: https://github.com/Sayantan-Sinha-GIT/stride
- **Last Updated**: 2026-11-25 01:45

## Completed Requirements
- **REQ-01..REQ-23**: All 23 checklist requirements implemented and verified across desktop (`1440px`) and mobile (`390px`, Light/Dark, `/en` & `/hi`, `/en/download` Dual-Edition Hub + `/manifest.webmanifest`), live Gmail Brevo OTP signup & password reset E2E on both website and Android, trimmed `24.6 MB` Flutter Standard APK (`Storage & Cache` 15 MB mem / 4 MB temp cap + `VACUUM`), ultra-compact `86 KB` Native Kotlin `Stride Lite` (`app-lite`, `Storage & Cache Guardian` 512 KB–5 MB LRU cap, `auto_vacuum`, Data Saver, auto-purge, offline GPS crash recovery, 5-tab UI on Android 15 Emulator), GitHub Actions `Stride CI`, and 100% Cloudflare Workers deployment with Vercel completely removed.

## Remaining Requirements
- None for v1 launch.

## Known Bugs
- None open across `/packages/track-engine`, `/api`, `/web`, `/app`, or `/app-lite`.

## Optional Owner Notes
- `FCM_PRIVATE_KEY` (optional server-to-device push signing) awaits one-click Firebase Admin SDK JSON download if server push delivery is enabled later (`google-services.json`, `FCM_PROJECT_ID`, and `FCM_CLIENT_EMAIL` are already active).
- `OLA_MAPS_API_KEY` returned `401` on direct Ola vector style endpoint, so OpenFreeMap dark/light styles remain cleanly active without errors.

# Project State

- **Project**: Stride
- **Objective**: GPS activity tracker, Hausdorff segment competition, and privacy-first social fitness platform (Flutter mobile app + Next.js flagship cinema website + Cloudflare Workers API + Neon PostGIS).
- **PRD**: PRD.md
- **Stack**: npm workspaces (`packages/track-engine`, `api` Hono + Cloudflare Workers + Neon Postgres 17 + PostGIS 3.5, `web` Next.js 15 + Tailwind v4 + GSAP + Lenis + Three.js GLSL + MapLibre GL, `app` Flutter 3.50.1 Android-first/iOS-ready)
- **Workflow Status**: DEPLOYED
- **Current Stage**: Stage 7 — Deployed & Live-Verified
- **Execution Mode**: AUTO
- **Preview URL**: http://localhost:3000/en
- **Live URL**: https://stride-web.srimantasutapa123.workers.dev
- **API URL**: https://stride-api.srimantasutapa123.workers.dev
- **APK URL**: https://stride-apk.srimantasutapa123.workers.dev/stride-android.apk
- **GitHub Repository**: https://github.com/Sayantan-Sinha-GIT/stride
- **Last Updated**: 2026-11-24 15:02

## Completed Requirements
- **REQ-01..REQ-22**: All 22 checklist requirements implemented and verified across desktop (`1440px`) and mobile (`390px`, Light/Dark, `/en` & `/hi`, `overflowX: false`, `0` broken images), live Gmail Brevo OTP signup & password reset E2E on both website and Android Emulator, Android `ActivityDetailScreen` / `SegmentDetailScreen` / `Clubs` / live `adb emu geo fix` GPS tracking, GitHub Actions `Stride CI` (`45361248258` green), and 100% Cloudflare Workers deployment (`stride-web`, `stride-api`, `stride-apk` SHA-256 verified) with Vercel completely removed.

## Remaining Requirements
- None for v1 launch.

## Known Bugs
- None open across `/packages/track-engine`, `/api`, `/web`, or `/app`.

## Optional Owner Notes
- `FCM_PRIVATE_KEY` (optional server-to-device push signing) awaits one-click Firebase Admin SDK JSON download if server push delivery is enabled later (`google-services.json`, `FCM_PROJECT_ID`, and `FCM_CLIENT_EMAIL` are already active).
- `OLA_MAPS_API_KEY` returned `401` on direct Ola vector style endpoint, so OpenFreeMap dark/light styles remain cleanly active without errors.

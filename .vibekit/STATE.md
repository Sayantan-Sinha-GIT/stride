# Project State

- **Project**: Stride
- **Objective**: GPS activity tracker, Hausdorff segment competition, and privacy-first social fitness platform (Flutter mobile app + Next.js flagship cinema website + Cloudflare Workers API + Neon PostGIS).
- **PRD**: PRD.md
- **Stack**: npm workspaces (`packages/track-engine`, `api` Hono + Cloudflare Workers + Neon Postgres 17 + PostGIS 3.5, `web` Next.js 15 + Tailwind v4 + GSAP + Lenis + Three.js + MapLibre GL, `app` Flutter 3.50.1 Android-first/iOS-ready)
- **Workflow Status**: READY FOR MY REVIEW
- **Current Stage**: Stage 5 — Local Verification & Preview
- **Execution Mode**: AUTO
- **Preview URL**: http://localhost:3000/en
- **API URL**: http://127.0.0.1:8787
- **Android APK Artifact**: `app/build/app/outputs/flutter-apk/app-release.apk` (82.3 MB, served locally via `http://localhost:3000/api/download-apk`)
- **Live URL**: Not deployed
- **Last Updated**: 2026-11-24 10:47

## Completed Requirements
- **REQ-01..REQ-22**: All 22 checklist requirements implemented and locally verified across track-engine tests (10/10), API Neon PostGIS integration tests (5/5), live Google OAuth Web & Android client config + 302 redirect verification, live Brevo REST API key & verified sender (`srimantasutapa123@gmail.com`) in `api/.dev.vars`, Firebase Android `google-services.json` (`com.stride.tracker` + SHA-1) + Google Services Gradle plugin + Flutter FCM token registration, Next.js production build (27 routes incl. `/api/download-apk`), Chrome DevTools cinema QA (`1440x900` Dark & Light, `768x1024` `/hi`, `390x844` mobile, `/en/download`), AND Flutter 3.50.1 (`flutter analyze` 0 errors/warnings, `flutter test` 3/3 suites, `flutter build apk --release`).

## Remaining Requirements
- Owner review of local preview at `http://localhost:3000/en` (and `/hi`) including live Google Login, Brevo emails, & `app/build/app/outputs/flutter-apk/app-release.apk`.
- Production deployment only when explicitly authorized via `DEPLOY MY PROJECT`.

## Known Bugs
- None open across `/packages/track-engine`, `/api`, `/web`, or `/app`.

## External Blockers
- Server-side `FCM_PRIVATE_KEY` awaits a 1-click Firebase Admin SDK JSON download from the owner's regular Chrome browser (`https://console.firebase.google.com/project/stride-515703/settings/serviceaccounts/adminsdk`), since the built-in browser sandbox cannot persist downloaded files to disk; `OLA_MAPS_API_KEY` remains optional (OpenFreeMap vector tiles are active).

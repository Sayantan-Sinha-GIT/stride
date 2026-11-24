# Stride — Build, CI/CD & Production Release Guide

## 1. Automated CI (`/.github/workflows/ci.yml`)
Every push / pull request runs:
- `@stride/track-engine` typecheck, build & Vitest unit tests
- `@stride/api` typecheck & Vitest API integration tests (when staging DB secret configured)
- `@stride/web` ESLint, typecheck & Next.js production build
- `/app` Flutter `flutter analyze`, `flutter test`, and Android release APK/AAB build job

## 2. Production Hosting (Cloudflare Free Plan)
- **API (`/api`)**: Deployed to Cloudflare Workers via `wrangler deploy`.
  - Required Cloudflare KV namespace (`STRIDE_KV`) updated in `api/wrangler.toml`.
  - Production secrets set via `npx wrangler secret put <KEY>` (`DATABASE_URL`, `JWT_SECRET`, `OLA_MAPS_API_KEY`, `BREVO_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`).
- **Website (`/web`)**: Built and deployed via `@opennextjs/cloudflare` (`opennextjs-cloudflare build && opendev/wrangler deploy`) or Cloudflare Pages.

## 3. Android Release Signing Steps (Owner Action Before Play Store)
1. Generate an upload keystore once on your machine (keep it safe & never commit to git):
   ```bash
   keytool -genkey -v -keystore stride-upload-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias stride
   ```
2. Create `app/android/key.properties` (git-ignored) with `storePassword`, `keyPassword`, `keyAlias=stride`, and `storeFile`.
3. Update `app/android/app/build.gradle.kts` `signingConfig` to read `key.properties`.
4. Build the signed Android App Bundle:
   ```bash
   cd app
   flutter build appbundle --release --dart-define=STRIDE_API_URL=https://api.yourdomain.com
   ```
5. Upload `app/build/app/outputs/bundle/release/app-release.aab` to Google Play Console.

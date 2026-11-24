# Stride: Product Requirements Document

**Product:** Stride, a GPS activity tracker and social fitness platform for runners, cyclists and walkers (Strava-style), with an Android/iOS app (Flutter) and a website.
**Audience for this document:** the AI coding agent that will build, test and deploy the project end to end.
**Owner:** non-coder product owner. The agent owns all engineering decisions not fixed here.

---

## 1. How to use this document

- This PRD defines **what** to build, **the constraints**, and **what "correct" means**. It deliberately does not prescribe screens, layouts, colours or UX flows (see section 3).
- Where the PRD fixes a technology, use it. Where it leaves a choice open, pick the simplest reliable option, and record the decision in `docs/DECISIONS.md` with a one-line reason.
- **The owner has their own build workflow (a VibeKit) that takes priority.** If it defines how to plan, build, test, review or deploy, follow it. Sections 14 and 15 are only defaults for anything the workflow does not already cover.
- If something here is impossible or conflicts with a free-tier limit, choose the closest free alternative and document it.
- **Autonomy rule: never ask the owner for decisions.** Every open design, product or technical question is yours to decide. Pick the most sensible default, write it in `docs/DECISIONS.md`, and keep building.
- **One exception: things only the owner can do** (creating accounts, API keys, OAuth credentials, anything that needs their login). For those, follow the guided-setup rules in section 1A.
- Every claim about third-party limits and pricing in this document may be outdated. **Verify current limits on each provider's official page before depending on them.**

## 1A. Guided setup for the owner (credentials and accounts)

The owner is not a developer. Whenever something can only be done by the owner (creating an account, enabling an API, generating a key, setting up Google sign-in, adding a secret), the agent must **walk them through it like a patient guide**.

**What every guided step must include**
1. **What it is and why it is needed**, in one plain sentence.
2. **The direct link** to the exact page where the action happens (the deepest working link, not a homepage). Before sharing a link, verify it is current using web search or fetch, because dashboards and URLs change.
3. **Numbered, exact steps:** what to click, what to select, what to type, and what the result should look like, so the owner can tell they did it right. Assume no prior knowledge.
4. **Where to put the result:** the exact variable name and exactly where it goes (for example a Cloudflare secret or a local `.env` file). Where possible, give the exact command or the exact place to paste it.
5. **A quick check** that confirms it worked, which the agent can run itself once the owner says it's done.
6. **Free-tier safety:** say when a step might ask for a card or payment method, and offer the no-card alternative instead (section 5).

**Rules**
- **Batch the requests.** Do not interrupt the owner for each key. Collect everything needed for the current phase into one setup checklist, ask once, and let the owner finish it in one sitting.
- **Never block on it.** Until the owner provides a key, keep building with clearly marked mocks, test credentials or local stand-ins, and wire in the real key as soon as it arrives.
- **Do it yourself when you can.** If the agent has access to a connected tool (for example GitHub, Cloudflare or Neon through the owner's workflow) and can create the resource or secret without the owner, do so and do not hand the work to the owner.
- **Keep secrets safe.** Never put keys in the repository, in client apps (apart from keys designed to be public), in logs or in chat transcripts. Tell the owner to paste secrets only into the places the guide names.
- **Maintain `docs/SETUP-GUIDE.md`:** a single, up-to-date checklist of every account, key and setting the project needs (with the same links and steps), marked done or pending, so the owner can always see what is left.
- Expected items include, at minimum: Ola Maps (or the fallback map provider) API key, Neon project and connection string, Brevo account, sender verification and API key, Google Cloud project with OAuth consent screen and client IDs (web, Android with the app's SHA-1, and iOS if needed), Firebase project with FCM and the service account, Cloudflare account and project settings, and any domain or GitHub secrets the pipeline needs.

## 2. Vision and principles

**One line:** record every run, ride and walk accurately, share it with friends, and compete on real stretches of road.

**Principles**
1. **Deterministic and reliable.** The product runs on GPS, geometry and arithmetic. No AI-generated content in any core feature.
2. **Accuracy first.** Distance, pace, elevation and segment times must be correct and reproducible. Test with real recorded and simulated GPS data.
3. **Never lose an activity.** A recording must survive app kills, crashes, low battery, no network and phone restarts, as far as the OS allows.
4. **Privacy by default.** Location data is sensitive. Defaults protect the user (section 9).
5. **Free-tier friendly.** Design every feature so the whole system runs at zero cost for the first thousands of users (section 13).

## 3. UI/UX policy

The owner has their own design preferences and will provide or direct them separately.

- Do **not** invent a visual identity, brand, colour palette, illustrations or detailed screen designs.
- Build functional screens that cover each feature's requirements using clean, neutral, standard components.
- Centralise all visual choices (colours, typography, spacing, radii) in a theme layer on both Flutter and web, so the owner's design can be applied later by editing the theme and not by rewriting screens.
- **Light and dark mode are required** on both app and website, as a user setting with three options: light, dark, follow system (default). The theme layer must support both modes from day one, with the actual colours left as neutral placeholders for the owner to replace. The choice is saved on the account and applies on every device, and the website applies it without a flash of the wrong theme on page load. Maps switch to a matching light or dark map style where the provider offers one. Every screen, state and public page must remain readable in both modes.
- Do include the usability fundamentals that are engineering concerns, not design opinions: loading, empty, error and offline states for every screen; accessibility basics (touch target size, contrast-safe defaults, screen reader labels); responsive layout on web.
- Where a feature needs a UX decision, choose the simplest standard behaviour and note it in `docs/DECISIONS.md`. Do not ask.

## 4. Users

- **Everyday movers:** want to record a walk, run or ride and see how they improve.
- **Social competitors:** want friends, kudos, leaderboards, challenges and clubs.
- **Club organisers:** want to run a group with shared goals and events.
- **Viewers (web, not logged in):** open shared activity links and public pages.

Primary market is India (distances in km by default, local time zones, INR not needed since there is no payment), but everything must work globally. Support metric and imperial units as a user setting, and both English and Hindi as interface languages (section 12).

## 5. Tech stack (fixed)

| Area | Choice | Notes |
|---|---|---|
| Mobile app (Standard) | **Flutter** (Android first, iOS-ready, `com.stride.tracker`, `24.6 MB`) | Background GPS, offline-first recording, trimmed of bloated native map engines, bounded `15 MB` image memory cache + `4 MB` temp cap + `VACUUM` DB compaction |
| Mobile app (Lite) | **Native Kotlin Android** (`/app-lite`, `com.stride.tracker.lite`, `86 KB`) | Ultra-light pure Android SDK/SQLite build with zero heavy engine/tile bloat, configurable LRU disk cache cap (`512 KB` / `2 MB` / `5 MB`), `PRAGMA auto_vacuum = FULL`, `Data Saver`, & auto-purge on close |
| Website & Web Lite PWA | **Next.js 15 deployed on Cloudflare Workers** via `@opennextjs/cloudflare` (`stride-web.srimantasutapa123.workers.dev`) | Server-rendered public pages for SEO and share previews + `/manifest.webmanifest` installable Web Lite PWA (`?variant=lite` download hub); zero Vercel dependency |
| Android APK hosting | **Cloudflare Workers chunked Static Assets** (`apk-host/` -> `stride-apk.srimantasutapa123.workers.dev`) | Serves `stride-lite-android.apk` (`88,022` bytes / `86 KB`) & `stride-android.apk` (`25,791,329` bytes / `24.6 MB` via `18 MiB` chunks) + `/manifest.json`; `/api/download-apk` redirects 302 with zero R2/card requirement |
| API | **Cloudflare Workers** (a single TypeScript API, e.g. with Hono) | Used by both the app and the website |
| Database | **Neon (Postgres)** with the **PostGIS** extension | Use Neon's serverless driver from Workers; use pooled connections; handle scale-to-zero cold starts gracefully |
| Email | **Brevo** (transactional email API) | Verification, password reset, optional digest |
| Login | **Email login + Google login** | Custom auth built on Workers (section 7). No Firebase Auth |
| Notifications | **Firebase Cloud Messaging (FCM)** only | Sending from Workers via FCM HTTP v1 (service-account OAuth token signed with Web Crypto) |
| Maps | **OpenFreeMap** (MapLibre vector `dark` / `positron` styles, zero API key/card) active via `/v1/maps/config` abstraction | Fallback activated after Ola Maps direct vector style endpoint returned HTTP 401; geocoding still cached server-side in KV |
| Scheduled jobs | **Protected admin endpoint** `POST /v1/admin/cron/heatmap` + cleanup trigger | Cloud account free-tier 5-cron cap is already allocated to other Workers; same aggregation pipeline invoked on demand |
| Caching | Cloudflare Cache API / KV | Public pages, leaderboards, heatmap tiles |
| Code hosting | GitHub (monorepo: `/app`, `/app-lite`, `/web`, `/api`, `/apk-host`, `/packages/track-engine`, `/docs`) | Commit per feature; keep `main` deployable |

Everything on this list must be usable on free plans. If any component needs a payment method (credit/debit card) on the account to unlock its free tier, **do not use it**. Pick a free alternative that needs no card, and record the choice.

## 6. Maps

**Preferred provider: Ola Maps (Krutrim).** It offers vector map tiles, autocomplete and geocoding APIs, and directions, and it has publicly advertised a free tier. As of the latest information I found, its pricing moved to a prepaid-credit model from September 2026 while saying usage inside the free-tier allowance needs no credit balance. The size of the free allowance has been reported differently in different sources, so confirm it on the Ola Maps console and pricing page before relying on it.

**Requirements**
1. Try Ola Maps first: create the developer project and API key, load its vector tiles and style into a MapLibre-based map on both Flutter and web.
2. **Wrap all map access behind a thin abstraction** (map style URL, geocoding/search, optional directions) controlled by configuration, so the provider can be swapped without touching feature code.
3. **Fallback** if Ola Maps is unavailable, restrictive, or its free tier is too small: use another free vector-tile provider that works with MapLibre (for example a free tier of MapTiler or Stadia Maps, OpenFreeMap, or self-hosted Protomaps files). Do not use OpenStreetMap's public tile servers for production traffic; their usage policy forbids heavy app use.
4. Protect the free quota: proxy and **cache geocoding and search requests** through the API, debounce autocomplete, and restrict API keys by app ID/domain where the provider supports it.
5. **Core recording must never depend on a map provider.** GPS tracking, distance, pace, saving and syncing all work with maps down. Maps are only for display, search and optional route suggestions.
6. Routes are drawn from the stored track, not from a directions API.

## 7. Authentication and accounts

Build custom auth on Workers and Neon.

**Email login**
- Sign up with email + password, verified through a Brevo email (a link or a one-time code; the agent picks the simpler reliable option and supports it on both app and web).
- Password reset by email. Passwords hashed with a modern, Workers-compatible algorithm (Argon2id via WASM, or PBKDF2 with a high iteration count via Web Crypto; document the choice).
- Rate-limit signup, login, verification and reset endpoints, and avoid revealing whether an email exists.
- Respect Brevo's free sending limits: send only essential emails, queue and retry politely, and fail gracefully with a clear error if the daily cap is hit.

**Google login**
- Mobile: native Google sign-in in Flutter, sending the Google ID token to the API, which verifies it (signature, audience, expiry) before issuing a Stride session.
- Web: standard Google OAuth sign-in.
- Link by verified email: a Google sign-in with an email that already exists signs into the same account only if the email is verified; otherwise require verification.

**Sessions**
- Short-lived access tokens plus rotating refresh tokens, stored hashed server-side, revocable per device. Mobile stores tokens in secure storage.
- Users can see and sign out of their devices.

**Account lifecycle**
- Profile: display name, unique handle, optional bio, optional avatar, home city (optional), unit preference, default privacy settings.
- **Account deletion** removes the user's personal data and activities (or anonymises what must remain, such as aggregate stats), and is available in the app and on the web.
- **Data export:** download all activities as GPX/JSON.

## 8. Features and requirements

Priorities: **P0** = launch-critical, **P1** = important, **P2** = nice to have.

### 8.1 Activity recording (app) — P0

- Activity types: run, walk, ride (outdoor), plus hike as an optional type. Types affect calorie estimates, speed validation and segment eligibility.
- Start, pause, resume, stop, discard. Auto-pause when stationary (user-toggleable).
- Live metrics during recording: elapsed time, moving time, distance, current and average pace or speed, elevation gain, and a live track on the map.
- **Background-safe recording:** continues with the screen off and app backgrounded, using a foreground service on Android (with the required persistent notification) and the equivalent background location mode on iOS. Handle permission flows correctly (foreground location, then background location, notification permission on newer Android versions) and explain clearly what is needed and why.
- **Crash and kill recovery:** write points to a local database continuously (not only in memory). On next launch, detect an unfinished recording and offer to resume or save it.
- **Offline-first:** every activity is saved locally first, then synced when online with retries. Syncing must be idempotent (client-generated IDs) so retries never create duplicates.
- Battery awareness: sensible sampling interval, adjusting to speed and activity type.
- Optional manual activity entry (type, date, duration, distance) for forgotten recordings, flagged as manual and ineligible for leaderboards.
- GPX file import (web and app), flagged as imported; segment eligibility is decided by the rules in 8.3.

### 8.2 Track processing and metrics — P0

This is the accuracy core. Put the processing logic in a shared, well-tested module (or equivalent implementations verified against the same test vectors).

- **GPS filtering:** drop points with poor accuracy, impossible jumps, and initial-fix noise. Apply light smoothing without distorting corners.
- **Distance:** computed from filtered points using a geodesic (haversine or better) calculation.
- **Moving vs elapsed time:** based on speed thresholds per activity type.
- **Pace, speed, splits:** per-km (or per-mile) splits and a pace/speed series.
- **Elevation:** GPS altitude is noisy. Smooth it, apply a minimum-change threshold when summing gain, and use the barometer where available. Document the method.
- **Calories:** a transparent estimate (MET-based using activity type, speed and optional body weight). Label it as an estimate.
- **Route storage:** store the full filtered track compactly (encoded polyline or similar, with per-point timestamps, elevation and optional heart rate) and a simplified geometry in PostGIS for spatial queries. Do not store thousands of raw points as individual database rows (free-tier storage).
- **Heart rate / sensors (P2):** optional Bluetooth heart-rate strap support; skip for the first release unless time allows.
- Provide a **recompute function** so improvements to the algorithm can be re-applied to old activities.

### 8.3 Segments and leaderboards — P0

- A **segment** is a named stretch of road or path defined by the user from one of their recorded activities (choose a start and an end point along the track). Segments have a type (run or ride), distance, elevation profile, and a creator.
- Validation when creating: sensible minimum and maximum length, not closed loops that confuse matching in v1, and a duplicate check (do not allow near-identical segments to proliferate; suggest the existing one).
- **Matching:** after an activity is processed, find segments the track passed through, in the right direction and in order. Use PostGIS: spatial index on bounding boxes first, then start/end proximity, then a shape-similarity check (for example a Fréchet or Hausdorff distance threshold) so shortcuts do not count. Compute the effort time by **interpolating timestamps** at the exact entry and exit points.
- Run matching as a background step after upload (for example `ctx.waitUntil`, or Cloudflare Queues if available on the free plan), never blocking the upload response. Make it idempotent and re-runnable.
- **Leaderboards:** all-time, this year, this month, and "friends/following". Show each user's best effort. Ranking uses elapsed segment time.
- **Personal best tracking:** flag PRs and top-10 placements, and trigger a notification (respecting settings).
- **Fairness checks:** reject or flag efforts with implausible speed for the activity type (for example a "run" at vehicle speed), GPS teleport jumps, and manual or imported activities (decide a clear rule and document it). Users can flag suspicious efforts; creators of segments can request review. Provide a minimal admin ability to hide efforts.
- Cache leaderboard reads (short TTL) to protect the database.

### 8.4 Social — P0/P1

- **Follow system:** follow/unfollow; private accounts require follow approval (P1).
- **Feed (P0):** activities from people you follow, newest first, with cursor-based pagination.
- **Kudos and comments (P0):** like and comment on activities; delete own comments; activity owners can delete comments on their activities.
- **Block and report (P0):** blocking hides both ways and removes follows. Reports are stored for an admin to review.
- **Search (P1):** find people by handle or name.
- **Per-activity visibility:** public, followers only, or only me, with a default setting and the ability to change it later.

### 8.5 Goals, stats and records — P0/P1

- **Personal records (P0):** automatic best efforts for standard distances (1 km, 5 km, 10 km, half marathon, marathon for runs; best distances/speeds for rides), plus longest and highest-climb activities.
- **Stats (P0):** weekly, monthly and yearly totals by activity type; streaks.
- **Goals (P1):** weekly or monthly goals by distance, time or count, with progress tracking and reminders.
- **Gear (P2):** shoes/bikes with mileage tracking.

### 8.6 Clubs, challenges and events — P1

- **Clubs:** create, join (open or approval-based), leave; member list; club feed of members' public activities; admins and members roles.
- **Challenges:** time-boxed goals (for example "100 km in December"), joinable by individuals or inside a club, with a live-updating leaderboard calculated from qualifying activities; completion marks and badges.
- **Events (P2):** simple listing of meetups or races with date, place and attendees. No ticketing or payments.
- **Badges:** milestone-based (first activity, distance milestones, streaks, challenge completion), awarded by server-side rules and idempotent.

### 8.7 Route discovery — P1

- Show popular nearby public activity routes and segments, using PostGIS proximity queries.
- Save a route to reuse later; the app can show it as a reference line while recording.
- Do not use external routing APIs for this in v1 (protects free-tier map quotas).

### 8.8 Notifications — P0/P1

- FCM push for: kudos, comments, new followers or follow requests, segment PRs and leaderboard changes, challenge milestones, goal reminders, and club announcements.
- **Granular settings** per notification type, plus quiet hours. Respect the OS permission model.
- Device token management: register, refresh and remove tokens on logout; clean up invalid tokens when FCM reports them.
- Batch and de-duplicate (for example "5 people gave you kudos") so users are not spammed.
- Optional weekly summary push or email (Brevo), user-controlled and off by default if email volume is a concern.

### 8.9 Website — P0/P1

The website is a first-class product, not just a landing page.

- **Public pages (P0), server-rendered for SEO and share previews:**
  - Public activity page with the route, key stats and an animated route replay.
  - Public profile page (only public data).
  - Segment page with leaderboard and map.
  - Club and challenge pages.
  - Proper titles, descriptions and Open Graph/Twitter metadata so shared links preview well. Generate share preview images on the edge, or use a simple dynamic approach that works within free limits.
- **Authenticated web app (P0):** sign in with email or Google; view and manage activities; feed; profile and settings; upload GPX; create and view clubs, segments and challenges; notification settings; account deletion and data export.
- **Dashboard (P1):** training analytics: weekly volume, pace/speed trends, PR history, yearly summary.
- **Year in review (P1):** shareable annual summary generated from the user's own data.
- **City heatmap (P1):** aggregated, anonymised density of public activities. Pre-compute on a schedule into tiles or grids, cache at the edge, and apply a minimum-contributors threshold so individuals cannot be identified (section 9). Exclude data inside privacy zones.
- **App download page** with links to the Android build (and iOS when available), plus a QR code.
- **Admin area (P1, protected):** review reports, hide or remove activities, comments, segments or users, and view basic system stats.

### 8.10 Settings — P0

Appearance (light, dark or follow system), language (English or Hindi), units, default activity visibility, privacy zones, notification preferences, connected login methods, password change, devices/sessions, data export, account deletion.

## 9. Privacy, safety and compliance

- **Privacy zones (P0):** users can define areas (for example home, work) with a radius. Any shared or public view of an activity **hides the portion of the track inside those zones**. Apply this on the server when serving anyone other than the owner; never expose the raw track through any public endpoint or cache.
- **Safe defaults:** new accounts default to followers-only (or a clearly chosen safe default, documented) for activity visibility. Public heatmap and public pages use only data that users made public.
- **Start/end protection:** offer an option to hide the first and last few hundred metres of any activity.
- **Authorisation on every endpoint:** an automated test suite must verify that private and followers-only activities cannot be fetched by unauthorised users, via any route including feeds, segments, leaderboards, clubs and the heatmap.
- **Data minimisation:** collect only what is needed. No selling or sharing of data.
- **User rights:** export and deletion as in section 7. Include a Privacy Policy and Terms page and a clear explanation of what location data is collected and why, in the spirit of India's DPDP Act and general best practice (the owner should have a lawyer review before public launch).
- **Abuse prevention:** rate limits on all write endpoints, input validation and size limits on uploads, protection against spam comments and follows, and basic content reporting.
- **Safety note:** in the recording flow, include a short, non-intrusive safety reminder for first use (traffic, visibility). No health claims anywhere; calories are estimates.

## 10. Architecture overview

```
Flutter app ──┐
              ├──> Cloudflare Workers API ──> Neon Postgres + PostGIS
Next.js web ──┘          │   │
                         │   └──> Brevo (email)
                         └──────> FCM (push)
Cron Triggers ──> aggregation, summaries, cleanup
Map provider (Ola Maps / fallback) <── app and web (tiles), API proxy (geocoding, cached)
```

- One API, one source of truth for business logic. The web app should call the same API (server-side where useful) and not duplicate rules.
- Versioned REST API (`/v1`), JSON, consistent error format, cursor-based pagination, and an OpenAPI description kept in `docs/`.
- Idempotency keys on activity uploads.
- Secrets live in Cloudflare secrets and CI secrets, never in the repo or the client. Client apps contain only public keys.

## 11. Data model (guidance)

The agent designs the final schema and migrations (use a migration tool; every change is a migration). Expected core entities:

- `users`, `auth_identities` (email/Google), `sessions`/`refresh_tokens`, `email_verifications`, `devices` (FCM tokens), `user_settings`, `privacy_zones`
- `activities` (type, start time, time zone, distance, moving/elapsed time, elevation gain, calories, visibility, source: recorded/imported/manual, encoded track, simplified geometry, bounding box), optional `activity_streams` for per-point data if stored separately
- `segments`, `segment_efforts` (activity, segment, elapsed time, start/end offsets, rank-relevant flags)
- `follows`, `blocks`, `kudos`, `comments`, `reports`
- `clubs`, `club_members`, `challenges`, `challenge_participants`, `badges`, `user_badges`, `events`, `event_attendees`
- `notifications` (in-app record) and `notification_preferences`
- `personal_records`, `goals`, `gear`
- `heatmap_cells` or tile cache tables (aggregates only)

**Required:** spatial (GiST) indexes on geometries, indexes for feed and leaderboard queries, foreign keys with sensible cascade rules (account deletion must really delete), and timestamps in UTC with the activity's local time zone stored separately.

## 12. Non-functional requirements

- **Accuracy:** distance error on a known test route within about 1 to 2 percent of reference in good GPS conditions; segment times within about 1 second of expected on simulated tracks.
- **Performance targets:** API p95 under 500 ms for typical reads (excluding Neon cold start); feed first page loads quickly; upload plus processing of a 2-hour activity completes within a few seconds.
- **Cold starts:** Neon free compute scales to zero. Keep first-request latency acceptable (retry logic, a lightweight health endpoint, and sensible loading behaviour in clients).
- **Reliability:** no lost activities; retries with backoff; clear sync status per activity.
- **Security:** OWASP basics, parameterised queries only, strict CORS, security headers, dependency scanning.
- **Observability:** structured logs on Workers, error tracking within free options, and a simple status/health endpoint.
- **Accessibility:** touch target sizes, screen reader labels, and contrast-safe defaults.
- **Languages: English and Hindi at launch.** Externalise every user-facing string (app, website, emails, push notifications, error messages, legal pages) so more languages can be added later.
  - Users pick their language in settings, defaulting to the device language when it is English or Hindi, otherwise English. The choice is stored on the account so emails and push notifications arrive in the same language.
  - Website: separate language routes with proper `hreflang`/metadata so Hindi pages are indexable and share previews appear in the right language.
  - Hindi text must render correctly everywhere: use fonts with full Devanagari support, make sure text is not clipped or overflowing, and use locale-aware formatting for dates, numbers, units and pace.
  - Hindi copy should read naturally to a native speaker, not as a literal translation; keep fitness terms commonly used in India (for example, keep widely used English words like "kudos"-style actions in a natural Hindi equivalent or in Latin script if that is how people say it) and record any terminology choices in `docs/DECISIONS.md`.
  - User-generated content (names, comments, club names) must support Hindi and mixed-script input, including search and handle rules.

## 13. Free-tier constraints and how to design for them

Verify the current limits of Neon, Cloudflare, Brevo, FCM and the map provider before building, and write the findings to `docs/LIMITS.md`.

- **Database size:** store tracks compactly; keep per-point data out of relational rows; prune or archive old derived data; avoid storing computed values that are cheap to recompute.
- **Database compute:** cache leaderboards, public pages and heatmap tiles; avoid N+1 queries; use the pooled connection and the serverless driver.
- **Workers limits:** keep CPU time per request small; push heavy work (segment matching, aggregation) into short background steps or cron batches, and design them to be resumable.
- **Email:** only essential transactional emails by default; handle the daily cap gracefully.
- **Maps:** cache geocoding, avoid per-keystroke search, limit tile requests with sensible zoom limits and client caching.
- **Storage for images:** v1 should work without user-uploaded photos. If avatars are needed, keep them tiny, or use a free option that does not require a payment method. Never adopt anything that needs a card.
- **Realtime:** do not hold open sockets for every user. Use polling, pull-to-refresh and short-TTL caches for feeds and leaderboards.
- **Hosting:** Cloudflare's free plan is the deployment target for web and API.

## 14. Quality, testing and deployment

The agent is responsible for testing and deployment, not the owner.

**Testing**
- **Unit tests** for the track processing module: distance, filtering, moving time, elevation, splits, PR detection, calories.
- **Fixture-based tests** with recorded and synthetic GPX files (including noisy tracks, tunnels/GPS loss, paused segments, loops, out-and-back routes, and very short or very long activities).
- **Segment matching tests:** correct match, wrong direction, shortcut, partial overlap, near-duplicate segments, boundary timing.
- **API tests** for every endpoint including authorisation and privacy-zone enforcement.
- **Auth tests:** signup/verify/reset flows, token rotation and revocation, Google token verification failures, rate limiting.
- **App tests:** recording state machine, crash recovery, offline sync with idempotency, permission flows. Include a **GPS simulation mode** (dev-only) so recording can be tested without walking outside.
- **Manual device checklist** in `docs/QA.md` for real-phone testing: background recording on screen-off, battery behaviour, permission denial paths, airplane-mode recording, upgrade-in-place.

**CI/CD**
- GitHub Actions (free tier) running lint, tests and migrations checks on every push.
- Automatic deployment of the website and API to Cloudflare from `main`; separate staging and production environments (separate Neon branches/databases and separate keys).
- Database migrations run in a controlled, reversible way; take care never to run destructive migrations unreviewed.
- Android release build pipeline producing a signed APK/AAB; the owner will handle store accounts. Document the exact release steps.

**Documentation to maintain in `/docs`:** `README` (setup and run), `SETUP-GUIDE` (owner's account and key checklist), `DECISIONS`, `LIMITS`, `QA`, `API` (OpenAPI), `PRIVACY-NOTES`, `RELEASE`.

## 15. Delivery phases

**Phase 0: Foundations.** Monorepo, environments, CI, Cloudflare + Neon + PostGIS wiring, migration setup, config and secrets approach, map provider abstraction with Ola Maps test (and fallback decision recorded), theme layer on both clients.

**Phase 1: Accounts.** Email signup with Brevo verification, login, reset, Google login (app and web), sessions, devices, profile and settings, account deletion and export. Deploy and test end to end.

**Phase 2: Recording core.** Background GPS recording, local persistence, crash recovery, offline sync, track processing module with full tests, activity detail on app and web, GPX import and export.

**Phase 3: Social and privacy.** Visibility settings, privacy zones, follow system, feed, kudos, comments, block and report, push notifications for social events, authorisation test suite.

**Phase 4: Competition.** Segments, matching, leaderboards, PRs, fairness checks, personal records and stats.

**Phase 5: Community.** Clubs, challenges, badges, goals, route discovery, notification preferences and digest.

**Phase 6: Website depth.** Public pages with share previews, route replay, dashboard, year in review, city heatmap, app download page, admin area.

**Phase 7: Hardening and launch.** Performance and load pass against free-tier limits, security review, accessibility pass, legal pages, store-ready builds, release documentation.

At the end of each phase, report briefly: what was built, what was tested, what is deployed (with links), and decisions made. Then continue to the next phase without waiting.

## 16. Out of scope for v1

Payments or subscriptions, ads, in-app messaging between users, live tracking shared with others in real time, wearable-specific apps (watchOS/Wear OS), third-party sync (Strava/Garmin/Apple Health), training plans or coaching, video, and AI features of any kind.

## 17. Default decisions (already made, do not ask)

1. Android-first launch; keep the Flutter code iOS-ready.
2. Default activity visibility for new accounts: followers only.
3. No service that requires a card or payment method is to be used.
4. English and Hindi at launch, with all strings externalised so further languages can be added later.

## 18. Definition of done

- All P0 features work on a real Android phone and on the deployed website.
- Recording is robust: background, offline and crash-recovery scenarios pass the manual checklist.
- Segment matching and leaderboards pass the test suite; privacy tests pass with no leakage paths.
- Everything runs on free tiers, with limits documented and caching in place.
- CI is green, production is deployed from `main`, and documentation is complete.

---

## 19. Implemented Production Alignment (Final As-Built Notes)

- **100% Cloudflare Workers Production Architecture (Zero Vercel)**:
  - Website (`stride-web`): `https://stride-web.srimantasutapa123.workers.dev`
  - API (`stride-api`): `https://stride-api.srimantasutapa123.workers.dev`
  - APK Host (`stride-apk`): `https://stride-apk.srimantasutapa123.workers.dev` serves both `stride-lite-android.apk` (`88,022` bytes / `86 KB`, `com.stride.tracker.lite`, pure Kotlin SDK/SQLite with `512 KB`/`2 MB`/`5 MB` LRU disk cache cap, `PRAGMA auto_vacuum = FULL`, `Data Saver`, and temp auto-purge) and `stride-android.apk` (`25,791,329` bytes / `24.6 MB`, `com.stride.tracker`, trimmed of unused tile binaries with `AppCacheManager` `15 MB` mem / `4 MB` temp cap + `VACUUM`), redirected from `/api/download-apk?variant=lite` and `/api/download-apk`. All Vercel deployments were permanently removed.
- **Authentication & Cross-Origin Session Delivery**:
  - Passwords hashed with Web Crypto `PBKDF2-SHA256` (100,000 iterations).
  - Email verification and password reset use localized 6-digit Brevo OTP codes (`en` / `hi`) with resend/edit UX across Web, Flutter Standard, and `Stride Lite`.
  - Web and `Stride Lite` Google OAuth sign users in via single-use `STRIDE_KV` `?oauthCode=` exchange (`POST /v1/auth/oauth-exchange`, `?client=lite` -> `stride-lite://oauth?oauthCode=...`) so shared `*.workers.dev` public-suffix origins authenticate seamlessly alongside HttpOnly refresh cookies and Keystore-encrypted Android tokens.
- **UI/UX**: Flagship bespoke identity applied per the owner's UI/UX preferences across Web (`web/src/styles/tokens.css`, GSAP/Lenis/Three.js GLSL, Dual-Edition `/en/download` + `/manifest.webmanifest` Web Lite PWA, responsive `1440px` & `390px`), Flutter (`app/lib/theme/stride_theme.dart`), and `Stride Lite` (`app-lite/.../core/LiteTheme.kt`), preserving Light/Dark/System theme switching and full English/Hindi (`en` / `hi`) parity.
- **CI/CD & Documentation**: GitHub Actions (`Stride CI`) runs Node 22 (`web-and-api`), Java 21 + Flutter `3.50.1` (`flutter-app`), and Java 21 + Gradle `9.5.0` (`stride-lite-android`) to validate linting, typechecks, tests, and Android release APK builds on `main`. `docs/SETUP-GUIDE.md` was intentionally omitted per owner instruction, with architecture decisions tracked in `docs/DECISIONS.md`, limits in `docs/LIMITS.md`, and release steps in `docs/RELEASE.md`.

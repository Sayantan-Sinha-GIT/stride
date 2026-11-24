# Stride — Monorepo Setup & Local Development

## Structure
- `/packages/track-engine`: Pure TypeScript deterministic GPS filtering, geodesic distance, splits, MET calories, GPX 1.1 parser/serializer, privacy zone masking, Hausdorff/Frechet segment matching, and PR detection.
- `/api`: Cloudflare Workers Hono TypeScript API (`/v1`) connected to Neon Postgres + PostGIS.
- `/web`: Next.js 15 App Router website (`@opennextjs/cloudflare`-ready) with centralized CSS design tokens, Light/Dark/System themes, bilingual English + Hindi (`en`/`hi`), MapLibre GL JS vector maps, and GSAP scroll choreography.
- `/app`: Flutter Android-first / iOS-ready mobile app with background GPS service, SQLite crash recovery, offline idempotent sync queue, and Dev GPS Simulator.
- `/docs`: Documentation, OpenAPI 3.1 spec, free-tier limits, privacy compliance notes, QA checklist, and guided setup.

## Local Run Commands
```bash
# 1. Install dependencies (from monorepo root)
npm install

# 2. Apply database schema & demo seed data to Neon Postgres + PostGIS
npm run db:migrate
npm run db:seed

# 3. Start Cloudflare Workers API locally (http://127.0.0.1:8787)
npm run dev:api

# 4. Start Next.js Website locally (http://localhost:3000)
npm run dev:web

# 5. Run automated tests, typecheck, and lint
npm test
npm run typecheck
npm run lint
```

## Demo Accounts (Seeded Locally)
- **Demo Athlete**: `arjun@stride.demo` / `StrideDemo123!` (`@arjun_runs`, Bengaluru)
- **Demo Moderator / Admin**: `admin@stride.demo` / `StrideAdmin123!` (`@priya_admin`, Mumbai)
- **Hindi Athlete**: `rohan@stride.demo` / `StrideDemo123!` (`@rohan_kolkata`, Kolkata)

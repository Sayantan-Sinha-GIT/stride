# Architecture & Engineering Decisions

1. **Database & Spatial Index (`Neon + PostGIS`)**: Provisioned dedicated Neon Postgres 17 project `stride` (`wandering-sound-01411373`, `aws-ap-southeast-1`, closest to primary India market) with `postgis` and `pgcrypto`. Existing unrelated Neon projects were left untouched.
2. **Password Hashing (`PBKDF2-SHA256`, 310,000 iterations, Web Crypto)**: Chosen over WASM Argon2id to fit comfortably inside Cloudflare Workers' 10 ms free-tier CPU time per invocation with zero external binary dependencies while matching OWASP recommendations.
3. **Map Provider Abstraction (`Ola Maps` primary + `OpenFreeMap` free fallback)**: All style URLs and geocoding requests sit behind `/v1/maps/config` and `/v1/maps/geocode` (with KV 24h caching) plus client-side `mapConfig` helpers. When `OLA_MAPS_API_KEY` is unset (or quota exhausted), clients seamlessly use `OpenFreeMap` vector styles (`dark` and `positron`, zero card/API key required) and Nominatim cached search.
4. **Track Filtering & Elevation Smoothing**:
   - Drop points with GPS accuracy `> 35m` (run/walk/hike) or `> 50m` (ride), initial-fix instability, non-monotonic timestamps, and speed jumps (`> 12 m/s` run, `> 32 m/s` ride).
   - 3-point weighted spatial smoothing skipping sharp corners (`turnAngle > 25°`).
   - 5-point median + moving-average altitude smoothing with `3.0m` hysteresis elevation-gain threshold.
5. **Segment Matching & Fairness Rules**:
   - Segment creation requires `150m <= length <= 50km`, non-closed-loop (`startToEnd >= min(50m, length * 0.1)`), and blocks near-duplicates (start/end `<= 40m`, length diff `< 10%`, Hausdorff `<= 35m`).
   - Matching verifies ordered entry/exit (`<= 30m` proximity), 25-point bidirectional discrete Hausdorff + Fréchet distance (`<= 35m`), monotonic progression, and linear timestamp interpolation at exact projected entry/exit points (<1s precision).
   - Manual activities are never segment-eligible. Imported GPX files ARE eligible if they carry real timestamps and pass speed/teleport fairness checks (`run <= 7.4 m/s` avg / `11.5 m/s` peak; `ride <= 18.9 m/s` avg / `29.2 m/s` peak).
6. **Privacy Defaults & Heatmap Anonymization**:
   - New accounts default to `followers` activity visibility (`default_visibility = 'followers'`).
   - Privacy zones + optional start/end distance trim are enforced strictly server-side before returning any activity, GPX, or route to non-owners.
   - Public city heatmap aggregates grid cells (`0.002°` ~220m) via scheduled cron strictly from `visibility = 'public'` tracks outside privacy zones, serving only cells with `contributor_count >= 3`.
7. **Hindi Fitness Terminology (`en` + `hi`)**: Keep widely used Indian athletic terms natural in Hindi rather than stiff literal translations — e.g. "Kudos" -> `"शाबाशी (Kudos)"` or `"वाह!"` in action labels, "Pace" -> `"पेस (Pace)"`, "Segment" -> `"सेगमेंट"`, "Personal Record" -> `"व्यक्तिगत रिकॉर्ड (PR)"` alongside pure Hindi navigation/controls and full `Noto Sans Devanagari` typography.
8. **Web Visual Direction (PRD §3 + Owner `UI-UX Preferences.txt`)**: Applied the owner's flagship Kinetic Telemetry & Topographic Cartography design system (Obsidian Dark `#080B0F` / Architectural Stone Light `#F3F5F8`, Signal Volt `#FF4D1C` / `#D1380E`, Space Grotesk + Plus Jakarta Sans + JetBrains Mono + Noto Sans Devanagari, living TopoCanvas, MapLibre route replay, GSAP ScrollTrigger choreography) strictly through centralized theme CSS tokens so visual re-skinning requires touching only `tokens.css` / `stride_theme.dart`.

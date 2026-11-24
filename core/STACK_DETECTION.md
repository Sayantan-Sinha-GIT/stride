# Stack Detection & Provider Independence

Never assume a project uses Node.js or `npm run dev` / `npm run build`. Inspect actual manifests first.

## 1. Stack & Command Detection Matrix

| Manifest / Marker | Detected Stack | Package / Tooling Check | Typical Dev / Run Command | Typical Verification / Build Command |
|---|---|---|---|---|
| `package.json` | Node / Web / JS / TS | Inspect `scripts` in `package.json`; check `pnpm-lock.yaml`, `yarn.lock`, `bun.lock*`, or `package-lock.json` | `<pm> run dev` or `<pm> start` (whatever exists in `scripts`) | `<pm> test`, `<pm> run lint`, `<pm> run typecheck`, `<pm> run build` |
| `pyproject.toml`, `requirements.txt`, `manage.py` | Python (FastAPI, Django, Flask, Streamlit, CLI) | Check `uv.lock`, `poetry.lock`, `.venv` | `uvicorn ... --reload`, `python manage.py runserver`, `flask run`, `streamlit run`, `python -m <pkg>` | `pytest`, `ruff check`, `mypy` |
| `go.mod` | Go | `go version` | `go run ./...` | `go test ./...`, `go vet ./...`, `go build ./...` |
| `Cargo.toml` | Rust | `cargo --version` | `cargo run` | `cargo test`, `cargo clippy`, `cargo build --release` |
| `pubspec.yaml` | Flutter / Dart | `flutter --version` | `flutter run` | `flutter analyze`, `flutter test`, `flutter build <target>` |
| `build.gradle*`, `settings.gradle*`, `pom.xml` | Java / Kotlin / Android | Gradle wrapper (`./gradlew`) or Maven (`./mvnw`) | `./gradlew run` or Android emulator/APK run | `./gradlew test`, `./gradlew check`, `./gradlew assembleRelease` |
| `*.csproj`, `*.sln` | .NET / C# | `dotnet --version` | `dotnet run` | `dotnet test`, `dotnet build -c Release` |
| `index.html` (no build tool) | Static HTML / CSS / JS | None required | `npx --yes serve .` or `python -m http.server` | Browser load + console/layout verification |
| Monorepo (`pnpm-workspace.yaml`, `turbo.json`, `nx.json`, multiple dirs) | Multi-package repo | Inspect root + workspace manifests | Root workspace dev script or individual service commands | Workspace test/build per affected package |

## 2. Rules for Stack & External Providers
1. **Check Existing Scripts First**: Before running any command, read `package.json`, `pyproject.toml`, `Makefile`, or README to see the exact script names used by the repo.
2. **Honor `PRD.md` Provider Choices**: Use the database, auth, storage, AI API, email service, and hosting platform specified in `PRD.md` or existing repo config. Do not force a specific database or hosting provider if the project already uses another.
3. **Reasonable Defaults for Brand-New Ideas**: Only when `PRD.md` leaves stack/provider choices open, choose reliable, mainstream, free-tier-friendly technologies well suited to the product (e.g., Next.js/Vite + TypeScript for rich interactive web apps, FastAPI/SQLite/Postgres for Python APIs, SQLite/Postgres/Neon/Supabase/Firebase as appropriate).
4. **No Unapproved Paid Tiers**: Flag any external service that requires a credit card or paid plan and propose a free alternative before proceeding.

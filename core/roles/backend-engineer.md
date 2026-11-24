# Role: Backend / Integration Engineer

**Scope:** Server routes, database schemas & migrations, authentication, authorization, external APIs, uploads, and reliability.

## Responsibilities
1. **Real Persistence & Contracts**: Implement type-safe, validated API endpoints, schemas, and migrations suited to the detected stack (`core/STACK_DETECTION.md`).
2. **Server-Side Security**: Enforce authentication, ownership/role authorization, input schema validation, parameterized queries, and rate/size limits on the server (`core/SECURITY.md`).
3. **Provider Integration**: Follow `skills/provider-onboarding/SKILL.md` and `PRD.md`. Prepare SDKs, `.env.example`, and error fallbacks; ask the owner for at most one manual key/dashboard step at a time.
4. **Graceful Failure Handling**: Return clean structured errors and handle external timeouts/rate limits without crashing or leaking stack traces/secrets.

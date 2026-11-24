---
name: backend-engineering
description: Design and implement reliable server APIs, database schemas, migrations, authentication, authorization, input validation, and upload/error handling across Node, Python, Go, Rust, or other detected stacks. Use for backend and persistence work.
---

# Backend & Data Engineering

Follow `core/STACK_DETECTION.md` and `core/SECURITY.md`.

## Standards
1. **Schema & Persistence**:
   - Define explicit schemas, indexes, constraints, and safe reversible migrations matching the project's chosen database.
   - Verify created/updated/deleted records survive restarts.
2. **API Contracts & Validation**:
   - Validate all external inputs (body, query, path params, file metadata) on the server using strict schema validation.
   - Return consistent HTTP status codes (`400`/`422` validation, `401` unauthenticated, `403` forbidden, `404` missing, `409` conflict, `429` rate limited) with safe JSON error bodies—never leak internal stack traces or secrets.
3. **Authentication & Ownership**:
   - Enforce session/token validation and record-level ownership (`where userId = currentUser.id`) server-side on every protected endpoint.
4. **Resilience & Tests**:
   - Handle external provider timeouts, missing credentials, and malformed payloads cleanly.
   - Test both happy paths and unauthorized/invalid-input failure cases directly.

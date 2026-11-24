---
name: security-audit
description: Audit authentication, authorization, data isolation, input validation, secret handling, API routes, dependencies, and provider configs, fixing confirmed vulnerabilities in scope and reporting remaining risks. Use for security reviews or pre-release checks.
---

# Security Audit & Remediation

Follow `core/SECURITY.md` strictly. Never run destructive attacks against live systems and never print secrets.

## Audit Checklist
1. **Authentication & Session Hygiene**: Cookie flags (`HttpOnly`, `SameSite`, `Secure`), password hashing, token verification, logout invalidation, protected route enforcement.
2. **Authorization & IDOR**: Verify every mutation and private read enforces user ownership and role checks on the server—not merely hiding UI elements.
3. **Input Validation, Injection & XSS**: Check SQL/NoSQL queries, shell calls, template rendering, HTML injection (`dangerouslySetInnerHTML`), and open redirects.
4. **Secrets & Client Bundles**: Search source and build configs for leaked keys (`NEXT_PUBLIC_*`, `VITE_*`, hardcoded tokens, committed `.env` files).
5. **Uploads, Webhooks & Abuse Protection**: Check file type/size limits, webhook HMAC verification, CORS configuration, and rate limits on auth/AI/expensive endpoints.
6. **Dependencies & External Untrusted Data**: Inspect lockfiles/audit advisories (`npm audit`, `pip-audit`, etc. when relevant) and ensure third-party/user inputs are sanitized.

## Output & Remediation
- Fix confirmed vulnerabilities within repository scope without breaking valid UX.
- Re-run tests covering the fixed security boundary (`QUALITY_CASES.md`).
- Summarize **Confirmed & Fixed** vs. **Remaining / External Risks** concisely.

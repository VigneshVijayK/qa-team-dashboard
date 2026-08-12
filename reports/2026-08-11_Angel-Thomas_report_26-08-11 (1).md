24observe Testing Report

Date: 06 August 2026
Tester: Angel Thomas (GUI + Copilot)
Environment: Hosted dashboard (login.24observe.com), API (api.24observe.com)
Account: Free plan
________________________________________________________________________________

**Verification Summary Table**:

| Bug ID | Bug Name | Severity | Last Known Status | Your Verdict | Evidence |
|--------|----------|----------|-------------------|--------------|----------|
| BUG-001 | No CSP Header | HIGH | BROKEN | FIXED | Verified via response headers showing `content-security-policy` present |
| BUG-002 | Metrics Endpoint Public | HIGH | Verified(still reproducible) | Verified via curl returning HTTP 200 to /metrics without authentication and exposing Prometheus data |
________________________________________________________________________________

## BUG-001 — No Content-Security-Policy Header

**Area:** Security
**Severity:** HIGH
**First Reported:** 2026-06-26
**Last Verified:** 2026-08-11
**Status:** ✅ FIXED

**Description**

The SPA at `login.24observe.com` does not set a `Content-Security-Policy` header. Without CSP, the browser imposes no restrictions on which scripts can execute, making the application vulnerable to Cross-Site Scripting (XSS) attacks.

**Reproduction**

```bash
curl -sI "https://login.24observe.com" | grep -i content-security-policy
```

**Live Evidence — Full Response Headers (as on 2026-08-11)**

```
HTTP/2 200
date: Tue, 11 Aug 2026 09:10:05 GMT
content-type: text/html; charset=utf-8
content-security-policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.24observe.com; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://api.24observe.com; object-src 'none'
permissions-policy: geolocation=(), microphone=(), camera=()
referrer-policy: strict-origin-when-cross-origin
x-content-type-options: nosniff
x-frame-options: DENY
server: cloudflare
```


Positive security headers present: `x-frame-options: DENY`, `strict-transport-security`, `x-content-type-options: nosniff`, `permissions-policy`, `referrer-policy`.
Observed Result: `Content-Security-Policy` — the most critical one for XSS prevention earlier not present is now present.

**Root Cause**

CSP header not configured at either the application layer or the Cloudflare edge layer.

**Recommended Fix**

Add `Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'` at minimum, via Cloudflare Transform Rules or application middleware.

**Verification Evidence**

- Tested with: `curl -sI "https://login.24observe.com" | grep -i content-security-policy`
- Verified that the response headers include `content-security-policy`
- Result: The missing CSP header issue is no longer reproducible.

**Status History**

- 2026-06-26: BROKEN (first reported)
- 2026-06-27: Still broken (verified 4 rounds)
- 2026-08-11: FIXED (verified; CSP header now present)

________________________________________________________________________________

## BUG-002 — Metrics Endpoint Public (No Auth)

**Area:** Security
**Severity:** HIGH
**First Reported:** 2026-06-26
**Last Verified:** 2026-08-11
**Status:** ⚠️ VERIFIED (still reproducible)

**Description**

`https://api.24observe.com/metrics` returns full Prometheus metrics with **no authentication**. Leaks internal API routes, memory/CPU, DB pool stats, request volumes.

**Reproduction**

```bash
curl -s "https://api.24observe.com/metrics" | head -30
# Response: 200 OK — no token required
# Leaks: http_request_duration_seconds_count{path="/api/v1/sensors",method="POST"}
```
**Live Evidence**
```bash
 curl.exe -i -s https://api.24observe.com/metrics

```
HTTP/1.1 200 OK
Date: Tue, 11 Aug 2026 11:00:29 GMT
Content-Type: text/plain; version=0.0.4; charset=utf-8
Transfer-Encoding: chunked
Connection: keep-alive

**Root Cause**

The `/metrics` endpoint is still exposed on the public HTTP server without authentication middleware.

**Fix**

```typescript
app.use('/metrics', requireMetricsAuth, metricsMiddleware);
```

**Status History**

- 2026-06-26: BROKEN (first reported)
- 2026-06-27: FIXED — old `/api/v1/metrics` removed; replaced by `/api/v1/metrics/names` and `/api/v1/metrics/series` (require auth). Without auth → 401; With auth → 200.
- 2026-08-11: `\metrics` can stilled be accessed without authentication.

________________________________________________________________

Summary

Bugs verified today:
1. No Content-Security-Policy Header - bug fixed.
2. Metrics Endpoint Public (No Auth) - bug verified but not fixed, metrics endpoint can be acessed without authentication

________________________________________________________________

End of report.

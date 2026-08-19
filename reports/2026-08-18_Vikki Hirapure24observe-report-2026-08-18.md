# 24observe.com — QA & Incident Report

**Reporter:** vikki
**Date:** 2026-08-18
**Site:** https://login.24observe.com
**API:** https://api.24observe.com
**Tester / reporter:** Ollima (black-box, using a user PAT) — reviewed by vikki
**Date:** 2026-08-18
**Scope:**
- Settings → Account → Connections → **GitHub Connect** (incident triage)
- Settings → **#integrations** — the five features there: webhook signing secret, event webhooks, log redaction, weekly digest email, enterprise SSO (OIDC)

All testing was done against production from the outside. No source code was read or modified.

---

## Part 1 — GitHub Connect is broken (incident)

### What the user sees

In Settings → Account → Connections, clicking the **GitHub Connect** button does two things, both bad:

1. The browser navigates to `https://api.24observe.com/api/v1/me/oauth/github/start`, which replies with a bare JSON `401 {"error":"Unauthorized"}`. No GitHub login page ever appears.
2. Instead of a useful error, the screen fills with **"Content unavailable. Resource was not cached"** referencing `https://api.24observe.com`.

### What's actually going on

I ran a few black-box probes to pin this down.

| Probe | Result |
|---|---|
| `GET api.../api/v1/me/oauth/github/start` | `401 {"error":"Unauthorized"}` (24 bytes, JSON) |
| `GET api.../api/v1/me` | `401` (same shape) |
| `GET api.../api/v1/` | `404` |
| `GET login.../` | SPA shell (empty HTML, JS-rendered) |

The headers on that 401 are the giveaway:

```
HTTP/1.1 401 Unauthorized
access-control-allow-credentials: true
access-control-expose-headers: x-refreshed-token
vary: Origin
cross-origin-opener-policy: same-origin
cross-origin-resource-policy: same-origin
cf-cache-status: DYNAMIC
server: cloudflare
```

Two things to notice:

- **There is no `Set-Cookie`.** The API doesn't authenticate with cookies at all.
- The CORS headers (`access-control-allow-credentials: true`, `access-control-expose-headers: x-refreshed-token`) are tuned for credentialed `fetch()` calls from the SPA — the same bearer-token model the public docs show (`Authorization: Bearer obs_<token>`).

So this is really **two bugs stacked on each other**.

#### Bug A — the button navigates the browser to a bearer-token API endpoint

The frontend lives on `login.24observe.com`; the API lives on a different origin, `api.24observe.com`. The "GitHub Connect" button does a full-page navigation (`window.location = ...` or an `<a href>`) to the OAuth start endpoint on the API origin.

That endpoint is part of the REST API surface, which authenticates only with `Authorization: Bearer obs_<token>`. A top-level browser GET **cannot attach an Authorization header** — that header only exists in the SPA's memory. So the request hits the API with no credentials and the API correctly returns `401 {"error":"Unauthorized"}`. The endpoint is being called the wrong way: as a navigation instead of as an authenticated API call.

#### Bug B — the service worker shows a cache-miss fallback

The "Content unavailable. Resource was not cached" message is the standard fallback a **service worker** (Workbox-style navigation fallback) emits when it intercepts a navigation and has no precache entry for it. It's not a Cloudflare message — `cf-cache-status: DYNAMIC` and the lack of any `Cache-Control`/`ETag` confirm the API response was never cached at the edge.

What's happening: after Bug A fires the top-level navigation to `api.24observe.com/...`, the SPA's service worker (or an over-broad client-side router) treats that navigation as an app route, fails to find it in its precache, and renders its fallback. The fallback is a **symptom**, not the cause. The cause is Bug A.

### Why this matches the architecture

- The docs (`/docs/context`) say *"the org is always taken from the token — clients never pass an org id"*, and every example uses `Authorization: Bearer obs_<your_token>`. Bearer-only, stateless, no cookies.
- Frontend and API are on different origins. Cross-origin cookies would need `SameSite=None; Secure` plus a credentialed cookie flow — but the API never sets one. So a top-level GET from the SPA carries nothing.
- The CORS config is built for `fetch(..., {credentials:'include'})`, not for navigations.

### Recommended fixes

**Fix A (primary) — don't navigate to the API; drive the OAuth start as an authenticated call.** In order of preference:

**A1. SPA fetches the start endpoint with the bearer token, then navigates to GitHub.**

```js
const res = await fetch(`${API}/api/v1/me/oauth/github/start?next=/settings`, {
  credentials: "include",
  headers: { Authorization: `Bearer ${token}` },
});
const { url } = await res.json();   // server returns the GitHub authorize URL
window.location = url;              // continue the OAuth flow at GitHub
```

The backend should return `200 { "url": "https://github.com/login/oauth/authorize?..." }` (or a 302 the fetch follows) — not rely on the browser to follow the redirect on its own, because a top-level GET to the API with no `Authorization` is the thing that's broken.

**A2. Serve the OAuth start from the SPA's own origin.** Move `GET /oauth/github/start` to `login.24observe.com/oauth/github/start`, where it can read a session cookie the SPA already has, and `302` straight to GitHub. Classic, robust, no cross-origin credential juggling.

**A3. Last resort** — issue a short-lived, HttpOnly, `SameSite=None; Secure` OAuth-start cookie that the top-level GET carries, valid only for the start route and expiring in ~60s. Only if A1/A2 are infeasible.

**Fix B (secondary) — constrain the service worker.** Even after Fix A it's a latent landmine. Only handle same-origin navigations:

```js
if (e.request.mode === "navigate" && new URL(e.request.url).origin === self.location.origin) {
  // serve app shell / fallback
}
```

With Workbox, denylist `/api/` and cross-origin for the navigation fallback. Also make sure the SPA router doesn't treat `api.24observe.com` URLs as client-side routes.

**Fix C (minor) — better 401 UX on the start route.** Returning bare JSON on a no-credentials GET is technically correct but produces a blank JSON page (or, via Bug B, a SW fallback) when hit by a navigation. If the start route sees `Accept: text/html`, return a small "Re-authenticate" HTML page linking back to the SPA.

### How to verify the fix

1. Private window, log in to `login.24observe.com`.
2. DevTools → Network. Click **GitHub Connect**.
3. Expect a `fetch` XHR to `api.../api/v1/me/oauth/github/start` returning `200` (or a 302 the XHR follows to `github.com/login/oauth/authorize`) **with** the `Authorization: Bearer obs_...` header present, then a top-level navigation to `https://github.com/login/oauth/authorize?...`.
4. No "Content unavailable. Resource was not cached" page at any point.
5. Complete GitHub consent; callback returns to `login.24observe.com/settings#account` and GitHub shows connected.

### Bottom line for Part 1

The 401 is **not** a backend outage and **not** a GitHub OAuth misconfiguration. The API is correctly rejecting an unauthenticated request because the SPA is invoking a bearer-token REST endpoint via a top-level browser navigation, which can't carry the `Authorization` header. The "Content unavailable" page is the SPA's service worker showing a cache-miss fallback after that failed navigation. Fix is frontend-side.

---

## Part 2 — Integrations feature test

Method: read the OpenAPI spec → exercise every endpoint with curl → validate input handling, auth gates, SSRF, and persistence → clean up.

### Feature 1 — Webhook signing secret ✅ Works (cleanup note)

| Test | Result |
|---|---|
| `GET /me/webhook-secret` | `200` — returns `secret`, `algorithm: HMAC-SHA256`, `signatureHeader: X-24Observe-Signature`, `timestampHeader: X-24Observe-Timestamp`, `toleranceSec: 300` |
| `POST /me/webhook-secret/rotate` | `200` — returns new secret + `rotatedAt`; persisted on next GET |
| Anonymous GET | `401 Unauthorized` |

No bugs. HMAC-SHA256, 64-hex secret, 5-minute replay tolerance — correct.

> ⚠️ **Cleanup note:** To test rotate, the org's signing secret was rotated. The old secret `7e2e13a9…` is gone; the current secret is now `30e07c379b66390dd7c3884ac6a80638d52485132fd6e175bedb83629c063f4f`. If any external receiver verifies `X-24Observe-Signature` with the old secret, it will start rejecting deliveries. Update those receivers, or call rotate once more to set a fresh known value.

### Feature 2 — Event webhooks ✅ Works (no bugs)

| Test | Result |
|---|---|
| Create valid subscription | `201` (ids 112, 113, 114 — all deleted in cleanup) |
| SSRF — `http://169.254.169.254/...` | `400 WEBHOOK_URL_UNSAFE "Cloud metadata endpoint blocked"` |
| SSRF — `http://127.0.0.1:8080` | `400 WEBHOOK_URL_UNSAFE "Blocked non-public address: 127.0.0.1"` |
| Scheme — `file:///etc/passwd` | `400 WEBHOOK_URL_UNRESOLVABLE "No host found"` |
| Invalid `eventTypes` value | `400 "must be equal to one of the allowed values"` |
| `eventTypes: []` | `201` — documented as "subscribe to all events". Intended, not a bug. |
| `GET .../{id}/deliveries` | `200 []` |
| `DELETE .../{id}` | `204` |
| Final list | `[]` (clean) |

No bugs. SSRF guard, scheme allow-list, and event-type validation are all solid. `eventTypes: []` is explicitly documented in the OpenAPI summary as "subscribe to all events".

### Feature 3 — Log redaction 🐞 Bug (Low/Medium)

| Test | Result |
|---|---|
| `GET` (initial) | `200 {"rules":[]}` |
| Valid rule `password=([^\s]+)` / `i` flag | `200`, persisted |
| Unterminated regex `(unclosed` | `400 REDACTION_RULES_INVALID "invalid regex in rule 0: Unterminated group"` |
| `rules: []` (clear) | `200` |
| 51 rules | `400 "must NOT have more than 50 items"` |
| Pattern >500 chars | `400 REDACTION_RULES_INVALID "pattern exceeds 500 chars"` |
| Missing `pattern` | `400 "must have required property 'pattern'"` |
| Extra property in rule | `200` (stripped) |
| Unknown flag `'INVALID'` | `400 REDACTION_RULES_INVALID "unknown regex flag 'I'"` |
| **`(a+)+b` (ReDoS)** | **`200` — accepted and stored** |
| Final state | `{"rules":[]}` (clean) |

#### 🐞 Bug: no ReDoS (catastrophic backtracking) protection

**Severity:** Low/Medium

The classic ReDoS pattern `(a+)+b` is accepted and stored as a redaction rule:

```bash
PUT /api/v1/settings/log-redaction
{"rules":[{"pattern":"(a+)+b","replacement":"x"}]}
# -> 200 {"rules":[{"pattern":"(a+)+b","replacement":"x"}]}
```

A pattern like `(a+)+b` applied to `aaaaaaaaaaaaaaaaaaaaaaaac` causes exponential backtracking in the JavaScript regex engine. Redaction rules run on **every incoming log line at ingest**, so a user (or a malicious admin) can save a rule that hangs the regex engine on benign input. Because it's on the ingest hot path, a crafted log payload could exhaust the event loop / worker pool and stall log ingestion for the whole org — a self-inflicted DoS. The 500-char length cap limits but doesn't prevent this (short ReDoS patterns exist).

Reproduction:

```bash
curl -X PUT "https://api.24observe.com/api/v1/settings/log-redaction" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"rules":[{"pattern":"(a+)+b","replacement":"x"}]}'
# -> 200 {"rules":[{"pattern":"(a+)+b","replacement":"x"}]}
```

Fixes, in order of preference:

1. **Best** — validate each pattern with a ReDoS detector before saving. Use `safe-regex` (npm) or `re2`'s fallback detection in the validation step; reject patterns flagged as potentially exponential with `400 REDACTION_RULES_UNSAFE "pattern may cause catastrophic backtracking"`.
2. **Durable** — switch the redaction regex engine from JS `RegExp` to `node-re2`. Guaranteed linear time, cannot backtrack catastrophically.
3. **Minimum** — wrap each redaction apply in a per-line timeout and auto-disable the rule if it trips, surfacing `disabledReason: "regex_timeout"` in `GET /settings/log-redaction`.

#### Minor: misleading error on unknown flags

Passing `flags: "INVALID"` returns `"unknown regex flag 'I'"` — the parser reads flags char-by-char and reports only the first unknown char, dropping context. A user who passes a valid JS flag set (e.g. `gim`) may get a confusing rejection if `g` isn't in the allow-list. Consider echoing the full offending flag string or documenting the allowed flag set in the spec.

### Feature 4 — Weekly digest email ✅ Works (no bugs)

| Test | Result |
|---|---|
| `GET` (initial) | `200 {"enabled":false}` |
| `PUT {enabled:true}` | `200 {"enabled":true}` |
| `PUT {enabled:false}` | `200 {"enabled":false}` |
| `PUT {enabled:"yes"}` | `400 "body/enabled must be boolean"` |
| `PUT {enabled:true,"extra":"bad"}` | `200` (extra ignored) |
| `PUT {}` (missing) | `400 "body must have required property 'enabled'"` |
| Anonymous GET | `401 Unauthorized` |
| Anonymous PUT | `401 Unauthorized` |
| Final state | `{"enabled":false}` (back to original) |

No bugs. Strict schema, auth-gated, correct persistence.

### Feature 5 — Enterprise SSO (OIDC) 🐞 Issue (Low/Medium)

| Test | Result |
|---|---|
| `GET` (initial) | `200 {"connection":null,"loginUrl":".../sso/{slug}/start","hasSecret":false}` |
| Create valid connection | `200 {"ok":true}` |
| Create **without** `clientSecret` (no existing) | `400 SSO_SECRET_REQUIRED "clientSecret is required to create a connection"` ✅ |
| Update **without** `clientSecret` (existing) | `200` — preserves old secret (`hasSecret: true`) ✅ correct update semantics |
| `defaultRole: "superadmin"` | `400 "must be equal to one of the allowed values"` |
| `issuer: "not-a-url"` | `400 "must match format \"uri\""` |
| `clientId: ""` | `400 "must NOT have fewer than 1 characters"` |
| `clientSecret` >1024 chars | `400 "must NOT have more than 1024 characters"` |
| `allowedDomain` >255 chars | `400` |
| `enabled:false` then GET `/sso/{slug}/start` | `302 → login?sso_error=sso_not_configured` ✅ respects the flag |
| `enabled:true` then GET `/sso/{slug}/start` | `302 → {issuer}/oauth2/v2/auth?client_id=...` with signed `sso_state` cookie ✅ |
| Unknown slug `/sso/no-such-org/start` | `302 → login?sso_error=sso_not_configured` ✅ no enumeration |
| `/sso/callback?code=fake&state=fake` (no cookie) | `302 → login?sso_error=sso_bad_state` ✅ CSRF state enforced |
| `GET /settings/sso` never returns `clientSecret` | ✅ only `hasSecret: true` |
| `DELETE /settings/sso` | `200 {"ok":true}` |
| Final state | `{"connection":null,"hasSecret":false}` (clean) |

#### 🐞 Issue: `allowedDomain` accepts arbitrary strings (`*`, `*.com`) with no validation

**Severity:** Low/Medium

The schema only requires `allowedDomain` be a string ≤255 chars. Wildcards and globs are accepted as literal strings and stored verbatim:

```bash
PUT /api/v1/settings/sso
{"issuer":"https://accounts.google.com","clientId":"c","clientSecret":"s",
 "enabled":true,"allowedDomain":"*.com"}
# -> 200 {"ok":true}

GET /api/v1/settings/sso
# -> {"allowedDomain":"*.com", ...}   # stored as literal string
```

Same for `allowedDomain: "*"`. No check that it's a real domain or a documented wildcard form.

`allowedDomain` is the control that restricts which users from the IdP can join this org via SSO. The intended value is a concrete domain (e.g. `yourcompany.com`) so only `*@yourcompany.com` users can log in. An admin who types `*.com` (thinking it's a wildcard, or copy-pasting a bad example) has the string stored, but its matching semantics at callback time are undefined from the API's perspective:

- If the server matches with a **suffix check** on the email domain, `*.com` lets in **every `.com` email on earth** that the IdP will issue — a wide-open auth bypass.
- If it matches with **strict equality**, `*.com` blocks everyone (including legit users), silently breaking SSO login.

Either outcome is bad, and the API gives the admin no signal about which interpretation applies. The OpenAPI spec says only `type: string, maxLength: 255` — no format, no pattern, no documentation.

Reproduction:

```bash
curl -X PUT "https://api.24observe.com/api/v1/settings/sso" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"issuer":"https://accounts.google.com","clientId":"c","clientSecret":"s","enabled":true,"allowedDomain":"*.com"}'
# -> 200 {"ok":true}
```

Fixes:

1. **Best** — validate `allowedDomain` as a real domain: a regex like `^([a-z0-9-]+\.)+[a-z]{2,}$` (case-insensitive), reject `*` and any string containing `*` with `400 SSO_ALLOWED_DOMAIN_INVALID "allowedDomain must be a concrete domain (e.g. example.com); wildcards are not supported"`.
2. **If wildcards are genuinely desired** — define the syntax explicitly (e.g. `*.example.com` only), validate it, document it, and make the callback matcher use a **safe** glob that cannot match `*.com` against `evil.com` by accident (use `email.endsWith(allowedDomain.slice(1))` only when the value starts with `*.`, else strict equality).
3. **Minimum** — surface the matching rule in the API response or dashboard so admins understand what they configured.

---

## Part 3 — Overall summary

| # | Area | Status | Bugs |
|---|---|---|---|
| — | GitHub Connect (Account → Connections) | 🐞 Broken | SPA navigates to bearer-token API; SW shows cache-miss fallback |
| 1 | Webhook signing secret | ✅ Works | None (secret rotated during testing — see cleanup note) |
| 2 | Event webhooks | ✅ Works | None |
| 3 | Log redaction | 🐞 Bug | No ReDoS protection — `(a+)+b` accepted, can hang ingest hot path |
| 4 | Weekly digest email | ✅ Works | None |
| 5 | Enterprise SSO (OIDC) | 🐞 Issue | `allowedDomain` accepts `*` / `*.com` with no validation; matching semantics undefined |

### Priority order for fixes

1. **GitHub Connect** — the feature is completely unusable right now; every click fails. Frontend fix (authenticated `fetch` or same-origin OAuth start) plus service-worker hardening.
2. **Log redaction ReDoS** — reliability/DoS on the ingest hot path; a bad rule can stall ingestion org-wide.
3. **SSO `allowedDomain` validation** — potential silent breakage or accidental open-auth, depending on the callback matcher's behavior.

---

## Cleanup status

- Test webhook subscriptions (112, 113, 114): **deleted** ✅
- Log redaction rules: **cleared to `[]`** ✅
- Weekly digest: **reset to `false`** (original state) ✅
- SSO connection: **deleted** ✅
- **Webhook signing secret:** rotated to `30e07c379b66390dd7c3884ac6a80638d52485132fd6e175bedb83629c063f4f` — rotate again yourself if you need a known value.
- Local test files: removed.

---

*Report generated by Ollima. All testing was black-box against production; no application source code was read or modified.*
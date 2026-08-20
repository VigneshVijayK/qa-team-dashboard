# 24Observe API Contract Test Report

**Tester:** Preet Mishra
**Date:** 20 August
**Test Suite:** 24observe BUG-HUNT v2.3 (`b_h_v2.py`)
**Base URL:** https://api.24observe.com
**API Root:** https://api.24observe.com/api/v1
**Target (monitored):** https://www.youtube.com

---

## 1. Executive Summary

The BUG-HUNT v2.3 suite executed **53 checks** against the live 24observe API.
OpenAPI was loaded successfully with **172 documented paths**, and the suite is
OpenAPI-aware (undocumented endpoints are reported as NOTE/SKIP, not as failures).

| Result   | Count |
|----------|-------|
| PASSED   | 50    |
| FAILED   | 3     |
| SKIPPED  | 0     |
| INFRA    | 0     |
| NOTES    | 1     |

**Outcome:** FAIL — 3 API contract violations require investigation.

After analysis, the 3 failures reduce to **2 distinct root causes**:

1. **Schema-validation 400s omit the `code` field** — affects the empty-body
   `/monitors/` case and the missing-`status` `/incidents/{id}/updates` case
   (same bug, two manifestations).
2. **`GET /metrics` is documented in OpenAPI but returns 404** —
   spec-vs-implementation drift.

---

## 2. Environment / Configuration

| Variable            | Value                              |
|---------------------|------------------------------------|
| OBSERVE24_BASE       | https://api.24observe.com          |
| OBSERVE24_PAT       | obs_YE1P7N...kUg (admin)           |
| OBSERVE24_TARGET_URL | https://www.youtube.com            |
| Test timeout         | 30s (default)                      |
| User-Agent          | 24observe-bughunt-v2.3/1.0         |

OpenAPI discovery: **PASS** — 172 documented paths loaded from `/openapi.json`.

---

## 3. Detailed Test Results

### [0] Live OpenAPI Discovery
- **OpenAPI loaded:** 172 documented paths
- Status: PASS

### [1] Authentication
| # | Check                              | Result |
|---|------------------------------------|--------|
| 1 | invalid token -> 401               | PASS   |
| 2 | missing bearer -> 401              | PASS   |
| 3 | valid token -> 200                 | PASS   |

### [2] Error Envelope
| # | Check                                              | Result | Notes |
|---|----------------------------------------------------|--------|-------|
| 1 | empty body -> 400 with validation error            | PASS   | envelope: `{"error": "body must have required property 'name'"}` |
| 2 | empty-body validation carries `code=VALIDATION_FAILED` | **FAIL** | `code=None`; error=`"body must have required property 'name'"` |
| 3 | malformed JSON -> 400 BAD_JSON                     | PASS   |  |
| 4 | BAD_JSON body does not leak parser internals       | PASS   |  |

**Failure detail:** The 400 response correctly returns a validation error
message, but the envelope does **not** include the documented
`code: "VALIDATION_FAILED"` field. Other endpoints (BAD_JSON, SSRF, interval,
idempotency) do populate `code`, so this is an inconsistency in the
schema-validation error handler.

### [3] Idempotency-Key
| # | Check                                                        | Result |
|---|--------------------------------------------------------------|--------|
| 1 | replay same key+body returns same response (id=807)          | PASS   |
| 2 | `Idempotent-Replayed='true'` header present                  | PASS   |
| 3 | same key+different body -> 409 IDEMPOTENCY_KEY_REPLAY_CONFLICT | PASS   |
| 4 | key >255 chars -> 400 IDEMPOTENCY_KEY_TOO_LONG               | PASS   |

### [4] Duplicate Monitor Name
| # | Check                                  | Result |
|---|----------------------------------------|--------|
| 1 | dup name -> 409 MONITOR_NAME_DUPLICATE | PASS   |

### [5] intervalSec Guardrails
| # | Check                | Result |
|---|----------------------|--------|
| 1 | interval=5 rejected  | PASS   |
| 2 | interval=15 rejected | PASS   |
| 3 | interval=45 rejected | PASS   |
| 4 | interval=100 rejected | PASS   |
| 5 | interval=3601 rejected | PASS  |

**Plan-tier probe:**
- interval=30  -> REJECTED (PLAN_INTERVAL_TOO_LOW)
- interval=60  -> REJECTED (PLAN_INTERVAL_TOO_LOW)
- interval=300 -> ACCEPTED (plan min <= 300)

### [6] SSRF Guard — Monitor Target
| # | Check                                       | Result |
|---|---------------------------------------------|--------|
| 1 | SSRF reject http://127.0.0.1                 | PASS   |
| 2 | SSRF reject http://169.254.169.254/latest/meta-data/ | PASS |
| 3 | SSRF reject http://10.0.0.1                  | PASS   |
| 4 | SSRF reject http://localhost                 | PASS   |

### [7] Webhook SSRF Guard
| # | Check                                            | Result |
|---|--------------------------------------------------|--------|
| 1 | webhook SSRF reject http://127.0.0.1:9999/hook   | PASS   |
| 2 | webhook SSRF reject http://169.254.169.254/      | PASS   |

### [8] PAT Scope Enforcement
| # | Check                                                | Result |
|---|------------------------------------------------------|--------|
| 1 | scoped read token cannot write -> 403 PAT_SCOPE_INSUFFICIENT | PASS |
| 2 | scoped read token CAN read /monitors -> 200          | PASS   |

### [9] Daily Mutation Cap
- Capped PAT (`dailyMutationLimit=2`) minted; cleanup performed with admin PAT
  to avoid consuming the capped token's quota.

| Mutation # | Status |
|------------|--------|
| 1          | 201 SUCCESS |
| 2          | 201 SUCCESS |
| 3          | 429 PAT_DAILY_LIMIT_EXCEEDED |
| 4          | 429 PAT_DAILY_LIMIT_EXCEEDED |

| # | Check                                                  | Result |
|---|--------------------------------------------------------|--------|
| 1 | daily limit allows no more than 2 successful mutations  | PASS   |
| 2 | third-or-later mutation -> 429 PAT_DAILY_LIMIT_EXCEEDED | PASS   |
| 3 | 429 carries Retry-After or X-PAT-Mut-Reset              | PASS   |

### [10] Rate-Limit Headers
| # | Check                          | Result |
|---|--------------------------------|--------|
| 1 | rate-limit headers (3/3)       | PASS   |

Required headers observed: `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
`X-RateLimit-Reset`.

### [11] No 5xx on Bad Input
| # | Check                          | Result |
|---|--------------------------------|--------|
| 1 | no 5xx on any bad input         | PASS   |

Bad-input probes covered: empty/partial monitor bodies, bad URL, bad type,
nonexistent monitor PATCH/GET, bad status-page slug, bad token scope, bad
incident update.

### [12] Audit Attribution
| # | Check                                                | Result |
|---|------------------------------------------------------|--------|
| 1 | audit shows recent PAT-attributed CREATE_MONITOR     | PASS   |

### [13] Audit Redaction (alertSlackUrl patch)
| # | Check                                  | Result |
|---|----------------------------------------|--------|
| 1 | audit redacts alertSlackUrl in diff    | PASS   |

### [14] Public Endpoints
| # | Check                                  | Result |
|---|----------------------------------------|--------|
| 1 | GET /health/live no-auth -> 200        | PASS   |
| 2 | GET /health/ready no-auth -> 200       | PASS   |
| 3 | GET /openapi.json no-auth -> 200       | PASS   |
| 4 | GET /version no-auth -> 200            | PASS   |
| 5 | invalid heartbeat token -> 4xx not 5xx | PASS   |

### [15] Status Page Public Render
| # | Check                                              | Result |
|---|----------------------------------------------------|--------|
| 1 | public status page JSON renders without auth       | PASS   |
| 2 | public status page atom feed renders               | PASS   |

### [16] Logs Ingest -> Search Round-Trip
| # | Check                          | Result |
|---|--------------------------------|--------|
| 1 | logs ingest -> 200/202         | PASS   |
| 2 | logs search -> 200/202         | PASS   |
| 3 | from>to -> 400 BAD_TIME_RANGE  | PASS   |

Search response keys observed: `['events', 'nextCursor', 'tookMs', 'facets']`.

### [17] Error Codes From Documented Set
| # | Check                                          | Result |
|---|------------------------------------------------|--------|
| 1 | all observed codes documented                  | PASS   |

Observed codes: `['MONITOR_TARGET_UNSAFE']` (no unknown codes detected).

### [18] Prometheus Metrics Endpoint
- OpenAPI metrics candidates found:
  `/metrics`, `/api/v1/log-metrics/`, `/api/v1/log-metrics/{id}`,
  `/api/v1/log-metrics/{id}/series`, `/api/v1/otlp/v1/metrics`,
  `/api/v1/metrics/names`, `/api/v1/metrics/series`,
  `/api/v1/analyst/metrics`

| # | Check                  | Result | Detail      |
|---|------------------------|--------|-------------|
| 1 | GET /metrics -> 200    | **FAIL** | got 404   |

**Failure detail:** `/metrics` is listed in the live OpenAPI as a GET
operation, but the deployment returns HTTP 404. The test correctly treats this
as a failure because the endpoint is *documented*; undocumented missing
endpoints are reported as NOTE/SKIP instead.

### [19] /me/oauth/ Linking
| # | Type | Detail                                                        |
|---|------|--------------------------------------------------------------|
| 1 | NOTE | `/me/oauth/` requires an interactive session; admin PAT behavior is treated as documentation review. |

### [20] Incident Lifecycle
| # | Check                                              | Result | Notes |
|---|----------------------------------------------------|--------|-------|
| 1 | PUT postmortem with {postmortem} -> 200             | PASS   |  |
| 2 | POST updates with {status,body} -> 200/201         | PASS   |  |
| 3 | POST updates missing status -> 400 VALIDATION_FAILED | **FAIL** | `400 None: body must have required property 'status'` |

**Failure detail:** Same root cause as [2.2]. The 400 is returned correctly,
but the response envelope lacks the `code: "VALIDATION_FAILED"` field that the
contract requires and that other endpoints populate.

### [21] Maintenance Window
| # | Check                                              | Result |
|---|----------------------------------------------------|--------|
| 1 | POST maintenance-windows with {startsAt,endsAt} -> 200/201 | PASS   |

### [22] Webhook Subscription
| # | Check                                              | Result |
|---|----------------------------------------------------|--------|
| 1 | POST webhook-subscriptions with {url,eventTypes} -> 200/201/400 | PASS |

### [23] Escalations + On-Call
| # | Check                          | Result |
|---|--------------------------------|--------|
| 1 | GET /escalation-policies/ -> 200 | PASS   |
| 2 | GET /on-call/schedules -> 200     | PASS   |

### [24] Context Graph
| # | Check                       | Result |
|---|-----------------------------|--------|
| 1 | GET /context/lookup -> 200  | PASS   |
| 2 | GET /context/topology -> 200 | PASS   |

### [25] Saved Search
| # | Check                            | Result |
|---|----------------------------------|--------|
| 1 | POST saved-searches -> 200/201   | PASS   |

### [cleanup]
All created resources (monitors, tokens, status pages, webhooks, saved
searches, maintenance windows) were deleted at the end of the run using the
admin PAT. Capped-PAT mutations were cleaned up with the admin PAT to avoid
consuming the capped token's daily quota.

---

## 4. Confirmed / Likely Contract Failures

1. **Schema-validation 400s omit `code=VALIDATION_FAILED`**
   - Manifestations:
     - [2.2] empty-body POST `/monitors/`
     - [20.3] POST `/incidents/{id}/updates` missing `status`
   - Observed: `code=None`, `error="body must have required property '...'"`.
   - Expected: `code="VALIDATION_FAILED"` per the documented error-code set.
   - Impact: clients keying on `code` cannot reliably detect validation
     errors; inconsistent with `BAD_JSON`, `MONITOR_TARGET_UNSAFE`,
     `PLAN_INTERVAL_TOO_LOW`, `IDEMPOTENCY_*`, etc., which all populate `code`.

2. **`GET /metrics` documented but returns 404**
   - The live OpenAPI advertises `GET /metrics`, but the deployment responds
     with HTTP 404.
   - Either the route should be exposed, or the spec entry should be removed
     (or pointed at the correct operational metrics path, e.g. one of the
     `/api/v1/log-metrics/*` or `/api/v1/otlp/v1/metrics` candidates).

---

## 5. Notes / Documentation Review

- **`/me/oauth/`** requires an interactive session; admin PAT behavior is
  treated as documentation review only (not classified as an API failure).

---

## 6. Coverage Summary by Area

| Area                        | Tests | Pass | Fail |
|-----------------------------|-------|------|------|
| OpenAPI discovery           | 1     | 1    | 0    |
| Authentication              | 3     | 3    | 0    |
| Error envelope              | 4     | 3    | 1    |
| Idempotency                 | 4     | 4    | 0    |
| Duplicate monitor name      | 1     | 1    | 0    |
| intervalSec guardrails      | 5     | 5    | 0    |
| Monitor SSRF                | 4     | 4    | 0    |
| Webhook SSRF                | 2     | 2    | 0    |
| PAT scope                   | 2     | 2    | 0    |
| Daily mutation cap           | 3     | 3    | 0    |
| Rate-limit headers          | 1     | 1    | 0    |
| No 5xx on bad input         | 1     | 1    | 0    |
| Audit attribution           | 1     | 1    | 0    |
| Audit redaction             | 1     | 1    | 0    |
| Public endpoints            | 5     | 5    | 0    |
| Status page public render   | 2     | 2    | 0    |
| Logs ingest/search          | 3     | 3    | 0    |
| Error code documentation     | 1     | 1    | 0    |
| Prometheus /metrics         | 1     | 0    | 1    |
| OAuth linking               | 0     | 0    | 0 (NOTE) |
| Incident lifecycle          | 3     | 2    | 1    |
| Maintenance window          | 1     | 1    | 0    |
| Webhook subscription        | 1     | 1    | 0    |
| Escalations + on-call       | 2     | 2    | 0    |
| Context graph               | 2     | 2    | 0    |
| Saved search                | 1     | 1    | 0    |
| **Total**                   | **53** | **50** | **3** |

---

## 7. Recommendations

1. **Fix the validation envelope handler** so all schema-validation 400
   responses include `code: "VALIDATION_FAILED"` alongside the existing
   `error` string. This resolves both [2.2] and [20.3].
2. **Resolve `/metrics` spec drift** — either expose the documented
   `GET /metrics` endpoint or remove/redirect the OpenAPI entry to the
   operational metrics path actually served.
3. Re-run `b_h_v2.py` after fixes to confirm a clean PASS (exit code 0).

---

## 8. Final Verdict

**RESULT: FAIL** — one or more API contract violations require investigation.

Exit code: 1
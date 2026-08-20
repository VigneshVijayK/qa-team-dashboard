# WhatPing — Combined Bug Report (Day 2)

**Reported by:** Vikki Hirapure
**Date:** 20 August 2026
**Target:** `https://www.whatping.com/`
**Scope:** API-level testing of `https://api.whatping.com/v1` (Overview / Concepts functionality and all documented endpoints)
**Methodology:** Black-box API testing against the live service using a write-scoped Bearer key. Read-only / non-destructive. All monitors created during testing were deleted at the end of the session. No brute-force, no rate-limit stress, no data exfiltration beyond the evidence shown in this report.

---

## Executive Summary

This report covers **new** issues found on 20 August 2026. It does **not** repeat the five issues from the 19 August 2026 report (IPv4-mapped IPv6 SSRF bypass, heartbeat ping endpoint broken on the dashboard host, IP literals accepted for SSL monitor, IP literals accepted for DNS monitor, invalid pagination cursor → 500). Those remain tracked separately.

Five additional issues are confirmed below. All are reproducible today and are distinct from yesterday's findings.

| Bug | Title | Severity | Status |
|---|---|---|---|
| BUG #1 | Unhandled type-coercion inputs return HTTP 500 on `POST /v1/monitors` | 🟠 High | Confirmed |
| BUG #2 | `interval_sec: null` silently coerced to default 60 despite schema declaring integer | 🟡 Medium | Confirmed |
| BUG #3 | No content-type enforcement — server parses any body as JSON regardless of `content-type` header | 🟡 Medium | Confirmed |
| BUG #4 | XSS payload stored verbatim in `name` and returned by the API | 🟡 Medium (conditional) | Confirmed |
| BUG #5 | Idempotency body comparison is byte-exact — semantically identical bodies with different key order return 409 | 🟡 Medium | Confirmed |

**Totals:** 1 High, 4 Medium.

The common theme across BUG #1, BUG #2, and BUG #3 is that the request-body handling layer is **lenient in the wrong places and strict in the wrong places**: it accepts inputs the schema says it should reject (`null`, wrong `content-type`), and it panics on inputs it should reject cleanly (wrong JSON types). The single root cause is that the typed deserialiser runs before the field-presence/type validator, so wrong-type values reach downstream code that is not prepared for them.

---

## BUG #1 — Unhandled type-coercion inputs return HTTP 500 on `POST /v1/monitors`

### Summary

Submitting `POST /v1/monitors` with a field whose JSON type does not match the documented schema returns `HTTP 500` with a generic `internal_error` response, instead of the documented `422` validation error with the offending field named.

The API documentation states:

> *"Errors always take one shape: `{ "error": { "code": "invalid_request", "message": "..." } }`. `422` carries a `field` when one input is at fault. Validation is the same code the dashboard runs — if the interface would refuse it, the API refuses it identically."*

The 500s violate that contract in two ways: the status code is wrong (500 vs 422), and the error shape is wrong (`internal_error` + no `field` vs `invalid_request` + `field`).

### Reproduction Steps

#### Step 1 — `name` as integer

**Command:**
```powershell
$body = '{"name":123,"type":"http","url":"https://example.com"}'
$body | Out-File -Encoding ascii -NoNewline "$env:TEMP\wp_t1.json"
curl.exe -s -X POST https://api.whatping.com/v1/monitors `
  -H "Authorization: Bearer [REDACTED]" `
  -H "content-type: application/json" `
  --data-binary "@$env:TEMP\wp_t1.json" `
  -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response (BUG — 500):**
```json
{
  "error": {
    "code": "internal_error",
    "message": "Something went wrong"
  }
}
HTTP_STATUS:500
```
Captured at 2026-08-20 15:12:41.

#### Step 2 — `name` as array

```powershell
$body = '{"name":["a","b"],"type":"http","url":"https://example.com"}'
```
**Response:** `500` `internal_error: "Something went wrong"` (captured 2026-08-20 15:12:41).

#### Step 3 — `name` as object

```powershell
$body = '{"name":{"a":1},"type":"http","url":"https://example.com"}'
```
**Response:** `500` `internal_error`.

#### Step 4 — `name` as null

```powershell
$body = '{"name":null,"type":"http","url":"https://example.com"}'
```
**Response:** `500` `internal_error`.

#### Step 5 — `name` missing entirely

```powershell
$body = '{"type":"http","url":"https://example.com"}'
```
**Response:** `500` `internal_error` (captured 2026-08-20 15:12:41).

#### Step 6 — `interval_sec` as string

```powershell
$body = '{"name":"t","type":"http","url":"https://example.com","interval_sec":"60"}'
```
**Response:** `500` `internal_error` (captured 2026-08-20 15:12:41).

#### Step 7 — `url` as integer

```powershell
$body = '{"name":"t","type":"http","url":12345}'
```
**Response:** `500` `internal_error`.

### Control tests (validator works here)

These neighbouring cases return the correct structured `422`, proving the validation framework exists and the 500s are an unhandled path, not a deliberate design:

```powershell
# empty name string -> 422 (captured 2026-08-20 15:12:41)
$body = '{"name":"","type":"http","url":"https://example.com"}'
```
```json
{ "error": { "code": "invalid_request", "message": "Name is required" } }
HTTP_STATUS:422
```

```powershell
# interval as float -> 422 (captured 2026-08-20 15:12:41)
$body = '{"name":"t","type":"http","url":"https://example.com","interval_sec":60.5}'
```
```json
{ "error": { "code": "invalid_request", "message": "Interval must be between 20 and 86400 seconds" } }
HTTP_STATUS:422
```

### Test Cases Summary

| # | Payload | Maps to | Expected | Actual | Verdict |
|---|---------|---------|----------|--------|---------|
| 1 | `{"name":123,...}` | name is int | `422` field:name | `500` | 🔴 BUG |
| 2 | `{"name":["a","b"],...}` | name is array | `422` field:name | `500` | 🔴 BUG |
| 3 | `{"name":{"a":1},...}` | name is object | `422` field:name | `500` | 🔴 BUG |
| 4 | `{"name":null,...}` | name is null | `422` field:name | `500` | 🔴 BUG |
| 5 | `{"type":"http","url":"..."}` | name missing | `422` field:name | `500` | 🔴 BUG |
| 6 | `{"interval_sec":"60",...}` | interval is string | `422` field:interval_sec | `500` | 🔴 BUG |
| 7 | `{"url":12345,...}` | url is int | `422` field:url | `500` | 🔴 BUG |
| C1 | `{"name":"",...}` | empty string | `422` Name is required | `422` | ✅ Control |
| C2 | `{"interval_sec":60.5,...}` | float | `422` Interval range | `422` | ✅ Control |

### Impact

| Risk | Description |
|------|-------------|
| **Contract violation** | The docs promise one error shape with a `field` attribute. 500s break any client that switches on `error.code` (`invalid_request` vs `internal_error`) or reads `field`. |
| **Information signal** | A 500 vs 422 distinction tells an attacker which fields are type-checked and which aren't — useful reconnaissance when crafting other payloads. |
| **Operational noise** | Every 500 is an exception in the request handler, logged and potentially alerted on. The write rate-limit bucket is 60/min, so an attacker can burn that on 500s cheaply. |
| **Client confusion** | A caller who accidentally sends `name: 123` (e.g. a serialiser bug in their own code) gets "Something went wrong" instead of "name must be a string" — no actionable feedback. |

### Root Cause

The request body is deserialised into a typed struct (Rust `serde`) **before** the field-presence / empty-string validator runs. When a field is present but with the wrong JSON type, `serde` fails late (or an unchecked accessor panics) and the failure is not converted to a structured `422`. The empty-string and float cases are caught by explicit checks; the wrong-type cases fall through to the top-level error handler, which emits `500 internal_error`.

The control tests prove the validator framework can return `422` with `field` — it just isn't applied to the type-check path.

### How to Fix

Wrap the body deserialiser in a single error-mapping layer that converts any `serde` deserialisation error into `422 { "error": { "code": "invalid_request", "message": "<field> must be <expected type>", "field": "<field>" } }`.

Concretely, before any downstream code runs, assert per field:
- `name` is a string (non-null, non-array, non-object)
- `type` is a string from the documented enum
- `url` is a string (for http-type monitors)
- `interval_sec` is an integer
- `port`, `timeout_ms`, `down_threshold`, `packet_count`, `loss_threshold_pct`, etc. are integers where present

Return `422` on the first failure, with `field` set to the offending field name.

Example (Rust-shaped pseudocode):
```rust
fn parse_create(body: Bytes) -> Result<MonitorCreate, ApiError> {
    let v: serde_json::Value = serde_json::from_slice(&body)
        .map_err(|_| ApiError::invalid_json())?;
    let name = v.get("name")
        .and_then(|x| x.as_str())
        .ok_or_else(|| ApiError::invalid_field("name", "name must be a string"))?;
    // ... per-field type checks ...
    serde_json::from_value(v).map_err(|e| ApiError::serde_to_422(e))
}
```

### Verification After Fix

Each of the 7 payloads above should return `422` with a populated `field`, and **no monitor should be created**. The two control cases should still return `422` as they do today. A positive control `{"name":"t","type":"http","url":"https://example.com"}` should still return `201`.

---

## BUG #2 — `interval_sec: null` silently coerced to default 60

### Summary

Submitting `interval_sec: null` in `POST /v1/monitors` is accepted (`201 Created`) and silently replaced with the default value `60`, even though the OpenAPI schema declares `interval_sec` as `type: integer` with no nullable marker. A strict validator should reject `null` with `422`.

### Reproduction Steps

#### Step 1 — Send `interval_sec: null`

**Command:**
```powershell
$body = '{"name":"verify-null","type":"http","url":"https://example.com","interval_sec":null}'
$body | Out-File -Encoding ascii -NoNewline "$env:TEMP\wp_null.json"
curl.exe -s -X POST https://api.whatping.com/v1/monitors `
  -H "Authorization: Bearer [REDACTED]" `
  -H "content-type: application/json" `
  --data-binary "@$env:TEMP\wp_null.json" `
  -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response (BUG — accepted and coerced, captured 2026-08-20 15:12:41):**
```json
{
  "id": "m977qwakrw0jftk9s760khz0gh8cvnr2",
  "name": "verify-null",
  "type": "http",
  "url": "https://example.com/",
  "interval_sec": 60,
  "state": "pending"
}
HTTP_STATUS:201
```

The monitor was created with `interval_sec: 60` — the default — despite the client sending `null`.

#### Step 2 — Cleanup

The test monitor was deleted immediately after:
```
DELETE /v1/monitors/m977qwakrw0jftk9s760khz0gh8cvnr2 -> 204
```

### Test Cases Summary

| # | Payload | Expected | Actual | Verdict |
|---|---------|----------|--------|---------|
| 1 | `{"interval_sec":null,...}` | `422` field:interval_sec | `201`, interval_sec=60 | 🔴 BUG |
| C1 | `{"interval_sec":60.5,...}` | `422` (float) | `422` "Interval must be between 20 and 86400 seconds" | ✅ Control |
| C2 | `{"interval_sec":"60",...}` | `422` (string) | `500` (see BUG #1) | 🔴 Related |

### Impact

| Risk | Description |
|------|-------------|
| **Silent semantic shift** | A client that intended `interval_sec: 300` but sent `null` (e.g. from a null-coalescing serialiser, or a templated body with a missing variable) gets a monitor checking every 60s — 5× more load and 5× more alerting than intended. |
| **Schema violation** | The OpenAPI schema declares `interval_sec` as `integer`, non-nullable. Accepting `null` makes the implementation diverge from the published contract. |
| **Inconsistency** | `null` is handled *more* leniently than a string (`"60"` → 500 per BUG #1) or a float (`60.5` → 422). The three wrong-type inputs should be handled consistently. |

### Root Cause

The deserialiser treats `null` as "use the default", most likely via `#[serde(default)]` on the field, while a present-but-wrong-type value falls through to the panic path (BUG #1). The two paths disagree: `null` is silently accepted, a string is silently panicked on.

### How to Fix

Pick one of the following and document the choice:

**Option A — reject `null` (recommended, matches the schema):**
```rust
if let Some(Value::Null) = v.get("interval_sec") {
    return Err(ApiError::invalid_field("interval_sec", "interval_sec must be an integer"));
}
```

**Option B — accept `null` and document it:**
Update the OpenAPI schema to mark `interval_sec` as `nullable: true`, and add a docs note that `null` is equivalent to omitting the field.

Option A is preferred because it is consistent with the float and string cases and matches the published schema.

### Verification After Fix

After Option A: `{"interval_sec":null,...}` → `422` `field: interval_sec`, no monitor created.
After Option B: OpenAPI says `nullable: true` and the docs note is present.

---

## BUG #3 — No content-type enforcement on POST endpoints

### Summary

The `POST /v1/monitors` endpoint does not validate the `content-type` header. A request with `content-type: text/plain` (and a JSON-shaped body) is accepted and parsed as JSON, returning `201 Created`. The server should either reject non-JSON content types with `415 Unsupported Media Type`, or document that the header is ignored.

### Reproduction Steps

#### Step 1 — Send a JSON body with `content-type: text/plain`

**Command:**
```powershell
$body = '{"name":"t","type":"http","url":"https://example.com"}'
$body | Out-File -Encoding ascii -NoNewline "$env:TEMP\wp_ct.json"
curl.exe -s -X POST https://api.whatping.com/v1/monitors `
  -H "Authorization: Bearer [REDACTED]" `
  -H "content-type: text/plain" `
  --data-binary "@$env:TEMP\wp_ct.json" `
  -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response (BUG — accepted despite wrong content-type, captured 2026-08-20 15:12:41):**
```json
{
  "id": "m97d2vjqyxpcc8ardry3cq6e6n8cv15x",
  "name": "t",
  "type": "http",
  "url": "https://example.com/",
  "interval_sec": 60,
  "state": "pending"
}
HTTP_STATUS:201
```

The monitor was created even though `content-type` declared the body as plain text, not JSON.

#### Step 2 — Cleanup

The test monitor was deleted:
```
DELETE /v1/monitors/m97d2vjqyxpcc8ardry3cq6e6n8cv15x -> 204
```

### Test Cases Summary

| # | content-type header | Body | Expected | Actual | Verdict |
|---|---------------------|------|----------|--------|---------|
| 1 | `text/plain` | valid JSON | `415` or `400` | `201` created | 🔴 BUG |
| C1 | (none, empty body) | empty | `400` "Request body must be a JSON object" | `400` | ✅ Control |
| C2 | (none, malformed JSON) | `{...bad...}` | `400` invalid_json | `400` `invalid_json` | ✅ Control |

### Impact

| Risk | Description |
|------|-------------|
| **Silent leniency** | A misconfigured client (e.g. `curl` without `-H "content-type: application/json"`, or a script using form-encoding defaults) gets a 201 and believes it sent JSON correctly, when the server silently parsed a text/plain body as JSON. This masks client bugs. |
| **Security ambiguity** | Some downstream systems (proxies, WAFs, content filters) make routing/filtering decisions based on `content-type`. If WhatPing ignores the header, a WAF that skips JSON inspection for `text/plain` bodies could let a malicious payload through that would otherwise have been inspected. Low severity on its own, but it widens the trust boundary. |
| **Spec divergence** | The OpenAPI document declares the request body as `application/json`. Accepting `text/plain` diverges from the published contract. |

### Root Cause

The POST handler reads the request body and passes it to a JSON parser without first checking the `content-type` header. The empty-body and malformed-JSON paths are handled explicitly (returning `400`), but the wrong-content-type path is not — the body is parsed as JSON regardless of the declared type.

### How to Fix

At the top of the POST handler, before parsing the body, verify the `content-type`:

```rust
let ct = headers.get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("");
let mime = ct.split(';').next().unwrap_or("").trim();
if mime != "application/json" {
    return Err(ApiError::unsupported_media_type());
}
```

Return `415 Unsupported Media Type` with the standard error shape:
```json
{ "error": { "code": "unsupported_media_type", "message": "Request body must be application/json" } }
```

Allow `application/json; charset=utf-8` (the `; charset=` suffix should be tolerated). If the body is empty, return the existing `400` first.

### Verification After Fix

- `POST` with `content-type: text/plain` → `415`.
- `POST` with `content-type: application/json` → behaves as today.
- `POST` with `content-type: application/json; charset=utf-8` → behaves as today.
- `POST` with no `content-type` header → `415` (or `400`, but pick one and document it).

---

## BUG #4 — XSS payload stored verbatim in `name` and returned by the API

### Summary

The `name` field of a monitor accepts arbitrary strings, including HTML/JavaScript payloads, with no sanitisation or length cap. The payload is stored verbatim and returned unchanged by `GET /v1/monitors`. The API itself is JSON-only with no CORS (confirmed separately: `OPTIONS /v1/me` → 404 "No matching routes found"), so this is **not** directly exploitable as XSS through the API. The risk is conditional: if the dashboard renders `name` into HTML without escaping, this becomes a stored XSS in the dashboard.

### Reproduction Steps

#### Step 1 — Create a monitor with an XSS payload in `name`

**Command:**
```powershell
$body = '{"name":"<img src=x onerror=alert(1)>","type":"http","url":"https://example.com"}'
$body | Out-File -Encoding ascii -NoNewline "$env:TEMP\wp_xss.json"
curl.exe -s -X POST https://api.whatping.com/v1/monitors `
  -H "Authorization: Bearer [REDACTED]" `
  -H "content-type: application/json" `
  --data-binary "@$env:TEMP\wp_xss.json" `
  -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response (BUG — payload accepted and stored verbatim, captured earlier today):**
```json
{
  "id": "m974y1ym4cyafa62jtz1zr0y118ct852",
  "name": "<img src=x onerror=alert(1)>",
  "type": "http",
  "url": "https://example.com/",
  "state": "pending"
}
HTTP_STATUS:201
```

The `name` is stored exactly as sent, including the `<img>` tag and `onerror` handler.

#### Step 2 — Confirm the payload is returned verbatim on read

```powershell
curl.exe -s "https://api.whatping.com/v1/monitors/m974y1ym4cyafa62jtz1zr0y118ct852" `
  -H "Authorization: Bearer [REDACTED]"
```

**Response:** the `name` field is returned as the literal string `<img src=x onerror=alert(1)>` — no escaping, no stripping.

#### Step 3 — Cleanup

The test monitor was deleted:
```
DELETE /v1/monitors/m974y1ym4cyafa62jtz1zr0y118ct852 -> 204
```

### Test Cases Summary

| # | Payload in `name` | Expected | Actual | Verdict |
|---|--------------------|----------|--------|---------|
| 1 | `<img src=x onerror=alert(1)>` | accepted, stored verbatim | accepted, stored verbatim, returned verbatim | 🔴 BUG (conditional) |
| 2 | `<script>alert(1)</script>` | accepted, stored verbatim | accepted, stored verbatim | 🔴 BUG (conditional) |

### Impact

| Risk | Description |
|------|-------------|
| **Stored XSS in dashboard (conditional)** | If the dashboard renders `name` into HTML without escaping, a workspace member (or anyone with a write-scoped key) can execute arbitrary script in another member's browser. This escalates to session hijack of an owner/admin → full workspace takeover (create new write keys, delete monitors, redirect alert channels to attacker-controlled webhooks). **This must be verified on the dashboard side.** |
| **XSS in alert payloads (conditional)** | Monitor names are rendered into Slack, Discord, ntfy, Telegram, and email alerts. Each of those has its own markup/escaping rules. If `name` is interpolated into an alert message without escaping for the target medium, the payload could execute in that context too. |
| **API surface itself is safe** | No CORS, JSON-only responses with `content-type: application/json` — the API cannot be used to deliver XSS to a browser directly. The finding is strictly about downstream rendering. |

### Root Cause

The API performs no input sanitisation on free-text fields (`name`, `expected_keyword`, `dns_query_name`, `udp_payload`, etc.). This is a defensible design for a JSON API, but it must be paired with strict output escaping everywhere the field is rendered. The bug is not that the API *accepts* the string — it is that there is no documented guarantee (and no test coverage) that every consumer escapes it.

### How to Fix

1. **Verify the dashboard escapes `name`** in every rendering context: monitor list, monitor detail, incident view, alert message text, the ntfy/webhook payload, the email alert subject and body, and the Telegram message. Pay special attention to alert channels — Slack/Discord/Telegram have their own markup languages that may interpret `<...>` differently from HTML.
2. **Add a regression test** that creates a monitor named `<script>alert(1)</script>` and asserts the dashboard HTML contains the literal text, not an executed script. Run the same assertion against a delivered alert payload (Slack webhook, ntfy, email).
3. **As defence-in-depth**, enforce a length cap on `name` (e.g. 100 chars) consistent with the existing 200-char cap on `expected_keyword`, and consider a conservative character allowlist. The product already rejects 5000-char names with `422`, so a `name` cap is consistent with existing style.

### Verification After Fix

- Create a monitor with the payload above.
- Open the dashboard as another workspace member; confirm the name renders as visible text with no script execution.
- Trigger an alert and confirm the alert payload (Slack, ntfy, email, Telegram) shows the literal text, not executed script.
- If the dashboard or any alert channel executes the payload, that is the real XSS bug and should be tracked separately with the rendering context identified.

---

## BUG #5 — Idempotency body comparison is byte-exact

### Summary

The `Idempotency-Key` feature correctly deduplicates identical retries (returning `idempotent-replay: true` with the original monitor id) and correctly returns `409` for a different body. However, the body comparison is **byte-exact**: two semantically identical JSON bodies that differ only in key order or insignificant whitespace produce a `409` instead of a replay.

This is a footgun for the documented CI recipe, which uses `Idempotency-Key: $SERVICE-$(git rev-parse --short HEAD)` — implying the body is regenerated on each pipeline run. Bodies generated by `jq`, hash-map serialisers, or templating engines do not have stable key order, so a rerun of the "same" deploy returns `409` even though the intent is identical.

### Reproduction Steps

#### Step 1 — Create a monitor with an idempotency key (happy path)

**Command:**
```powershell
$key="audit-$(Get-Date -Format yyyyMMddHHmmss)"
$body='{"name":"idem-correct","type":"http","url":"https://example.com","interval_sec":60}'
$body | Out-File -Encoding ascii -NoNewline "$env:TEMP\wp_idem1.json"
curl.exe -s -X POST https://api.whatping.com/v1/monitors `
  -H "Authorization: Bearer [REDACTED]" `
  -H "Idempotency-Key: $key" `
  -H "content-type: application/json" `
  --data-binary "@$env:TEMP\wp_idem1.json" `
  -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response:** `201 Created`, new monitor id (e.g. `m97b5tm2y72eej7nce35sfzhvx8cvp5y`).

#### Step 2 — Replay with the EXACT same body and key (correct behaviour)

```powershell
curl.exe -s -X POST https://api.whatping.com/v1/monitors `
  -H "Authorization: Bearer sk_..." `
  -H "Idempotency-Key: $key" `
  -H "content-type: application/json" `
  --data-binary "@$env:TEMP\wp_idem1.json" `
  -D - -o NUL
```

**Response (healthy — replay recognised):**
```
HTTP/1.1 201 Created
idempotent-replay: true
```
Same monitor id returned. No duplicate created. ✅

#### Step 3 — Replay with the SAME key but a semantically identical body in different key order (the bug)

```powershell
$body='{"type":"http","name":"idem-correct","url":"https://example.com","interval_sec":60}'
$body | Out-File -Encoding ascii -NoNewline "$env:TEMP\wp_idem2.json"
curl.exe -s -X POST https://api.whatping.com/v1/monitors `
  -H "Authorization: Bearer sk_..." `
  -H "Idempotency-Key: $key" `
  -H "content-type: application/json" `
  --data-binary "@$env:TEMP\wp_idem2.json" `
  -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response (BUG — 409 for semantically identical body):**
```json
{
  "error": {
    "code": "idempotency_conflict",
    "message": "This Idempotency-Key was used with a different request body"
  }
}
HTTP_STATUS:409
```

The two bodies are semantically identical (`name`, `type`, `url`, `interval_sec` all the same) — only the key order differs. The idempotency store treats them as different.

#### Step 4 — Cleanup

The test monitor was deleted:
```
DELETE /v1/monitors/m97b5tm2y72eej7nce35sfzhvx8cvp5y -> 204
```

### Test Cases Summary

| # | First body | Second body (same key) | Expected | Actual | Verdict |
|---|-----------|------------------------|----------|--------|---------|
| 1 | `{"name":"x","type":"http","url":"...","interval_sec":60}` | identical (byte-for-byte) | `201` replay, header `idempotent-replay: true` | `201` replay | ✅ Works |
| 2 | `{"name":"x","type":"http",...}` | `{"type":"http","name":"x",...}` (key order swapped) | `201` replay | `409` | 🔴 BUG |
| 3 | `{"name":"x",...}` | `{"name":"y",...}` (genuinely different) | `409` | `409` | ✅ Works |

### Impact

| Risk | Description |
|------|-------------|
| **Spurious 409 in CI** | A pipeline following the documented recipe (`Idempotency-Key: $SERVICE-$(git rev-parse --short HEAD)`) with a templated body will get `409` on the second run if the body's key order changes — even though the deploy intent is identical. The operator has to debug why "the same" deploy fails idempotency the second time. |
| **Safe failure mode** | The 409 does **not** create a duplicate monitor, so data integrity is preserved. This is why the severity is Medium, not higher. |
| **Documentation mismatch** | The docs imply the body is regenerated per run (the recipe keys on the git commit, not on a hash of the body), which suggests the comparison should be semantic, not byte-exact. |

### Root Cause

The idempotency store keys on `(idempotency_key, sha256(body_bytes))` (or equivalent), without canonicalising the JSON before hashing. Two semantically identical bodies with different key order hash to different values.

### How to Fix

Before hashing the body for idempotency comparison, canonicalise it: parse the JSON, re-serialise with sorted keys and no insignificant whitespace (RFC 8785 JSON Canonicalization Scheme, or `serde_json` with sorted keys). Then two semantically identical bodies hash to the same value and replay correctly.

```rust
fn idempotency_hash(body: &[u8]) -> Result<[u8; 32], ApiError> {
    let v: serde_json::Value = serde_json::from_slice(body)
        .map_err(|_| ApiError::invalid_json())?;
    let canonical = canonicalize_json(&v);  // sort keys, no whitespace
    Ok(sha256(&canonical))
}
```

Document that the comparison is canonical, so users know whitespace and key order do not matter.

### Verification After Fix

- POST with body `{"name":"x","type":"http","url":"https://example.com","interval_sec":60}` and key K → `201`.
- POST with body `{"type":"http","name":"x","url":"https://example.com","interval_sec":60}` and the same key K → `201` with `idempotent-replay: true` and the original monitor id (not `409`).
- POST with body `{"name":"DIFFERENT",...}` and key K → `409` (genuinely different bodies still conflict).

---

## Combined Remediation Priorities

| Priority | Bug(s) | Theme |
|----------|--------|-------|
| **P1** | BUG #1 | Centralise the body-deserialisation error path so wrong-type inputs return structured `422` with `field`, not `500`. One fix addresses all 7 sub-cases. |
| P2 | BUG #2 | Decide whether `null` is rejected or documented; align with the float/string handling so all wrong-type inputs behave consistently. |
| P2 | BUG #3 | Add a `content-type` check at the top of POST handlers; return `415` for non-JSON. |
| P2 | BUG #4 | Audit every rendering of `name` (and other free-text fields) in the dashboard and alert payloads; add output-escaping regression tests. This is the only finding that could escalate to a real security issue, and only if a rendering context is unescaped. |
| P3 | BUG #5 | Canonicalise JSON before hashing for idempotency; document the behaviour. |

BUG #1, BUG #2, and BUG #3 share a single underlying root cause — the request-body handling layer runs the typed deserialiser before validating input shape — and can be addressed together in one pass over the POST handler.

---

## Final Verification Checklist

| Bug | Required verification |
|---|---|
| BUG #1 | All 7 wrong-type payloads return `422` with `field`; no monitor created; control cases (empty name, float interval) still return `422`. |
| BUG #2 | `interval_sec: null` returns `422 field: interval_sec` (Option A) or OpenAPI marks the field nullable (Option B). |
| BUG #3 | `content-type: text/plain` returns `415`; `application/json` and `application/json; charset=utf-8` behave as today. |
| BUG #4 | Dashboard and every alert channel render `name` as literal text, not executed script. |
| BUG #5 | Semantically identical body with different key order returns `201 idempotent-replay: true`, not `409`. |

---

## Test Environment

| Item | Value |
|------|-------|
| API base URL | `https://api.whatping.com/v1` |
| Workspace | `Personal` (`n17d91811mzbd9vta919a3fs5s8cstt1`) |
| Key scope | `write` |
| Test monitors created | 6 across the session |
| Test monitors deleted | 6 (cleanup confirmed, workspace is empty) |
| Existing email channel | `mahabocw.in` (untouched) |
| Verification timestamp | 2026-08-20 15:12:41 (fresh evidence captured today) |

---

## Disclosure Timeline

| Date | Action |
|------|--------|
| 20 Aug 2026 | Bugs #1–#5 discovered and confirmed by Vikki Hirapure during API-level testing |
| 20 Aug 2026 | Combined report exported to `Vikki_Hirapure_20.08.2026-whatping-report.md` |

---

*Combined report prepared by Vikki Hirapure — 20 August 2026.*
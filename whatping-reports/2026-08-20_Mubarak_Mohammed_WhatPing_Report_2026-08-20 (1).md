# WhatPing Security & API Testing Report

**Date:** 20 August 2026  
**Tester:** Mubarak Mohammed  
**Environment:** WhatPing API — Monitors, TCP, Push, SSL, and cross-cutting API behavior

________________________________________________________________

## 1. Executive Summary

A security and API validation review was performed against the WhatPing monitoring platform.

Testing covered:

- Monitor creation and modification
- TCP monitor behavior
- Push/heartbeat monitor behavior
- SSL monitor behavior
- Input validation
- JSON type handling
- SSRF protection
- Field exclusivity
- XSS payload handling
- Content-Type handling
- API documentation/runtime consistency
- Boundary validation
- Authentication and endpoint behavior

A total of **15 findings** are documented in the reference testing material:

- **6 High**
- **2 Medium**
- **7 Low**

Important note: the detailed findings below are based on the supplied Emil Thomas WhatPing report and our own automated retesting. The report distinguishes between issues **independently reproduced during Mubarak Mohammed's testing** and findings that are included from the reference testing but were **not independently reproduced in today's two automated passes**.

________________________________________________________________

# 2. Findings Summary

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Wrong JSON types return HTTP 500 | High | Independently reproduced |
| 2 | Missing/null/non-string `name` returns HTTP 500 | High | Independently reproduced |
| 3 | TCP SSRF protection can be bypassed using encoded/private forms | High | Reference finding |
| 4 | Invalid IP addresses are accepted | Low | Reference finding |
| 5 | Polling fields silently accepted on Push monitors | Medium | Reference finding |
| 6 | Stored XSS payloads accepted in monitor names | Medium | Reference finding |
| 7 | Content-Type is not strictly enforced | Low | Reference finding |
| 8 | `confirm_externally` documentation/behavior inconsistency on TCP | Low | Reference finding |
| 9 | `push_expected_interval_sec` is not actually required | Low | Reference finding |
| 10 | Grace-period upper bound is undocumented/inconsistently enforced | Low | Reference finding |
| 11 | SSL `cert_warn_days` PATCH returns HTTP 500 | High | Reference finding |
| 12 | SSL monitor has no SSRF guard on `host` | High | Reference finding |
| 13 | SSL host normalization occurs silently | Low | Reference finding |
| 14 | OpenAPI specification does not match SSL runtime behavior | High | Reference finding |
| 15 | SSL first-check timing is unpredictable | Low | Reference finding |

________________________________________________________________

# 3. Detailed Findings

## Bug 1 — Systemic HTTP 500 on Wrong JSON Types

**Severity:** High  
**Type:** Weak input validation / unhandled type assertion  
**Status:** Independently reproduced by Mubarak Mohammed

### Description

The API returns HTTP 500 `internal_error` when fields receive an incorrect JSON type instead of returning a controlled HTTP 422 validation error.

During our automated testing, the following cases produced HTTP 500:

```text
name = 12345
name = true
interval_sec = "60"
interval_sec = true
timeout_ms = "10000"
timeout_ms = true
```

Example response:

```text
HTTP 500

{
  "error": {
    "code": "internal_error",
    "message": "Something went wrong"
  }
}
```

### Expected Behavior

The API should reject malformed input with HTTP 422 and identify the invalid field.

### Impact

A malformed but syntactically valid JSON request should not cause an internal server error. Returning 500 makes input validation unreliable and can create unnecessary server-side error conditions.

### Assessment

**Confirmed independently during Mubarak Mohammed's testing.**

This finding is also documented in the supplied reference report, so it is **not a newly discovered unique bug**.

________________________________________________________________

## Bug 2 — Missing / Null / Non-String `name` Causes HTTP 500

**Severity:** High  
**Type:** Required-field validation failure  
**Status:** Independently reproduced by Mubarak Mohammed

### Description

The required monitor `name` field causes an HTTP 500 when it is missing or supplied using an unsupported JSON type.

Tested:

```text
name missing       → 500
name = 12345       → 500
name = true        → 500
name = ["test"]    → 500
name = {"x":"y"}   → 500
```

Interestingly:

```text
name = ""
```

correctly returned HTTP 422.

### Expected Behavior

Missing or non-string names should return HTTP 422 with an appropriate validation message.

### Impact

Basic required-field validation can trigger a server-side error instead of a controlled client error.

### Assessment

**Independently reproduced by Mubarak Mohammed.**

This issue is already documented in the reference report.

________________________________________________________________

## Bug 3 — TCP SSRF Protection Bypass

**Severity:** High  
**Type:** Server-Side Request Forgery  
**Status:** Reference finding — not independently reproduced in today's automated passes

### Description

Literal private and loopback addresses were rejected, but encoded representations of private addresses were accepted.

Examples documented in the reference testing:

```text
127.0.0.1              → 422
10.0.0.1               → 422
192.168.1.1            → 422

0x7f000001             → 201
0177.0.0.1             → 201
2130706433             → 201
127.1                  → 201
0                       → 201
```

Wildcard DNS representations were also accepted.

### Expected Behavior

All representations resolving to private, loopback, link-local, or metadata addresses should be blocked.

### Impact

A monitoring service that makes outbound connections could potentially be abused to reach internal resources.

### Recommended Fix

Resolve and normalize the destination before applying the private-network check. Validate the final resolved IP rather than relying on string matching.

________________________________________________________________

## Bug 4 — Invalid IP Addresses Accepted

**Severity:** Low  
**Type:** Input validation  
**Status:** Reference finding

### Description

The reference testing found that syntactically invalid IP representations, including values with octets above 255 or short forms, could be accepted.

### Expected Behavior

Invalid IP addresses should return HTTP 422 before the connection attempt.

### Recommended Fix

Perform strict IPv4/IPv6 parsing and reject malformed addresses.

________________________________________________________________

## Bug 5 — Polling Fields Silently Accepted on Push Monitors

**Severity:** Medium  
**Type:** Field-exclusivity violation  
**Status:** Reference finding

### Description

Push monitors use heartbeat-specific settings, but polling fields were silently accepted.

Reference tests showed:

```text
interval_sec=60          → 201
timeout_ms=5000          → 201
down_threshold=3         → 201
```

while unrelated fields such as `host`, `port`, and `url` were correctly rejected.

### Expected Behavior

Polling-only fields should be rejected when the monitor type is `push`.

### Impact

Users may believe they configured a meaningful setting when the setting is irrelevant or has unexpected semantics.

### Recommended Fix

Enforce a complete field matrix for each monitor type.

________________________________________________________________

## Bug 6 — Stored XSS Payloads Accepted in Monitor Names

**Severity:** Medium  
**Type:** Stored XSS  
**Status:** Reference finding — API-side confirmed

### Description

The API accepted JavaScript/HTML payloads in monitor names and returned them verbatim.

Examples:

```html
<script>alert(1)</script>
```

```html
<img src=x onerror=alert(1)>
```

The reference testing confirmed that the payload was stored and returned through monitor API responses.

### Expected Behavior

At minimum, every UI consumer must safely HTML-escape monitor names before rendering them.

### Impact

If a dashboard renders the stored value without escaping, a malicious monitor name could execute JavaScript in another user's browser.

### Important Note

The reference report states that API storage was confirmed, but dashboard rendering was not independently confirmed.

________________________________________________________________

## Bug 7 — Content-Type Not Strictly Enforced

**Severity:** Low  
**Type:** Content-Type validation weakness  
**Status:** Reference finding

### Description

The API accepted requests containing valid JSON even when the Content-Type was not the expected JSON media type.

### Expected Behavior

The API should consistently enforce the documented Content-Type.

### Impact

Loose Content-Type handling can cause inconsistent behavior between clients and proxies.

________________________________________________________________

## Bug 8 — `confirm_externally` Documentation/Behavior Inconsistency

**Severity:** Low  
**Type:** API contract inconsistency  
**Status:** Reference finding

### Description

The documented behavior and actual TCP monitor behavior for `confirm_externally` were inconsistent.

### Impact

Clients relying on the API documentation may configure a monitor expecting behavior that differs from the runtime implementation.

### Recommended Fix

Align documentation, OpenAPI behavior, and runtime behavior.

________________________________________________________________

## Bug 9 — `push_expected_interval_sec` Not Actually Required

**Severity:** Low  
**Type:** Validation/documentation inconsistency  
**Status:** Reference finding

### Description

The documentation implies that `push_expected_interval_sec` is required for Push monitors, but the API does not consistently enforce that requirement.

### Expected Behavior

If the field is required by the API contract, requests without it should return HTTP 422.

### Recommended Fix

Either enforce the field or update the documentation to state that it is optional.

________________________________________________________________

## Bug 10 — Grace Period Upper Bound Undocumented/Inconsistently Enforced

**Severity:** Low  
**Type:** Boundary validation/documentation issue  
**Status:** Reference finding

### Description

The reference testing found that the upper boundary for the Push grace period was not clearly documented and was inconsistently enforced.

### Impact

Clients cannot reliably determine the valid range from the API contract.

### Recommended Fix

Document the exact allowed range and enforce it consistently with HTTP 422 for invalid values.

________________________________________________________________

## Bug 11 — SSL `cert_warn_days` PATCH Returns HTTP 500

**Severity:** High  
**Type:** PATCH validation/server error  
**Status:** Reference finding

### Description

The reference testing found that valid `cert_warn_days` values could cause an HTTP 500 when updating an SSL monitor.

### Expected Behavior

A valid integer value should be accepted with HTTP 200.

Invalid values should produce HTTP 422 rather than 500.

### Impact

Users cannot reliably modify certificate warning settings through the API.

### Recommended Fix

Correct the SSL PATCH validation path and ensure valid values are processed without an internal error.

________________________________________________________________

## Bug 12 — SSL Monitor Has No SSRF Guard on `host`

**Severity:** High  
**Type:** Server-Side Request Forgery  
**Status:** Reference finding

### Description

Unlike the TCP monitor, the SSL monitor accepted private/loopback/metadata targets without an equivalent SSRF protection mechanism.

### Expected Behavior

SSL monitor targets should receive the same private-network and metadata protection as other outbound monitor types.

### Impact

An attacker could potentially use an SSL monitor as an outbound request mechanism against internal infrastructure.

### Recommended Fix

Apply centralized destination validation before SSL connections are made.

________________________________________________________________

## Bug 13 — SSL Host Normalization Happens Silently

**Severity:** Low  
**Type:** Data normalization / transparency issue  
**Status:** Reference finding

### Description

The SSL monitor silently normalizes host values, including stripping protocol prefixes and URL paths.

### Expected Behavior

The API should either reject invalid host input or clearly communicate the normalization performed.

### Impact

The value displayed to the user may differ from the value they submitted, which can cause confusion when troubleshooting.

________________________________________________________________

## Bug 14 — OpenAPI Specification Does Not Match SSL Runtime Behavior

**Severity:** High  
**Type:** API specification drift  
**Status:** Reference finding

### Description

The OpenAPI schema lists fields such as:

```text
url
port
accepted_status
expected_keyword
```

as part of the shared monitor creation schema, while the SSL runtime rejects those fields.

The reference testing demonstrated:

```text
POST SSL + url  → 422
POST SSL + port → 422
```

### Expected Behavior

The OpenAPI specification should accurately describe which fields are valid for each monitor type.

### Impact

Developers generating typed API clients from the specification may create requests that the actual runtime rejects.

### Recommended Fix

Use per-monitor-type schemas or a discriminated `oneOf` structure.

________________________________________________________________

## Bug 15 — SSL First-Check Timing Is Unpredictable

**Severity:** Low  
**Type:** Observability / UX behavior  
**Status:** Reference finding

### Description

SSL monitoring works once a check occurs, but the first check after monitor creation is not deterministic.

The reference testing observed one monitor becoming active after approximately 145 seconds while other newly created monitors remained pending for several minutes.

### Expected Behavior

A new SSL monitor should either perform an initial check promptly or expose the expected next check time.

### Impact

Users cannot easily determine whether a monitor is functioning or simply waiting for its first scheduled check.

### Recommended Fix

Perform an immediate initial check or provide a `next_check_at` field.

________________________________________________________________

# 4. Controls Confirmed Working

The reference testing also confirmed several security and validation controls working correctly:

- Authentication bypass attempts rejected
- HTTP method restrictions enforced
- Invalid/nonexistent monitor IDs return 404
- Path traversal attempts blocked
- Query parameter validation works
- Malformed JSON rejected
- Monitor limit enforced
- Monitor type cannot be changed through PATCH
- Unknown fields rejected
- Idempotency behavior works
- Numeric range validation works when the correct JSON type is supplied
- Push ping endpoint protections work
- DNS monitor handles wrong field types correctly

________________________________________________________________

# 5. Mubarak Mohammed Automated Retesting

Two automated Python test passes were performed during today's testing.

### Test Pass 1

The first pass tested:

- Empty name
- Spaces-only name
- Numeric name
- Boolean name
- Missing name
- Zero interval
- Negative interval
- String interval
- Invalid URL

The test successfully reproduced:

- Numeric name → HTTP 500
- Boolean name → HTTP 500
- Missing name → HTTP 500
- String interval → HTTP 500

These findings match Bugs 1 and 2 above.

### Test Pass 2

The second pass tested:

- Decimal interval
- Null interval
- Boolean interval
- Maximum interval
- Above-maximum interval
- Negative timeout
- Zero timeout
- String timeout
- Boolean timeout
- Null timeout
- Unknown fields
- Array name
- Object name
- Very long name

The test successfully reproduced additional wrong-type HTTP 500 behavior and observed silent null handling.

These results again overlap with the documented findings in the reference report.

________________________________________________________________

# 6. Overall Assessment

The testing identified significant API validation and security weaknesses, particularly around:

1. Strict JSON type validation
2. Required-field handling
3. SSRF protection
4. Monitor-type field exclusivity
5. Stored input handling
6. API documentation accuracy
7. SSL monitor behavior

The most severe issues are the systemic HTTP 500 behavior for malformed input and the SSRF weaknesses affecting outbound monitoring functionality.

Today's automated tests independently verified the most accessible validation failures. The remaining findings in this report are included from the supplied reference testing and should be independently reproduced before being represented as Mubarak Mohammed's own discoveries.

________________________________________________________________

**Tester:** Mubarak Mohammed  
**Date:** 20 August 2026  
**Testing Status:** Completed

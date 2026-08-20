WhatPing TCP + Push + SSL Monitor — Security Report

Date: 20 August 2026
Tester: Emil Thomas
Environment: API (api.whatping.com) — Monitors, TCP connect monitor type, Push (cron/CI heartbeat) monitor type, SSL (TLS certificate expiry) monitor type, and cross-cutting surfaces across ALL monitor types
Account: Personal workspace (write-scoped key), monitor_limit 20, 0/20 at start and end of testing

Method: API testing against live endpoints. Created and mutated TCP and push monitors via POST/PATCH /v1/monitors, exercised the push ping endpoint at /v1/monitor/ping/<token>, inspected results via GET /v1/monitors/{id} and GET /v1/monitors/{id}/results. Expanded to all monitor types (http, icmp, udp, grpc, smtp, ssl, domain, dns, email-auth) to test cross-cutting type handling. Re-verified each finding with controls and repeat runs. All test monitors deleted after each section; final GET /v1/me confirmed 0/20 usage.

Scope tested:
- TCP monitor create / mutate lifecycle (POST, PATCH) — SSRF surface, field-type validation, confirm_externally semantics
- Push (heartbeat/cron) monitor create / mutate lifecycle — token security, rotation, ping endpoint behavior, field exclusivity
- Push ping endpoint — token enumeration resistance, idempotency, method routing, path traversal
- SSL (TLS certificate) monitor create / mutate lifecycle (POST, PATCH) — cert_warn_days validation and PATCH crash, SSRF surface (no guard vs TCP's bypassable guard), silent host normalization, OpenAPI spec drift, expiry reflection and first-check timing
- Cross-cutting: bad field types across ALL monitor types, name field injection, type field edge cases, auth bypass, content-type confusion, HTTP method abuse, query param injection, XSS storage, malformed JSON, monitor limit enforcement, idempotency

________________________________________________________________

Bug 1 — Systemic HTTP 500 internal_error on wrong JSON type across ALL monitor types (POST and PATCH)

Severity: High
Type: Weak validation / unhandled type assertion — systemic
Status: Confirmed (reproduced across 9 of 10 monitor types on 2026-08-20)

What happened:

Sending a number-typed field as a string or boolean crashes the request handler with HTTP 500 "Something went wrong" instead of a clean 422 naming the offending field. The documented contract is: "422 with the field named" for bad input. Instead the server panics during JSON deserialization before the range validator runs.

The bug is systemic — it reproduces on every monitor type that has a numeric field, on both POST (create) and PATCH (mutate). Only the `dns` monitor type handles it correctly (422).

What I tested:

| Monitor type | Field sent wrong | Type sent | Result |
|---|---|---|---|
| http | interval_sec | "60" (string) | 500 internal_error |
| http | interval_sec | true (bool) | 500 internal_error |
| http | url | 12345 (number for string) | 500 internal_error |
| tcp | port | "53" (string) | 500 internal_error |
| tcp | port | true (bool) | 500 internal_error |
| tcp | interval_sec | "60" (string) | 500 internal_error |
| tcp | timeout_ms | "5000" (string) | 500 internal_error |
| tcp | timeout_ms | true (bool) | 500 internal_error |
| icmp | packet_count | "4" (string) | 500 internal_error |
| udp | port | "53" (string) | 500 internal_error |
| grpc | port | true (bool) | 500 internal_error |
| smtp | port | "25" (string) | 500 internal_error |
| ssl | host | true (bool for string) | 500 internal_error |
| domain | host | true (bool for string) | 500 internal_error |
| email-auth | host | true (bool for string) | 500 internal_error |
| push | push_expected_interval_sec | "3600" (string) | 500 internal_error |
| push | push_expected_interval_sec | true (bool) | 500 internal_error |
| push | push_grace_sec | "300" (string) | 500 internal_error |
| push | push_grace_sec | true (bool) | 500 internal_error |
| dns | (any numeric field wrong type) | string/bool | 422 (CORRECT) |

Also confirmed on PATCH: sending `{"port":"53"}` to PATCH an existing TCP monitor returns 500. Same root cause, same crash.

Evidence (re-verification, 2026-08-20):

  http  interval_sec "60"  -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  http  interval_sec true  -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  http  url 12345          -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  tcp   port "53"          -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  tcp   port true          -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  tcp   interval_sec "60"  -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  tcp   timeout_ms "5000" -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  icmp  packet_count "4"  -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  udp   port "53"          -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  grpc  port true          -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  smtp  port "25"          -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  ssl   host true          -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  domain host true         -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  email-auth host true     -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  push  push_expected_interval_sec "3600" -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  push  push_expected_interval_sec true   -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  push  push_grace_sec "300" -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  push  push_grace_sec true  -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  dns   (any field wrong)  -> HTTP 422 (CORRECT — only type that handles it properly)

Out-of-range numbers (e.g. port 99999) are correctly rejected with 422. The bug is specifically that JSON type deserialization (string/bool where integer is expected) happens BEFORE the range check and the deserializer has no strict type guard — it panics on the unexpected type.

Why this matters:

1. This is the single largest defect in the system. It affects 9 of 10 monitor types on both create and mutate paths. One missing strict-type check in the deserializer opens ~20 distinct attack surfaces.
2. A 500 on bad input is a reliability defect and can leak implementation detail (stack traces, framework fingerprints) to an attacker. It also masks real bugs because the error is generic.
3. Clients cannot reliably highlight the offending field because the 500 response names no field — violating WhatPing's own documented "422 with the field named" contract.
4. The inconsistency with dns (which returns 422 correctly) proves this is a per-type code path issue, not a fundamental platform limitation — it can be fixed.

What the fix should look like:

1. Strict request-body decoding in the shared monitor handler: type mismatches return 422 with error.field naming the offending field, before any range or semantic validation runs.
2. Apply the same strict decode path to ALL monitor types, not just dns. Consolidate the decode logic so all types inherit the same type guard.
3. Never return 500 for a malformed-but-parseable JSON request body; reserve 500 for genuine internal faults.
4. Reject null where the schema says integer (or document nullable explicitly). See Bug 6 for the silent-null-coercion variant.

________________________________________________________________

Bug 2 — `name` field missing / null / non-string crashes with 500 internal_error

Severity: High
Type: Weak validation / unhandled type assertion — required-field handling
Status: Confirmed (2026-08-20)

What happened:

The `name` field is the single most basic required field on every monitor. When it is missing, null, or sent as a non-string type, the handler crashes with 500 instead of returning a clean 422 "name is required" or "name must be a string".

What I tested:

  {"type":"http","url":"https://1.1.1.1"}              (name missing) -> 500 internal_error
  {"name":null,"type":"http","url":"https://1.1.1.1"}  -> 500 internal_error
  {"name":12345,"type":"http","url":"https://1.1.1.1"} (number)       -> 500 internal_error
  {"name":true,"type":"http","url":"https://1.1.1.1"}  (bool)         -> 500 internal_error
  {"name":["a","b"],"type":"http","url":"https://1.1.1.1"} (array)     -> 500 internal_error
  {"name":{"x":"y"},"type":"http","url":"https://1.1.1.1"} (object)    -> 500 internal_error
  {"name":"","type":"http","url":"https://1.1.1.1"}    (empty string)  -> 422 (CORRECT — empty string rejected by range check)

Evidence (re-verification, 2026-08-20):

  name missing  -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  name null     -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  name 12345    -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  name true     -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  name ["a","b"]-> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  name {"x":"y"}-> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  name ""       -> HTTP 422 (correct — empty string caught by range validation)

Why this matters:

1. A request with no name at all — which should be the easiest possible 422 ("name is required") — instead crashes the server. This is the simplest possible bad-input case and it is mishandled.
2. Same root cause as Bug 1: the `name` field is not type-checked before use. The deserializer panics on non-string types.
3. An attacker can trivially trigger 500s by omitting `name`, enabling targeted noise generation or availability degradation against the API.

What the fix should look like:

1. Validate `name` presence and type (string, non-null) before any other processing; return 422 with error.field="name" on failure.
2. Apply the same strict decode to all required string fields across all monitor types.

________________________________________________________________

Bug 3 — SSRF bypass: private-network guard only string-matches literal IP forms (TCP, POST and PATCH)

Severity: High
Type: SSRF — security-control bypass
Status: Confirmed (reproduced on 2026-08-20 for TCP host field)

What happened:

WhatPing rejects literal private/loopback/metadata IPs at create time with 422 "Private-network targets are not permitted on this deployment". Confirmed for TCP: `127.0.0.1`, `10.0.0.1`, `192.168.1.1`, `::1`, `::ffff:127.0.0.1` all return 422.

However, the same private addresses written in encoded forms — hexadecimal, octal, decimal integer, short form, IPv6 hex words, or wildcard DNS — bypass the string-match guard and are accepted (201). The same bypass works via PATCH (mutating an existing monitor's host to an encoded private form).

What I tested (TCP host field):

  host=127.0.0.1                    -> 422 (rejected — literal form caught)
  host=10.0.0.1                      -> 422 (rejected)
  host=192.168.1.1                   -> 422 (rejected)
  host=::1                           -> 422 (rejected)
  host=::ffff:127.0.0.1              -> 422 (rejected)
  host=0x7f000001                    -> 201 (hex-encoded 127.0.0.1 accepted)
  host=0177.0.0.1                    -> 201 (octal form accepted)
  host=2130706433                    -> 201 (decimal integer form accepted)
  host=127.1                         -> 201 (short form accepted)
  host=0x7f.0x0.0x0.0x1              -> 201 (per-octet hex accepted)
  host=0                             -> 201 (0.0.0.0 accepted)
  host=0x0                           -> 201 (hex 0 accepted)
  host=::ffff:7f00:1                 -> 201 (IPv6 hex-word form of 127.0.0.1 accepted)
  host=127.0.0.1.nip.io              -> 201 (wildcard DNS accepted)
  host=127-0-0-1.sslip.io            -> 201 (wildcard DNS accepted)
  host=10.0.0.1.nip.io               -> 201 (wildcard DNS RFC1918 accepted)
  host=192.168.1.1.nip.io            -> 201 (wildcard DNS RFC1918 accepted)
  host=169.254.169.254.nip.io        -> 201 (AWS/GCP IMDS metadata endpoint via wildcard DNS accepted)

PATCH confirmation: created a TCP monitor with a public host, then PATCHed host=0x7f000001 -> 200 (accepted). Same bypass works on mutate.

Evidence (re-verification, 2026-08-20):

  TCP host=127.0.0.1       POST  -> 422 (rejected)
  TCP host=0x7f000001      POST  -> 201 (hex 127.0.0.1 accepted)
  TCP host=0177.0.0.1       POST  -> 201 (octal accepted)
  TCP host=2130706433       POST  -> 201 (decimal accepted)
  TCP host=127.1             POST  -> 201 (short form accepted)
  TCP host=::ffff:7f00:1     POST  -> 201 (IPv6 hex word accepted)
  TCP host=127.0.0.1.nip.io  POST  -> 201 (wildcard DNS accepted)
  TCP host=169.254.169.254.nip.io POST -> 201 (IMDS endpoint accepted)
  TCP host=0x7f000001       PATCH -> 200 (hex bypass on mutate)

Why this matters:

1. An attacker can point a TCP monitor at any internal address by writing it in a non-literal form. WhatPing's probe fleet will then attempt to TCP-connect to that address from the worker network.
2. The `169.254.169.254.nip.io` case is the canonical cloud-metadata SSRF: if the worker runs in AWS/GCP/Azure, a monitor pointed at this hostname would resolve to 169.254.169.254 and the TCP connect would reach the instance metadata service. Whether data is returned depends on the protocol handler (TCP monitor only checks connect success, not response body), but the connection itself is the SSRF primitive.
3. The guard is a string match against literal dotted-decimal forms. It does not parse the address, unmap IPv6, resolve DNS, or classify the result. This is the canonical "SSRF filter only string-matches 127.0.0.1" bug class, identical in root cause to Bug 1 in the 2026-08-19 HTTP report.
4. The bypass works on both create and mutate, so an attacker can also retarget an existing legitimate-looking monitor at an internal address without creating a new one.

What the fix should look like:

1. Before the private-network check, normalize the host: parse the IP (handling hex, octal, decimal, short, and per-octet forms), unmap IPv4-mapped IPv6, resolve any DNS name to its IP(s), and classify the result against loopback / private / link-local / CGNAT / ULA / metadata ranges.
2. Apply this normalization at create, at PATCH, and immediately before every connect.
3. Fail closed on any address that cannot be classified as definitively public.
4. Do not rely on string matching of literal forms — parse and classify the actual address.

________________________________________________________________

Bug 4 — Invalid IPs accepted (octet > 255, short octet forms)

Severity: Low
Type: Weak input validation
Status: Confirmed (2026-08-20)

What happened:

The TCP host field accepts IP strings that are not valid IPv4 addresses: octets greater than 255 and 3-octet short forms. These are accepted at create (201) without any parse error.

What I tested:

  host=256.1.1.1   (octet > 255)  -> 201 (accepted)
  host=1.1.1        (3-octet form) -> 201 (accepted)

Evidence (re-verification, 2026-08-20):

  TCP host=256.1.1.1  POST -> 201 (invalid octet accepted)
  TCP host=1.1.1      POST -> 201 (short form accepted)

Why this matters:

1. Same root cause as Bug 3: the guard string-matches rather than parsing. A value like 256.1.1.1 is not a valid IPv4 address but is accepted because it looks like dotted-decimal.
2. The monitor will then fail at connect time (the OS resolver will reject or reinterpret), wasting probe cycles and producing confusing "connection failed" errors that do not match the actual validation gap.
3. Input validation should reject syntactically invalid IP addresses at create/patch, not pass them to the dial layer.

What the fix should look like:

1. Validate the host as either a syntactically valid IPv4/IPv6 address (all octets <= 255, correct number of octets) or a resolvable hostname with valid DNS syntax.
2. Reject at create/patch with 422 naming the field if the host does not parse.

________________________________________________________________

Bug 5 — Polling fields silently accepted on push (heartbeat) monitors

Severity: Medium
Type: Field-exclusivity violation — silent acceptance of irrelevant fields
Status: Confirmed (2026-08-20)

What happened:

Push monitors are inverted monitors: they do not poll anything. The client pings WhatPing; WhatPing does not dial out. The push-specific fields are `push_expected_interval_sec` and `push_grace_sec`. The polling-type fields (`interval_sec`, `timeout_ms`, `down_threshold`) should not be applicable to push monitors.

However, `interval_sec`, `timeout_ms`, and `down_threshold` are silently accepted (201) on push monitor creation and stored on the monitor object. `down_threshold` is the concerning one: it controls how many missed pings trigger an incident, and it is silently stored on a monitor type where the semantics of "missed ping" are already defined by `push_expected_interval_sec` + `push_grace_sec`.

The fields that ARE correctly rejected on push: `host`, `port`, `url`, `confirm_externally` all return 422 "not a valid field".

What I tested:

  POST push with interval_sec=60            -> 201 (silently accepted, stored)
  POST push with timeout_ms=5000            -> 201 (silently accepted, stored)
  POST push with down_threshold=3           -> 201 (silently accepted, stored)
  POST push with host="1.1.1.1"              -> 422 (correctly rejected)
  POST push with port=53                     -> 422 (correctly rejected)
  POST push with url="https://1.1.1.1"       -> 422 (correctly rejected)
  POST push with confirm_externally=true     -> 422 (correctly rejected)
  PATCH push with interval_sec=120           -> 200 (silently accepted, stored)

Evidence (re-verification, 2026-08-20):

  push + interval_sec=60    POST  -> 201, monitor stored with interval_sec=60
  push + timeout_ms=5000    POST  -> 201, monitor stored with timeout_ms=5000
  push + down_threshold=3   POST  -> 201, monitor stored with down_threshold=3
  push + host="1.1.1.1"     POST  -> 422 "not a valid field" (correct)
  push + port=53            POST  -> 422 "not a valid field" (correct)
  push + url="..."          POST  -> 422 "not a valid field" (correct)
  push + confirm_externally POST  -> 422 "not a valid field" (correct)
  push + interval_sec=120   PATCH -> 200 (silently accepted)

Why this matters:

1. WhatPing's own design principle (per the API docs) is that silent field acceptance is a bug: "a typo'd field that silently vanished would leave you believing you set something you did not". The inverse is also true — silently accepting a field that has no effect (or worse, a conflicting effect) leaves the user believing they configured something meaningful when they did not.
2. `down_threshold` on a push monitor is semantically ambiguous: does it mean "3 missed pings" or is it ignored? If it is honored, it interacts with `push_expected_interval_sec` and `push_grace_sec` in a way the user did not intend. If it is ignored, it is misleading.
3. The inconsistency (`host`/`port`/`url` correctly rejected but `interval_sec`/`timeout_ms`/`down_threshold` accepted) shows the field-exclusivity check is incomplete.

What the fix should look like:

1. Reject all polling-type fields (`interval_sec`, `timeout_ms`, `down_threshold`) on push monitors with 422 "not a valid field for monitor type push", the same way `host`/`port`/`url` already are.
2. Audit the full field list per monitor type and enforce exclusivity uniformly.

________________________________________________________________

Bug 6 — Stored XSS payloads accepted as monitor `name` and echoed verbatim

Severity: Medium
Type: Stored XSS — input not sanitized on storage (consumer-escaping responsibility unconfirmed)
Status: Confirmed API-side storage (2026-08-20); dashboard render escaping NOT tested (no browser access)

What happened:

The `name` field accepts arbitrary strings including HTML/JavaScript payloads, SQL injection strings, and CRLF sequences. These are stored verbatim and echoed back unchanged via GET /v1/monitors/{id} and GET /v1/monitors. The API does not sanitize or escape the name on storage or retrieval.

What I tested:

  name="<script>alert(1)</script>"              -> 201, stored verbatim, echoed in GET
  name="<img src=x onerror=alert(1)>"           -> 201, stored verbatim, echoed in GET
  name="'; DROP TABLE monitors;--"             -> 201, stored verbatim (SQLi string, no crash)
  name="javascript:alert(document.cookie)"      -> 201, stored verbatim

Results endpoint (GET /monitors/{id}/results) does NOT echo the name — only raw metrics, so no XSS there. Incidents endpoint was empty during testing (no incident to check).

Evidence (re-verification, 2026-08-20):

  POST name="<script>alert(1)</script>"  -> 201, id returned
  GET monitor                             -> name field: "<script>alert(1)</script>" (verbatim)
  GET /monitors (list)                    -> name: "<script>alert(1)</script>" (verbatim)
  POST name="'; DROP TABLE monitors;--"  -> 201, stored verbatim (no SQLi crash, no error)

Why this matters:

1. The API storing raw strings is technically correct behavior — escaping is the consumer's (dashboard's) job. However, if the WhatPing dashboard or any other consumer renders monitor names without HTML escaping, this is a stored XSS vulnerability: a user who creates a monitor with a script-tag name would execute JavaScript in every other user's browser who views the monitor list.
2. The SQL injection string was stored without triggering any database error, which suggests the query layer uses parameterized queries (good) — but the absence of a crash does not prove the query layer is safe everywhere.
3. CRLF injection in names was also accepted (not separately confirmed to reach any header-splitting context, but stored without rejection).

What the fix should look like:

1. The API itself does not need to sanitize — but the dashboard MUST HTML-escape all monitor names on render. Verify that every surface that displays a monitor name (dashboard list, detail view, incident view, notification templates) escapes properly.
2. Optionally, reject names containing control characters (CRLF) at the API level as a defense-in-depth measure.

________________________________________________________________

Bug 7 — Content-Type not enforced: any content-type accepted if body is valid JSON

Severity: Low
Type: Weak input validation — content-type confusion
Status: Confirmed (2026-08-20)

What happened:

The API does not validate the Content-Type header. POST requests with `Content-Type: text/plain`, `Content-Type: multipart/form-data`, `Content-Type: application/xml`, and even no Content-Type header at all all succeed (201) as long as the body parses as valid JSON.

What I tested:

  Content-Type: application/json     + valid JSON body -> 201 (expected)
  Content-Type: text/plain          + valid JSON body -> 201 (accepted)
  Content-Type: multipart/form-data + valid JSON body -> 201 (accepted)
  Content-Type: application/xml     + valid JSON body -> 201 (accepted)
  (no Content-Type header)          + valid JSON body -> 201 (accepted)

Evidence (re-verification, 2026-08-20):

  CT: application/json    -> 201
  CT: text/plain          -> 201
  CT: multipart/form-data -> 201
  CT: application/xml     -> 201
  CT: (none)              -> 201

Why this matters:

1. This is not a direct security vulnerability — the body is still validated as JSON. But accepting arbitrary content-types is looser than expected and increases attack surface (e.g. a CSRF payload delivered via a form-encoded context that happens to contain valid JSON).
2. Per REST conventions, the API should enforce `application/json` and reject other content-types with 415 Unsupported Media Type.

What the fix should look like:

1. Validate that Content-Type is `application/json` (or `application/json; charset=utf-8`). Return 415 Unsupported Media Type for any other content-type.

________________________________________________________________

Bug 8 — `confirm_externally` documentation/behavior inconsistency on TCP monitors

Severity: Low
Type: Documentation / behavior mismatch
Status: Confirmed (2026-08-20)

What happened:

The TCP monitor documentation states: "No second opinion... TCP incidents are recorded as skipped." This implies TCP monitors do not use `confirm_externally`. However:

- Setting `confirm_externally` in the POST body returns 422 "not a valid field" (the field is rejected as unknown).
- But every TCP monitor returned by the API has `confirm_externally: true` set by the server in the response object.

So the field is not settable by the user, but the server sets it to `true` on every TCP monitor, contradicting the docs that say TCP incidents are "skipped" (implying no external confirmation).

Evidence (re-verification, 2026-08-20):

  POST tcp with confirm_externally=true -> 422 "not a valid field"
  POST tcp (no confirm_externally)       -> 201, response shows confirm_externally: true

Why this matters:

1. Documentation/behavior mismatch causes user confusion. The docs say TCP doesn't confirm externally, but the stored object says it does.
2. Either the docs are wrong (TCP does use confirm_externally) or the server is setting a meaningless field that has no effect.

What the fix should look like:

1. Either remove `confirm_externally` from the TCP monitor response object (if it has no effect) or update the docs to explain that TCP monitors do use it. Make the response object and documentation consistent.

________________________________________________________________

Bug 9 — `push_expected_interval_sec` not actually required despite documentation implying it is

Severity: Low
Type: Documentation / behavior mismatch
Status: Confirmed (2026-08-20)

What happened:

The push monitor documentation implies `push_expected_interval_sec` is required. However, omitting it creates a push monitor successfully (201) with a default interval applied (3600s / 1 hour).

What I tested:

  POST push (no push_expected_interval_sec) -> 201, monitor created with default 3600s
  POST push push_expected_interval_sec=3600  -> 201

Evidence (re-verification, 2026-08-20):

  push (no interval)  -> 201, stored push_expected_interval_sec=3600 (default)
  push interval=3600  -> 201

Why this matters:

1. Minor doc/behavior mismatch. The docs should either say the field is optional with a documented default, or the API should require it (422 if missing).

What the fix should look like:

1. Update docs to state the field is optional with a default of 3600s, or enforce it as required (422 if missing). Pick one and make docs match behavior.

________________________________________________________________

Bug 10 — Grace period upper bound undocumented and inconsistently enforced

Severity: Low
Type: Documentation / validation mismatch
Status: Confirmed (2026-08-20)

What happened:

The push monitor documentation says `push_grace_sec` accepts "0 seconds and up" with no upper bound stated. However, very large values are rejected (422) without the bound being documented.

What I tested:

  push_grace_sec=0        -> 201 (accepted)
  push_grace_sec=300       -> 201 (accepted)
  push_grace_sec=99999999  -> 422 (rejected — upper bound exists but is undocumented)

Evidence (re-verification, 2026-08-20):

  push_grace_sec=0         -> 201
  push_grace_sec=300        -> 201
  push_grace_sec=99999999  -> 422 (undocumented upper bound hit)

Why this matters:

1. The docs claim "0 seconds and up" but there is an upper bound. Users who set a large grace period (e.g. for a daily cron with a long failure tolerance) will hit an undocumented 422.

What the fix should look like:

1. Document the upper bound for `push_grace_sec` and ensure the validation matches the documented range.

________________________________________________________________

Bug 11 — `PATCH cert_warn_days` returns HTTP 500 internal_error on SSL monitors (valid integer values)

Severity: High
Type: Weak validation / unhandled assertion — field-specific PATCH crash
Status: Confirmed (re-verified twice on 2026-08-20 with fresh SSL monitors)

What happened:

Updating `cert_warn_days` on an existing SSL monitor via PATCH crashes the server with HTTP 500 "Something went wrong" for ANY valid integer value in the allowed range (1–365). The monitor cannot be edited to change its warning threshold after creation. This is NOT the same as Bug 1 (which covers type-mismatch crashes): here the value type and range are both correct, and the crash is specific to the `cert_warn_days` field on the PATCH path for `ssl` monitors.

What I tested:

  POST ssl monitor (host=example.com, cert_warn_days=30) -> 201 created (id=m9712fn28gzhekfs3sxvhnp62s8cvret)
  PATCH cert_warn_days=60   (valid, in 1-365) -> 500 internal_error
  PATCH cert_warn_days=15   (valid, in 1-365) -> 500 internal_error

Controls (same monitor, same PATCH endpoint, different fields) all succeed:
  PATCH name="renamed"        -> 200 (works)
  PATCH interval_sec=120      -> 200 (works)
  PATCH host="whatping.com"   -> 200 (works)

So the PATCH endpoint itself is functional; only the `cert_warn_days` field path is broken on `ssl` monitors.

Evidence (re-verification, 2026-08-20):

  POST ssl -> 201, id=m9712fn28gzhekfs3sxvhnp62s8cvret, cert_warn_days=30
  PATCH {"cert_warn_days":60} -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  PATCH {"cert_warn_days":15} -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  PATCH {"name":"renamed"}    -> HTTP 200 (control — works)
  PATCH {"interval_sec":120}  -> HTTP 200 (control — works)

Why this matters:

1. A monitor setting that users reasonably expect to change over time (raise the warning window as a renewal approaches, or lower it to be more conservative) is silently uneditable via the API. The only workaround is to delete and recreate the monitor, which discards its check history, incident history, and channel attachments.
2. The 500 response is generic and names no field, so a client cannot programmatically distinguish this from a transient server fault and may retry indefinitely.
3. Combined with Bug 1 (which already crashes PATCH on type-mismatched `cert_warn_days`), the `cert_warn_days` field on `ssl` is effectively unwritable after creation through any code path — type-correct values crash with 500, type-incorrect values also crash with 500.
4. The specificity (only `cert_warn_days`, only on `ssl`, only on PATCH) points to a missing branch in the SSL update validator's allowed-field list — likely the field is validated on the POST path but omitted from the PATCH allowlist for `ssl`, causing the update handler to fail when it encounters it.

What the fix should look like:

1. Add `cert_warn_days` to the SSL monitor's PATCH allowlist and apply the same 1–365 range validation used on POST.
2. Add a regression test: create an SSL monitor, PATCH `cert_warn_days` to several values in range, assert 200 and that the stored value changes.
3. Audit the PATCH allowlists for every monitor type to ensure each type's type-specific numeric/string fields are present (not just the generic `name`/`interval_sec`/`timeout_ms`).

________________________________________________________________

Bug 12 — No SSRF guard at all on SSL monitor `host` field (literal private/metadata IPs accepted directly)

Severity: High
Type: SSRF — missing security control (distinct from Bug 3)
Status: Confirmed (re-verified on 2026-08-20)

What happened:

Bug 3 documents that TCP monitors HAVE a private-network guard but it can be bypassed via encoded IP forms (hex, octal, wildcard DNS). The SSL monitor type is worse: it has NO private-network guard at all. Literal private, loopback, link-local, and cloud-metadata addresses are accepted directly at create time (201) without any 422 rejection.

This is a distinct and more severe finding than Bug 3: Bug 3 is a bypass of an existing (string-match) control; this bug is the complete absence of the control on a different monitor type. The site's own docs state that webhook URLs resolving to private addresses are refused, establishing that WhatPing has a private-address policy — but it is not applied to SSL monitor hosts.

What I tested (SSL host field, literal forms only — no encoding tricks):

  host=169.254.169.254        (AWS/GCP IMDS link-local) -> 201 (accepted, no 422)
  host=127.0.0.1              (loopback)                -> 201 (accepted, no 422)
  host=10.0.0.1               (RFC1918 private)         -> 201 (accepted, no 422)
  host=0.0.0.0                (unspecified)             -> 201 (accepted, no 422)
  host=metadata.google.internal (GCP metadata hostname) -> 201 (accepted, no 422)

For contrast, the same literal values on TCP monitors return 422 "Private-network targets are not permitted on this deployment" (per Bug 3 testing). So the guard exists for TCP but is entirely absent for SSL.

Evidence (re-verification, 2026-08-20):

  ssl host=169.254.169.254       POST -> 201, id=m973zg1vm1p8mkq9yt5004z8ah8cvrsn (accepted, no SSRF check)
  ssl host=127.0.0.1             POST -> 201, id=m972nas4jdxc3sjje823aygzv18cta24
  ssl host=10.0.0.1              POST -> 201, id=m977nfm2dznwv67barmpzdtbdn8cvkqn
  ssl host=0.0.0.0               POST -> 201, id=m97aedsq3afh4g5ezdfs3erw158cv9px
  ssl host=metadata.google.internal POST -> 201, id=m978vq9mm8j5jdt8s28we06pb98cv6ac

Why this matters:

1. An attacker can create an SSL monitor pointing at `169.254.169.254` or `metadata.google.internal` directly — no encoding or wildcard DNS needed, unlike TCP. WhatPing's probe worker will initiate a TLS handshake against the instance metadata service from the worker network. While a TLS handshake to an IMDS endpoint typically won't return credential bodies (IMDS is HTTP, not TLS), the connection attempt itself is an SSRF primitive, and the same worker could be pointed at internal TLS services (e.g. `https://10.0.0.1:8443`) to enumerate internal TLS surfaces, certificate issuers, and SANs.
2. The asymmetry with TCP (which has the guard, even if bypassable) indicates the SSL monitor type was never wired into the private-network check at all — a coverage gap, not a filter weakness.
3. The acceptance of `metadata.google.internal` as a hostname (not even an IP) shows the SSL host field also skips hostname classification, not just IP classification.

What the fix should look like:

1. Apply the same private-network guard to the SSL monitor `host` field that TCP already has — and implement it correctly (parse + classify, per Bug 3's fix) rather than as a string match.
2. Extend the guard to hostnames, not just IPs: resolve the hostname and classify the resolved addresses (covers `metadata.google.internal` and `169.254.169.254.nip.io`).
3. Add SSL to the regression matrix for the SSRF guard so this coverage gap does not recur.

________________________________________________________________

Bug 13 — Silent host normalization on SSL monitors (`https://` prefix and URL paths stripped without warning)

Severity: Low
Type: Silent input mutation — violates documented "unknown fields are an error, not a shrug" contract
Status: Confirmed (re-verified on 2026-08-20)

What happened:

The SSL monitor `host` field silently rewrites user input without returning a warning or error. Two observed transformations:

  - Input host="https://example.com"  -> stored host="example.com"  (scheme stripped, no warning)
  - Input host="example.com/admin"    -> stored host="example.com"  (path stripped, no warning)

Both return 201 with no indication that the input was modified. The user believes they configured `https://example.com` or `example.com/admin`, but the monitor is actually watching `example.com`.

This directly contradicts WhatPing's documented design principle: "unknown fields are an error, not a shrug — a typo'd field that silently vanished would leave you believing you set something you did not." The same principle applies to silent input rewriting: the user set a value and the system stored a different value without acknowledgment.

What I tested:

  POST ssl host="https://example.com" cert_warn_days=30 -> 201, response host="example.com"
  POST ssl host="example.com/admin"   cert_warn_days=30 -> 201, response host="example.com"

Evidence (re-verification, 2026-08-20):

  Sent host='https://example.com' -> stored host='example.com' (http=201, no warning)
  Sent host='example.com/admin'   -> stored host='example.com' (http=201, no warning)

Why this matters:

1. A user who enters `https://example.com` (a reasonable mistake, given most monitoring tools take a URL, not a bare host) is silently given a monitor for `example.com`. They may not notice the difference until an incident, at which point they investigate the wrong target.
2. A user who enters `example.com/admin` intending to monitor a specific endpoint is silently monitored for the bare host. SSL monitoring only inspects the certificate, so the path is semantically irrelevant to the check — but the user was not told that, so they believe they configured something meaningful that they did not.
3. This is the exact "silent shrug" behavior the site's API philosophy explicitly rejects. Either reject the input with a 422 ("host must not include a scheme or path") or accept it AND echo a warning — never silently mutate.

What the fix should look like:

1. If the host contains a scheme (`://`) or a path (`/`), return 422 with error.field="host" and a message like "host must be a bare domain (no scheme or path)".
2. If silent normalization is intentionally permissive, return the normalized value AND a non-fatal warning field in the response so the user is aware their input was modified.

________________________________________________________________

Bug 14 — OpenAPI spec lists `url`/`port` as valid for SSL monitors but the API rejects them (spec drift)

Severity: High
Type: Documentation / contract drift — generated spec contradicts runtime validation
Status: Confirmed (re-verified on 2026-08-20)

What happened:

The published OpenAPI 3.1 spec at https://www.whatping.com/openapi.json describes a single `MonitorCreate` schema with `additionalProperties: false` that lists `url`, `port`, `accepted_status`, `expected_keyword`, and other fields as common properties across all monitor types. The site explicitly claims the spec is "generated from the API's route table rather than written alongside it — so it cannot describe an endpoint that does not exist."

However, for `ssl` monitors the runtime validator rejects `url` and `port` (and other non-SSL fields) with 422, naming the field. So a client generated from the spec will send `url` (per the schema) and the API will refuse it. The spec describes fields the API does not accept for this monitor type.

What I tested:

Spec inspection (https://www.whatping.com/openapi.json):
  MonitorCreate schema fields include: url, port, accepted_status, expected_keyword, max_redirects, expected_status, keyword_inverted, starttls, tls, grpc_service, packet_count, loss_threshold_pct, udp_payload, udp_payload_hex, udp_expect_hex, dns_query_name, dns_record_type, dns_expected, push_expected_interval_sec, push_grace_sec, cert_warn_days, domain_warn_days, host, interval_sec, timeout_ms, down_threshold, repeat_every_min, confirm_externally, name, type
  additionalProperties: false

Runtime validation:
  POST ssl with url="https://example.com"          -> 422 "`url` is not a valid field for a ssl monitor"
  POST ssl with port=443                            -> 422 "`port` is not a valid field for a ssl monitor"
  POST ssl with accepted_status="200-299"          -> 422 "`accepted_status` is not a valid field for a ssl monitor"
  POST ssl with expected_keyword="ok"             -> 422 "`expected_keyword` is not a valid field for a ssl monitor"

The only fields the SSL monitor actually accepts are: name, type, host, cert_warn_days, interval_sec, timeout_ms, down_threshold, repeat_every_min. Every other field in the shared schema is rejected at runtime.

Evidence (re-verification, 2026-08-20):

  GET https://www.whatping.com/openapi.json
    -> MonitorCreate.properties contains url=true, port=true, accepted_status=true
    -> additionalProperties=false

  POST {"name":"x","type":"ssl","url":"https://example.com","cert_warn_days":30}
    -> HTTP 422 {"error":{"code":"invalid_request","message":"`url` is not a valid field for a ssl monitor","field":"url"}}

Why this matters:

1. The site's central API claim is that the spec is generated from the route table and "cannot describe an endpoint that does not exist, and it cannot miss one that does." This finding shows the spec can describe fields the runtime rejects — the generator is producing a supertype schema (`MonitorCreate` with all fields) rather than per-type discriminated schemas, and the runtime enforces per-type field exclusivity that the spec does not encode.
2. Any developer who uses `openapi-generator-cli` to build a typed client will produce requests that include `url` for SSL monitors (because the schema says it's valid) and get a 422 on every create. The spec is actively misleading for this monitor type.
3. This is not just a documentation issue: it breaks code generation, which is a stated use case of the spec ("Point a generator at it").

What the fix should look like:

1. Replace the single `MonitorCreate` supertype with a discriminated union (oneOf) keyed on `type`, where each variant lists only the fields valid for that monitor type (ssl: name, type, host, cert_warn_days, interval_sec, timeout_ms, down_threshold, repeat_every_min; http: name, type, url, accepted_status, expected_keyword, ...; etc.).
2. If a single schema is kept for implementation reasons, document the per-type field matrix in the schema description and add `enum`-conditional `required`/`not` constraints, or at minimum add a descriptive note per field listing which types accept it.
3. Add a conformance test: for each monitor type, generate a request from the spec and assert it is accepted by the runtime.

________________________________________________________________

Bug 15 — SSL monitor expiry reflection works but first-check timing is unpredictable (no check-on-create)

Severity: Low
Type: UX / observability — feature works but timing is non-deterministic
Status: Confirmed (re-verified on 2026-08-20)

What happened:

The SSL monitor's core feature — reporting days-until-certificate-expiry via `last_days_remaining` and flipping `state` to `up`/`down`/`warn` — functions correctly when it runs. In the first test session, a `whatping.com` SSL monitor populated `last_days_remaining: 74` and `state: up` approximately 145 seconds after creation, and a check result appeared in GET /v1/monitors/{id}/results with `ok: true`.

However, on re-verification, three fresh SSL monitors (including a new `whatping.com` monitor) stayed in `state: "pending"` with null `last_check_at` and zero results for over 6 minutes, and one stayed pending for 110+ seconds in a separate run. The docs state certificate checks "run daily," and there is no check-on-create behavior — the first check happens whenever the next scheduled prober sweep runs, which is not deterministic from the user's perspective.

What I tested:

Session 1 (initial TLS feature test):
  Created ssl monitor for whatping.com (cert_warn_days=30)
  After ~145s: state=up, last_check_at=1787221522610, last_days_remaining=74
  Results: 1 row, {ok: true, at: 1787221522610}

Session 2 (re-verification):
  Created ssl monitor for whatping.com (id=m974mdfphmgac5yb24h830zf0d8cvr6j)
  After 90s:  state=pending, last_check_at=null, last_days_remaining=null, results=0
  After 3 min: state=pending, last_check_at=null, results=0
  After 6+ min: state=pending, last_check_at=null, results=0

  Created another ssl monitor for whatping.com (id=m971hdzb5dvwfmq31mv9mb20d58cv5s6)
  After 110s: state=pending, last_check_at=null, results=0

Evidence (re-verification, 2026-08-20):

  Session 1: whatping.com ssl monitor -> state=up, last_days_remaining=74 (after ~145s) [feature confirmed working]
  Session 2: whatping.com ssl monitor m974mdfphmgac5yb24h830zf0d8cvr6j
    [16:03:35] poll 1 (30s):  state=pending last_check= days_left= error= results=0
    [16:04:07] poll 2 (60s):  state=pending last_check= days_left= error= results=0
    [16:04:39] poll 3 (90s):  state=pending last_check= days_left= error= results=0
    After 6+ min:             state=pending last_check= days_left= error= results=0
  Session 2: whatping.com ssl monitor m971hdzb5dvwfmq31mv9mb20d58cv5s6
    After 110s: state=pending last_check= days_left= error= results=0

Why this matters:

1. The feature is not broken — it produced a correct `last_days_remaining: 74` for whatping.com in session 1. But for a tool whose entire purpose is "warn me before my certificate expires," a user who creates a monitor and sees it sit in "pending" for an unbounded time cannot tell whether the monitor is misconfigured, the prober is down, or they simply need to wait. There is no "next_check_at" field to indicate when the first check will occur.
2. The non-determinism (145s in one run, >6min in another) makes it impossible to write a reliable automated test or to give a user an expected wait time. This complicates CI-based provisioning: a pipeline that creates a monitor and immediately polls for an `up` state will flake.
3. The docs say cert checks "run daily," which is fine for steady-state, but on creation the user has no signal. An immediate first check (or at minimum a `next_check_at` timestamp) would resolve the ambiguity.

What the fix should look like:

1. Optionally run one immediate check on monitor creation (or within a short bounded window, e.g. <30s) so the monitor leaves "pending" quickly, then settle into the daily schedule. This is what most monitoring tools do.
2. If an immediate check is not desired, expose a `next_check_at` field on the monitor object so the user knows when to expect the first result, and so automated pipelines can poll intelligently instead of guessing.
3. Document the expected first-check latency explicitly so users and integrators can set sane timeouts.

________________________________________________________________

Controls that are correctly working (confirmed 2026-08-20, not bugs)

Auth and access control:
- Missing Authorization header -> 401 unauthorized
- Wrong scheme (Basic/Bearer混淆) -> 401
- Garbage token -> 401
- Empty Bearer -> 401
- Token in query param (?token=...) -> 401 (auth is header-only, correct)
- X-API-Key header instead of Authorization -> 401
- 401 error message shows `sk_…` (ellipsis, not the real token) — no token leak in error response

HTTP method handling:
- DELETE /v1/monitors (collection) -> 405 method_not_allowed
- POST /v1/me -> 405 method_not_allowed
- PATCH /v1/monitors (collection) -> 405 method_not_allowed
- PUT /v1/monitors (collection) -> 405 method_not_allowed

ID-based endpoints:
- Nonexistent monitor ID -> 404 (no info leak)
- Invalid ID format -> 404
- Path traversal in ID (../, ..%2F) -> 404 (blocked at router)

Query parameters:
- limit=0 -> 422 (min 1 enforced)
- limit=101 -> 422 (max 100 enforced)
- limit=50 (valid) -> 200
- Unknown query params -> silently ignored (no error, no effect)
- cursor with SQL injection payload -> rejected (no SQLi)

Malformed JSON:
- Plain text body -> 400 invalid_json
- Truncated JSON -> 400 invalid_json
- Array body ([]) -> 400 "must be JSON object"
- String body ("...") -> 400 "must be JSON object"
- Number body (123) -> 400 "must be JSON object"
- Null body (null) -> 400 "must be JSON object"

Monitor limit:
- 21st monitor (limit is 20) -> 422 "already has the maximum of 20 monitors"
- 20th monitor -> 201 (correct)

Type immutability:
- PATCH type field -> 422 unknown_field (cannot change monitor type after creation)
- Case sensitivity: type="TCP" (uppercase) -> 422 (only lowercase "tcp" accepted)

Unknown fields:
- Typo'd field name (intervall_sec) -> 422 naming the field

Idempotency:
- Same Idempotency-Key + same body -> replay (returns same result)
- Same Idempotency-Key + different body -> 409 conflict

Range validation (when type is correct):
- port out of range (99999) -> 422
- interval_sec out of range -> 422
- All numeric bounds enforced when the value is a number (the 500 crash only happens when the type is wrong, not when the value is out of range)

Push ping endpoint (/v1/monitor/ping/<token>):
- Uniform 404 on bad/expired/rotated tokens — no token enumeration possible
- Token length cutoff: 128-char tokens rejected, 127 accepted (reasonable limit)
- Only GET and POST routed to the ping endpoint; other methods -> 404/405
- Path traversal in token (../, encoded) -> 404 (blocked at router)
- Token rotation: instant invalidation of old token, new distinct token issued each rotation
- Token cannot be PATCHed directly (setting push_token in PATCH body -> 422 unknown_field)

Push type-specific:
- rotate-token on non-push monitor -> 422 "Only push monitors have a ping token" (correct)
- host/port/url/confirm_externally on push -> 422 (correctly rejected as irrelevant fields)

DNS monitor type:
- The ONLY monitor type that correctly returns 422 (instead of 500) on wrong field types. All other types crash. This proves the 500 bug is a per-type code path issue that can be fixed.

SSL monitor type (confirmed working, not bugs):
- Core expiry feature works: whatping.com monitor populated last_days_remaining=74 and state=up in session 1 (feature confirmed; timing variability covered in Bug 15)
- cert_warn_days range enforcement on POST: 0, -1, 100000, 30.5 all rejected with 422 "Warning threshold must be between 1 and 365 days"
- cert_warn_days default of 30 applied on POST when omitted or null (silent default, not a bug)
- interval_sec bounds on POST: 10 (below min) and 100000 (above max 86400) rejected with 422
- host validation on POST: empty host -> 422 "A domain is required for ssl monitors"; "host:8080" -> 422 "Domain must not include a port or scheme"; "localhost" -> 422 "Domain is not valid"; "*.example.com" -> 422 "Domain is not valid"
- type immutability on PATCH: PATCH {"type":"http"} -> 422 unknown_field type
- Non-SSL fields correctly rejected on POST ssl: accepted_status, expected_keyword -> 422 naming the field
- Idempotency on SSL monitor create: same Idempotency-Key + same body -> replay (same monitor id); same key + different body -> 409 idempotency_conflict
- Pause/resume on SSL monitor: both work, flip enabled correctly
- rotate-token on SSL monitor -> 422 "Only push monitors have a ping token" (correct)
- PATCH name, interval_sec, host on SSL monitor all succeed (200) — confirms PATCH endpoint works; only cert_warn_days PATCH is broken (Bug 11)

________________________________________________________________

Additional notes (for context)

1. All testing was API-only. No browser/dashboard access, so the stored XSS (Bug 6) could not be confirmed exploitable in the dashboard — only the API-side storage was confirmed. The dashboard render escaping MUST be verified separately.

2. The SSRF bypass (Bug 3) was confirmed at the validation layer (monitors accepted with encoded/wildcard-DNS private hosts). All test monitors were deleted before any probe could fire, so no actual connection to internal addresses was made. The bypass is a validation-layer bypass; whether the probe-time dial layer has an additional check was not tested for TCP (it was tested for HTTP in the 2026-08-19 report, where the network egress block caught some cases). For TCP, the probe behavior of accepted-but-encoded-private hosts was not observed because monitors were deleted before the probe interval.

3. The 500-crash bug (Bug 1) is the same root cause as Bug 4 in the 2026-08-19 HTTP report ("Wrong JSON types cause HTTP 500 internal_error instead of 422"). That report found it on HTTP monitors; today's testing confirmed it is systemic across 9 of 10 monitor types, not just HTTP. The fix should be applied in the shared decode path, not per-type.

4. PowerShell on Windows was used for all testing. JSON bodies were written to temp files (Set-Content -Encoding ascii -NoNewline) and passed via curl.exe -d "@file.json" to avoid shell quoting issues with embedded colons and quotes. This methodology was validated against known-good and known-bad requests before use.

5. The alternate host https://monitor-site.whatping.com/v1 was discovered to be functional and equivalent to api.whatping.com — both route to the same backend. This is not a bug but is noted for completeness.

6. All test monitors were deleted after each section; final GET /v1/me shows usage monitors=0 of 20. No test artefacts left in the account. Temporary script files created during testing were removed after use.

________________________________________________________________

Summary

Bugs found today (20 August 2026):

1. Systemic HTTP 500 internal_error on wrong JSON type across ALL monitor types (POST and PATCH) — High
2. `name` field missing/null/non-string crashes with 500 internal_error — High
3. SSRF bypass: private-network guard only string-matches literal IP forms (TCP, POST and PATCH) — High
4. Invalid IPs accepted (octet > 255, short octet forms) — Low
5. Polling fields silently accepted on push (heartbeat) monitors — Medium
6. Stored XSS payloads accepted as monitor `name` and echoed verbatim — Medium (API-side confirmed; dashboard render unconfirmed)
7. Content-Type not enforced: any content-type accepted if body is valid JSON — Low
8. `confirm_externally` documentation/behavior inconsistency on TCP monitors — Low
9. `push_expected_interval_sec` not actually required despite documentation implying it is — Low
10. Grace period upper bound undocumented and inconsistently enforced — Low
11. `PATCH cert_warn_days` returns HTTP 500 internal_error on SSL monitors (valid integer values) — High
12. No SSRF guard at all on SSL monitor `host` field (literal private/metadata IPs accepted directly) — High
13. Silent host normalization on SSL monitors (`https://` prefix and URL paths stripped without warning) — Low
14. OpenAPI spec lists `url`/`port` as valid for SSL monitors but the API rejects them (spec drift) — High
15. SSL monitor expiry reflection works but first-check timing is unpredictable (no check-on-create) — Low

Working as expected (confirmed, not bugs):
- Auth (all bypass attempts rejected, no token leak in errors)
- HTTP method handling (405 on wrong methods)
- ID-based endpoints (404 on nonexistent/invalid/path-traversal IDs)
- Query param validation (limit bounds, cursor SQLi rejected, unknown params ignored)
- Malformed JSON handling (400 invalid_json / must be JSON object)
- Monitor limit (20-cap enforced with clean 422)
- Type immutability (cannot PATCH type)
- Unknown field rejection (422 naming the field)
- Idempotency (replay and conflict behavior correct)
- Range validation when type is correct (numeric bounds enforced)
- Push ping endpoint (token enumeration resistance, rotation, method routing, path traversal blocked)
- DNS monitor type (only type that correctly returns 422 on wrong field types)

Correlation with prior report (2026-08-19):
- Bug 1 today (systemic 500 on wrong type) is the expansion of Bug 4 in the 2026-08-19 report (which found it on HTTP only). Today confirmed it affects 9 of 10 monitor types systemically.
- Bug 3 today (SSRF bypass on TCP via encoded forms) is the same bug class as Bug 1 in the 2026-08-19 report (IPv4-mapped IPv6 bypass on HTTP). The root cause is identical: the guard string-matches literal IP forms instead of parsing and classifying. The TCP surface also adds hex/octal/decimal/short/wildcard-DNS bypasses beyond the IPv6-mapped form.

Correlation within this report (SSL findings):
- Bug 12 (no SSRF guard on SSL host) is a distinct but related issue to Bug 3 (SSRF bypass on TCP). Bug 3 is a bypass of an existing (weak) control; Bug 12 is the complete absence of the control on a different monitor type. Both point to the same fix: a single, correctly-implemented (parse + classify + resolve) private-network guard applied uniformly to every monitor type's host field.
- Bug 11 (PATCH cert_warn_days 500) is a field-specific instance of the broader 500-on-bad-input class (Bug 1), but with a critical difference: the input in Bug 11 is type-correct and range-valid, yet the PATCH still crashes. This means the SSL PATCH allowlist is missing the field, independent of the type-mismatch crash in Bug 1.
- Bug 14 (OpenAPI spec drift for SSL) is the only documentation/contract finding in this report that breaks a stated core guarantee ("the spec cannot describe an endpoint that does not exist"). The spec describes fields the runtime rejects for SSL monitors, which is the inverse of that guarantee.

Severity ranking (recommended fix order):
1. Bug 1 + Bug 2 (systemic 500 crash) — fix the shared decode path; closes ~20 attack surfaces at once. Highest impact-to-effort ratio.
2. Bug 11 (PATCH cert_warn_days 500 on SSL) — field-specific PATCH crash; users cannot edit the warning threshold after creation.
3. Bug 12 (SSRF — no guard at all on SSL host) + Bug 3 (SSRF bypass on TCP) — parse and classify addresses instead of string-matching; wire SSL into the guard it is currently missing.
4. Bug 14 (OpenAPI spec drift for SSL) — spec describes fields the runtime rejects; breaks code generation.
5. Bug 5 (polling fields on push) — enforce field exclusivity uniformly.
6. Bug 6 (XSS name storage) — verify dashboard escaping on render.
7. Bug 13 (silent host normalization on SSL) — reject or warn, never silently mutate.
8. Bugs 4, 7, 8, 9, 10, 15 — input validation, documentation, and observability cleanup.

________________________________________________________________

End of report.
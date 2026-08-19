# WhatPing Monitors Feature — Backend Bug & Functionality Report

**Date:** 2026-08-19
**Scope:** Monitors feature (creation, validation, state machine, security) exercised via the public API (`https://api.whatping.com/v1`) and the heartbeat endpoint.
**Method:** Live API probing against the hosted deployment using a `write`-scoped key (`Day-1`), workspace `Personal`. All test monitors were deleted after testing.
**Reference:** https://www.whatping.com/docs/ (security, concepts, api, limits pages)

---

## Executive summary

17 distinct behaviors were tested. **3 confirmed bugs** were found, one of which
is a **critical security vulnerability** (SSRF bypass). The core validation engine
is otherwise solid: unknown-field rejection, range bounds, scheme allowlisting and
hostname-based private-network blocking all behave as documented.

| # | Severity | Area | Summary |
|---|----------|------|---------|
| 1 | 🔴 Critical | Security / SSRF | IPv4-mapped IPv6 bypasses the private-network target block |
| 2 | 🟠 High | Security / validation | Intelligence monitors accept schemes and IP literals (docs say bare domain only) |
| 3 | 🟡 Medium | State machine | A failing heartbeat reports `state: "up"` with `consecutive_failures: 1` instead of `pending` |

Everything else checked out correctly — see "What works" at the bottom.

---

## 🔴 BUG 1 — Critical: IPv4-mapped IPv6 bypasses SSRF protection

### What the docs promise
> *"Private-network targets refused by default … IPv4-mapped IPv6 addresses are
> unwrapped and re-checked, so `::ffff:10.0.0.1` cannot bypass the IPv4 rules."*
> — https://www.whatping.com/docs/security

### What actually happens
A monitor created with an IPv4-mapped IPv6 loopback or cloud-metadata address is
**accepted and probed**. The private-network check is bypassed entirely.

**Reproduction:**

```bash
# Loopback via v4-mapped v6 — ACCEPTED (should be rejected)
curl -X POST https://api.whatping.com/v1/monitors \
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \
  -d '{"name":"loopback v6 mapped","type":"http","url":"http://[::ffff:127.0.0.1]/"}'
# -> HTTP 201, url normalized to "http://[::ffff:7f00:1]/"

# Cloud metadata via v4-mapped v6 — ACCEPTED and PROBED (should be rejected)
curl -X POST https://api.whatping.com/v1/monitors \
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \
  -d '{"name":"cloud metadata","type":"http","url":"http://[::ffff:169.254.169.254]/latest/meta-data/"}'
# -> HTTP 201, url normalized to "http://[::ffff:a9fe:a9fe]/latest/meta-data/"
```

**The probe actually ran.** The metadata monitor produced a check result:
```json
{ "at": 1787136045927, "error": "timeout", "latency_ms": 10001, "ok": false }
```
A 10001 ms latency = the probe connected/timed out against the 10s timeout. On
this hosted deployment the metadata service did not answer, but **the probe was
allowed to attempt the internal address**. On a deployment where the metadata
service responds (or any internal service on 127.0.0.1/10.x/192.168.x), this
leaks the response body through keyword matching or status assertions, and proves
reachability through latency/errors.

For contrast, the **direct IPv4 forms are correctly blocked**:
```bash
curl ... -d '{"url":"http://10.0.0.1/"}'          # -> 422 "Private-network targets are not permitted"
curl ... -d '{"url":"http://localhost/"}'         # -> 422 (hostname block works)
curl ... -d '{"url":"http://metadata.google.internal/"}'  # -> 422
```
So the bug is specifically in the IPv4-mapped IPv6 unwrapping path — the exact
code path the docs claim handles this case.

### Impact
- **SSRF.** An attacker (or a misconfigured monitor) can target the cloud metadata
  service, loopback services, or any RFC1918 address by wrapping it in
  `::ffff:<ipv4>`. If the deployment allows private targets via the documented
  opt-in, this is moot; on the default-hosted deployment it is a real bypass.
- Response bodies are not stored, but keyword match results and status codes are
  observable, and timing/errors leak reachability — a classic blind-SSRF channel.

### Suggested fix
In the URL host parser, after resolving an IPv6 literal, detect the
`::ffff:a.b.c.d` / `::ffff:xxxx:xxxx` form, extract the embedded IPv4 address,
and run it through the **same** private-network check that bare IPv4 goes through.
The docs already describe this exact logic; the implementation appears to be
missing or no-op for this case.

---

## 🟠 BUG 2 — High: Intelligence monitors accept scheme + IP literal

### What the docs promise
> *"Stricter rules for intelligence monitors. Certificate, domain, DNS and
> email-auth targets must be bare domain names: no scheme, no port, no path, no
> IP literals. Those targets are passed to a third-party API rather than fetched
> directly, so the surface is narrowed further."*
> — https://www.whatping.com/docs/security

And from the limits page:
> *"Bare domain required — no scheme, port, path or IP literal | certificate,
> domain, DNS, email auth"*

### What actually happens
A `domain` monitor accepts `https://example.com` (scheme stripped silently) and
`1.2.3.4` (IP literal accepted as-is).

**Reproduction:**
```bash
# Domain with scheme — ACCEPTED, scheme silently stripped to "example.com"
curl -X POST https://api.whatping.com/v1/monitors \
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \
  -d '{"name":"domain with scheme","type":"domain","host":"https://example.com"}'
# -> HTTP 201, host stored as "example.com"

# Domain as IP literal — ACCEPTED, stored as "1.2.3.4"
curl -X POST https://api.whatping.com/v1/monitors \
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \
  -d '{"name":"domain ip literal","type":"domain","host":"1.2.3.4"}'
# -> HTTP 201, host stored as "1.2.3.4"
```

### Impact
- **Documentation/behavior mismatch.** Users relying on the documented strictness
  (e.g. expecting a typo'd `https://` to be rejected rather than silently working)
  will be surprised.
- The IP-literal case is the more concerning one: an IP is not a domain, and
  passing it to a third-party WHOIS/registration API may return nonsense or be
  treated as a lookup error, producing misleading monitor state. It also widens
  the input surface for the third-party API call.

### Suggested fix
Add a validator for `type` in `{ssl,domain,dns,email-auth}` that requires `host`
to match a bare-domain grammar (labels separated by dots, no scheme/port/path,
no IP literal). Reject with `422 invalid_request` rather than silently stripping.

---

## 🟡 BUG 3 — Medium: Heartbeat reports `up` while actively failing

### What the docs promise
> *State `pending`: "Not yet established. Either the monitor has never completed a
> check, or it is failing but has not reached its threshold."*
> — https://www.whatping.com/docs/concepts

The state table is explicit: failing-but-below-threshold = `pending`, not `up`.

### What actually happens
The pre-existing heartbeat monitor `cron check` (type `push`) shows:
```json
{
  "state": "up",
  "consecutive_failures": 1,
  "last_error": "no ping received; 7s past the expected window",
  "last_check_at": 1787135944127,
  "down_threshold": 2
}
```
And its results confirm the last check failed:
```json
{ "at": 1787135944127, "error": "no ping received; 7s past the expected window", "ok": false }
```

So the monitor is **failing (1 consecutive failure, below threshold of 2)** but
reports `state: "up"`. Per the documented state machine it must be `pending`.

### Likely cause
Heartbeat monitors transition `pending -> up` on the first successful ping. The
state appears to "stick" at `up` once set, and a subsequent missed-ping failure
increments `consecutive_failures` without reverting the state to `pending`. The
probed monitor types may or may not share this flaw — only the heartbeat type was
observable in this workspace.

### Impact
- **Incorrect dashboard/API state.** Consumers reading `state` to decide whether
  to page will see `up` for a monitor that is currently failing. The `pending`
  state exists precisely to signal "failing but not yet down," and this monitor
  is in exactly that condition but is labeled `up`.
- Any automation that keys off `state` (the docs' own recipe
  `monitors?state=down` for mirroring incidents) will not see this monitor even
  though it is one failure away from an incident.

### Suggested fix
When a check fails and `consecutive_failures` is > 0 but < `down_threshold`, set
`state = "pending"`. The transition should be: success → `up` (and reset
counter); failure with counter < threshold → `pending`; failure with counter ≥
threshold → `down`. This matches the documented table exactly.

---

## What works correctly (negative results, for completeness)

These were tested and behaved exactly as documented — no issues:

| Check | Result |
|-------|--------|
| Auth: valid key returns workspace + usage | ✅ 200 |
| Unknown JSON field (`intervall_sec`) | ✅ 422 `unknown_field` with `field` |
| Interval below min (10s) | ✅ 422 "Interval must be between 20 and 86400 seconds" |
| Interval above max (90000s) | ✅ 422, same message |
| `down_threshold` 15 (max 10) | ✅ 422 "Failure threshold must be between 1 and 10" |
| Private IPv4 `http://10.0.0.1/` | ✅ 422 "Private-network targets are not permitted" |
| `localhost` hostname | ✅ 422 (name-based block works) |
| `metadata.google.internal` hostname | ✅ 422 |
| Embedded creds `https://user:[email protected]/` | ✅ 422 "URL is not valid" |
| Non-http(s) scheme `gopher://` | ✅ 422 "Only http and https URLs can be monitored" |
| Name > 80 chars | ✅ 422 "Name is too long" |
| HTTP type missing `url` | ✅ 422 "URL is required for HTTP monitors" |
| Unsupported `type` (`htttp`) | ✅ 422 `unsupported monitor type` with `field` |
| PATCH `type` (immutable) | ✅ 422 `unknown_field` for `type` (type not patchable) |
| Idempotency: same key + same body | ✅ 201 replay with `idempotent-replay: true` header |
| Idempotency: same key + different body | ✅ 409 `idempotency_conflict` |
| Non-existent monitor id → pause | ✅ 404 `not_found` (not 403 — no cross-account leak) |
| Heartbeat ping, unknown token | ✅ 404 `{"ok":false}` (uniform, no enumeration) |
| Heartbeat ping, valid token | ✅ 200 `{"ok":true}` |
| Rate-limit headers present | ✅ `ratelimit-limit`, `ratelimit-remaining`, `ratelimit-policy` |
| Results carry `retention_days` | ✅ `"retention_days": 7` |
| Cursor pagination (`next_cursor`) | ✅ present, `null` on last page |
| Delete monitor | ✅ 204 |

---

## Reproducibility notes

- All `POST /v1/monitors` creates used an `Idempotency-Key` header so reruns do
  not accumulate duplicates.
- Every monitor created during testing was deleted (`DELETE` → 204) afterward.
  The workspace's pre-existing `cron check` monitor was left untouched.
- The IPv4-mapped IPv6 probe (BUG 1) did execute a real check against the internal
  address on the hosted deployment; it timed out (10s) rather than returning data,
  but the probe attempt itself is the vulnerability.
- Tests were run from a Windows/PowerShell environment using `curl.exe`; JSON
  bodies were written to temp files and sent with `--data-binary @file` to avoid
  shell-escaping artifacts.

---

## Recommended priority

1. **BUG 1 (SSRF bypass)** — fix first. This is a security issue, not just a
   doc/behavior mismatch, and it's on a path the docs explicitly claim is handled.
2. **BUG 2 (intelligence monitor input)** — fix next; it's a documented-contract
   violation and widens the third-party-API input surface.
3. **BUG 3 (state machine)** — fix for correctness of the `state` field, which
   downstream automation relies on.
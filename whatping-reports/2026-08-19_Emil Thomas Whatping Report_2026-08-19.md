WhatPing HTTP Monitor — Security Report

Date: 19 August 2026
Tester: Emil Thomas
Environment: API (api.whatping.com) — Monitors, HTTP monitor type
Account: Personal workspace (write-scoped key), monitor_limit 20, 0/20 at start and end of testing
Method: API testing against live endpoints. Created HTTP monitors via POST /v1/monitors, exercised the probe fleet, inspected results via GET /v1/monitors/{id} and GET /v1/monitors/{id}/results. Re-verified each finding with controls and a reserved-port discriminator for the redirect-SSRF case. All test monitors deleted after each run; final usage confirmed 0/20.

Scope tested:
- HTTP monitor create / probe lifecycle (POST /v1/monitors, GET monitor + results)
- SSRF surface: literal private IPs, IPv4-mapped IPv6, DNS-resolving-to-private hostnames, redirect hops into private space
- Request decoding: JSON type confusion and silent null coercion
- Runtime behaviour: bad DNS, keyword match, inverted keyword

________________________________________________________________

Bug 1 — IPv4-mapped IPv6 loopback bypasses the private-network block and reaches the dial layer

Severity: High
Type: SSRF — security-control bypass
Status: Confirmed (reproduced 2/2 variants on 2026-08-19)

What happened:

WhatPing rejects literal private/loopback/metadata/link-local IPs at create time with:

HTTP 422
{"error":{"code":"invalid_request","message":"Private-network targets are not permitted on this deployment"}}

Confirmed for http://127.0.0.1/, http://169.254.169.254/, and http://[::1]/ — all 422.

However, the same loopback address written as an IPv4-mapped IPv6 address is NOT classified as private and is accepted at create:

http://[::ffff:127.0.0.1]/   -> 201 Created
http://[::ffff:7f00:1]/       -> 201 Created   (7f00:1 is 127.0.0.1 in hex)

After the probe interval, both monitors report:

state=down
last_error="connection failed"
last_status=null
latency_ms=0
results[].error="connection failed", results[].http_status=null

The "connection failed" outcome (a dial error, latency 0) is distinct from the policy-deny string used by the probe-time check for DNS-resolving names ("target resolves to a private or reserved address"). This confirms the worker reached the TCP connect path against 127.0.0.1 before failing — the private-network filter was bypassed, not enforced. Nothing returned data because nothing listens on the worker's localhost:80, but the security control itself was defeated.

What I tested:

1. Control: POST http://127.0.0.1/ -> 422 "Private-network targets are not permitted on this deployment".
2. POST http://[::ffff:127.0.0.1]/ -> 201, monitor id m97bv1eey39q5gdyn30p0ebmxd8crcc4.
3. POST http://[::ffff:7f00:1]/ -> 201, monitor id m977zqmemsfjnrvmstqvgvvxed8cr4aq.
4. Waited 35s, fetched monitor + results for each.
5. Both: state=down, last_error="connection failed", http_status=null, latency_ms=0 (one probe had latency 4ms — dial attempted).

Evidence (re-verification, 2026-08-19):

  Control http://127.0.0.1/                -> 422 (rejected)
  http://[::ffff:127.0.0.1]/ create        -> 201
  http://[::ffff:127.0.0.1]/ probe         -> state=down err="connection failed" http_status=null latency_ms=0
  http://[::ffff:7f00:1]/      create      -> 201
  http://[::ffff:7f00:1]/      probe       -> state=down err="connection failed" http_status=null latency_ms=0

Why this matters:

1. The private-network filter only matches the obvious IPv4 forms. An attacker can point a monitor at an internal address by writing it in IPv4-mapped IPv6 notation and have WhatPing's probe fleet attempt to dial it.
2. Because the dial was attempted (connection failed, not policy-deny), this is a bypass of the control at the validation layer AND at the pre-dial check. The dial layer is reached for private targets via this notation.
3. If anything were listening on the worker's loopback or on an internal RFC1918 address expressed this way, an attacker could use WhatPing's network as a middleman to reach it.
4. This is the canonical "SSRF filter only string-matches 127.0.0.1 / RFC1918" bug class.

What the fix should look like:

1. Before the private-network check, normalize the URL host: parse the IP, unmap IPv4-mapped IPv6 (::ffff:a.b.c.d and the hex form), and treat the result as IPv4. Reject if it falls in loopback / private / link-local / CGNAT / ULA / metadata ranges.
2. Apply this normalization at create, at PATCH, immediately before every dial, and at every redirect hop.
3. Fail closed on any address that cannot be classified as definitively public.

________________________________________________________________

Bug 2 — Redirects into private space are followed by the application layer (defense-in-depth gap, currently mitigated by a network egress block)

Severity: Medium (downgraded from High after reserved-port discriminator testing)
Type: SSRF — incomplete redirect policy (mitigated by network layer)
Status: Confirmed mechanism; impact downgraded after discriminator testing (2026-08-19)

What happened:

A monitor can be created pointing at a public open-redirector (httpbingo.org/redirect-to). The first URL is public, so it passes create-time validation. When the probe runs, the worker follows the 302 redirect into private space:

redirect to http://127.0.0.1/           -> last_status=403, err="status 403 is not in accepted set 200-299"
redirect to http://169.254.169.254/     -> last_status=403, same err

At face value this looks like a confirmed SSRF (an HTTP status returned from a private hop). To determine whether the worker actually dialed the private address or whether something intercepted the hop, I ran a discriminator test: redirect into 127.0.0.1 on reserved ports where nothing can be listening.

Discriminator (the new test in this report):

redirect to http://127.0.0.1:1/   (port 1, reserved, no listener)  -> last_status=403
redirect to http://127.0.0.1:9/   (port 9, discard, no listener)  -> last_status=403

Port 1 and port 9 cannot have a real service answering. If the worker had actually dialed 127.0.0.1:1, the result would be "connection failed" (exactly as the H1 probe produced for port 80). Instead, both reserved-port redirects return a clean HTTP 403 identical to the port-80 case. A clean HTTP response on a port where nothing listens can only come from something intercepting the private hop and returning a canned response — i.e. a network-layer egress filter/proxy, not a real dial to the private target.

A public canary was also run to confirm the worker faithfully reports the final hop's real status:

redirect to httpbingo.org/status/200 (canary) -> state=up, last_status=200

So the worker does report the final hop's status when it is allowed to complete; the 403 on the private hops is the egress block answering, not the private target.

What I tested:

1. Control (public canary): redirect to https://httpbingo.org/status/200 -> up / 200. Confirms worker reports final-hop status faithfully.
2. redirect to http://127.0.0.1/ (port 80) -> down / last_status=403.
3. redirect to http://169.254.169.254/ (port 80) -> down / last_status=403.
4. redirect to http://127.0.0.1:1/ (reserved port, nothing listens) -> down / last_status=403.
5. redirect to http://127.0.0.1:9/ (discard, nothing listens) -> down / last_status=403.

Evidence (re-verification, 2026-08-19):

  canary public echo                 state=up   status=200
  redir -> 127.0.0.1:80              state=down status=403 err="status 403 is not in accepted set 200-299"
  redir -> 169.254.169.254:80        state=down status=403 err="status 403 is not in accepted set 200-299"
  redir -> 127.0.0.1:1  (reserved)   state=down status=403   <- discriminator: 403 on a no-listener port
  redir -> 127.0.0.1:9  (discard)    state=down status=403   <- discriminator: 403 on a no-listener port

Why this matters:

1. The application layer follows redirects into private space without re-running the private-network policy per hop. The SSRF check is only applied to the initial URL.
2. Today this is mitigated by a network-layer egress block that returns 403 for private destinations. That block held — no internal data was returned in my testing.
3. Relying on a single network layer as the only control is fragile: if that egress block is ever misconfigured, removed, or bypassed (e.g. a rebind to a public address that then proxies to internal), the application would happily follow the redirect into private space.
4. This is a defense-in-depth gap, not a confirmed data-returning SSRF. The earlier report's claim that "an HTTP exchange completed on loopback/metadata" is not supported by the reserved-port evidence; the 403 is the egress block, not the private target.

What the fix should look like:

1. On every redirect hop, resolve the Location host and re-run the same private/reserved-address policy used for the initial URL (unmap IPv4-mapped IPv6, resolve DNS, classify, deny before connect).
2. Do not rely solely on the network egress block; the application should fail closed on private redirect targets before attempting the dial.
3. Cap max_redirects conservatively and log each hop for auditability.

________________________________________________________________

Bug 3 — DNS names that resolve to private IPs are accepted at create; probe-time catches common cases but not all

Severity: Medium
Type: SSRF — create-time validation gap; inconsistent probe-time enforcement
Status: Confirmed (2026-08-19)

What happened:

Hostnames that resolve to private addresses (nip.io, sslip.io, localtest.me wildcards) are accepted at create time, because create-time validation does not resolve DNS. The probe-time check catches most of these, but the enforcement is not uniform across all wildcard-DNS providers.

What I tested:

  http://127.0.0.1.nip.io/                       create=201, probe: "target resolves to a private or reserved address" (blocked)
  http://127-0-0-1.sslip.io/                      create=201, probe: "target resolves to a private or reserved address" (blocked)
  http://localtest.me/                            create=201, probe: "target resolves to a private or reserved address" (blocked)
  http://169.254.169.254.nip.io/latest/meta-data/ create=201, probe: "target resolves to a private or reserved address" (blocked)

All four were accepted at create (no DNS check). At probe time, all four were blocked pre-connect with the correct policy-deny string. (In the prior run, http://127.0.0.1.xip.io returned "connection failed" with 2–3ms latency — a dial attempt — showing the probe-time check is not applied uniformly across all wildcard DNS providers. xip.io is largely decommissioned, so that path is less relevant today, but it shows the inconsistency.)

Evidence (re-verification, 2026-08-19):

  nip.io loopback      create=201  probe err="target resolves to a private or reserved address"
  sslip.io loopback    create=201  probe err="target resolves to a private or reserved address"
  localtest.me         create=201  probe err="target resolves to a private or reserved address"
  nip.io metadata      create=201  probe err="target resolves to a private or reserved address"

Why this matters:

1. Create-time does not check DNS, so hostile or useless monitors can be scheduled against private-resolving hostnames. The documented guarantee ("private-network targets are not permitted") is violated at create.
2. Probe-time catches the common wildcard DNS cases (nip.io, sslip.io, localtest.me), but the inconsistency with some paths (xip.io reached the dial layer in the prior run) shows the check is not uniformly applied before every connect.
3. DNS rebinding (TTL=0 flipping public at validate time, private at dial time) remains a residual risk unless every dial re-resolves and re-checks immediately before connecting.

What the fix should look like:

1. Best-effort resolve-and-classify at create time (reject obvious private-resolving hostnames early).
2. Always resolve the hostname and classify the resolved IP immediately before every dial and every redirect hop.
3. Fail closed on DNS responses that include any private/reserved address.

________________________________________________________________

Bug 4 — Wrong JSON types cause HTTP 500 internal_error instead of 422; null is silently coerced

Severity: Medium
Type: Weak validation / unhandled type assertion
Status: Confirmed (2026-08-19)

What happened:

Sending a wrong JSON type for any of several fields causes the API to return 500 internal_error with a generic "Something went wrong" message instead of a clean 422 naming the bad field. Sending null for a field documented as integer is silently accepted and coerced to a default.

What I tested:

  {"interval_sec": "60"}   (string for integer)   -> 500 internal_error
  {"interval_sec": true}   (bool for integer)      -> 500 internal_error
  {"url": 12345}           (number for string)     -> 500 internal_error
  {"interval_sec": null}                           -> 201, stored interval_sec=60 (silently coerced)

Evidence (re-verification, 2026-08-19):

  interval_sec string  -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  interval_sec bool    -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  url as number        -> HTTP 500 {"error":{"code":"internal_error","message":"Something went wrong"}}
  interval_sec null    -> HTTP 201, id=m97ahdn1myh8a9gvc5x7zqj7w18crycs, stored interval_sec=60

Why this matters:

1. A 500 on bad input is a reliability defect — an unhandled type assertion or panic in request decoding. It is not a security vulnerability on its own, but 500s can mask real bugs and leak implementation detail.
2. The silent null-to-default coercion violates the documented schema and can cause monitors to run with settings the user did not intend.
3. Clients cannot reliably highlight the offending field because the 500 response names no field.

What the fix should look like:

1. Strict request-body decoding: type mismatches return 422 with error.field naming the offending field.
2. Reject null where the schema says integer (or document nullable explicitly).
3. Never return 500 for a malformed-but-parseable JSON request body; reserve 500 for genuine internal faults.

________________________________________________________________

Additional notes (not separate bugs, for context)

1. Controls that are correctly working (confirmed 2026-08-19):
   - Literal private/loopback/link-local/metadata IPs rejected at create: 127.0.0.1, 169.254.169.254, [::1] all -> 422.
   - Scheme restriction holds: only http/https accepted (ftp/file/gopher/javascript/data -> 422 in prior runs).
   - Credentials in URL blocked (user:pass@, user@, :pass@ -> 422 in prior runs).
   - URL length, accepted_status grammar, numeric bounds, keyword length, idempotency-key replay, and auth all solid.
   - Runtime: bad DNS -> down; example.com + keyword "Example" -> up/200; inverted keyword -> down with "forbidden keyword found in body".

2. The redirect-probe canary confirms the worker faithfully reports the final hop's real status when the hop is public (canary redirect to httpbingo.org/status/200 -> up / 200). This validates the methodology used for the H2 discriminator.

3. All test monitors were deleted after each section; final GET /v1/me shows usage monitors=0 of 20. No test artefacts left in the account.

4. An earlier (pre-2026-08-19) report rated Bug 2 (redirect SSRF) as High and claimed "an HTTP exchange completed on loopback/metadata". The reserved-port discriminator in this run disproves that impact claim: a 403 returned on port 1 (where nothing can listen) proves the 403 is an egress-proxy canned response, not the private target. The redirect-follow mechanism is real, but the HIGH impact is not supported. Bug 2 is downgraded to Medium.

________________________________________________________________

Summary

Bugs found today:

1. IPv4-mapped IPv6 loopback bypasses private-network block and reaches the dial layer — High
2. Redirects into private space are followed by the application layer (mitigated by a network egress block; defense-in-depth gap) — Medium
3. DNS names that resolve to private IPs accepted at create; probe-time catches common cases but not all — Medium
4. Wrong JSON types cause HTTP 500 internal_error instead of 422; null silently coerced to default — Medium

Working as expected (confirmed, not bugs):
- Literal private/loopback/metadata IP rejection at create
- Scheme restriction, credentials-in-URL block, URL length, bounds, idempotency, auth
- Runtime keyword logic (match, inverted), DNS-fail handling

Severity change from prior report:
- Redirect-into-private (Bug 2) downgraded from High to Medium after reserved-port discriminator testing showed the 403 is a network egress block, not a real dial into private space.

________________________________________________________________

End of report.
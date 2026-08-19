WhatPing Testing Report

Date: 19 August 2026
Tester: Angel Thomas (GUI + Copilot)
Environment: Hosted dashboard (monitor.whatping.com), API (api.whatping.com)
Account: Free / beta plan (20 monitors per workspace)
Feature: Monitor types — create + status check (http, tcp, dns, ssl, domain, push)
________________________________________________________________

Bug 1 — SSL expired monitor lingered in `pending` after a failed check before eventually going `down`

Severity: Medium
Type: Functional Bug / Status State Machine (delayed transition)
Status: Confirmed (interim); Final state later corrected to `down`

What happened:

A TLS/SSL monitor pointed at `expired.badssl.com` (warn under 30d) ran a check and
surfaced a clear certificate failure in the Detail column:

  [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: certificate has expired (_ssl.c:1016)

For a period after that failed check (Last check populated, not "never"), State remained
`pending` instead of `down`. On a later refresh (~4m after a subsequent check window),
State correctly became `down` with "down since 8/19/2026, 4:40:22 PM".

Control `test-tls-google` (`google.com`) stayed `up` throughout.

What I tested:

1. Logged into the WhatPing dashboard (monitor.whatping.com).
2. Created SSL monitor `test-tls expired` with host `expired.badssl.com`, warn under 30d.
3. Created control SSL monitor `test-tls-google` with host `google.com`, warn under 30d.
4. Observed mid-run: Detail showed cert expired / VERIFY_FAILED while State was still `pending`.
5. Re-checked later: State flipped to `down` with "down since ..." timestamp.
6. Confirmed google.com SSL remained `up`.

Expected Result:

1. After a failed SSL verification (expired certificate), State should become `down`
   as soon as `down_threshold` consecutive failures are met — ideally on the first
   failed check when threshold is 1.
2. Detail may show the certificate error (acceptable).
3. List should show "down since ..." consistent with other DOWN monitors.
4. Control target `google.com` should be `up`.

Actual Result:

1. Interim: Detail correctly reported certificate expired; State incorrectly stayed `pending`
   after a check had already run.
2. Later refresh: State correctly became `down` (down since 8/19/2026, 4:40:22 PM).
3. Control `test-tls-google` correctly showed `up`.

Why this matters:

1. Operators rely on State for at-a-glance health and alerting during the window between
   first failure and the eventual flip.
2. A hard cert error with State=`pending` understates severity and can delay downtime alerts
   if `down_threshold` or scheduling is opaque.
3. Detail text and State disagree during the interim — confusing in triage.

What the fix should look like:

1. Treat certificate verify failure as a failed check immediately.
2. When `down_threshold=1`, first failed check should set State=`down` without a misleading
   lingering `pending` after Last check is populated.
3. Document default `down_threshold` and time-to-DOWN for ssl monitors in UI/docs.
4. Keep the human-readable SSL error in Detail / results once DOWN.
5. Add a regression test: ssl on `expired.badssl.com` with `down_threshold=1` → `down`
   within one interval, never "checked but still pending."
________________________________________________________________

Bug 2 — Domain monitor for non-existent name lingered in `pending` after whois "No match" before eventually going `down`

Severity: Medium
Type: Functional Bug / Status Semantics (delayed transition)
Status: Confirmed (interim); Final state later corrected to `down`

What happened:

Domain monitor `test-domain-neg` targeted
`this-domain-does-not-exist-123456789.com` (warn under 30d). After an early check,
Detail showed a whois-style failure ("No match for ...") while State remained `pending`.

On a later refresh, State correctly became `down` with "down since 8/19/2026, 4:40:22 PM"
(same DOWN timestamp window as the expired SSL monitor).

Control domain monitor `test-domain-google` on `google.com` correctly stayed `up`.

What I tested:

1. Created domain monitor on a clearly non-existent name.
2. Created domain monitor on `google.com` (warn under 30d) as UP control.
3. Observed interim: whois "No match" in Detail with State still `pending`.
4. Re-checked later: State=`down`, "down since 8/19/2026, 4:40:22 PM".
5. Note: QA checklist still treats fake-name domain-DOWN as a soft case vs true expiry-DOWN;
   DNS NXDOMAIN belongs on type `dns`.

Expected Result:

1. Once whois returns no match and a check result exists, State should not remain
   create-time `pending`; it should move to `down` (after threshold) promptly.
2. UP control `google.com` → `up`.

Actual Result:

1. Interim: whois failure visible; State=`pending`.
2. Later: State=`down` with "down since ..." (correct terminal state).
3. `test-domain-google` → `up` as expected.

Why this matters:

1. `pending` after a completed check implies "not evaluated yet," which is misleading
   during the delay window.
2. Unregistered domains are a realistic failure mode; time-to-DOWN should be predictable.

What the fix should look like:

1. Map whois "No match" to a failed check → `down` after threshold without a long
   "checked but pending" interim when Last check is already set.
2. Document supported domain-DOWN scenarios (unregistered vs expiry within warn window).
3. For QA: also cover type `dns` + NXDOMAIN for resolve failures.
________________________________________________________________

Bug 3 — `https://google.com` required raising redirection limit to 2 to become `up`; `https://www.google.com` was `up` without changing the limit

Severity: Medium
Type: Functional / HTTP Redirect Handling
Status: Confirmed

What happened:

Two HTTP monitors were created for Google:

- `test1-google` — URL `https://google.com/`
- `test-google` — URL `https://www.google.com/`

With the default / unchanged redirection limit, the www monitor reached State=`up`.
The apex monitor (`https://google.com/`) did not behave the same until the
redirection limit (`max_redirects`) was raised to **2**, after which its State
became `up`.

This shows the URLs are not interchangeable under the product’s redirect budget:
apex `google.com` needs at least one redirect hop (typically toward www / a
regional host) before a final success can be scored, while `www.google.com` can
succeed without increasing the limit.

After setting apex `max_redirects=2`, both monitors showed State=`up` with Detail
`HTTP 200` (apex ~157ms, www ~82ms on the later list refresh).

What I tested:

1. Created HTTP monitor `test1-google` with URL `https://google.com/`.
2. Created HTTP monitor `test-google` with URL `https://www.google.com/` (redirection
   limit left unchanged).
3. Observed www → State=`up` without changing the redirection limit.
4. Adjusted apex monitor redirection limit to **2**.
5. Re-checked: apex State became `up` (HTTP 200) only after that change.
6. Compared Latency / Detail: both `up` · HTTP 200, different latency paths.

Expected Result:

1. Documented default `max_redirects` and what happens when the budget is too low
   for a redirecting apex URL (explicit detail: redirect limit / last hop status).
2. Docs/UI warn that `https://google.com` may need a higher redirect limit than
   `https://www.google.com` for an equivalent `up` signal.
3. Operators can set `accepted_status` / `max_redirects` intentionally per URL.

Actual Result:

1. `https://www.google.com/` → `up` with redirection limit unchanged.
2. `https://google.com/` → became `up` only after redirection limit was set to **2**.
3. Once apex limit was 2, both reported `up` · HTTP 200 (not proof they are always
   equivalent under lower limits).

Why this matters:

1. Customers often paste the apex URL and leave default redirect settings; the
   monitor can look unhealthy while www with the same defaults is fine.
2. Looks like a site outage when the issue is redirect budget, not origin downtime.
3. HTTP QA must treat apex + `max_redirects` as a matrix case, not a twin of www.

What the fix should look like:

1. Explicit Detail when the check stops due to redirection limit (status + hop count).
2. Document default `max_redirects` and first-hop vs final-hop scoring.
3. Optional UI hint for known-redirecting apex hosts (suggest raising limit or using www).
4. QA: prefer www for stable UP with defaults; for apex, document required
   `max_redirects=2` (or accept first-hop 3xx) in the matrix.
________________________________________________________________

Observation 1 — Monitors list summary counters out of sync with rows

Severity: Low
Type: UI / Aggregation
Status: Observed (earlier refresh)

What happened:

At an earlier refresh the list header showed approximately "total 7 · up 2 · down 0 · paused"
while the table contained more monitors and multiple `up` and `down` rows.

Expected Result: Header totals match visible (or filtered) rows.

Actual Result: Header counts did not match the table contents on that refresh.

Why this matters: Summary chips are used for quick fleet health; wrong counts hide
outages or invent capacity headroom on the free 20-monitor plan.

Suggested follow-up: Reproduce with filters cleared; compare to `GET /v1/monitors`;
fix aggregation or stale cache.
________________________________________________________________

Verification — Latest monitor list snapshot (19 Aug 2026)

Severity: N/A (Verification)
Type: Functional Verification
Status: Passed for terminal states below

Latest observed results:

| Monitor | Type | Target | State | Last check / detail | Result |
|---------|------|--------|-------|---------------------|--------|
| test-dns | dns | google.com A | up | ~4m ago | PASS |
| test-domain-neg | domain | nonexistent · warn 30d | down | down since 4:40:22 PM | PASS (terminal); see Bug 2 for interim `pending` |
| test-domain-google | domain | google.com · warn 30d | up | ~4m ago | PASS |
| test-tls expired | ssl | expired.badssl.com | down | down since 4:40:22 PM | PASS (terminal); see Bug 1 for interim `pending` |
| test-tls-google | ssl | google.com · warn 30d | up | ~4m ago | PASS |
| test-push-backup | push | ping every 1h | up | pinged ~29m ago | PASS |
| test-tcp-invalid | tcp | 8.8.8.8:65000 | down | ~1m ago · 10s | PASS |
| test-tcp_google-dns | tcp | 8.8.8.8:53 | up | ~6ms | PASS |
| test1-google | http | https://google.com/ | up | HTTP 200 · ~157ms after max_redirects=2 | PASS (with limit 2); see Bug 3 |
| test-google | http | https://www.google.com/ | up | HTTP 200 · ~82ms; limit unchanged | PASS |
| test-https/http invalid | http | does-not-exist-xyz-12345.com | down | ~48s ago · 2ms | PASS |

Notes:

1. Immediately after create, several monitors showed `pending` / Last check `never` —
   expected until the first interval. That is distinct from Bugs 1-2, where Last check
   and failure Detail existed while State was still `pending`.
2. SSL expired and domain-neg flipped to `down` on the same "down since" timestamp
   (4:40:22 PM) — consistent with shared threshold / scheduler behavior.
3. Product default interval for ssl/domain/dns is often daily; for fast QA use
   `interval_sec=60` and `down_threshold=1` (see whatping-monitor-matrix.ps1).
4. HTTP redirect finding (Bug 3): `https://www.google.com/` became `up` with redirection
   limit unchanged; `https://google.com/` became `up` only after redirection limit set to **2**.
   Prefer www for a stable default UP control; treat apex as a max_redirects matrix case.
________________________________________________________________

Summary

Bugs found today:
1. SSL expired: interim `pending` after failed cert check before eventual `down` — Medium.
2. Domain nonexistent: interim `pending` after whois "No match" before eventual `down` — Medium.
3. `https://google.com` needed redirection limit **2** to become `up`; `https://www.google.com`
   was `up` without changing the limit — Medium.
4. Monitors list summary counters mismatched row states (earlier refresh) — Low.

Verifications completed today (latest snapshot):
1. dns / domain-google / ssl-google / push / tcp:53 / http www (default limit) — UP Passed.
2. http apex google.com — UP after setting max_redirects=2 (see Bug 3).
3. ssl expired / domain-neg / tcp :65000 / http nonexistent host — DOWN Passed (terminal).
4. Interim pending-after-failure called out under Bugs 1-2.

Artifacts / references:
1. GUI: https://monitor.whatping.com/monitors
2. Checklist: whatping-monitor-types-qa-checklist.md
3. Automation: whatping-monitor-matrix.ps1

________________________________________________________________

End of report.

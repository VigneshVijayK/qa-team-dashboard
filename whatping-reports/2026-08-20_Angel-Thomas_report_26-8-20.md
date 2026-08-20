WhatPing Testing Report

Date: 20 August 2026
Tester: Angel Thomas (GUI + Copilot)
Environment: Hosted dashboard (monitor.whatping.com), API (api.whatping.com)
Account: Free / beta plan (20 monitors per workspace)
Feature: Monitor create validation — name uniqueness; SSL first-check timing; cross-type health check
________________________________________________________________

Bug 1 — No duplicate monitor name unique constraint

Severity: Medium
Type: Validation / Uniqueness Gap
Status: Confirmed (reproduced)
IDs: BUG-WP-15

What happened:

Creating two monitors with the **identical `name`** both succeeded. Two `POST /v1/monitors` calls with the same name each returned **201** and produced two distinct monitors. There is no workspace-level unique constraint on `name`, and the GUI does not warn when a duplicate name is used.

| Call | `name`              | `id`                                   | Result |
|------|---------------------|----------------------------------------|--------|
| 1    | `qa-dup-name-test`  | `m97d8zjjwgbqr2q86r19zjfdzh8cv8xj`    | 201    |
| 2    | `qa-dup-name-test`  | `m977b67zeh74e7tjx1p67j5e6s8cvxn2`    | 201    |

What I tested:

1. Authenticated against API `https://api.whatping.com/v1` with a workspace write key.
2. Created monitor 1 with `name=qa-dup-name-test` → **201**, new `id`.
3. Created monitor 2 with the **same** `name=qa-dup-name-test` → **201**, different `id`.
4. Confirmed both monitors coexisted in the workspace list under the identical display name.
5. Deleted both probe monitors; usage returned to within plan limits.

Expected Result:

1. Either reject a duplicate `name` within the workspace with **409** or **422** and a clear message, **or**
2. Document that names need not be unique and surface a disambiguator in the GUI (e.g. show `id` / host alongside the name).

Actual Result:

1. Both creates returned **201**.
2. Two distinct monitors shared the same `name` with no uniqueness error and no GUI warning.
3. Silent acceptance; no unique constraint enforced.

Why this matters:

1. Operators can create many identically named monitors and then cannot tell them apart in the GUI list, alert routing, or dashboards.
2. Rename / delete / pause operations become ambiguous ("which `prod-api` did I just edit?").
3. If alerting or integrations key off `name`, duplicate names can cause misrouted or merged notifications.
4. Fleet triage and audit become error-prone once the list grows beyond a handful of monitors.

What the fix should look like:

1. Enforce workspace-unique `name` on create and rename (PATCH), returning **409/422** with a clear message such as "A monitor with this name already exists in this workspace."
2. **Or** explicitly document non-uniqueness and add a disambiguator in the GUI list (short `id`, host/URL, or type badge always visible next to name).
3. Add a regression test: second create with the same `name` in the same workspace must fail (or, if non-unique by design, GUI must show disambiguation).
4. Optionally suggest a unique default name on create (e.g. append a short suffix) to reduce accidental collisions.

________________________________________________________________

Bug 2 / Note — SSL certificate check stays `pending` for a long time, then eventually becomes `up`

Severity: Medium
Type: Functional / First-check scheduling (state machine timing)
Status: Confirmed (observed)
IDs: Related to BUG-WP-04

What happened:

An SSL certificate monitor (valid target, e.g. `google.com` / control SSL check) remained in State=`pending` for a **long time** after create before eventually transitioning to `up`. During that window the list looked like the cert check had not run yet (or was still "warming up"), even when a short `interval_sec` (e.g. 60) had been set. The terminal state was correct (`up` for a healthy cert), but time-to-first-UP was much slower / less predictable than liveness types (http/tcp/icmp/udp).

This matches the broader "daily-ish" type scheduling gap: ssl / domain / dns / email-auth often linger in `pending` with empty or delayed first results while other types already have checks.

What I tested / observed:

1. Created / reviewed an SSL certificate monitor against a known-good host.
2. Watched State stay `pending` for an extended period after create.
3. On a later refresh, State eventually became `up` (healthy certificate).
4. Compared against faster types (http/tcp/udp/icmp) which typically leave `pending` and show first results within ~1 interval.

Expected Result:

1. With `interval_sec=60` (or any explicit short interval), the first SSL check should run promptly and State should leave `pending` once a result exists.
2. GUI should not imply "never checked" for minutes when the operator intentionally chose a short interval.
3. Time-to-first-check should be documented (or echoed as next-check time) so long `pending` is not mistaken for a broken monitor.

Actual Result:

1. SSL stayed `pending` for a long time after create.
2. Eventually flipped to `up` — terminal health was correct, timing was not.
3. Behavior is inconsistent with http/tcp/udp/icmp first-check latency and aligns with BUG-WP-04 for ssl/domain/dns/email-auth.

Why this matters:

1. Operators may assume the SSL monitor is stuck or misconfigured and recreate/delete it before the first check lands.
2. Alerting and dashboards under-report fleet health during the long `pending` window.
3. QA and onboarding become flaky: "is SSL broken or just slow to first check?"

What the fix should look like:

1. Fire the first check immediately (or within one short scheduler tick) for ssl as well as other types.
2. Honor `interval_sec` for first schedule even when product default for ssl is often `86400`.
3. Echo effective next-check / schedule in create response and GUI so long waits are explainable.
4. Keep regression coverage: ssl on a valid host with `interval_sec=60` → leave `pending` and show `up` (or first result) within a bounded window (e.g. ~60–90s), not "many minutes then eventually up."

________________________________________________________________

Bug 3 — email-auth `host` accepts URL scheme and bare IP (no domain validation)

Severity: Medium
Type: Validation inconsistency
Status: Confirmed (reproduced)
IDs: BUG-WP-10

What happened:

`POST /v1/monitors` for `type=email-auth` accepted a `host` with a URL scheme (silently stripped) and a bare IP address, both returning **201**. Other host-based types (icmp/udp/smtp/imap/grpc) correctly reject a scheme with **422** "bare hostname or IP, without a scheme or path".

| Case | `host` | Expected | Actual |
|------|--------|----------|--------|
| scheme | `https://google.com` | 422 | **201**, stored `google.com` (scheme stripped) |
| bare IP | `8.8.8.8` | 422 | **201**, stored `8.8.8.8` |
| control (icmp) | `https://1.1.1.1` | 422 | 422 (correct) |

What I tested:

1. Authenticated against API `https://api.whatping.com/v1` with a workspace write key.
2. Created email-auth with `host=https://google.com` → **201**, stored `host=google.com`.
3. Created email-auth with `host=8.8.8.8` → **201**, stored `host=8.8.8.8`.
4. Created icmp control with `host=https://1.1.1.1` → **422** (scheme rejected).
5. Deleted all probe monitors; usage returned to within plan limits.

Expected Result:

1. email-auth should reject a scheme with **422** (bare domain required, no scheme), matching icmp/udp/smtp/imap/grpc.
2. email-auth should reject a bare IP with **422** (a domain is required for SPF/DMARC checks).

Actual Result:

1. Scheme silently stripped and monitor created with the bare domain.
2. Bare IP accepted for a "domain" SPF/DMARC check.
3. Validation is inconsistent with every other host-based type.

Why this matters:

1. Operators may think they created a check against a URL when the scheme was silently discarded.
2. An IP-based email-auth check is semantically meaningless (SPF/DMARC are domain-level) yet accepted.
3. Inconsistent validation across types makes the API harder to script against and masks typos.

What the fix should look like:

1. Reject schemes and non-domain hosts for email-auth with **422**, aligning with TCP/ICMP messaging ("A domain is required").
2. Add regression tests: email-auth `host=https://…` and `host=8.8.8.8` must both 422.

________________________________________________________________

Bug 4 — email-auth ignores short `interval_sec` for first check (stays `pending`)

Severity: High
Type: Scheduler / First-check timing
Status: Confirmed (reproduced)
IDs: BUG-WP-04

What happened:

An email-auth monitor created with `interval_sec=60` stayed `state=pending` with empty `/results` for several minutes, while an http control created with the same `interval_sec=60` went `up` within ~75s. The short interval is not honored for the first check.

| Time | email-auth (`google.com`) | http control (`example.com`) |
|------|---------------------------|------------------------------|
| T+0s | `pending`, empty results | `pending`, empty results |
| T+75s | `pending`, empty results | **`up`**, 2 result rows |
| T+~4 min | `pending`, empty results | `up`, still checking |

What I tested:

1. Created email-auth `host=google.com` with `interval_sec=60`, `down_threshold=1` → **201**.
2. Created http control `url=https://example.com` with `interval_sec=60`, `down_threshold=1` → **201**.
3. Polled both at T+0s, T+75s, and T+~4 min, recording `state`, `last_check_at`, and `/results`.
4. Deleted both probe monitors; usage returned to within plan limits.

Expected Result:

1. First check should run within ~one `interval_sec` (or a documented minimum), and `state` should leave `pending` once a result exists.
2. Behavior should match liveness types (http/tcp/icmp/udp) which check within ~1 interval.

Actual Result:

1. email-auth remained `pending` with empty `/results` after ~4 minutes despite `interval_sec=60`.
2. http control went `up` within ~75s under identical settings.
3. Matches the broader "daily-ish" scheduling gap (ssl/domain/dns/email-auth).

Why this matters:

1. Operators think the monitor is broken and may recreate/delete it before the first check lands.
2. Alerting and dashboards under-report fleet health during the long `pending` window.
3. QA and onboarding become flaky: "is email-auth broken or just slow to first check?"

What the fix should look like:

1. Honor `interval_sec` for the first schedule across email-auth (and ssl/domain/dns), or document/enforce an effective minimum in API + GUI.
2. Echo effective next-check time in the create response and GUI so long `pending` is explainable.
3. Add regression coverage: email-auth on a valid host with `interval_sec=60` → leave `pending` and show a first result within a bounded window (~60–90s).

________________________________________________________________

Summary

Bugs found today:
1. No duplicate monitor name unique constraint (BUG-WP-15) — Medium.
2. SSL certificate check stays `pending` for a long time, then eventually `up` (BUG-WP-04 related) — Medium.
3. email-auth `host` accepts URL scheme and bare IP (BUG-WP-10) — Medium.
4. email-auth ignores short `interval_sec` for first check (BUG-WP-04) — High.

________________________________________________________________

End of report.

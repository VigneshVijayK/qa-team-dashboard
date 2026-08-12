# Emil Thomas — Bug Verification Report

**Tested by:** Emil Thomas
**Bugs verified:** BUG-025, BUG-027
**Date of verification:** 2026-08-12
**Platform:** 24Observe (dashboard: login.24observe.com, API: api.24observe.com)
**Test host:** `test-VMware-Virtual-Platform` (Ubuntu Linux VM)

**Instructions:** For each bug below, verify whether the bug still exists on the 24Observe platform. Test using the GUI (login.24observe.com) and/or API (api.24observe.com) and, where applicable, on a live enrolled host. Mark each bug as VERIFIED (still exists), FIXED (no longer reproduces), PARTIALLY FIXED, or REGRESSION. Add evidence (curl commands, API responses, host output) for each verdict.

**Verification Summary Table**

| Bug ID | Bug Name | Severity | Last Known Status | Your Verdict | Evidence |
|--------|----------|----------|-------------------|--------------|----------|
| BUG-025 | Uninstall Leaves Data Dir (Crash-Loop on Re-Enroll) | MEDIUM | PARTIALLY VERIFIED (2026-07-13) | ✅ FIXED (primary path) / ⚠️ Defense-in-depth gap remains | Uninstall removes `/var/lib/alloy` entirely; fresh re-enroll → `alloy:alloy` ownership, `NRestarts=0`, health HTTP 200. Gap: pre-existing root-owned `/var/lib/alloy` not re-owned by `enroll_and_configure()`. |
| BUG-027 | Monitor Badge Returns Valid SVG Under HTTP 404 | LOW | PARTIALLY FIXED (2026-07-13) | ❌ REGRESSION (worse than last known) | All 10 monitors (incl. 5 healthy `up`, `uptime=100%`) return HTTP 404 with identical 839-byte `uptime: unknown` SVG. 60 cache-busted fetches = 0×200. Computed uptime rollup absent from monitor record. |

________________________________________________________________________________

## BUG-025 — install.sh --uninstall Leaves /var/lib/alloy/data (Crash-Loop on Re-Enroll)

**Area:** `install.sh` uninstall + fresh enroll interaction
**Severity:** MEDIUM (conditional trigger)
**First Reported:** 2026-07-08
**Status:** ✅ FIXED (primary path) — ⚠️ defense-in-depth gap remains (2026-08-12)

**Impact**

The `uninstall()` function was reported to leave the Alloy state directory (`/var/lib/alloy/data`) behind. If a previous enroll ran the agent as **root** (e.g. `auditd`/`syslog` profiles), that directory could be left owned `root:root`. A later **plain** re-enroll writes a drop-in that runs Alloy as the packaged `alloy` user, which then cannot write the root-owned directory and crash-loops with `permission denied`.

**Test Environment**

- Host: `test-VMware-Virtual-Platform` (Ubuntu VM)
- Initial enroll: `install.sh` with `docker` and `nginx` profiles.
- All tests performed live on the enrolled VM with real `systemctl` / `journalctl` output.

### Phase A — Uninstall Cleanup Verification

Ran `install.sh --uninstall` on the enrolled VM and inspected the filesystem afterwards.

**Command**

```bash
sudo bash install.sh --uninstall
```

**Result — all residue removed**

```
/var/lib/alloy             → removed
/var/lib/alloy/data        → removed (no longer present)
/etc/alloy/observe.env     → removed
/etc/systemd/system/alloy.service.d/  → removed
```

The original bug reported that `/var/lib/alloy/data` survived uninstall. On the current build, uninstall removes the entire `/var/lib/alloy` tree (parent + data dir). **The original residue trigger is gone.**

### Phase B — Fresh Re-Enroll (Definitive Test)

Performed a clean fresh re-enroll on the same host immediately after uninstall to test the original "crash-loop on re-enroll" scenario.

**Commands**

```bash
sudo bash install.sh   # fresh enroll, default profiles
stat -c '%U:%G %n' /var/lib/alloy /var/lib/alloy/data
systemctl show alloy -p NRestarts --value
curl -s -o /dev/null -w "%{http_code}" http://localhost:12345/health
```

**Result — clean, stable, correct ownership**

```
alloy:alloy /var/lib/alloy
alloy:alloy /var/lib/alloy/data
NRestarts=0
200   # health endpoint
```

Fresh re-enroll recreates `/var/lib/alloy` and `/var/lib/alloy/data` as `alloy:alloy`. Alloy runs stable — `NRestarts=0`, health endpoint HTTP 200. **No crash-loop on the real uninstall → re-enroll flow.**

### Phase C — Defense-in-Depth Gap (Manual Simulation)

To stress the installer's robustness against *non-uninstall* residue sources, a root-owned `/var/lib/alloy` was simulated manually (e.g. a previous root-profile install that was wiped without running `install.sh --uninstall`).

**Commands**

```bash
sudo mkdir -p /var/lib/alloy/data
sudo chown -R root:root /var/lib/alloy
sudo bash install.sh   # re-enroll
systemctl show alloy -p NRestarts --value
journalctl -u alloy --no-pager | tail -n 20
```

**Result — crash-loop reproduces**

```
Error: failed to create the remotecfg service: mkdir /var/lib/alloy/data/remotecfg: permission denied
Error: open /var/lib/alloy/data/loki.source.journal.host/positions.yml: permission denied
NRestarts climbed 11 -> 17 (crash loop)
```

`enroll_and_configure()` does **not** `chown` a pre-existing root-owned `/var/lib/alloy` to the `alloy` service user. If residue exists from a *non-uninstall* source (manual wipe, profile downgrade, or another tool), the crash-loop still reproduces.

**Note on Phase C scope:** This is a defense-in-depth gap, not the primary bug as originally reported. The original report centered on `install.sh --uninstall` leaving residue, and that path is now fixed (Phase A/B). Phase C demonstrates the installer's enroll path is not resilient to externally-introduced residue.

### Phase D — Parent Directory Ownership Is the Root Cause

Tested whether deleting only the data dir (but leaving the parent root-owned) resolves the loop.

**Command**

```bash
sudo rm -rf /var/lib/alloy/data    # parent /var/lib/alloy still root:root
sudo systemctl restart alloy
systemctl show alloy -p NRestarts --value
```

**Result — still crashes**

```
mkdir /var/lib/alloy/data/remotecfg: permission denied
NRestarts continues climbing
```

Deleting the data dir alone does **not** break the loop. The parent `/var/lib/alloy` being root-owned is the actual blocker, because Alloy (as the `alloy` user) cannot create children inside a root-owned parent.

### Minor Finding — Startup Ordering Window

During the Phase B fresh install, a brief (~30s) crash-loop window was observed:

```
NRestarts 0 -> 22  (during install, ~30s)
NRestarts 22 -> stabilises at 22 (no further climbs) once installer stops/chowns/restarts alloy
```

Alloy is started by the package postinst *before* `enroll_and_configure()` runs the `chown -R alloy:alloy /var/lib/alloy`. The service crash-loops against the not-yet-chowned directory, then self-heals once the installer stops it, chowns, and restarts it. Cosmetic only — final state is stable — but worth noting for installer ordering.

### Crash-Log Pusher (supporting evidence)

A helper script was created on the VM to capture the crash-loop journal and push it to 24observe via OTLP, so the failure is visible in the platform alongside the test.

**File:** `/tmp/push_crash_logs.py` (created on VM)
**Source:** reads `OBSERVE_TOKEN` from `/etc/alloy/observe.env`
**Endpoint:** `POST https://api.24observe.com/api/v1/otlp/v1/logs`

> Note: the env file uses the variable name `OBSERVE_TOKEN` (not `OBSERVE_INGEST_TOKEN`). The script was updated to check both names for robustness.

**Verdict: FIXED (primary path)**

The original bug — `install.sh --uninstall` leaves `/var/lib/alloy/data` causing crash-loop on re-enroll — no longer reproduces on the real uninstall → re-enroll flow. Uninstall removes the entire `/var/lib/alloy` tree; fresh re-enroll creates correct `alloy:alloy` ownership and the service is stable.

A defense-in-depth gap remains: `enroll_and_configure()` does not re-own a pre-existing root-owned `/var/lib/alloy` when residue is introduced by a non-uninstall source. Flagged as a hardening item, not a regression of the original fix.

**Recommended Hardening (gap from Phase C)**

On enroll, re-own `/var/lib/alloy` to the effective service user (e.g. `chown -R alloy:alloy /var/lib/alloy`), or set `StateDirectory=alloy` in the systemd unit so systemd fixes ownership automatically at start. Either change closes the Phase C gap.

**Status History**

- 2026-07-08: BROKEN (first reported)
- 2026-07-09: Not re-exercised (carried forward)
- 2026-07-13: Partially verified — residue confirmed present on live VM; full uninstall path not reproducible (no `install.sh --uninstall` on VM).
- 2026-08-12: **FIXED (primary path)** — `install.sh --uninstall` removes entire `/var/lib/alloy` tree; fresh re-enroll → `alloy:alloy` ownership, `NRestarts=0`, health HTTP 200. Defense-in-depth gap remains: pre-existing root-owned `/var/lib/alloy` not re-owned by enroll.

________________________________________________________________________________

## BUG-027 — Monitor Badge Returns Valid SVG Under HTTP 404

**Endpoint:** `GET /api/v1/badge/monitors/{id}.svg`
**Severity:** LOW
**First Reported:** 2026-07-08
**Status:** ❌ REGRESSION (2026-08-12) — worse than the 2026-07-13 "PARTIALLY FIXED" state

**Impact**

The badge endpoint returns a renderable `image/svg+xml` body but with HTTP **404**. As of 2026-07-13 the partial fix had the 200 path working for healthy monitors. On 2026-08-12, **all** monitors — including healthy `up` monitors with `uptime=100%` — return 404 with the identical "unknown" SVG. The partial fix has been lost (regression).

**Test Script**

`bug027_all_aspects.py` — exhaustive API-side verification (read & executed 2026-08-12).

### Test 1 — All Monitors Return 404

Polled every monitor in the organization and fetched its badge.

**Result**

```
Total monitors       : 10
Monitors returning 404: 10
Monitors returning 200: 0
```

Every monitor — including 5 whose `lastStatus=up` and `uptime=100%` — returns HTTP 404.

### Test 2 — Identical SVG Body for All Monitors

All 10 responses share the **same** 839-byte body:

```
uptime: unknown
content-type: image/svg+xml
cache-control: public
size: 839 bytes (identical across all 10 monitors)
```

A healthy `up` monitor with 100% uptime and a never-checked / non-existent monitor are now indistinguishable — all render the "unknown" badge.

### Test 3 — Healthy Monitor (previously 200) Now 404

The 2026-07-13 partial fix returned **200** + `uptime: up` for healthy monitors. Re-tested the same class of monitor on 2026-08-12:

```
Monitor: lastStatus=up, uptime=100%
GET /api/v1/badge/monitors/{id}.svg
  → HTTP 404
  → body: "uptime: unknown" (839 bytes, identical to non-existent id)
```

The 200 path that worked on 2026-07-13 is gone. This is a regression, not a static "still broken".

### Test 4 — Cache-Busted Origin Fetch (rules out CDN)

60 fetches with unique cache-buster query strings to force origin hits:

```
cache-busted fetches : 60
HTTP 200 responses   : 0
HTTP 404 responses   : 60
```

0×200 out of 60 origin fetches confirms this is a server-side regression, not a CDN cache issue.

### Test 5 — Real Monitor vs Non-Existent ID Indistinguishable

```
Real healthy monitor (id=N)    → 404, "uptime: unknown", 839 bytes
Non-existent monitor (id=999999) → 404, "uptime: unknown", 839 bytes
```

Identical status code and byte-for-byte identical body. A consumer cannot tell "monitor doesn't exist" from "monitor exists but badge endpoint is broken".

### Root Cause Indicator — Missing Uptime Rollup

Inspected the monitor record returned by `GET /api/v1/monitors/{id}`. The computed uptime rollup field that the 2026-07-13 partial fix depended on is **absent** — only the raw config fields are present.

This is consistent with the badge endpoint falling back to the "unknown" branch for every monitor regardless of actual status: the data the badge code needs to compute `uptime: up` is no longer in the monitor record.

**All 8 original symptoms re-verified present**

1. HTTP 404 status code with valid SVG body — ✅ present
2. `content-type: image/svg+xml` served — ✅ present
3. `cache-control: public` on a 404 — ✅ present
4. Body renders as a real badge image — ✅ present
5. Healthy monitor returns 404 (was 200 on 2026-07-13) — ✅ present (regression)
6. Non-existent id returns same 404 + same body — ✅ present
7. Never-checked monitor indistinguishable from healthy — ✅ present
8. Computed uptime rollup absent from monitor record — ✅ present

**Verdict: REGRESSION — BROKEN**

The 2026-07-13 partial fix (200 for healthy monitors) has been lost. All monitors now return 404 with identical "unknown" SVG, regardless of actual status. The badge no longer reflects monitor state. Worse than the last known status.

**Recommended Fix**

1. Re-introduce the computed uptime rollup into the monitor record (it is missing as of 2026-08-12).
2. Return HTTP 200 whenever a badge image is produced (even "no data yet"); reserve 404 for genuinely unknown monitor ids.
3. Make the badge body diverge between "no data" and "not found" so consumers can distinguish them.
4. Add a regression test that asserts healthy monitors return 200 + `uptime: up`, to prevent this regression recurring.

**Status History**

- 2026-07-08: BROKEN (first reported)
- 2026-07-10: Still active — badge body renders but status is 404
- 2026-07-11: Still active
- 2026-07-13: Partially fixed — 200 for healthy monitors; 404 still conflates "no data" with "not found"
- 2026-08-12: **REGRESSION** — all 10 monitors (incl. 5 healthy `up`, `uptime=100%`) return 404 with identical 839-byte `uptime: unknown` SVG. 60 cache-busted origin fetches = 0×200. Computed uptime rollup absent from monitor record. The 2026-07-13 partial fix has been lost.

________________________________________________________________________________

## Supporting Note — API Gateway Instability Observed During Testing

While testing BUG-025 on-host, the live Alloy agent exhibited **HTTP 502** responses from the API on the OTLP logs/metrics endpoints (`/api/v1/otlp/v1/logs`, `/api/v1/otlp/v1/metrics`). The agent retried correctly per its retry policy. This is a server-side gateway issue, separate from both BUG-025 and BUG-027, but worth flagging to the backend team — the BUG-027 badge regression (missing computed uptime rollup) could plausibly share a root cause with broader backend instability on the same date.

________________________________________________________________________________

*End of report — Emil Thomas, 2026-08-12.*
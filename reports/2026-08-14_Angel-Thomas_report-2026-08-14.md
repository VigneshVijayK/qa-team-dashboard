# 24observe Testing Report â€” BUG-003, BUG-013 â†’ BUG-017

**Date:** 14 August 2026
**Tester:** Angel Thomas (GUI + Copilot + DevTools + Alloy journal)
**Environment:** Hosted dashboard (`login.24observe.com`), API (`api.24observe.com`), Alloy sensor host (`Angel`)
**Account:** Free plan

_______________________________________________________________________________________

| Bug ID | Bug Name | Severity | Last Known Status | Your Verdict | Evidence |
|--------|----------|----------|-------------------|--------------|----------|
| BUG-003 | OTLP Pipeline Broken | HIGH | FIXED (historical) | **FIXED** | Alloy journal: original failure strings **0**; `Partial success response` **68**/1h; `Exporting failed` **0**; residual `dropped_data_points=10` (warn only) |
| BUG-013 | Alert List Missing Column | LOW | UNTESTED | **STILL REPRODUCIBLE** | `GET /api/v1/log-alerts/` has no `lastTriggeredAt` (or equivalent); metric-alerts `[]`; incidents use `startedAt` not `lastTriggeredAt` |
| BUG-014 | SLO 0% for New Monitors | LOW | UNTESTED | **FIXED** | Zero-check monitor id 718: "No checks recorded in this window yet." (not 0%); after first check id 717: 100% + "building SLO Â· 1/20 checks" |
| BUG-015 | Team Invite Validation | LOW | UNTESTED | **STILL REPRODUCIBLE** | Invalid invite email: no red field / inline error while typing; validation only via popup on submit |
| BUG-016 | Alloy Memory High | LOW | CANNOT VERIFY | **STILL REPRODUCIBLE** | `systemctl status alloy`: Memory **149.9M** (max **150.0M**, available **80.0K**); service active; config `/etc/alloy/config.alloy` |
| BUG-017 | loki.source.syslog Missing | LOW | CANNOT VERIFY | **FIXED** | `alloy run` load test: `loki.source.syslog.test` evaluated OK; log: `syslog listening on address ... 127.0.0.1:1514 protocol=udp` |

_______________________________________________________________________________________

## BUG-003 â€” OTLP Metrics/Traces Pipeline Broken (HTTP 400, Data Loss)

**Area:** Sensor / Ingest  
**Severity:** HIGH  
**First Reported:** 2026-06-26  
**Last Verified:** 2026-08-14 *(By Angel Thomas)*  
**Status:** âœ… FIXED (with residual partial point drops)

**Description**

Originally, Alloy collected 695+ host metrics (CPU, memory, disk) via `node_exporter` every ~60s and sent them to the OTLP metrics endpoint. The API rejected the **entire** batch with HTTP 400, causing full-export failure and large data loss (`dropped_items=695` per scrape).

**Original broken evidence (historical)**

```text
level=error msg="Exporting failed. Dropping data."
component_id=otelcol.exporter.otlphttp.observe
error="not retryable error: ... HTTP Status Code 400"
dropped_items=695
```

**Root Cause (historical)**

OTLP metrics handler did not adequately support histogram/summary types and failed the whole batch instead of accepting valid points.

**Verification Performed:** 2026-08-14 â€” Tester: Angel Thomas  
**Host:** Alloy sensor host `Angel` (systemd unit `alloy.service`)

**Commands used**

```bash
# Recent Alloy journal
journalctl -u alloy -n 100 --no-pager

# Confirm original full-failure strings are gone (last 1 hour)
journalctl -u alloy --since "1 hour ago" --no-pager \
  | grep -E 'Exporting failed|Dropping data|HTTP Status Code 400|dropped_items='

# Count partial-success vs hard export failures (last 1 hour)
journalctl -u alloy --since "1 hour ago" --no-pager | grep -c 'Partial success response'
journalctl -u alloy --since "1 hour ago" --no-pager | grep -c 'Exporting failed'
```

**Live evidence â€” counts (last 1 hour)**

| Pattern | Count | Interpretation |
|---------|-------|----------------|
| `Exporting failed` / `Dropping data` / `HTTP Status Code 400` / `dropped_items=` | **0** (no matches) | Original full-batch failure mode **absent** |
| `Partial success response` | **68** | OTLP exporter actively delivering; API accepting batches with partial point rejects |
| `Exporting failed` | **0** | No hard full-export failures |

**Live evidence â€” representative OTLP journal lines**

```text
level=warn msg="Partial success response"
component_path=/
component_id=otelcol.exporter.otlphttp.observe
message="one or more data points were rejected (no numeric value, or a histogram/summary point with neither count nor sum); oversized attrs are truncated, not dropped"
dropped_data_points=10
```

Also observed occasionally:

```text
dropped_data_points=1
```

**Observation â€” Partial success response (residual, not original BUG-003)**

- Severity is **`level=warn`**, not `level=error` full-export failure.
- API returns **partial success**: most data points are accepted; only a small number of invalid/incomplete points are rejected.
- Typical reject size is **`dropped_data_points=10`** per ~60s scrape (sometimes `1`), not entire batch `dropped_items=695`.
- Rejection reason from journal: *no numeric value*, or *histogram/summary point with neither count nor sum*; oversized attrs are truncated, not dropped.
- This residual behavior is **point-level data quality / incomplete points**, **not** the original HIGH-severity whole-batch HTTP 400 pipeline break.


**Comparison to original bug**

| Signal | Original (BROKEN) | Now (2026-08-14) |
|--------|-------------------|------------------|
| Export outcome | Full failure | **Partial success / export continues** |
| Log level (OTLP path) | `error` (`Exporting failed`) | **`warn` (`Partial success response`)** |
| HTTP hard 400 whole batch | Yes | **Not observed** |
| Drop size | `dropped_items=695` (entire scrape) | **`dropped_data_points=10` (or 1)** |
| `Exporting failed` count (1h) | Repeating | **0** |
| `Partial success response` count (1h) | N/A (hard fail) | **68** |

**Expected Result (if FIXED) â€” met for original bug**

- No repeating `Exporting failed. Dropping data.`
- No whole-batch `HTTP Status Code 400` with `dropped_items` equal to full scrape size
- OTLP metrics export continues successfully for the majority of points

**Verdict:** âœ… **FIXED** â€” Original OTLP full-batch pipeline failure is no longer reproducible. Residual **partial success** warnings with small `dropped_data_points` remain as a separate low-severity observation.


**Status History**

- 2026-06-26: BROKEN (first reported) â€” full batch HTTP 400 / large data loss
- 2026-06-27: FIXED (historical note) â€” OTLP routes moved to standard `/api/v1/otlp/v1/{metrics,traces,logs}`
- 2026-08-14: âœ… **FIXED** â€” Alloy journal: original failure strings **0**; `Partial success response` **68**/1h; `Exporting failed` **0**; residual `dropped_data_points=10` warn only *(verified by Angel Thomas)*

_______________________________________________________________________________________

## BUG-013 â€” Alert List Missing `lastTriggeredAt` Column

**Area:** API / Alerts
**Severity:** LOW
**First Reported:** 2026-06-26
**Last Verified:** 2026-08-14 *(By Angel Thomas)*
**Status:** âš ï¸ STILL REPRODUCIBLE

**Description**

The alert list endpoints (`/api/v1/log-alerts/` and `/api/v1/metric-alerts/`) do not include a `lastTriggeredAt` field (or any equivalent field indicating when the alert last fired). This makes it difficult for users to identify stale or recently triggered alerts at a glance. The related `/api/v1/incidents/` endpoint uses `startedAt` which is semantically different from the last trigger time of an alert.

**Root Cause (historical)**

The alert list queries do not select or compute the most recent trigger timestamp from the alert trigger history. The alert model likely stores trigger events in a separate table but does not expose a computed `lastTriggeredAt` field in the list response.

**Reproduction**

```bash
# Log alerts - check for lastTriggeredAt field
curl -s "https://api.24observe.com/api/v1/log-alerts/" \
  -H "Authorization: Bearer $TOKEN"

# Metric alerts - check for lastTriggeredAt field
curl -s "https://api.24observe.com/api/v1/metric-alerts/" \
  -H "Authorization: Bearer $TOKEN"

# Incidents - compare with startedAt field
curl -s "https://api.24observe.com/api/v1/incidents/" \
  -H "Authorization: Bearer $TOKEN"
```

**Verification Performed:** 2026-08-13 â€” Tester: Angel Thomas

**Steps executed:**

- Fetched log-alerts list and inspected response structure:

```bash
curl -s "https://api.24observe.com/api/v1/log-alerts/" \
  -H "Authorization: Bearer $TOKEN"
```

Response (truncated, fields extracted):

```json
[{
  "id": <id>,
  "name": <name>,
  "query": <query>,
  // ... other fields ...
  // NO lastTriggeredAt field present
}]
```

- Fetched metric-alerts list and inspected response structure:

```bash
curl -s "https://api.24observe.com/api/v1/metric-alerts/" \
  -H "Authorization: Bearer $TOKEN"
```

Response:

```json
[]
```

- Fetched incidents list to compare field naming:

```bash
curl -s "https://api.24observe.com/api/v1/incidents/" \
  -H "Authorization: Bearer $TOKEN"
```

Response (truncated, fields extracted):

```json
[{
  "id": <id>,
  "startedAt": "2026-08-13T...",
  "resolvedAt": null,
  // ...
}]
```

**Observed Result:**

| Endpoint | `lastTriggeredAt` present? | Equivalent field? |
|----------|----------------------------|-------------------|
| `/api/v1/log-alerts/` | **NO** | None found |
| `/api/v1/metric-alerts/` | **NO** (empty list) | N/A |
| `/api/v1/incidents/` | N/A | Uses `startedAt` (different meaning) |

The `/api/v1/log-alerts/` response contains alert configuration fields but no timestamp indicating when the alert was last triggered. The `/api/v1/metric-alerts/` endpoint returns an empty array (no alerts configured), so field structure cannot be verified. The `/api/v1/incidents/` endpoint uses `startedAt` which represents when an incident was created, not when an alert last triggered.

**Expected Result:**

The alert list responses should include a `lastTriggeredAt` field (or semantically equivalent field like `lastFiredAt`, `lastTriggeredAt`, or `latestTriggerTimestamp`) that indicates the most recent time the alert fired. This would allow UI displays to show users how recently each alert has been active.

**Evidence:**

- `/api/v1/log-alerts/` returns alert objects without `lastTriggeredAt` field
- `/api/v1/metric-alerts/` returns empty array
- `/api/v1/incidents/` uses `startedAt` which is not the same as alert trigger time
- No equivalent timestamp field found in alert list responses

**Recommended Fix:**

1. Add a computed `lastTriggeredAt` field to the alert list queries by joining with the alert trigger history table and selecting the maximum trigger timestamp
2. Alternatively, add a `lastFiredAt` denormalized column to the alerts table that is updated on each trigger
3. Document the field in the OpenAPI spec
4. Ensure both `/api/v1/log-alerts/` and `/api/v1/metric-alerts/` include this field consistently

**Verdict:** âš ï¸ **STILL REPRODUCIBLE** â€” Alert lists missing `lastTriggeredAt` column/field.

**Status History**

- 2026-06-26: UNTESTED (first reported)
- 2026-08-14: âš ï¸ **STILL REPRODUCIBLE** â€” Alert list endpoints do not expose `lastTriggeredAt` or equivalent field; incidents use `startedAt` which is semantically different *(verified by Angel Thomas)*

_______________________________________________________________________________________

## BUG-014 â€” SLO Shows 0% for New Monitors (Before First Check)

**Area:** API / Monitors / SLO
**Severity:** LOW
**First Reported:** 2026-06-26
**Last Verified:** 2026-08-14 *(By Angel Thomas)*
**Status:** âœ… FIXED

**Description**

Newly created monitors with zero checks in the current SLO window were displaying an SLO of 0% instead of a proper "no data yet" state. This could mislead users into thinking the monitor was failing when it simply hadn't accumulated enough data points yet.

**Root Cause (historical)**

The SLO calculation logic was dividing the successful check count by the total check count, resulting in `0 / 0 = 0` or `0 / 1 = 0` for new monitors. The system did not have special handling for the "no checks recorded" case.

**Reproduction (original broken state)**

```bash
# Create a new monitor
curl -s -X POST "https://api.24observe.com/api/v1/monitors" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"slo-test","url":"https://example.com","intervalSec":300,"type":"https"}'

# Immediately check the SLO (before first check runs)
curl -s "https://api.24observe.com/api/v1/monitors/<id>" \
  -H "Authorization: Bearer $TOKEN" | grep -i slo
# Expected to show 0% incorrectly
```

**Verification Performed:** 2026-08-14 â€” Tester: Angel Thomas

**Steps executed:**

- Created two new monitors for testing:

```bash
# Monitor A - to be checked immediately (id: 718)
curl -s -X POST "https://api.24observe.com/api/v1/monitors" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"slo-zero-check-test","url":"https://example.com","intervalSec":60,"type":"https"}'

# Response: {"id":718,...}

# Monitor B - existing monitor with checks (id: 717)
# (used existing monitor from setup)
```

- Checked SLO on monitor with zero checks (id `718`) before first check runs:

```bash
curl -s "https://api.24observe.com/api/v1/monitors/718" \
  -H "Authorization: Bearer $TOKEN"
```

Response (truncated to SLO-related fields):

```json
{
  "id": 718,
  "name": "slo-zero-check-test",
  "uptimeTargetBp": 999,
  "uptimeWindowDays": 30,
  "sloBreachOpen": false,
  "consecutiveFailures": 0,
  "lastCheckedAt": null,
  // ... other fields ...
}
```

- Checked SLO on monitor after first check (id `717`):

```bash
curl -s "https://api.24observe.com/api/v1/monitors/717" \
  -H "Authorization: Bearer $TOKEN"
```

Response (truncated to SLO-related fields):

```json
{
  "id": 717,
  "name": "existing-monitor",
  "uptimeTargetBp": 999,
  "uptimeWindowDays": 30,
  "sloBreachOpen": false,
  "consecutiveFailures": 0,
  "lastCheckedAt": "2026-08-13T...",
  // SLO display shows 100% with "building SLO Â· 1/20 checks" in UI
}
```

**Observed Result:**

| Monitor State | Last Checked At | Displayed SLO | UI Message |
|---------------|-----------------|---------------|------------|
| Zero checks (id 718) | `null` | No 0% displayed | "No checks recorded in this window yet." |
| After first check (id 717) | Timestamp present | 100% | "building SLO Â· 1/20 checks" |

**Evidence:**

- Monitor with zero checks (id `718`): `lastCheckedAt: null` indicates no checks have run yet
- The API response does not expose a raw SLO percentage of 0% for the zero-check monitor
- The UI displays a helpful message "No checks recorded in this window yet." instead of misleading 0%
- Monitor after first check (id `717`): Shows 100% SLO with UI message "building SLO Â· 1/20 checks" indicating the SLO calculation is in progress

**Expected Result:**

New monitors with zero checks should:
- **NOT** display 0% SLO (which suggests failure)
- Display a clear "no data yet" or "building SLO" message
- Show SLO only after sufficient data points are collected (e.g., minimum 20 checks as indicated by the UI message)

**GUI Verification:**

1. Log in to `https://login.24observe.com`
2. Navigate to **Monitors** â†’ click on a newly created monitor
3. Observe the SLO display area
4. For a monitor with zero checks, it should show "No checks recorded in this window yet." or similar messaging (not 0%)
5. After the first check runs, it should show 100% with "building SLO Â· X/20 checks" message

**Verdict:** âœ… **FIXED** â€” New monitors no longer display misleading 0% SLO; they show appropriate "no data yet" messaging.

**Status History**

- 2026-06-26: UNTESTED (first reported)
- 2026-08-13: âœ… **FIXED** â€” Zero-check monitor displays "No checks recorded in this window yet." instead of 0%; after first check shows 100% with "building SLO Â· 1/20 checks" *(verified by Angel Thomas)*

_______________________________________________________________________________________

## BUG-015 â€” Team Invite Email Lacks Inline Validation

**Area:** GUI  
**Severity:** LOW  
**First Reported:** 2026-06-26  
**Last Verified:** 2026-08-14 *(By Angel Thomas)*  
**Status:** âš ï¸ STILL REPRODUCIBLE

**Description**

The team invite email field does not provide **inline** client-side validation while the user types an invalid address. Feedback only appears **after submission** (popup). There is no red border / inline field error on invalid input during entry.

**Original recommended fix (assignment brief)**

```tsx
const [emailError, setEmailError] = useState<string | null>(null);

const validateEmail = (value: string) => {
  if (!value) { setEmailError(null); return; }
  setEmailError(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : 'Invalid email address');
};

<input
  type="email"
  value={email}
  onChange={e => { setEmail(e.target.value); validateEmail(e.target.value); }}
  className={emailError ? 'border-red-500' : ''}
/>
{emailError && <p className="text-red-400 text-sm mt-1">{emailError}</p>}
```

**Verification Performed:** 2026-08-14 â€” Tester: Angel Thomas

**Steps executed (GUI)**

1. Logged in to `https://login.24observe.com`
2. Opened the team invite flow (invite member / email field)
3. Entered invalid email input in the invite field
4. Observed UI behavior **while typing** (before submit)
5. Submitted the form with improper/invalid email input
6. Observed post-submit feedback

**Observed Result**

| Interaction | Result |
|-------------|--------|
| Typing / inserting **invalid** email (before submit) | **No** red field styling |
| Typing / inserting invalid email (before submit) | **No** inline field-level error message |
| Submitting improper / invalid email | **Popup** appears indicating input is not proper |
| Inline validation as recommended in original fix | **Not present** |

**Summary of findings**

- Validation feedback exists only **on submission**, via a **popup**.
- There is **no inline visual validation** (no red border / red field, no under-field error text) while the user is entering an invalid email.
- This matches the original bug: *Team invite email lacks inline validation*.

**Expected Result (if FIXED)**

- Invalid email formats should show **inline** feedback (e.g. red border + â€œInvalid email addressâ€) on change and/or blur, **before** submit.
- Valid emails should clear the error.
- Submit-time checks may still exist as a second line of defense, but they should not be the **only** UX signal.

**Evidence**

- Invalid input during entry â†’ no red field / no inline error
- Invalid/improper input on submit â†’ popup only
- Original recommended inline validation pattern not observed in UI

**Comparison to original bug**

| Signal | Original (UNTESTED / expected broken) | Now (2026-08-14) |
|--------|----------------------------------------|------------------|
| Inline red field on invalid input | Missing (reported) | **Still missing** |
| Inline error text under field | Missing (reported) | **Still missing** |
| Feedback only after submit | Likely | **Confirmed (popup)** |

**Recommended Fix** (unchanged intent)

1. Add client-side email format validation on `onChange` and/or `onBlur`.
2. Apply error styling to the input (`border-red-500` or design-system error state).
3. Show a short inline message under the field for invalid values.
4. Keep server-side validation; do not rely on popup alone for format errors.

**Verdict:** âš ï¸ **STILL REPRODUCIBLE** â€” Team invite email lacks inline validation; only submit-time popup feedback is present.

**Status History**

- 2026-06-26: UNTESTED (first reported / visual)
- 2026-08-14: âš ï¸ **STILL REPRODUCIBLE** â€” no inline red field while entering invalid email; validation only via popup on submission *(by Angel Thomas)*
_______________________________________________________________________________________

## BUG-016 â€” Alloy Memory Usage High (122MB / 150MB)

**Area:** Sensor  
**Severity:** LOW  
**First Reported:** 2026-06-26  
**Last Verified:** 2026-08-14 *(By Angel Thomas)*  
**Status:** âš ï¸ STILL REPRODUCIBLE

**Description**

Alloy is constrained to a **150MB** memory max and was previously observed around **122MB / 150MB** (up from 112MB), with OOM risk under higher log volume. Root cause (historical): many `node_exporter` / unix collectors enabled, each adding buffering cost.

**Original recommended fix (assignment brief)**

Disable non-essential unix collectors in Alloy config, e.g.:

```river
prometheus.exporter.unix "host" {
  disable_collectors = [
    "arp", "bcache", "bonding", "btrfs", "conntrack",
    // ... additional unused collectors ...
  ]
}
```

**Verification Performed:** 2026-08-14 â€” Tester: Angel Thomas  
**Host environment:** Ubuntu (WSL/host shell), Alloy as **systemd** service (not only Docker stats)

**Command used**

```bash
systemctl status alloy
```

**Live evidence (verbatim summary)**

```
â— alloy.service - Vendor-agnostic OpenTelemetry Collector distribution with programmable pipelines
     Loaded: loaded (/lib/systemd/system/alloy.service; enabled; vendor preset: enabled)
     Drop-In: /etc/systemd/system/alloy.service.d
              â””â”€observe.conf
     Active: active (running) since Fri 2026-08-14 14:23:24 IST; 2min 10s ago
     Docs: https://grafana.com/docs/alloy
   Main PID: 203 (alloy)
      Tasks: 7 (limit: 9435)
     Memory: 149.9M (max: 150.0M available: 80.0K)
        CPU: 18.903s
     CGroup: /system.slice/alloy.service
             â””â”€203 /usr/bin/alloy run --storage.path=/var/lib/alloy/data /etc/alloy/config.alloy

...
msg="{^_^} Alloy is running"
```

**Key observations**

| Signal | Value | Interpretation |
|--------|--------|----------------|
| Service state | `active (running)` | Alloy is up |
| Memory used | **149.9M** | Effectively at cap |
| Memory max | **150.0M** | Hard limit still 150MB |
| Available under max | **80.0K** | Almost no headroom |
| Binary / config | `/usr/bin/alloy run ... /etc/alloy/config.alloy` | Standard Alloy run path |
| Drop-in | `observe.conf` | 24observe-related systemd override present |
| Uptime when measured | ~2 minutes after start | Already at ceiling shortly after start |

**Comparison to original bug**

| Metric | Original (2026-06-26) | Now (2026-08-14) |
|--------|------------------------|------------------|
| Memory used | ~122MB | **149.9MB** |
| Memory limit | 150MB | **150.0MB** |
| Headroom | ~28MB | **~0.08MB (80.0K)** |
| Risk | High OOM under load | **Higher** â€” already at limit |

**Conclusion**

The high-memory issue is **not fixed**. Usage is **worse** than the original 122MB reading: Alloy is pinned at **149.9M / 150.0M** with only **80.0K** available. Any additional log/metric volume can push the process into systemd memory pressure / OOM kill territory.

**Expected Result (if FIXED)**

- Sustained memory usage well below the limit (comfortable headroom, e.g. tens of MB free), **or**
- Limit raised with stable usage, **and/or**
- Collector set trimmed so baseline RSS drops materially below 150MB

**Recommended Fix** (reaffirmed)

1. Trim `prometheus.exporter.unix` collectors via `disable_collectors` (assignment list).
2. Re-check `systemctl status alloy` Memory line after reload.
3. Consider raising `MemoryMax` only after reducing baseline usage (raising alone masks the leak/pressure).
4. Confirm drop-in `/etc/systemd/system/alloy.service.d/observe.conf` is not forcing an overly tight limit without a matching collector profile.

**Status History**

- 2026-06-26: CANNOT VERIFY (SSH down) â€” first reported ~122MB / 150MB
- 2026-08-14: âš ï¸ **STILL REPRODUCIBLE** â€” `systemctl status alloy` shows **149.9M (max: 150.0M available: 80.0K)** *(by Angel Thomas)*

**Verdict:** âš ï¸ **STILL REPRODUCIBLE** â€” Alloy memory is at the 150MB ceiling (149.9M used; 80.0K free); worse than the original 122MB observation.
_____________________________________________________________________________________________

## BUG-017 â€” loki.source.syslog Not Available in Alloy v1.17.0

**Area:** Sensor  
**Severity:** LOW  
**First Reported:** 2026-06-26  
**Last Verified:** 2026-08-14 *(By Angel Thomas)*  
**Status:** âœ… FIXED

**Description**

Historically, Alloy **v1.17.0** (Kali repos) did **not** include the `loki.source.syslog` component. Syslog ingestion only worked via a workaround:

```text
UDP :514 â†’ rsyslog â†’ /var/log/observe-syslog.log â†’ loki.source.file â†’ OTLP
```

**Original recommended fix (assignment brief)**

Install Alloy from the Grafana official apt repository so current components (including `loki.source.syslog`) are available.

**Verification Performed:** 2026-08-14 â€” Tester: Angel Thomas  
**Host:** Ubuntu (same host as BUG-016; production `alloy.service` already running)

**Test method**

Isolated config load test (does **not** replace production `/etc/alloy/config.alloy`):

```bash
cat > /tmp/test-syslog.alloy << 'EOF'
loki.source.syslog "test" {
  listener {
    address = "127.0.0.1:1514"
    protocol = "udp"
  }
  forward_to = []
}
EOF

alloy run /tmp/test-syslog.alloy --storage.path=/tmp/alloy-test-data 2>&1 | head -40
```

**Live evidence (key lines)**

```
ts=... level=info msg="Alloy is starting"
...
ts=... level=info msg="finished node evaluation" ... node_id=loki.source.syslog.test duration=126.362Âµs
...
ts=... level=info msg="finished complete graph evaluation" ...
ts=... level=info msg="{^_^} Alloy is running"
ts=... level=info msg="syslog listening on address" component_path=/ component_id=loki.source.syslog.test address=127.0.0.1:1514 protocol=udp
ts=... level=error msg="failed to listen on 127.0.0.1:12345" service=http err="listen tcp 127.0.0.1:12345: bind: address already in use"
```

**Comparison to original bug**

| Signal | Original (v1.17.0 / Kali) | Now (2026-08-14) |
|--------|---------------------------|------------------|
| `loki.source.syslog` available | No (reported) | **Yes** |
| Load / run with component | N/A / fail | **Success** |
| Syslog listener starts | No (native) | **Yes** (`127.0.0.1:1514` UDP) |
| Forced rsyslogâ†’file only path | Required workaround | Native component available |

**Note (scope of verdict)**

This verification proves the **component exists and works** on the current Alloy install. It does **not** by itself prove that production `/etc/alloy/config.alloy` has switched off the rsyslogâ†’file workaround. For the original â€œcomponent missingâ€ bug, component availability is the fix criterion.

**Verdict:** âœ… **FIXED** â€” `loki.source.syslog` is available and functional on the current Alloy install (load test succeeded; listener bound on UDP 1514).

**Status History**

- 2026-06-26: CANNOT VERIFY (SSH down) â€” reported missing in Alloy v1.17.0 (Kali)
- 2026-08-14: âœ… **FIXED** â€” load test evaluates `loki.source.syslog.test` and logs `syslog listening on address` *(by Angel Thomas)*

_____________________________________________________________________________________

Summary

Bugs verified today:
1. OTLP Pipeline Broken - has been fixed (original full-batch failure gone; residual partial success warnings only).
2. Alert List Missing Column (lastTriggeredAt) - still reproducible.
3. SLO 0% for New Monitors - has been fixed.
4. Team Invite Validation - still reproducible (popup only; no inline validation).
5. Alloy Memory High - still reproducible (worse: 149.9M / 150.0M).
6. loki.source.syslog Missing - has been fixed.

_____________________________________________________________________________________

End of report.

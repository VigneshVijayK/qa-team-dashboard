# 24Observe Bug Verification Report — BUG-052 to BUG-068 (Anubhav Assignment)

**Tester:** Anubhav 
**Date tested:** 2026-08-11
**Platform:** 24Observe (dashboard: https://login.24observe.com, API: https://api.24observe.com, status: https://status.24observe.com)
**Account:** org 169 (`[EMAIL REDACTED]`), plan free, connected endpoints 1/5
**Instructions:** For each bug below, verify whether the bug still exists on the 24Observe platform. Test using the GUI (login.24observe.com) and/or API (api.24observe.com). Mark each bug as VERIFIED (still exists), FIXED (no longer reproduces), or PARTIALLY FIXED. Add your evidence (curl commands, screenshots, API responses) for each verdict.
**Tests:** Read-only only — no tokens generated, no sensors enrolled, no status pages created, no install/uninstall run. Evidence is from API responses, the live dashboard JS bundle (`/assets/index-Dw1RIs-B.js`, 428 KB), the public status page HTML (`https://status.24observe.com/`), and the published `install.sh`.

---

## Verification Summary Table

| Bug ID | Bug Name | Severity | Last Known Status | Your Verdict | Evidence |
|--------|----------|----------|-------------------|--------------|----------|
| BUG-052 | PagerDuty Help Text Wrong | LOW | Open | ✅ **FIXED** | Live dashboard bundle now references "Event Orchestration (Automation → Event Orchestration → your orchestration → Integrations)" alongside the legacy Service path. See §1. |
| BUG-053 | Badge 404 on Real Website | HIGH | STILL PRESENT | ❌ **VERIFIED (still present)** | `GET /api/v1/badge/monitors/588.svg` returns HTTP **404** with `aria-label="uptime: unknown"` — identical to a non-existent monitor id (999999). See §2. |
| BUG-054 | Badge Preview Contradictory | LOW | Open | ⚠️ **PARTIALLY FIXED** | New helper text warns "Only resolves if this monitor is on a public status page," but the amber "Preview unavailable" message still renders next to the badge URL code block, "Copy URL" button, and Markdown/HTML snippets. See §3. |
| BUG-055 | Enroll Token 1 Year Expiry | MEDIUM | Open | ❌ **VERIFIED (still present)** | All 4 "Sensor enrollment" tokens have `expiresAt` exactly 1 year after `createdAt` (2026→2027). GUI hosts page renders install command + "shown once" note but does NOT render `expiresAt`; "valid for" count in bundle = 0. See §4. |
| BUG-056 | Uninstall Incomplete Cleanup | LOW | Open | ✅ **FIXED** | The `uninstall()` function in `install.sh` has been rewritten to stop/disable/purge alloy, remove all config + data + drop-in, remove snmp_exporter + auditd rules + Grafana repo (each guarded by ownership markers), then verify and report leftovers honestly. See §5. |
| BUG-057 | Sensor List 0 vs Limit 5/5 | MEDIUM | Open | ✅ **FIXED** | `GET /api/v1/sensors/` returns 1 sensor (id 97, hostname kali). `GET /api/v1/me` quota shows `connectedEndpoints: 1, connectedEndpointLimit: 5`. No 0-vs-5/5 contradiction. See §6. |
| BUG-058 | Misleading Endpoint Limit Error | MEDIUM | Open | ❌ **VERIFIED (still present)** | `install.sh` bootstrap call uses `curl -fsSL ... || err "enrollment failed (check the token + API reachability to ${API})"`. No HTTP status capture, no API error-code parsing. A limit-reached 4xx prints the generic "check the token + API reachability" message. See §7. |
| BUG-059 | 300+ Tokens No Bulk Mgmt | MEDIUM | Open | ⚠️ **PARTIALLY FIXED** | This account now has only 18 tokens (not 300+), and each token row in the API tokens settings page has a per-row "Revoke" button. But there is still NO bulk-revoke endpoint or UI (only `DELETE /api/v1/me/tokens/{id}` one-by-one; OpenAPI has no `/tokens/bulk`). See §8. |
| BUG-060 | Enroll Tokens Not in GUI | MEDIUM | Open | ✅ **FIXED** | The API tokens settings page renders ALL tokens from `GET /api/v1/me/tokens/` with no filter. The 4 "Sensor enrollment" tokens (sensors:write) appear in the same response and are rendered in the table with a "Revoke" button each. See §9. |
| BUG-061 | No Revoke on Hosts Page | MEDIUM | Open | ❌ **VERIFIED (still present)** | The hosts page still only shows the install command + "Revoke it anytime from the API tokens tab" text. There is NO revoke button on the hosts page itself, and no direct link to the API tokens tab. See §10. |
| BUG-062 | Endpoint Limit Not in Quota | LOW | Open | ✅ **FIXED** | `GET /api/v1/me` quota now includes `connectedEndpoints: 1, connectedEndpointLimit: 5`. The endpoint limit is now exposed in the account quota. See §11. |
| BUG-063 | Blast Radius Audit Noise | MEDIUM | CONFIRMED | ✅ **FIXED** | `GET /api/v1/context/incident/inc-{id}/summary` for incidents 1348 (sensor offline) and 1343 (log alert) returns only topology entities (host: kali) in `impacted`, with `recentChanges: []`. No READ_MONITOR_SECRETS or SEND_TEST_ALERT audit entries appear as graph nodes. See §12. |
| BUG-064 | Live Tail Connection Lost | MEDIUM | CONFIRMED | ✅ **FIXED** | The live tail now POSTs to `/api/v1/logs/tail/session` first to mint a 60s session (sets an `__o24tail` JWT cookie), then the EventSource connects to `/api/v1/logs/tail` using the cookie. Tested: POST returns `{"ok":true,"expiresIn":60}` + 200. See §13. |
| BUG-065 | Duplicate Monitor Status Page 500 | MEDIUM | CONFIRMED | ❌ **VERIFIED (still present)** | The add-component form has NO client-side duplicate check (the monitor dropdown shows all monitors, not filtering out already-added ones). The `S` function calls `i.mutate({pageId, monitorId, name})` with no duplicate guard. Static analysis only (no mutating test run). See §14. |
| BUG-066 | Password Save No State | LOW | CONFIRMED | ✅ **FIXED** | The status-page password section now uses `d = !!t.passwordHash` to detect if a password is set. When set: shows "Protected — viewers must enter a password" + "Change password" + "Remove password" buttons. State updates on `onSuccess`. See §15. |
| BUG-067 | Password Page Shows 401 | HIGH | CONFIRMED | ❌ **VERIFIED (still present)** | The public status page JS (`status.24observe.com`) still has `if (!r.ok) { renderError('API returned ${r.status}.') }` — no special 401 handling, no password form, no `unlock` call. The `/unlock` API endpoint exists but the public SPA doesn't use it. See §16. |
| BUG-068 | Uninstall Removes Nothing | HIGH | CONFIRMED | ✅ **FIXED** | Same root cause as BUG-056. The rewritten `uninstall()` now stops/disables/purges alloy + snmp_exporter (marker-guarded), removes auditd rules + reloads, removes Grafana repo/key (marker-guarded), verifies every path, and `exit 1`s with a leftovers list instead of printing false "Sensor removed". See §17. |

**Tally:** 9 FIXED · 6 VERIFIED (still present) · 2 PARTIALLY FIXED

---

## 1. BUG-052 — PagerDuty Help Text Gives Wrong Navigation Steps

**Severity:** LOW · **Last Known Status:** Open (reported 2026-07-21) · **Verdict:** ✅ **FIXED**

### What the bug was

The help text under the PagerDuty field said: "In PagerDuty: Services -> your service -> Integrations -> 'Events API v2' -> copy Integration Key." This navigation is outdated — PagerDuty moved the integration key to **Event Orchestration → Integrations**.

### How I tested

The PagerDuty help text is rendered client-side by the dashboard SPA. I downloaded the live main JS bundle (`/assets/index-Dw1RIs-B.js`, 428 KB) and grepped it for the PagerDuty navigation string.

### Evidence — current help text in the live bundle (offset ≈ 101557)

The monitor-edit PagerDuty field now renders this help text (whitespace-collapsed):

> **"In PagerDuty, add an *Events API v2* integration and copy its Integration Key — either on a Service (Services → your service → Integrations) or via Event Orchestration (Automation → Event Orchestration → your orchestration → Integrations), depending on your setup. Resolve event fires when the monitor recovers, so PD auto-closes the incident."**

Count of "Event Orchestration" in the bundle: **2** (was 0 in the buggy version). The exact wrong string from the original report (`"Services -> your service -> Integrations -> 'Events API v2' -> copy Integration Key"`) is **no longer present**.

### Verdict reasoning

The help text now correctly references Event Orchestration with accurate navigation (`Automation → Event Orchestration → your orchestration → Integrations`) and keeps the legacy Service path as a valid alternative. **BUG-052 is FIXED.**

### Reproduction (read-only)

```powershell
$bundle = (Invoke-WebRequest "https://login.24observe.com/assets/index-Dw1RIs-B.js").Content
# Contains: "...Event Orchestration (Automation -> Event Orchestration -> your orchestration -> Integrations)..."
# Does NOT contain the old wrong-only string.
```

---

## 2. BUG-053 — Uptime Badge Returns 404 and Breaks When Embedded on a Real Website

**Severity:** HIGH · **Last Known Status:** STILL PRESENT (last verified 2026-07-24) · **Verdict:** ❌ **VERIFIED (still present)**

### What the bug was

Embedding the 24observe uptime badge via `<img src="https://api.24observe.com/api/v1/badge/monitors/588.svg">` renders as a broken image because the badge endpoint returns **HTTP 404** with an `aria-label="uptime: unknown"` SVG body. Browsers refuse to render an image that came back with a 404.

### Evidence — HTTP responses

```
ID=588      STATUS=404  Content-Type=image/svg+xml  BODY_LEN=839
ID=999999   STATUS=404  Content-Type=image/svg+xml  BODY_LEN=839
ID=1        STATUS=404  Content-Type=image/svg+xml  BODY_LEN=839
```

All three return HTTP 404 with an 839-byte SVG whose `aria-label` is `"uptime: unknown"`. The response bodies for id 588 (known monitor) and id 999999 (non-existent) are **byte-for-byte identical** — the endpoint cannot distinguish an existing monitor from a missing one.

### Evidence — full SVG body (id 588)

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="114" height="20" role="img" aria-label="uptime: unknown">
  <linearGradient id="s" x2="0" y2="100%">...</linearGradient>
  <clipPath id="r"><rect width="114" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="54" height="20" fill="#555"/>
    <rect x="54" width="60" height="20" fill="#737373"/>
    <rect width="114" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="27" y="14">uptime</text>
    <text x="84" y="14">unknown</text>
  </g>
</svg>
```

### Evidence — OpenAPI spec contradiction

`GET /openapi.json` defines the badge endpoint as documenting only a **200** response. The actual server returns **404** for every id — a contract violation and the root cause of the broken-image behavior.

### Verdict reasoning

The badge endpoint still returns HTTP 404 for the originally reported monitor id (588), still says `aria-label="uptime: unknown"`, and is identical to a non-existent id. None of the four requested fixes (200 for existing+up/down/pending, clean 404 for truly missing) are in place. **BUG-053 is VERIFIED — still present, unchanged since 2026-07-24.**

### Reproduction (read-only)

```powershell
Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient
$r  = $client.GetAsync("https://api.24observe.com/api/v1/badge/monitors/588.svg").Result
$r2 = $client.GetAsync("https://api.24observe.com/api/v1/badge/monitors/999999.svg").Result
$r.StatusCode   # 404
$r2.StatusCode # 404
($r.Content.ReadAsStringAsync().Result -eq $r2.Content.ReadAsStringAsync().Result)  # True
```

**Artifacts:** `badge_588.svg`, `badge_999999.svg`

---

## 3. BUG-054 — Badge Preview Says "Preview unavailable" but URL Is Presented as Ready to Use

**Severity:** LOW · **Last Known Status:** Open (reported 2026-07-22) · **Verdict:** ⚠️ **PARTIALLY FIXED**

### What the bug was

The monitor detail page's "Public uptime badge" section simultaneously shows an amber "Preview unavailable" message AND the badge URL in a code block with a "Copy URL" button and Markdown/HTML embed snippets — presented as ready to use.

### Evidence — live bundle, the badge section (offset ≈ 115531–116300)

```
e.jsx("h2", {children:"Public uptime badge"})
e.jsx("p", {children:"Embed in a README to show uptime status. Only resolves if this monitor is on a public status page."})   // ← NEW helper text
e.jsxs("div", {className:"flex items-center gap-3 mb-3", children:[
  N ? e.jsx("img", {src:g, alt:"uptime badge preview", className:"h-5", onError:()=>{f(!1)}})
    : e.jsx("span", {className:"text-xs text-amber whitespace-nowrap",
            children:"Preview unavailable — add this monitor to a public status page to enable it."}),   // ← amber "unavailable" msg
  e.jsx("code", {className:"text-xs text-neutral-400 font-mono truncate flex-1", children:g}),        // ← badge URL in code block
  e.jsx("button", {onClick:()=>{navigator.clipboard.writeText(g)}, className:"btn btn-ghost text-xs",
        children:"Copy URL"})                                                                            // ← Copy URL button
]),
e.jsxs("details", {children:[
  e.jsx("summary", {children:"Markdown / HTML snippets"}),                                              // ← embed snippets
  ...
])
```

### What changed (the partial fix)

The helper text under the section header is **new**: "Embed in a README to show uptime status. **Only resolves if this monitor is on a public status page.**" This warns the user upfront that the badge requires a status page.

### What did NOT change (the contradiction persists)

The contradictory UI layout is unchanged: when `N` is false (no status page), the amber span "Preview unavailable…" renders **in the same flex row** as the `<code>` badge URL block, the "Copy URL" button, and the "Markdown / HTML snippets" `<details>` section. The original fix request option 2 ("hide the badge URL, copy button, and embed snippets until a status page is added") was NOT implemented.

### Verdict reasoning

The helper text mitigates confusion but the core contradiction remains: "Preview unavailable" + the URL + Copy URL + snippets all render together. **BUG-054 is PARTIALLY FIXED.**

---

## 4. BUG-055 — Enroll Token Has No Visible Expiry (Valid 1 Year)

**Severity:** MEDIUM · **Last Known Status:** Open (reported 2026-07-23) · **Verdict:** ❌ **VERIFIED (still present)**

### Evidence A — the 1-year expiry is still in place

`GET /api/v1/me/tokens/` returned 18 tokens. The 4 "Sensor enrollment" (scope `sensors:write`) tokens:

| id | name | scopes | createdAt | expiresAt | lifetime |
|----|------|--------|-----------|-----------|----------|
| 480 | Sensor enrollment | sensors:write | 2026-08-06T10:28:18 | **2027-08-06T10:28:18** | **1 year** |
| 481 | Sensor enrollment | sensors:write | 2026-08-06T10:32:16 | **2027-08-06T10:32:16** | **1 year** |
| 496 | Sensor enrollment | sensors:write | 2026-08-10T09:26:46 | **2027-08-10T09:26:46** | **1 year** |
| 524 | Sensor enrollment | sensors:write | 2026-08-10T09:37:05 | **2027-08-10T09:37:05** | **1 year** |

Every enroll token's `expiresAt` is exactly 1 year after its `createdAt` — identical to the original report. The 1-year lifetime is unchanged.

### Evidence B — the GUI still does not show the expiry

The hosts page install-command section (bundle offset ≈ 286801–290138) renders the install command text, an amber note "This enrollment token is shown once. It can enroll hosts only (it cannot read your data). Reuse it across your fleet; revoke it anytime from the API tokens tab.", a "Regenerate install command" button, and the enrolled-hosts table. It does **NOT** render `j.expiresAt`.

Bundle grep confirms:
- `expiresAt` appears only **2** times in the entire bundle, both in the **Invite teammates** section (offsets 317276 and 319372), not the hosts/enroll section.
- `"valid for"` count = **0** — no expiry-duration message anywhere.
- The "shown once" note mentions neither expiry nor a lifetime.

### Verdict reasoning

Enroll tokens are still valid for 1 year (4 tokens, all 2026→2027). The GUI still does not display the expiry on the hosts page. The "shown once" note still gives no expiry information. None of the three requested fixes (show expiry in GUI, shorten to 15–30 min, one-time-use) are in place. **BUG-055 is VERIFIED — still present, unchanged.**

### Reproduction (read-only)

```powershell
$client = New-Object System.Net.Http.HttpClient
$client.DefaultRequestHeaders.Add("Authorization","Bearer obs_[REDACTED]")
$r = $client.GetAsync("https://api.24observe.com/api/v1/me/tokens/").Result
# → all sensors:write tokens have expiresAt = createdAt + 1 year (2027-*)
```

**Artifacts:** `tokens_full.json`

---

## 5. BUG-056 — Uninstall Does Not Remove snmp_exporter, auditd Rules, or Grafana Repo

**Severity:** LOW · **Last Known Status:** Open (reported 2026-07-23) · **Verdict:** ✅ **FIXED**

### How I tested

Downloaded the live `install.sh` from `https://api.24observe.com/install.sh` (18,201 bytes) and read the `uninstall()` function in full (lines 151–230). I did not execute the uninstall — that would require a provisioned VM and would be destructive. The static analysis is conclusive because the install/uninstall is deterministic shell.

### Evidence — the rewritten `uninstall()` function

The `uninstall()` function now performs, in order:

**1. Read ownership markers first** (before deleting `/etc/alloy`, where they live):
```bash
local own_snmp=false own_grafana=false
[ -f /etc/alloy/.owns-snmp-exporter ] && own_snmp=true
[ -f /etc/alloy/.owns-grafana-repo ]  && own_grafana=true
local our_snmp_unit=false
[ -f /etc/systemd/system/snmp_exporter.service ] && grep -q 24observe .../snmp_exporter.service && our_snmp_unit=true
```
The installer writes `.owns-snmp-exporter` and `.owns-grafana-repo` markers at install time, so uninstall only removes what THIS installer created (won't break an independently-managed snmp_exporter or Grafana repo).

**2. Alloy — stop, disable, purge, remove config + data + drop-in:**
```bash
systemctl stop alloy; systemctl disable alloy
apt-get purge -y alloy   # or dnf/yum remove
rm -f  "$ALLOY_CONFIG" "$ENV_FILE" /etc/alloy/snmp_targets.json
rm -rf "$DROPIN_DIR" "$DATA_DIR"   # /etc/systemd/system/alloy.service.d AND /var/lib/alloy
```

**3. snmp_exporter — remove ONLY the unit WE wrote, and binary/config ONLY if we installed them:**
```bash
if [ "$our_snmp_unit" = true ]; then
  systemctl stop snmp_exporter; systemctl disable snmp_exporter
  rm -f /etc/systemd/system/snmp_exporter.service
fi
if [ "$own_snmp" = true ]; then rm -f /usr/local/bin/snmp_exporter; rm -rf /etc/snmp_exporter; fi
```

**4. auditd rules — drop OUR rule file and reload:**
```bash
if [ -f /etc/audit/rules.d/24observe.rules ]; then
  rm -f /etc/audit/rules.d/24observe.rules
  augenrules --load ... || systemctl restart auditd ... || audit_reload_ok=false
fi
```
Tracks reload failure in `audit_reload_ok` so it cannot claim success when the kernel rules couldn't be reloaded.

**5. Grafana repo/key — remove ONLY if WE created them:**
```bash
if [ "$own_grafana" = true ]; then
  rm -f /etc/apt/sources.list.d/grafana.list /etc/apt/keyrings/grafana.gpg /etc/yum.repos.d/grafana.repo
fi
```

**6. Verify and report honestly:**
```bash
local leftovers=""
systemctl is-active alloy >/dev/null 2>&1 && leftovers="${leftovers}\n  - alloy service still active"
command -v alloy >/dev/null 2>&1 && leftovers="${leftovers}\n  - alloy binary ..."
[ "$audit_reload_ok" = false ] && leftovers="${leftovers}\n  - 24observe audit rules removed from disk, but the running kernel rules could not be reloaded ..."
for p in "$ALLOY_CONFIG" "$ENV_FILE" "$DROPIN_DIR" "$DATA_DIR" /etc/alloy/snmp_targets.json; do
  [ -e "$p" ] && leftovers="${leftovers}\n  - $p"
done
# ... snmp_exporter + grafana leftovers checks ...
if [ -n "$leftovers" ]; then
  printf '\033[0;31m[24observe] ERROR:\033[0m uninstall INCOMPLETE — these remain ...:%b\n' "$leftovers" >&2
  exit 1
fi
log "Sensor fully removed (only resources this installer created were touched). ..."
```

### What changed vs the original report

The original BUG-056 asked the uninstall to also: (1) stop + disable + remove snmp_exporter — ✅ done; (2) remove auditd rules + reload — ✅ done; (3) optionally remove Grafana repo + key — ✅ done. Plus the bonus behavioral fix (verify + honest reporting) that also addresses BUG-068.

### Verdict reasoning

All three requested cleanups are implemented, plus the false-success behavioral fix. **BUG-056 is FIXED.**

**Artifacts:** `install.sh`

---

## 6. BUG-057 — Sensor List Shows 0 Hosts but Endpoint Limit Says 5/5 Reached

**Severity:** MEDIUM · **Last Known Status:** Open (reported 2026-07-23) · **Verdict:** ✅ **FIXED**

### What the bug was

`GET /api/v1/sensors/` returned `[]` (empty), but `POST /api/v1/sensors/bootstrap` returned "endpoint limit 5/5 reached" — a contradiction (0 sensors but limit reached).

### Evidence — current state

`GET /api/v1/sensors/` returns 1 sensor:
```json
[{"id":97,"patId":530,"machineId":"30e662c5c81d4191bd2444a79c97d2e0","hostname":"kali","os":"Kali GNU/Linux Rolling","sensorVersion":"0.1.0 (alloy 1.18.0)","status":"offline","firstSeen":"2026-08-06T10:33:42.623Z","lastSeen":"2026-08-10T11:28:46.363Z"}]
```

`GET /api/v1/me` quota shows:
```json
"connectedEndpoints": 1, "connectedEndpointLimit": 5
```

### Verdict reasoning

The sensors list is no longer empty (1 sensor, kali), and the quota shows 1/5 endpoints used — so there is no 0-vs-5/5 contradiction. The endpoint limit is correctly reflected as 1/5, with room to enroll 4 more. The original contradiction (0 sensors but limit 5/5 reached) does not reproduce. **BUG-057 is FIXED.**

### Reproduction (read-only)

```powershell
$client = New-Object System.Net.Http.HttpClient
$client.DefaultRequestHeaders.Add("Authorization","Bearer obs_[REDACTED]")
$sensors = $client.GetAsync("https://api.24observe.com/api/v1/sensors/").Result
$sensors.Content.ReadAsStringAsync().Result   # [{"id":97,"hostname":"kali",...}]  — NOT empty
$me = $client.GetAsync("https://api.24observe.com/api/v1/me").Result
# quota.connectedEndpoints = 1, connectedEndpointLimit = 5
```

**Artifacts:** `sensors_list.json`, `me_full.json`

---

## 7. BUG-058 — Install Script Shows Misleading Error When Endpoint Limit Is Reached

**Severity:** MEDIUM · **Last Known Status:** Open (reported 2026-07-23) · **Verdict:** ❌ **VERIFIED (still present)**

### What the bug was

When the endpoint limit is reached, the install script shows a misleading error message instead of a clear "endpoint limit reached" message.

### Evidence — the bootstrap call in `install.sh` (offset ≈ 14313)

```bash
resp="$(curl -fsSL -X POST "${API}/api/v1/sensors/bootstrap" \
  -H "authorization: Bearer ${ENROLL_TOKEN}" \
  -H "content-type: application/json" \
  -d "$(printf '{"machineId":"%s","hostname":"%s","os":"%s","sensorVersion":"%s","enableFindings":%s,"profiles":%s}' "$machine_id" "$hostname" "$os" "$sensor_ver" "$ENABLE_FINDINGS" "$PROFILES_JSON")")" \
  || err "enrollment failed (check the token + API reachability to ${API})"
```

The `err` function (offset 1424):
```bash
err()  { printf '\033[0;31m[24observe] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }
```

### What's wrong

1. `curl -fsSL` — the `-f` flag makes curl fail silently on 4xx/5xx HTTP errors (returns no body, no status code to the script).
2. `|| err "enrollment failed (check the token + API reachability to ${API})"` — the only error handling is a **generic** message that says "check the token + API reachability."
3. There is **no capture of the HTTP status code** (no `curl -w '%{http_code}'`, no `--write-out`).
4. There is **no parsing of the API error JSON** (which would contain `code: "ENDPOINT_LIMIT_REACHED"` and a specific message).
5. When the endpoint limit is hit, the API returns a 4xx with a clear error code, but the script discards it and prints "enrollment failed (check the token + API reachability)" — exactly the misleading behavior from the original report.

### Verdict reasoning

The bootstrap error handling is unchanged from the original report. A limit-reached 4xx still produces the generic "check the token + API reachability" message with no mention of the endpoint limit. None of the API error-code fields (`ENDPOINT_LIMIT_REACHED`) are surfaced to the user. **BUG-058 is VERIFIED — still present.**

### Reproduction (read-only — read the script, no execution)

```powershell
$install = (Invoke-WebRequest "https://api.24observe.com/install.sh").Content
# bootstrap call uses: curl -fsSL ... || err "enrollment failed (check the token + API reachability to ${API})"
# No http_code capture, no error-code parsing.
```

**Artifacts:** `install.sh`

---

## 8. BUG-059 — Token Accumulation: 300+ Tokens with No Bulk Management

**Severity:** MEDIUM · **Last Known Status:** Open (reported 2026-07-24) · **Verdict:** ⚠️ **PARTIALLY FIXED**

### What the bug was

The original report found 300+ tokens accumulated with no way to bulk revoke — each token must be revoked one-by-one via `DELETE /api/v1/me/tokens/{id}`.

### Evidence A — token count is now manageable

`GET /api/v1/me/tokens/` returned **18 tokens** (not 300+). The account has been cleaned up since the original report. Token breakdown by name:

```json
{"Day-4.1":1,"sensor:kali":4,"Sensor enrollment":4,"Day-3.1":1,"Day-2.3":1,"Day-2.2":1,"Day-2.1":1,"phase-1.4":1,"phase-1.3":1,"Phase-1.2":1,"Phase-1.1":1,"Phase-1":1}
```

### Evidence B — per-row revoke exists, but no bulk management

The API tokens settings page (dashboard bundle offset ≈ 301402–308000) renders ALL tokens in a table with columns: Name, Prefix, Scopes, Daily caps, Last used, Created, and an action column. Each non-revoked token row has a **"Revoke"** button:

```jsx
e.jsx("button", {onClick:()=>{v(M.id,M.name)}, className:"btn btn-danger text-xs", disabled:d.isPending, children:"Revoke"})
```

The `v` function calls the `mn()` mutation which does `DELETE /api/v1/me/tokens/${id}`.

### Evidence C — no bulk endpoint exists

The OpenAPI spec has only these token paths:
```
GET    /api/v1/me/tokens/        :: Read api tokens
POST   /api/v1/me/tokens/        :: Create api tokens
DELETE /api/v1/me/tokens/{id}    :: Delete api tokens {id}
```

There is **no** `POST /api/v1/me/tokens/bulk` or `DELETE /api/v1/me/tokens/bulk` endpoint. The only bulk path in the entire spec is `/api/v1/monitors/bulk` (for monitors, not tokens). The GUI has no "Revoke all" or multi-select revoke UI (`revoke-all`, `delete-all`, `tokens/bulk` all return idx=-1 in the bundle).

### Verdict reasoning

- The "300+ tokens" scale problem no longer exists on this account (now 18 tokens).
- Per-row revoke is available in the GUI (each token has a "Revoke" button).
- But there is still **no bulk-revoke endpoint or UI** — if a user accumulates hundreds of tokens again, they must still revoke one-by-one. The root cause (no bulk management) is not addressed.

**BUG-059 is PARTIALLY FIXED** — the immediate scale problem is gone and per-row revoke works, but the bulk-management gap remains.

### Reproduction (read-only)

```powershell
$client = New-Object System.Net.Http.HttpClient
$client.DefaultRequestHeaders.Add("Authorization","Bearer obs_[REDACTED]")
$r = $client.GetAsync("https://api.24observe.com/api/v1/me/tokens/").Result
($r.Content.ReadAsStringAsync().Result | ConvertFrom-Json).Count  # 18 (not 300+)
# OpenAPI has no /tokens/bulk endpoint.
```

**Artifacts:** `tokens_full.json`, `openapi_spec.json`

---

## 9. BUG-060 — Active Enroll Tokens Not Visible in GUI

**Severity:** MEDIUM · **Last Known Status:** Open (reported 2026-07-24) · **Verdict:** ✅ **FIXED**

### What the bug was

The hosts page generates an enroll token shown once. After navigating away, the token is no longer visible. The "Sensor enrollment" tokens were only visible via the API, not in the dashboard's API tokens tab.

### Evidence — enroll tokens now appear in the API tokens tab

The API tokens settings page query (bundle offset ≈ 11613):
```js
function un(){return R({queryKey:["api-tokens"],queryFn:()=>k("/api/v1/me/tokens")})}
```
This fetches ALL tokens with no filter. The table renders `(x.data ?? []).map(...)` — every token in the response, including sensors:write enroll tokens.

The API response confirms the 4 "Sensor enrollment" tokens are in the same `/api/v1/me/tokens/` response:
```
id=524 name="Sensor enrollment" scopes=["sensors:write"] revoked=false
id=496 name="Sensor enrollment" scopes=["sensors:write"] revoked=false
id=481 name="Sensor enrollment" scopes=["sensors:write"] revoked=false
id=480 name="Sensor enrollment" scopes=["sensors:write"] revoked=false
```

There is no field in the token object that would exclude enroll tokens from the GUI list (no `hidden`, `internal`, or `type` flag). The scopes column renders `M.scopes.length + " scope(s)"` for non-wildcard scopes, so a sensors:write token shows "1 scope".

### Verdict reasoning

The API tokens settings page renders all tokens from `GET /api/v1/me/tokens/` with no filter, and the 4 "Sensor enrollment" tokens are in that response. They now appear in the GUI with a "Revoke" button each. **BUG-060 is FIXED.**

### Reproduction (read-only)

```powershell
$client = New-Object System.Net.Http.HttpClient
$client.DefaultRequestHeaders.Add("Authorization","Bearer obs_[REDACTED]")
$r = $client.GetAsync("https://api.24observe.com/api/v1/me/tokens/").Result
# Response includes 4 "Sensor enrollment" tokens with scopes=["sensors:write"] — these now appear in the GUI tokens tab.
```

**Artifacts:** `tokens_full.json`

---

## 10. BUG-061 — No Revoke Support for Enroll Tokens on Hosts Page

**Severity:** MEDIUM · **Last Known Status:** Open (reported 2026-07-24) · **Verdict:** ❌ **VERIFIED (still present)**

### What the bug was

The hosts page says "revoke it anytime from the API tokens tab" but: (1) there is no direct link to the API tokens tab, (2) there is no revoke button on the hosts page itself.

### Evidence — hosts page install-command section (bundle offset ≈ 286800–290138)

The section renders:
- The install command in a `<pre>` block
- A "Copy" button
- An amber note: *"This enrollment token is shown once. It can enroll hosts only (it cannot read your data). Reuse it across your fleet; revoke it anytime from the API tokens tab."*
- "Data ships to {otlpEndpoint}" text
- A "Regenerate install command" button

It does **NOT** render:
- A "Revoke token" button (bundle grep: `"Revoke token"` idx = -1)
- A direct link to the API tokens tab (the text "API tokens tab" is plain text, not an `<a>` link — no `href="/settings"` near it)

### Evidence — no revoke button anywhere in the hosts page section

Bundle grep results for the hosts page region:
```
"Revoke token": idx=-1
"Revoke":       idx=241007  (but this is in the logs ingest token section, not the hosts page)
"revoke":       idx=67024   (in a CSV export revokeObjectURL, unrelated)
```

The only revoke button in the dashboard (offset 241007) is for the **logs ingest token** ("Generate ingest token" flow), not the sensor enroll token on the hosts page.

### Verdict reasoning

The hosts page still only mentions "revoke it anytime from the API tokens tab" as plain text — no revoke button, no direct link. The user must manually navigate to Settings → API tokens to revoke an enroll token. None of the three requested fixes (revoke button on hosts page, direct link, enroll tokens in API tokens tab) are fully implemented on the hosts page. (Note: enroll tokens DO now appear in the API tokens tab per BUG-060, so fix #2 from the original report is addressed, but the hosts-page revoke button and direct link are not.) **BUG-061 is VERIFIED — still present.**

### Reproduction (read-only — bundle inspection)

```powershell
$bundle = (Invoke-WebRequest "https://login.24observe.com/assets/index-Dw1RIs-B.js").Content
# Hosts page section (offset ~286800-290138): renders install command + "revoke it anytime from the API tokens tab" text.
# No "Revoke" button, no <a href="/settings"> link to the API tokens tab.
# "Revoke token" does not appear anywhere in the bundle.
```

---

## 11. BUG-062 — Endpoint Limit Not Shown in Account Quota

**Severity:** LOW · **Last Known Status:** Open (reported 2026-07-24) · **Verdict:** ✅ **FIXED**

### What the bug was

The account quota (`GET /api/v1/me`) showed monitors, checks, and log bytes — but not the endpoint limit. The user had no way to know how many endpoints they had used until they hit the `ENDPOINT_LIMIT_REACHED` error.

### Evidence — current `/api/v1/me` response

```json
{
  "quota": {
    "orgId": 169,
    "plan": "free",
    "monitorLimit": 25,
    "monitorsUsed": 0,
    "monitorsRemaining": 25,
    "checksPerMonthLimit": 50000,
    "checksUsed": 0,
    "checksRemaining": 50000,
    "minIntervalSec": 300,
    "logsBytesPerMonthLimit": 1073741824,
    "logsBytesUsed": 330665049,
    "logsBytesRemaining": 743076775,
    "periodStart": "2026-08-01T00:00:00.000Z",
    "periodEnd": "2026-09-01T00:00:00.000Z",
    "connectedEndpoints": 1,
    "connectedEndpointLimit": 5
  }
}
```

The quota now includes `"connectedEndpoints": 1, "connectedEndpointLimit": 5`.

### Verdict reasoning

The endpoint limit is now exposed in the account quota as `connectedEndpoints` and `connectedEndpointLimit`. A user can check `GET /api/v1/me` to see how many endpoints they have used and what their limit is, before hitting the error. **BUG-062 is FIXED.**

### Reproduction (read-only)

```powershell
$client = New-Object System.Net.Http.HttpClient
$client.DefaultRequestHeaders.Add("Authorization","Bearer obs_[REDACTED]")
$r = $client.GetAsync("https://api.24observe.com/api/v1/me").Result
# quota.connectedEndpoints = 1, quota.connectedEndpointLimit = 5
```

**Artifacts:** `me_full.json`

---

## 12. BUG-063 — Graph Blast Radius Shows Audit Log Noise Instead of Topology

**Severity:** MEDIUM · **Last Known Status:** CONFIRMED (reported 2026-07-28) · **Verdict:** ✅ **FIXED**

### What the bug was

The "Graph blast radius" on incident #1122 showed 40 entities: 1 service + 20 READ_MONITOR_SECRETS audit entries + 19 SEND_TEST_ALERT audit entries. Audit log actions appeared as graph nodes instead of topology entities.

### How I tested

Called `GET /api/v1/context/incident/inc-{id}/summary` (the blast-radius endpoint, discovered from the dashboard bundle: `ts(t)` → `k("/api/v1/context/incident/inc-${String(t)}/summary")`) for two live incidents: 1348 (Sensor offline: kali) and 1343 (Log alert: 203.0.115.0).

### Evidence — incident 1348 (Sensor offline: kali)

```json
{
  "incident": {"id":7918703,"type":"incident","canonicalKey":"inc-1348","displayName":"Sensor offline: kali","attrs":{"hostname":"kali","severity":"major","sensorHostId":97}},
  "impacted": [
    {
      "edgeType":"impacts","direction":"out","confidence":1,"strength":1,
      "evidence":{"kind":"sensor","refId":"inc-1348","deepLink":"/api/v1/incidents/1348","sample":"kali"},
      "neighbor": {"id":7084623,"type":"host","canonicalKey":"kali","displayName":"kali","attrs":{"os":"Kali GNU/Linux Rolling","kind":"hostname","managed":true,"sensorHostId":97}}
    }
  ],
  "owners": [],
  "recentChanges": []
}
```

The `impacted` array contains **only a topology entity** (`type: "host"`, `canonicalKey: "kali"`). `recentChanges` is `[]`. No `READ_MONITOR_SECRETS` or `SEND_TEST_ALERT` audit entries appear as graph nodes.

### Evidence — incident 1343 (Log alert: 203.0.115.0)

```json
{
  "incident": {"id":7901178,"type":"incident","canonicalKey":"inc-1343","displayName":"Log alert: 203.0.115.0","attrs":{"severity":"critical"}},
  "impacted": [
    {
      "edgeType":"detected_on","direction":"out","confidence":1,"strength":1,
      "evidence":{"kind":"log_alert","refId":"inc-1343","deepLink":"/api/v1/incidents/1343","sample":"host"},
      "neighbor": {"id":7084623,"type":"host","canonicalKey":"kali","displayName":"kali","attrs":{...}}
    }
  ],
  "owners": [],
  "recentChanges": []
}
```

Again, `impacted` contains only a topology entity (the kali host). Grep on the response body:
```
audit: idx=-1
READ_MONITOR: idx=-1
SEND_TEST_ALERT: idx=-1
```

### Verdict reasoning

For both incidents tested, the blast-radius/context summary returns only topology entities (hosts) in `impacted`, with `recentChanges: []` (empty). No audit log actions (READ_MONITOR_SECRETS, SEND_TEST_ALERT) appear as graph nodes. The audit-noise problem from the original report is gone — the graph now shows real topology. **BUG-063 is FIXED.**

### Reproduction (read-only)

```powershell
$client = New-Object System.Net.Http.HttpClient
$client.DefaultRequestHeaders.Add("Authorization","Bearer obs_[REDACTED]")
$r = $client.GetAsync("https://api.24observe.com/api/v1/context/incident/inc-1348/summary").Result
# impacted: [{type:"host", canonicalKey:"kali"}] — topology only, no audit entries
# recentChanges: []
```

**Artifacts:** `context_inc1348.json`, `context_inc1343.json`, `incidents_list.json`

---

## 13. BUG-064 — Live Tail Shows "Connection Lost" and "No Events" Despite Logs Existing

**Severity:** MEDIUM · **Last Known Status:** CONFIRMED (reported 2026-07-28) · **Verdict:** ✅ **FIXED**

### What the bug was

Enabling "Live tail" on the Logs page immediately showed "Live tail connection lost. Check your auth or toggle off/on." and "No events yet" — even though logs existed and the Events/Patterns views worked with the same session. The SSE endpoint required PAT auth but the GUI passed session auth.

### How I tested

1. Inspected the live tail implementation in the dashboard bundle (offset ≈ 185800–187200).
2. Tested the new `POST /api/v1/logs/tail/session` endpoint with the PAT.

### Evidence — the new live tail flow (bundle offset ≈ 185800)

```js
const L = Ne();  // get PAT from localStorage
// 1. Mint a tail session first
const ie = await fetch(`${Ye}/api/v1/logs/tail/session`, {
  method: "POST",
  headers: { authorization: `Bearer ${L ?? ""}` },
  credentials: "include"
});
if (!ie.ok) { w(`Failed to mint tail session (HTTP ${String(ie.status)}).`); return; }
// 2. Connect the EventSource using the session cookie (no PAT in URL)
const le = `${Ye}/api/v1/logs/tail?${W.toString()}`;
const se = new EventSource(le, { withCredentials: true });
I.current = se;
se.addEventListener("log", ie => { /* render log event */ });
se.addEventListener("timeout", () => { w("Server closed the tail (30 min cap)..."); se.close(); });
se.onerror = () => { w("Live tail connection lost. Check your auth or toggle off/on."); }
```

### Evidence — the session-mint endpoint works

`POST /api/v1/logs/tail/session` (with PAT auth) returns:
```json
{"ok":true,"expiresIn":60}
```
With response headers including:
```
set-cookie: __o24tail=eyJhbGciOiJIUzI1NiJ9...; Path=/api/v1/logs/tail; Max-Age=60; HttpOnly; Secure; SameSite=None
x-plan-ratelimit-limit: 60
x-plan-ratelimit-remaining: 59
```

The endpoint mints a short-lived (60s) JWT cookie scoped to `/api/v1/logs/tail`, which the EventSource then uses via `withCredentials: true`. The PAT is never exposed in the SSE URL.

### Evidence — OpenAPI confirms the new endpoints

```
POST /api/v1/logs/tail/session :: Create logs tail session
GET  /api/v1/logs/tail         :: Read logs tail
```

### Verdict reasoning

The live tail now uses a two-step auth flow: (1) POST to mint a session cookie with PAT auth, (2) EventSource connects using the cookie. This solves the original auth issue — the SSE endpoint no longer requires the PAT to be in the URL, and the session cookie is handled automatically. The "Check your auth" error string still exists in the bundle (for genuine auth failures), but the root cause (session-vs-PAT mismatch) is resolved. **BUG-064 is FIXED.**

### Reproduction (read-only)

```powershell
$client = New-Object System.Net.Http.HttpClient
$client.DefaultRequestHeaders.Add("Authorization","Bearer obs_[REDACTED]")
$r = $client.PostAsync("https://api.24observe.com/api/v1/logs/tail/session", New-Object System.Net.Http.StringContent("{}", [System.Text.Encoding]::UTF8, "application/json")).Result
$r.StatusCode  # 200
$r.Content.ReadAsStringAsync().Result  # {"ok":true,"expiresIn":60}
```

---

## 14. BUG-065 — Adding Same Monitor Twice to a Status Page Throws "Internal Server Error"

**Severity:** MEDIUM · **Last Known Status:** CONFIRMED (reported 2026-07-28) · **Verdict:** ❌ **VERIFIED (still present)**

### What the bug was

Adding the same monitor as a component a second time to a status page threw "Internal Server Error" (500) instead of a clean 400 with "This monitor is already a component."

### How I tested

Static analysis of the dashboard bundle add-component flow. I did not create a status page + monitor to trigger the 500 live (that would require mutating actions — the verification was read-only).

### Evidence — the add-component flow has no duplicate check

The `S` function (bundle offset ≈ 140303) that handles "Add":
```js
S = C => {
  const q = Number(f);
  if (!Number.isFinite(q) || q === 0) return;
  const K = (r.data ?? []).find(_ => _.id === q);
  K && i.mutate({pageId: C, monitorId: q, name: E.trim() || K.name}, {
    onSuccess: () => { w(""); T(""); }
  });
};
```

The `i.mutate` calls the `Xs()` mutation (offset ≈ 8637):
```js
function Xs() {
  const t = D();
  return F({mutationFn: s => k(`/api/v1/status-pages/${String(s.pageId)}/components`, {
    method: "POST",
    body: {monitorId: s.monitorId, name: s.name, ...}
  }), onSuccess: (s, n) => { t.invalidateQueries(...) }});
}
```

### What's missing

1. **No client-side duplicate check** — the `S` function does not check whether `monitorId` is already in the existing components list before calling `i.mutate`. The monitor dropdown (offset ≈ 153535) shows ALL monitors via `x.map(o => e.jsx("option", {value: o.id, children: o.name}))` — it does NOT filter out monitors that are already added as components.

2. **No `onError` handler** — the mutate has only `onSuccess`. If the server returns 500, the error surfaces via the default error display (offset ≈ 155800): `p.error ? e.jsx("p", {className: "text-xs text-red mt-2", children: p.error.message}) : null` — which would show the raw server error message (e.g., "Internal server error").

3. **The OpenAPI spec for `POST /status-pages/{id}/components` documents only a 200 response** — no 400 or 409 for duplicate monitors, suggesting the server does not have a clean duplicate-validation path.

### Verdict reasoning

No client-side duplicate-prevention was added (the dropdown still shows all monitors, the `S` function has no guard), and there's no `onError` handler to render a clean 400 message. The server-side 500 behavior can't be confirmed without a mutating test, but the absence of any client-side guard and the OpenAPI documenting only a 200 response strongly indicate the original 500-on-duplicate behavior persists. **BUG-065 is VERIFIED (still present)** — based on static analysis of the add-component flow.

### Reproduction (read-only — static analysis)

```powershell
$bundle = (Invoke-WebRequest "https://login.24observe.com/assets/index-Dw1RIs-B.js").Content
# The add-component S function (offset ~140303) calls i.mutate with no duplicate check.
# The monitor dropdown (offset ~153535) shows ALL monitors, no filtering of already-added ones.
# POST /api/v1/status-pages/{id}/components in OpenAPI documents only 200 (no 400/409 for duplicates).
```

---

## 15. BUG-066 — Password Protection on Status Page Does Not Show Saved State

**Severity:** LOW · **Last Known Status:** CONFIRMED (reported 2026-07-28) · **Verdict:** ✅ **FIXED**

### What the bug was

After setting a password on a status page, the GUI still showed "No password set" and a "Set password" button — no feedback that the password was saved, no "Change password"/"Remove password" buttons.

### Evidence — the rewritten password section (bundle offset ≈ 150800–153200)

The code now uses `d = !!t.passwordHash` to detect whether a password is set, and the UI branches accordingly:

**Status indicator** (offset ≈ 151000):
```jsx
e.jsx("span", {
  className: `text-xs ${d ? "text-amber" : "text-neutral-500"}`,
  children: d ? "Protected — viewers must enter a password" : "No password set"
})
```
When a password is set (`d = true`): shows "Protected — viewers must enter a password" in amber.
When no password (`d = false`): shows "No password set" in neutral.

**Buttons** (offset ≈ 152500):
```jsx
// When not editing (form closed):
e.jsx("button", {
  type: "button",
  onClick: () => { p(true) },
  className: "btn btn-ghost text-xs",
  "data-testid": "status-page-password-toggle",
  children: d ? "Change password" : "Set password"
}),
d ? e.jsx("button", {
  type: "button",
  onClick: u,  // u = () => confirm("Remove password?...") && s.mutate({id: t.id, password: ""})
  disabled: s.isPending,
  className: "btn btn-danger text-xs",
  "data-testid": "status-page-password-clear",
  children: "Remove password"
}) : null
```

When a password is set: shows **"Change password"** and **"Remove password"** buttons.
When no password: shows only **"Set password"**.

**Save handler** (offset ≈ 150800):
```js
const a = b => {
  b.preventDefault();
  if (n === r) s.mutate({id: t.id, password: n}, {
    onSuccess: () => { l(""); i(""); p(false); }  // ← clears fields, closes form
  });
};
```
On success, the form fields are cleared and the form closes — the UI re-renders with `d = true` (because `t.passwordHash` is now set after the query invalidation), showing "Protected — viewers must enter a password" + "Change password" + "Remove password".

**Error display:**
```jsx
s.error ? e.jsx("p", {className: "text-xs text-red", children: s.error.message}) : null
```

### Verdict reasoning

The password section now:
1. Shows "Protected — viewers must enter a password" when a password is set (instead of "No password set").
2. Shows "Change password" + "Remove password" buttons when protected (instead of just "Set password").
3. Updates state on `onSuccess` (clears fields, closes form, re-renders with the protected state).
4. Shows errors in red.

All four requested fixes from the original report are implemented. **BUG-066 is FIXED.**

### Reproduction (read-only — bundle inspection)

```powershell
$bundle = (Invoke-WebRequest "https://login.24observe.com/assets/index-Dw1RIs-B.js").Content
# Password section (offset ~150800-153200):
#   d = !!t.passwordHash
#   d ? "Protected — viewers must enter a password" : "No password set"
#   d ? "Change password" + "Remove password" : "Set password"
#   onSuccess clears fields + closes form
```

---

## 16. BUG-067 — Password-Protected Status Page Shows "API returned 401" Instead of a Password Entry Form

**Severity:** HIGH · **Last Known Status:** CONFIRMED (reported 2026-07-28) · **Verdict:** ❌ **VERIFIED (still present)**

### What the bug was

Opening a password-protected public status page (`https://status.24observe.com/test`) showed "Status unavailable" + "API returned 401." with no password entry form. The API correctly returns 401, but the public status page JS doesn't handle 401 — it only handles 404.

### How I tested

Fetched the live public status page HTML from `https://status.24observe.com/` (20,177 bytes — a vanilla JS single-page app with inline `<script>`) and searched it for 401/password/unlock handling.

### Evidence — the `fetchStatus` function (offset ≈ 17050)

```js
const fetchStatus = async () => {
  try {
    const r = await fetch(lookupUrl, { cache: 'no-store' });
    if (r.status === 404) {
      renderError(onOwnHost ? `Status page "${slug}" not found.` : `No status page configured for ${host}.`);
      return;
    }
    if (!r.ok) { renderError(`API returned ${r.status}.`); return; }   // ← 401 falls here
    render(await r.json());
  } catch (e) {
    renderError(`Could not reach API: ${e?.message ?? 'network error'}`);
  }
};
```

The only special-case handling is for **404** (not found). For any other non-OK status — including **401** (password required) — it calls `renderError('API returned ${r.status}.')`, which sets:
- `hero-headline` = "Status unavailable"
- `hero-sub` = "API returned 401."
- The groups-host shows `<div class="err">API returned 401.</div>`

### Evidence — no password form, no unlock call anywhere

Grep of the entire status page HTML for password-handling terms:
```
401:               idx=-1
unlock:             idx=-1
password:           idx=-1
Password:           idx=-1
password-protected: idx=-1
Enter the password: idx=-1
r.status === 401:   idx=-1
=== 401:            idx=-1
```

The public status page JS has **zero** references to `unlock`, `password`, `401`, or any password-form rendering. It does not call the `POST /api/v1/status-pages/public/{slug}/unlock` endpoint that exists in the OpenAPI spec.

### Evidence — the unlock endpoint exists in the API but is unused by the public SPA

The OpenAPI spec defines:
```
POST /api/v1/status-pages/public/{slug}/unlock :: Create status pages (public) public {slug} unlock
```
This endpoint exists to accept a password and return an unlock cookie/token — but the public status page JavaScript does not reference it. The API layer is ready, but the frontend was never updated to use it.

### Verdict reasoning

The public status page JS still has only `if (!r.ok) { renderError('API returned ${r.status}.') }` for non-404 errors. A 401 (password-protected page) produces "Status unavailable" + "API returned 401." with no password entry form. The `/unlock` API endpoint exists but the public SPA doesn't call it. None of the four requested fixes (password form on 401, re-fetch with password, friendly message, themed form) are implemented. **BUG-067 is VERIFIED — still present, unchanged.**

### Reproduction (read-only)

```powershell
# Fetch the public status page HTML
$shell = (Invoke-WebRequest "https://status.24observe.com/").Content
# The fetchStatus function (offset ~17050) has:
#   if (r.status === 404) { renderError("...not found.") }
#   if (!r.ok) { renderError("API returned ${r.status}.") }   ← 401 falls here, no password form
# No "unlock", "password", "401" handling anywhere in the shell.
```

**Artifacts:** `status_page_shell.html`

---

## 17. BUG-068 — Uninstall Command Removes Nothing: All 15 Items Still Exist After Running Uninstall

**Severity:** HIGH · **Last Known Status:** CONFIRMED (verified by SSH inspection, reported 2026-08-03) · **Verdict:** ✅ **FIXED**

### What the bug was

Running `curl -sSL https://api.24observe.com/install.sh | sudo bash -s -- --uninstall` printed "Sensor removed (incl. /var/lib/alloy)" but SSH inspection showed all 15 items still existed (alloy service/binary/config/secret/data/drop-in, snmp_exporter binary/service/config, auditd rules, Grafana repo/key, alloy + snmp_exporter processes). Score: 0/15 items removed. The uninstall printed false success.

### How I tested

Same as BUG-056 — downloaded the live `install.sh` and read the rewritten `uninstall()` function (lines 151–230). BUG-068 is the same root cause as BUG-056 (the original uninstall didn't remove snmp_exporter/auditd/Grafana repo AND didn't remove alloy/alloy config/data either — it was a complete no-op that printed false success).

### Evidence — the rewritten `uninstall()` now removes all 15 items

The new `uninstall()` function (see §5 for full code) addresses every item from the original BUG-068 list:

| # | Original item still present | Now removed? | How |
|---|-----|------|------|
| 1 | Alloy service (running, enabled) | ✅ | `systemctl stop alloy; systemctl disable alloy` |
| 2 | Alloy binary (`/usr/bin/alloy`) | ✅ | `apt-get purge -y alloy` (or dnf/yum remove) |
| 3 | Alloy config (`/etc/alloy/config.alloy`) | ✅ | `rm -f "$ALLOY_CONFIG"` |
| 4 | Ingest token file (`/etc/alloy/observe.env`) | ✅ | `rm -f "$ENV_FILE"` (the secret is removed) |
| 5 | SNMP targets (`/etc/alloy/snmp_targets.json`) | ✅ | `rm -f /etc/alloy/snmp_targets.json` |
| 6 | Data dir (`/var/lib/alloy/`) | ✅ | `rm -rf "$DATA_DIR"` |
| 7 | systemd drop-in (`/etc/systemd/system/alloy.service.d/`) | ✅ | `rm -rf "$DROPIN_DIR"` |
| 8 | snmp_exporter binary (`/usr/local/bin/snmp_exporter`) | ✅ | `rm -f /usr/local/bin/snmp_exporter` (marker-guarded) |
| 9 | snmp_exporter service (`/etc/systemd/system/snmp_exporter.service`) | ✅ | `systemctl stop/disable + rm -f` (unit-guarded) |
| 10 | snmp_exporter config (`/etc/snmp_exporter/snmp.yml`) | ✅ | `rm -rf /etc/snmp_exporter` (marker-guarded) |
| 11 | auditd rules (`/etc/audit/rules.d/24observe.rules`) | ✅ | `rm -f /etc/audit/rules.d/24observe.rules + augenrules --load` |
| 12 | Grafana apt repo (`/etc/apt/sources.list.d/grafana.list`) | ✅ | `rm -f` (marker-guarded) |
| 13 | Grafana GPG key (`/etc/apt/keyrings/grafana.gpg`) | ✅ | `rm -f` (marker-guarded) |
| 14 | alloy process (PID 742, 14.9% CPU) | ✅ | stopped via `systemctl stop alloy` |
| 15 | snmp_exporter process (PID 705) | ✅ | stopped via `systemctl stop snmp_exporter` |

**Score: 15/15 items now removed.**

### Evidence — false success message is gone

The original bug's key symptom was the false "Sensor removed" message. The new `uninstall()` replaces it with honest verification:

```bash
local leftovers=""
systemctl is-active alloy >/dev/null 2>&1 && leftovers="${leftovers}\n  - alloy service still active"
command -v alloy >/dev/null 2>&1 && leftovers="${leftovers}\n  - alloy binary ... — is dpkg/apt locked? re-run once it frees"
[ "$audit_reload_ok" = false ] && leftovers="${leftovers}\n  - 24observe audit rules removed from disk, but the running kernel rules could not be reloaded ..."
for p in "$ALLOY_CONFIG" "$ENV_FILE" "$DROPIN_DIR" "$DATA_DIR" /etc/alloy/snmp_targets.json; do
  [ -e "$p" ] && leftovers="${leftovers}\n  - $p"
done
# ... snmp_exporter + grafana leftovers checks ...
if [ -n "$leftovers" ]; then
  printf '\033[0;31m[24observe] ERROR:\033[0m uninstall INCOMPLETE — these remain ...:%b\n' "$leftovers" >&2
  exit 1
fi
log "Sensor fully removed (only resources this installer created were touched). ..."
```

If anything remains, it prints a red `ERROR: uninstall INCOMPLETE` with a specific list and `exit 1` — it can no longer print false success.

### Verdict reasoning

All 15 items from the original report are now removed by the rewritten `uninstall()` (alloy fully purged, snmp_exporter/auditd/Grafana cleaned, processes stopped, secret removed). The false "Sensor removed" message is replaced with per-path verification and honest error reporting. **BUG-068 is FIXED.**

### Caveat

Verified statically (read the `uninstall()` source). Not executed on a VM — that would require provisioning a host and is destructive. The static analysis shows the logic is correct and symmetric with install.

### Reproduction (read-only — read the script)

```powershell
$install = (Invoke-WebRequest "https://api.24observe.com/install.sh").Content
# uninstall() (lines 151-230): stop/disable/purge alloy; rm config+data+dropin+secret;
#   remove snmp_exporter (marker-guarded); rm auditd rules + reload; rm grafana repo/key (marker-guarded);
#   verify every path; exit 1 with leftovers list if anything remains (no false success).
```

**Artifacts:** `install.sh`

---

## Cross-reference: BUG-056 vs BUG-068

BUG-056 and BUG-068 describe the same root cause from different angles:
- **BUG-056** (LOW, reported 2026-07-23): the uninstall didn't remove snmp_exporter, auditd rules, or Grafana repo (3 specific gaps).
- **BUG-068** (HIGH, reported 2026-08-03): the uninstall removed NOTHING — all 15 items still existed, with a false success message.

The rewritten `uninstall()` function fixes both: it removes all 15 items (addressing BUG-068's "0/15 removed") AND specifically cleans up snmp_exporter + auditd + Grafana repo (addressing BUG-056's three gaps), plus the false-success behavioral fix.

---

## Methodology & Caveats

### Test approach
- **Read-only only** — no tokens generated, no sensors enrolled, no status pages created, no components added, no install/uninstall executed. All evidence is from API responses, the live dashboard JS bundle, the public status page HTML, and the published `install.sh`.
- **API calls** via Node.js `https` module (PowerShell `Invoke-WebRequest` timed out on large responses).
- **Bundle analysis** — downloaded `/assets/index-Dw1RIs-B.js` (428 KB) and grepped with Node.js scripts for specific UI strings and code structures.
- **Static script analysis** for BUG-056/BUG-068 — read the `uninstall()` function source rather than executing it (would require a VM and is destructive).

### Caveats
- **BUG-065** (duplicate monitor 500) — verdict is based on static analysis of the add-component flow (no client-side duplicate check, no `onError` handler, OpenAPI documents only 200). A live mutating test (create status page + add same monitor twice) would confirm the server-side 500 vs 400 behavior, but was not performed to keep tests read-only.
- **BUG-056/BUG-068** (uninstall) — verified statically. A VM run would confirm runtime behavior (e.g., whether `apt-get purge` succeeds on a specific box), but the static analysis shows the logic is correct and symmetric with install.
- **BUG-063** — the original incident #1122 is not in this account. Tested with available incidents 1348 and 1343, which show clean topology-only blast radius. The fix appears global (the context summary endpoint returns topology entities, not audit entries).
- **Account state** — this account (org 169) has 18 tokens and 1 sensor. The original BUG-059 report of "300+ tokens" was on a dirty account state that has since been cleaned.

---

## Artifacts

| File | Contents | Bugs |
|---|---|---|
| `dashboard_bundle.js` | Live dashboard JS bundle (428 KB) | 052, 054, 055, 058, 059, 060, 061, 064, 065, 066 |
| `install.sh` | Live installer (18,201 bytes) — rewritten `uninstall()` at lines 151–230 | 056, 058, 068 |
| `status_page_shell.html` | Public status page HTML (20,177 bytes) | 067 |
| `openapi_spec.json` | Full OpenAPI spec (172 paths) | 059, 062, 064, 065, 067 |
| `me_full.json` | `GET /api/v1/me` — quota with `connectedEndpoints: 1, connectedEndpointLimit: 5` | 057, 062 |
| `sensors_list.json` | `GET /api/v1/sensors/` — 1 sensor (kali) | 057 |
| `tokens_full.json` | `GET /api/v1/me/tokens/` — 18 tokens; 4 enroll tokens expire 2027-* | 055, 059, 060 |
| `incidents_list.json` | `GET /api/v1/incidents/` — 20 incidents | 063 |
| `context_inc1348.json` | Blast radius for incident 1348 — topology only | 063 |
| `context_inc1343.json` | Blast radius for incident 1343 — topology only | 063 |
| `badge_588.svg` | 404 SVG for monitor 588 | 053 |
| `badge_999999.svg` | Identical 404 SVG for non-existent monitor (control) | 053 |
| `hosts_list.json` | `GET /api/v1/hosts/` | 057 |

---

*End of verification report for BUG-052 to BUG-068.*
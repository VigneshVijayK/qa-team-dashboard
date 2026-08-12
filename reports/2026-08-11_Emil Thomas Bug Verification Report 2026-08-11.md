24observe Testing Report
Date: 11 August 2026
Tester: Emil Thomas (API + On-Host + Static Analysis)
Environment: Hosted dashboard (login.24observe.com), API (api.24observe.com), Kali VM (on-host), Ubuntu VM (VMware)
Account: Free plan
________________________________________________________________________________
**Verification Summary Table**:
| Bug ID | Bug Name | Severity | Last Known Status | Your Verdict | Evidence |
|--------|----------|----------|-------------------|--------------|----------|
| BUG-018 | Status Pages Create 500 | MEDIUM | FIXED | ✅ VERIFIED FIXED | POST returns clean 201 with correct schema (`title`+`slug`); no 500 or error body |
| BUG-019 | Webhook PATCH name 500 | MEDIUM | FIXED | ✅ VERIFIED FIXED | Old route gone (404); new `/webhook-subscriptions/` rejects unknown fields with 400, PATCH with valid fields returns 200 |
| BUG-020 | Metric Alert No GET Detail | LOW | FIXED | ✅ VERIFIED FIXED | `GET /api/v1/metric-alerts/{id}` returns 200 with single object; OpenAPI lists `get` on the detail route |
| BUG-021 | Webhook No GET Detail | LOW | FIXED | ✅ VERIFIED FIXED | `/api/v1/webhook-subscriptions/{id}` supports `['get','patch','delete']` per OpenAPI |
| BUG-022 | Status Pages No GET Detail | LOW | FIXED | ✅ VERIFIED FIXED | `/api/v1/status-pages/{id}` supports `['get','patch','delete']` per OpenAPI |
| BUG-023 | Broken Alloy Config | HIGH | FIXED | ✅ VERIFIED FIXED | `alloy run` loads config cleanly; `otelcol.processor.transform.redact` exits without error; verified on-host |
| BUG-024 | Bootstrap Revokes Token | MEDIUM | FIXED | ✅ VERIFIED FIXED | Old token still returns HTTP 200 after re-bootstrap; verified 4×, no 401 flood |
| BUG-025 | Uninstall Leaves Data Dir | MEDIUM | PARTIALLY VERIFIED | ✅ FIXED (static analysis) / ⚠️ ON-HOST PENDING | Static analysis (75/82 checks, all 8 critical passed): `DATA_DIR="/var/lib/alloy"`, `rm -rf "$DROPIN_DIR" "$DATA_DIR"`, leftovers verification loop, `exit 1` on incomplete cleanup. On-host script ready; Ubuntu VM test pending. |
| BUG-026 | Incidents No Status Filter | LOW | FIXED | ✅ VERIFIED FIXED | `?status=resolved` returns filtered results; `?status=invalid` returns 400 with enum validation; `limit`/`offset` documented in OpenAPI |
| BUG-027 | Badge SVG Under 404 | LOW | PARTIALLY FIXED | ⚠️ PARTIALLY FIXED | Healthy monitors → 200 ✅; "never checked" and "not found" both return 404 with identical SVG — still conflated |
________________________________________________________________________________
## BUG-018 — Status Pages Create Returns Wrong Response (500 / 201+error)
**Area:** API
**Severity:** MEDIUM
**First Reported:** 2026-07-01
**Last Verified:** 2026-08-11
**Status:** ✅ VERIFIED FIXED
**Description**
Status page creation returned 500 or 201 with an error body.
**Reproduction**
```bash
POST /api/v1/status-pages
Payload (correct schema): {"title":"reverify-aug11-sp","slug":"reverify-aug11-112626"}
```
**Live Evidence (as on 2026-08-11)**
```json
HTTP 201
{"id":110,"organizationId":68,"slug":"reverify-aug11-112626","title":"reverify-aug11-sp","isPublic":true,...}
```
The OpenAPI schema now correctly requires `title` + `slug` (not `name`). With the correct schema, creation returns a clean HTTP 201 with a proper response body. No regression observed.
**Root Cause**
Schema mismatch between what the API expected and what the GUI sent.
**Recommended Fix**
Already applied — schema now requires `title` + `slug`.
**Verification Evidence**
- Tested with: `curl -X POST https://api.24observe.com/api/v1/status-pages -H "Authorization: Bearer ..." -H "Content-Type: application/json" -d '{"title":"...","slug":"..."}'`
- Verified HTTP 201 with clean response body
- Result: No 500 or error body; creation works correctly.
**Status History**
- 2026-07-01: BROKEN (first reported)
- 2026-07-03: FIXED
- 2026-08-11: VERIFIED FIXED — Emil Thomas
________________________________________________________________________________
## BUG-019 — Webhook PATCH `name` Causes 500 Internal Server Error
**Area:** API
**Severity:** MEDIUM
**First Reported:** 2026-07-01
**Last Verified:** 2026-08-11
**Status:** ✅ VERIFIED FIXED
**Description**
Patching a webhook with the `name` field caused a 500 Internal Server Error.
**Reproduction**
```bash
# Old route (gone):
PATCH /api/v1/webhooks/{id}  →  HTTP 404

# New route:
POST /api/v1/webhook-subscriptions/  →  HTTP 201  →  id=74
PATCH .../{id} with {"name":...}     →  HTTP 400  "nothing to update"
PATCH .../{id} with {"url":...}      →  HTTP 200  (works)
```
**Live Evidence — Schema Migration**
| Old schema field | New schema field |
|------------------|------------------|
| `name` | *(removed)* |
| `url` | `url` (kept) |
| `events` | `eventTypes` (renamed + enum-validated) |
| — | `description` (new) |
| — | `enabled` (new) |
The entire webhooks feature was redesigned. The old `/api/v1/webhooks` route no longer exists (returns 404). It is replaced by `/api/v1/webhook-subscriptions/` with a cleaner schema. The original 500-crash bug is gone. The new schema simply rejects unknown fields with a clean 400.
**Root Cause**
Server-side crash when processing unrecognized field `name` in PATCH body.
**Recommended Fix**
Already applied — feature redesigned with proper field validation.
**Verification Evidence**
- Tested old route: returns 404 (correctly removed)
- Tested new route with invalid field: returns 400 (clean rejection)
- Tested new route with valid field: returns 200 (works)
- Result: No 500 error; unknown fields rejected cleanly.
**Status History**
- 2026-07-01: BROKEN (first reported)
- 2026-07-03: FIXED (redesigned)
- 2026-08-11: VERIFIED FIXED — Emil Thomas
________________________________________________________________________________
## BUG-020 — Metric Alert No GET Detail
**Area:** API
**Severity:** LOW
**First Reported:** 2026-07-01
**Last Verified:** 2026-08-11
**Status:** ✅ VERIFIED FIXED
**Description**
`GET /api/v1/metric-alerts/{id}` was missing — no way to fetch a single metric alert by ID.
**Reproduction**
```bash
GET /api/v1/metric-alerts/17
```
**Live Evidence (as on 2026-08-11)**
```json
HTTP 200
{"id":17,"name":"test-ma","metricName":"cpu","aggregation":"avg",...}
```
OpenAPI now lists `GET` on `/api/v1/metric-alerts/{id}` (methods: `['get', 'patch', 'delete']`). Single-object detail endpoint works correctly.
**Root Cause**
Detail route not registered in the router.
**Recommended Fix**
Already applied — GET detail route added.
**Verification Evidence**
- Tested with: `curl -s https://api.24observe.com/api/v1/metric-alerts/17 -H "Authorization: Bearer ..."`
- Verified HTTP 200 with single object response
- Verified OpenAPI spec lists GET on the detail route
- Result: GET detail works correctly.
**Status History**
- 2026-07-01: BROKEN (first reported)
- 2026-07-03: FIXED
- 2026-08-11: VERIFIED FIXED — Emil Thomas
________________________________________________________________________________
## BUG-021 — Webhook No GET Detail
**Area:** API
**Severity:** LOW
**First Reported:** 2026-07-01
**Last Verified:** 2026-08-11
**Status:** ✅ VERIFIED FIXED
**Description**
No GET detail endpoint existed for webhooks.
**Live Evidence (as on 2026-08-11)**
OpenAPI confirms `/api/v1/webhook-subscriptions/{id}` supports methods `['get', 'patch', 'delete']`. GET detail is now available via the redesigned webhook-subscriptions route.
**Root Cause**
Detail route not registered; resolved via feature redesign.
**Recommended Fix**
Already applied — new `/webhook-subscriptions/{id}` route includes GET.
**Verification Evidence**
- Verified OpenAPI spec: `/api/v1/webhook-subscriptions/{id}` lists `get`
- Result: GET detail now available.
**Status History**
- 2026-07-01: BROKEN (first reported)
- 2026-07-03: FIXED (redesigned)
- 2026-08-11: VERIFIED FIXED — Emil Thomas
________________________________________________________________________________
## BUG-022 — Status Pages No GET Detail
**Area:** API
**Severity:** LOW
**First Reported:** 2026-07-01
**Last Verified:** 2026-08-11
**Status:** ✅ VERIFIED FIXED
**Description**
No GET detail endpoint existed for status pages.
**Live Evidence (as on 2026-08-11)**
OpenAPI confirms `/api/v1/status-pages/{id}` now supports methods `['get', 'patch', 'delete']`. GET detail is now available.
**Root Cause**
Detail route not registered.
**Recommended Fix**
Already applied — GET detail route added.
**Verification Evidence**
- Verified OpenAPI spec: `/api/v1/status-pages/{id}` lists `get`
- Result: GET detail now available.
**Status History**
- 2026-07-01: BROKEN (first reported)
- 2026-07-03: FIXED
- 2026-08-11: VERIFIED FIXED — Emil Thomas
________________________________________________________________________________
## BUG-023 — Sensor Bootstrap Ships Broken Alloy Config (Agent Won't Start)
**Area:** Sensor / Onboarding
**Severity:** HIGH
**First Reported:** 2026-07-08
**Last Verified:** 2026-08-11
**Status:** ✅ VERIFIED FIXED
**Description**
Any brand-new Linux host that follows the documented one-liner gets an Alloy config that Alloy refuses to load. The service crash-loops and **no logs or metrics are ever shipped** until the config is hand-edited. This blocks first-run onboarding for every Linux customer. Because every profile config inherits the same block, NONE of the host profiles can start a fresh agent until this is fixed.
**Root Cause**
The generated config contains 10 redaction rules in `otelcol.processor.transform "redact"`. The last rule (labelled `[REDACTED:kv-secret]`) is an Alloy backtick string that wraps an OTTL double-quoted string, and that inner OTTL string contains **un-escaped double-quote characters inside its regex character classes**. The bare quote closes the string early, so Alloy's OTTL lexer aborts.
**The offending line (verbatim from the generated config):**
```
`replace_pattern(body, "(?i)\\b(password|passwd|secret|api[_-]?key|token)[\"\\s:=]+[^\\s\"]{6,}", "[REDACTED:kv-secret]")`,
```
The two bare `"` characters inside `["\\s:=]` and `[^\\s"]` are the problem.
**Why It Slipped Through CI**
`alloy fmt` **passes** on this file (RC=0) because the outer HCL grammar is valid — the broken quoting is only inside a string literal. The failure only appears when Alloy **evaluates** the component at `alloy run` time. So a formatter check is not enough; a load/dry-run check is required.
**Exact Runtime Failure (captured live on the Kali VM):**
```
level=error msg="failed to evaluate config" controller_path=/ controller_id=""
node=otelcol.processor.transform.redact
err="decoding configuration: statement has invalid syntax: 1:75: lexer: invalid input text \"\\s:=]+[^\\s\"]{6...\""
Error: /tmp/live_config.alloy:21:1: Failed to build component: decoding configuration:
statement has invalid syntax: 1:75: lexer: invalid input text \"\\s:=]+[^\\s\"]{6...\"
Error: could not perform the initial load successfully
collector server run finished with error: could not perform the initial load successfully
```
**Reproduction (fixed — now loads cleanly)**
```bash
# 1) get an enroll token
ENROLL=$(curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -X POST https://api.24observe.com/api/v1/sensors/enroll-token -d '{"label":"reverify-aug11"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['enrollToken'])")

# 2) bootstrap and save the generated config
curl -s -X POST https://api.24observe.com/api/v1/sensors/bootstrap \
  -H "authorization: Bearer $ENROLL" -H "content-type: application/json" \
  -d '{"machineId":"reverify0000000000000000000000","hostname":"reverify-aug11","os":"Kali","sensorVersion":"0.1.0","enableFindings":false,"profiles":[]}' \
  | python3 -c "import sys,json;open('cfg_reverify.alloy',\"w\").write(json.load(sys.stdin)['alloyConfig'])"

# 3) alloy fmt PASSES:
alloy fmt cfg_reverify.alloy    # RC=0

# 4) alloy run NOW LOADS CLEANLY:
alloy run --storage.path=/tmp/d cfg_reverify.alloy
#   node exited without error node=otelcol.processor.transform.redact
```
**Fix**
1. In the server config generator, escape (or avoid) the double-quote characters inside the `kv-secret` OTTL regex character classes. ✅ Done — inner quotes now emitted as `\"`
2. Add a CI gate that runs `alloy run --dry-run` (not just `alloy fmt`) against a generated config before release. (Recommendation stands)
**Verification Evidence**
- Tested on-host (Kali VM): `alloy run` loads config cleanly
- `otelcol.processor.transform.redact` exits without error
- Verified 2026-08-11: no regression
- Result: Config generation fixed; alloy starts successfully.
**Status History**
- 2026-07-08: BROKEN (first reported, HIGH)
- 2026-07-09: Re-verified live, still HIGH
- 2026-07-10: FIXED at generator level — inner quotes now emitted as `\"`
- 2026-07-13: FIXED — verified ON-HOST
- 2026-08-11: VERIFIED FIXED — Emil Thomas
________________________________________________________________________________
## BUG-024 — Re-Running Bootstrap Revokes the Token It Just Issued (401 Flood)
**Area:** Sensor / Token Lifecycle
**Severity:** MEDIUM
**First Reported:** 2026-07-08
**Last Verified:** 2026-08-11
**Status:** ✅ VERIFIED FIXED
**Description**
Each bootstrap for the same `machineId` mints a new host ingest token and **revokes the previous one**. If bootstrap runs twice (installer + any re-run/verification, or the installer being run again), the token already written to `/etc/alloy/observe.env` becomes invalid and Alloy floods with `HTTP 401` on every OTLP send. Hard to diagnose because the agent looks "installed".
**Evidence (original bug — two bootstraps, same machineId)**
```
bootstrap #1 -> ingest token A (obs_eMwAtqbK...)
bootstrap #2 -> ingest token B (obs_zsxwzCg3...)
POST /otlp/v1/logs  (token A)  -> 401   <- the one on disk, now revoked
POST /otlp/v1/logs  (token B)  -> 200   <- only the newest works
```
**Live Alloy log after a re-bootstrap, token on disk now stale (original bug)**
```
level=error msg="Exporting failed. Dropping data." component_id=otelcol.exporter.otlphttp.observe
error="not retryable error: Permanent error: rpc error: code = Unauthenticated desc = error exporting items,
request to https://api.24observe.com/api/v1/otlp/v1/logs responded with HTTP Status Code 401" dropped_items=1
```
(The above repeats every ~1s — a continuous 401 flood — while the agent still reports as running.)
**Fix**
Make bootstrap idempotent per `machineId` (return the current valid token instead of rotating), **or** have the installer always overwrite `observe.env` with the token from the latest bootstrap response so disk and server never diverge. Also surface a clearer agent-side error than a raw 401 flood.
**Fix Verification (2026-08-11)**
Bootstrap is now idempotent per `machineId`. After re-bootstrap, the old token still returns **HTTP 200** on OTLP sends. Verified 4× — no 401 flood, no token rotation on re-bootstrap. No regression observed.
**Verification Evidence**
- Tested: 4 consecutive bootstraps with same `machineId`
- Old ingest token still returns HTTP 200 on OTLP sends
- No 401 flood in alloy logs
- Result: Bootstrap is idempotent; token not revoked on re-bootstrap.
**Status History**
- 2026-07-08: BROKEN (first reported)
- 2026-07-09: Still active — VM's Alloy flooding HTTP 401
- 2026-07-10: FIXED — old token still returns HTTP 200 after re-bootstrap (verified 4×)
- 2026-08-11: VERIFIED FIXED — Emil Thomas
________________________________________________________________________________
## BUG-025 — install.sh --uninstall Leaves /var/lib/alloy/data (Crash-Loop on Re-Enroll)
**Area:** install.sh uninstall + fresh enroll interaction
**Severity:** MEDIUM (conditional trigger)
**First Reported:** 2026-07-08
**Last Verified:** 2026-08-11
**Status:** ✅ FIXED (static analysis) / ⚠️ ON-HOST VERIFICATION PENDING
**Description**
The `uninstall()` function removes the config, env file, drop-in and the `alloy` package, but did **not** remove the Alloy state directory (`/var/lib/alloy/data`). If the host was previously enrolled with a profile that runs the agent as **root** (`auditd`/`syslog`), that directory is left owned `root:root`. A later **plain** re-enroll writes a drop-in that runs Alloy as the packaged `alloy` user, which then cannot write the root-owned directory and crash-loops.
**Evidence (observed on the Kali host — original bug)**
```
Error: open /var/lib/alloy/data/loki.source.journal.host/positions.yml: permission denied
Error: failed to create the remotecfg service: mkdir /var/lib/alloy/data/remotecfg: permission denied
# systemd NRestarts climbed 11 -> 17 (crash loop)
```
**Scope (honesty)**
A truly first-time install on a clean host (no pre-existing root-owned data) will **not** hit this. It bites on re-enroll after a profile change, and on hosts that previously ran a root profile. Still a real installer defect.
**Fix**
On uninstall, delete or re-own the Alloy state directory. On enroll, re-own `/var/lib/alloy` to the effective service user (e.g. `chown -R alloy:alloy /var/lib/alloy`), or set `StateDirectory=alloy` in the systemd unit so ownership is fixed automatically.
**Static Analysis Verification (2026-08-11) — 75/82 checks passed, all 8 critical passed**
The live `install.sh` at `https://api.24observe.com/install.sh` was exhaustively analyzed (82 checks across 5 phases):
| Phase | Checks | Passed | Status |
|-------|--------|--------|--------|
| A: Script Structure | 12 | 12 | ✅ |
| B: Uninstall Function | 28 | 25 | ✅ |
| C: Enroll & Configure | 14 | 12 | ✅ |
| D: API Verification | 10 | 9 | ✅ |
| E: Edge Cases & Regression | 18 | 17 | ✅ |
**Critical checks (all passed):**
1. ✅ `DATA_DIR="/var/lib/alloy"` defined with `# QA Bug #3` comment
2. ✅ `rm -rf "$DROPIN_DIR" "$DATA_DIR"` in `uninstall()`
3. ✅ Post-removal verification loop (`for p in ... DATA_DIR`)
4. ✅ `[ -e "$p" ]` existence check for each path
5. ✅ `leftovers` variable tracking incomplete removal
6. ✅ `exit 1` on leftovers (non-zero exit on incomplete cleanup)
7. ✅ "Sensor fully removed" only printed after verification (not unconditional)
8. ✅ `User=root` / `Group=root` elevation for auditd/syslog profiles
9. ✅ Sensor DELETE API works; re-enroll after delete succeeds
**The fix is present in code.** The `uninstall()` function now:
- Defines `DATA_DIR="/var/lib/alloy"` with a `# QA Bug #3` comment
- Removes it: `rm -rf "$DROPIN_DIR" "$DATA_DIR"`
- Verifies removal with a leftovers check loop
- Exits code 1 if anything remains
- Reports "Sensor fully removed" only after verification
**On-Host Verification (pending)**
A comprehensive 6-phase on-host test script (`bug025_onhost.sh`) is ready for execution on an Ubuntu VM (VMware). The script will:
- Phase 1: Download & static-analyze `install.sh`
- Phase 2: Snapshot pre-existing state of `/var/lib/alloy`
- Phase 3: Install sensor via `install.sh --enroll-token=...`
- Phase 4: Run `--uninstall` and verify `/var/lib/alloy/data` is actually deleted from the filesystem
- Phase 5: Simulate crash-loop scenario (root-owned residue + alloy user → permission denied)
- Phase 6: Re-enroll after cleanup and verify alloy runs without errors
**Status History**
- 2026-07-08: BROKEN (first reported)
- 2026-07-09: Not re-exercised (carried forward)
- 2026-07-13: Partially verified — residue confirmed present on live VM (`/var/lib/alloy/data` → 44K, owned by alloy:alloy). Full uninstall path not reproducible (no `install.sh` with `--uninstall` on VM).
- 2026-08-11: FIXED (static analysis — fix confirmed in live `install.sh` code). On-host verification script ready; Ubuntu VM test pending.
________________________________________________________________________________
## BUG-026 — GET /incidents/ Has No Status Filter and Undocumented Params
**Area:** API
**Severity:** LOW
**First Reported:** 2026-07-08
**Last Verified:** 2026-08-11
**Status:** ✅ VERIFIED FIXED
**Description**
The incidents list endpoint had no status filter and undocumented pagination params.
**Findings (original bug)**
- `?limit=` and `?offset=` **worked** but were undocumented
- `?status=investigating` (or any status) was **rejected** with `400 VALIDATION_FAILED unrecognized_keys: status`
- Neither `limit` nor `offset` was declared in the OpenAPI spec (0 parameters on this route)
**Fix Verification (2026-08-11)**
```bash
GET /api/v1/incidents/?limit=5&offset=0     -> 200
GET /api/v1/incidents/?status=resolved      -> 200  (returns only resolved, e.g. incident 535 "Sensor offline: kali")
GET /api/v1/incidents/?status=notarealstatus-> 400  {"error":"querystring/status must be equal to one of the allowed values"}
```
OpenAPI documents params: `limit`, `offset`, `status`. All three work correctly with proper enum validation.
**Root Cause**
Status filter not implemented; pagination params not declared in spec.
**Recommended Fix**
Already applied — status filter with enum validation added; params documented in OpenAPI.
**Verification Evidence**
- Tested `?status=resolved`: returns filtered results (HTTP 200)
- Tested `?status=invalid`: returns 400 with allowed-values error
- Verified OpenAPI spec documents `limit`, `offset`, `status`
- Result: Status filter works; params documented.
**Status History**
- 2026-07-08: BROKEN (first reported)
- 2026-07-10: FIXED — status filter works and validates the enum
- 2026-08-11: VERIFIED FIXED — Emil Thomas
________________________________________________________________________________
## BUG-027 — Monitor Badge Returns Valid SVG Under HTTP 404
**Area:** API / Badge
**Severity:** LOW
**First Reported:** 2026-07-08
**Last Verified:** 2026-08-11
**Status:** ⚠️ PARTIALLY FIXED
**Description**
The monitor badge endpoint returns a valid SVG image but with HTTP 404 status, and conflates "no data yet" with "monitor not found".
**Verified States (2026-08-11)**
| Monitor state | HTTP | Body |
|---|---|---|
| Healthy monitor (lastStatus=up, established uptime rollup) | **200** ✅ | `uptime: up` |
| Brand-new monitor, no checks yet (lastStatus=null) | 404 ❌ | `uptime: unknown` |
| Non-existent id (999999) | 404 ❌ | `uptime: unknown` |
**Findings**
- For a monitor whose uptime rollup is not yet computed, the endpoint returns a well-formed image (839 bytes, `content-type: image/svg+xml`, `cache-control: public`) but with status **404**.
- A non-existent monitor id returns the **same** 404 + same body. So the 404 currently means "uptime unknown OR monitor missing".
- The 200 path now works for healthy monitors. ✅
**What Remains**
"Never checked" and "not found" are still **indistinguishable** — both return 404 with identical SVG bodies. The 404 also still serves a renderable `image/svg+xml` body.
**Root Cause**
The endpoint uses HTTP 404 as a catch-all for both "no uptime data" and "monitor doesn't exist".
**Recommended Fix**
Return 200 whenever an image is produced (even a "no data yet" badge). Reserve 404 for genuinely unknown monitor ids, and update the spec accordingly.
**Verification Evidence**
- Tested healthy monitor (id with established uptime): HTTP 200, `uptime: up` ✅
- Tested new monitor (no checks yet): HTTP 404, `uptime: unknown` ❌
- Tested non-existent id (999999): HTTP 404, `uptime: unknown` ❌
- Result: 200 path fixed; 404 still conflates two distinct states.
**Status History**
- 2026-07-08: BROKEN (first reported)
- 2026-07-10: Still active — badge body renders but status is 404
- 2026-07-11: Still active
- 2026-07-13: Partially fixed — 200 for healthy monitors; 404 still conflates "no data" with "not found"
- 2026-08-11: PARTIALLY FIXED — Emil Thomas
________________________________________________________________________________
Summary

Bugs verified today:
1. Status Pages Create 500 — bug fixed.
2. Webhook PATCH name 500 — bug fixed (feature redesigned).
3. Metric Alert No GET Detail — bug fixed.
4. Webhook No GET Detail — bug fixed.
5. Status Pages No GET Detail — bug fixed.
6. Broken Alloy Config — bug fixed, verified on-host.
7. Bootstrap Revokes Token — bug fixed, idempotent per machineId.
8. Uninstall Leaves Data Dir — fix confirmed in code (static analysis); on-host test pending.
9. Incidents No Status Filter — bug fixed, status filter with enum validation.
10. Badge SVG Under 404 — partially fixed; 200 for healthy monitors, but 404 still conflates "no data" with "not found".

Remaining to verify: BUG-028 through BUG-034 (7 bugs).
________________________________________________________________________________
End of report.

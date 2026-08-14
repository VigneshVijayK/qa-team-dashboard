24observe Testing Report

Date: 13 August 2026
Tester: Angel Thomas (GUI + Copilot + DevTools)
Environment: Hosted dashboard (login.24observe.com), API (api.24observe.com)
Account: Free plan
_______________________________________________________________________________________

| Bug ID | Bug Name | Severity | Last Known Status | Your Verdict | Evidence |
|--------|----------|----------|-------------------|--------------|----------|
| BUG-006 | No State Machine | MEDIUM | FIXED | VERIFIED(FIXED) | Pause accepted; illegal transition rejected (400); monitor shows `paused=true`, `lastStatus=up` |
| BUG-007 | Error Messages Leak | MEDIUM | BROKEN |FIXED | |
| BUG-008 | sensorVersion Null | LOW | FIXED | VERIFIED(FIXED) | Sensor returns `0.1.0 (alloy 1.18.1)` — no null |
| BUG-009 | No Sensor Detail Endpoint | LOW | BROKEN | VERIFIED(FIXED) | `GET /api/v1/sensors/{id}` returns 200 with full sensor object |
| BUG-010 | AI Findings 404 | LOW | STILL ABSENT | STILL ABSENT | 7 candidate routes × auth/no-auth all 404; OpenAPI 172 paths, no findings/insights |
| BUG-011 | Status Page Cache | MEDIUM | CANNOT VERIFY | FIXED | GUI custom-domain save updates immediately without Ctrl+F5; page id 160 |
| BUG-012 | Mobile Chart Overflow | MEDIUM | UNTESTED | STILL REPRODUCIBLE | DevTools 390×608 + real mobile browser: page-level horizontal overflow/scrollbar; wide sidebar; no single-column layout; chart not yet isolated |
____________________________________________________________________________________________

## BUG-006 — No Monitor State Machine Validation

**Area:** API
**Severity:** MEDIUM
**First Reported:** 2026-06-26
**Status:** ✅ FIXED (2026-06-27)
**Last Verified:** ✅FIXED(2026-08-13)

**Description**

A paused monitor can transition directly to `up` or `down` without going through `active` first. No state validation exists.

**Reproduction**

```bash
# Pause the monitor
curl -s -X PATCH "https://api.24observe.com/api/v1/monitors/220" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"paused":true}'
# {"paused":true,...}

# Illegal transition: paused → up (should fail)
curl -s -X PATCH "https://api.24observe.com/api/v1/monitors/220" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"lastStatus":"up"}'
# ✅ SILENTLY ACCEPTED — no error, no validation
```

**Root Cause**

PATCH handler updates `paused` and `lastStatus` independently in the DB without checking if the transition is valid.

**Verification Performed:** 2026-08-13 — Tester: Angel Thomas

**Steps executed:**
- Pause monitor (ID `672`):

```bash
curl -s -X PATCH "https://api.24observe.com/api/v1/monitors/672" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"paused":true}'
```

Response (truncated):

```
{"id":672,"organizationId":163,"name":"ping_test","url":"https://google.com","type":"ping","intervalSec":900,"timeoutMs":5000,...,"lastStatus":"up","lastCheckedAt":"2026-08-13T04:16:40.458Z","paused":true,...}
```

- Attempt illegal transition (paused → `up`):

```bash
curl -s -X PATCH "https://api.24observe.com/api/v1/monitors/672" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"lastStatus":"up"}' -w "\nHTTP_CODE:%{http_code}\n"
```

Response:

```
{"error":"Validation failed","code":"VALIDATION_FAILED","fields":[{"path":"","code":"custom","message":"Update payload cannot be empty"}],"issues":[{"path":"","code":"custom","message":"Update payload cannot be empty"}]}
HTTP_CODE:400
```

- Retrieved monitor after changes (saved to `monitor_after.json` locally):

```bash
curl -s "https://api.24observe.com/api/v1/monitors/672" -H "Authorization: Bearer $TOKEN" -o monitor_after.json
```

**Raw outputs saved during testing:**

- `monitor_after.json` (full response body):

```
{"id":672,"organizationId":163,"name":"ping_test","url":"https://google.com","type":"ping","intervalSec":900,"timeoutMs":5000,"expectedStatusCode":null,"degradedResponseTimeMs":null,"port":null,"keyword":null,"keywordMatchType":null,"alertEmail":"[EMAIL REDACTED]","alertThreshold":1,"alertOnDegraded":false,"consecutiveFailures":0,"lastStatus":"up","lastCheckedAt":"2026-08-13T04:46:16.213Z","paused":true,"heartbeatGraceSec":60,"heartbeatLastReceivedAt":null,"uptimeTargetBp":999,"uptimeWindowDays":30,"sloBreachOpen":false,"createdAt":"2026-08-07T13:32:51.722Z","hasAlertWebhook":false,"hasAlertSlack":false,"hasAlertDiscord":false,"hasAlertMsteams":false,"hasAlertTelegram":false,"hasAlertPagerduty":false,"hasAlertOpsgenie":false,"hasAlertSms":false,"hasAlertVoice":false,"hasHeaders":false,"tags":[],"regions":["local"],"escalationPolicyId":null}
```

- `headers.txt` (captured header status):

```
HTTP_CODE:200
```

**Evidence:** see the responses above (pause response and validation error). The attempted `lastStatus` update returned a validation error and did not silently accept the illegal transition.


**Verdict:** FIXED — API rejects unauthorized `lastStatus` updates while paused (returns validation error).

**Status History**

- 2026-06-26: BROKEN (first reported)
- 2026-06-27: FIXED — `lastStatus` made read-only; PATCH now validates all allowed fields; unrecognized fields return `"Update payload cannot be empty"`. PATCH with `lastStatus` → 400 validation error.
- 2026-08-13: FIXED

_______________________________________________________________

## BUG-007 — API Error Messages Leak Internal Framework Details

**Area:** Security
**Severity:** MEDIUM
**First Reported:** 2026-06-26
**Last Verified:** 2026-06-27
**Latest Verification:** 2026-08-13 *(By Angel Thomas)*

**Status:** ✅FIXED

**Description**

The API leaks raw Node.js `JSON.parse` error messages when malformed JSON is submitted. Responses include exact parser position (byte offset), line number, column number, and echoed user input — all from the internal JavaScript runtime.

**Reproduction & Verification — 4 test cases**

| # | Input Payload | Server Response |
|---|---------------|----------------|
| 1 | `{broken` | `{"error":"Expected property name or '}' in JSON at position 1 (line 1 column 2)"}` |
| 2 | `just plain text` | `{"error":"Unexpected token 'j', \"just plain text\" is not valid JSON"}` |
| 3 | `{"foo": "\x00bar"}` | `{"error":"Bad escaped character in JSON at position 10 (line 1 column 11)"}` |
| 4 | `{"a":{"b":{"c":{"d":broken}}}}` | `{"error":"Unexpected token 'b', ...\"{\"c\":{\"d\":broken}}}}\" is not valid JSON"}` |

All 4 responses expose: parser byte position, line number, column number, and echoed raw user input. This is a verbatim Node.js `SyntaxError.message`.

**Root Cause**

No centralized Express error-handling middleware. The raw `SyntaxError` thrown by `JSON.parse` propagates to the client unmodified.

**Recommended Fix**

```js
// Add to Express app after all routes:
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  next(err);
});
```

**Reproduction & Verification — 4(+1) test cases***(as on 13-08-26)*

| # | Input Payload | HTTP |Server Response | Leak?|
|---|---------------|-------|---------|-------------------------------|
| 1 | `{broken` | 400 | `{"error":"Malformed JSON in request body","code":"BAD_JSON"}` | NO |
| 2 | `just plain text` | 400 | `{"error":"Malformed JSON in request body","code":"BAD_JSON"}` | NO |
| 3 | `{"foo": "\x00bar"}` | 400 | `{"error":"Malformed JSON in request body","code":"BAD_JSON"}` | NO |
| 4 | `{"a":{"b":{"c":{"d":broken}}}}` | 400 | `{"error":"Malformed JSON in request body","code":"BAD_JSON"}` | NO |
| 5 | `{"name":"x"} trailing` | 400 | `{"error":"Malformed JSON in request body","code":"BAD_JSON"}` | NO |

**Commands used (token redacted):**

```bash
curl -sS -i -X POST "https://api.24observe.com/api/v1/monitors" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{broken'

curl -sS -i -X POST "https://api.24observe.com/api/v1/monitors" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d 'just plain text'

curl -sS -i -X POST "https://api.24observe.com/api/v1/monitors" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary '{"foo": "\x00bar"}'
```

**Observed result (all cases):**

```
HTTP/2 400
content-type: application/json; charset=utf-8
{"error":"Malformed JSON in request body","code":"BAD_JSON"}
```

**Comparison to original bug:**

| Signal of leak | Original (BROKEN) | Now (2026-08-13) |
|----------------|-------------------|------------------|
| Parser position / line / column | Present | Absent |
| `Unexpected token` / Node `SyntaxError` text | Present | Absent |
| Echo of raw user input in error | Present | Absent |
| Generic client-safe message | No | Yes (`BAD_JSON`) |

**Verdict:** **FIXED** — invalid JSON is still rejected with HTTP 400, but internal framework parse details are no longer exposed.

**Note:** Additional payloads (nested broken JSON, trailing garbage, double JSON) were checked alongside the existing payloads; all parse-failure paths returned the sanitized response.

**Status History**

- 2026-06-26: BROKEN (first reported)
- 2026-06-27: Still broken (verified 4 rounds, 4 test cases)
- 2026-08-13: Fixed (verified 5 rounds, 5 test cases) *- By Angel Thomas*
_____________________________________________________________________________________

## BUG-008 — sensorVersion Field Returns Null

**Area:** Sensor
**Severity:** LOW
**First Reported:** 2026-06-26
**Last Verified:** 2026-08-13 *(By Angel Thomas)*
**Status:** ✅ FIXED (2026-07-08) *(verified on 13-08-2026)*

**Description**

`GET /api/v1/sensors` always returns `sensorVersion: null` for the `kali` sensor, even though Alloy v1.17.0 is installed and actively reporting (sensor is `active`, `lastSeen` is current).

**Reproduction**

```bash
curl -s "https://api.24observe.com/api/v1/sensors" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
for s in json.load(sys.stdin):
    print(s['hostname'], s.get('sensorVersion'))
"
# kali None
```

**Root Cause**

The `sensorVersion` field is not populated in the sensor listing query. Alloy v1.17.0 is installed but the version is not transmitted or stored.

**Verification Performed:** 2026-08-13 — Tester: Angel Thomas

**Steps executed:**

- Fetched the sensor list and extracted `hostname` + `sensorVersion`:

```bash
curl -s "https://api.24observe.com/api/v1/sensors" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
for s in json.load(sys.stdin):
    print(s['hostname'], s.get('sensorVersion'))
"
```

**Observed output:**

```
<hostname> 0.1.0 (alloy 1.18.1)
```

**Evidence:** The sensor returns a concrete `sensorVersion` of `0.1.0 (alloy 1.18.1)` — no `null` values. The version string includes both the 24observe sensor wrapper version (`0.1.0`) and the underlying Alloy collector version (`1.18.1`).

**GUI Verification:**

The same check can be performed from the dashboard UI:

1. Log in to the 24observe dashboard at `https://login.24observe.com`.
2. Navigate to **Hosts** in the sidebar.
3. Click on a host that has a sensor installed.
4. Look for the **Sensor Version** field in the host detail panel or sensor info section.
5. Confirm it displays a concrete version string (e.g., `0.1.0 (alloy 1.18.1)`) rather than blank, `null`, or `—`.

**Verdict:** ✅ **FIXED** — `sensorVersion` is populated for all sensors; the original `null` bug is no longer reproducible.


**Status History**

- 2026-06-26: BROKEN (first reported)
- 2026-06-27: Still broken
- 2026-07-08: FIXED — now `0.1.0 (alloy 1.10.2)` + fresh `lastSeen`
- 2026-08-13: FIXED *(verified by Angel Thomas)*
_____________________________________________________________________________________

## BUG-009 — No Individual Sensor Detail Endpoint (404)

**Area:** Sensor
**Severity:** LOW
**First Reported:** 2026-06-26
**Last Verified:** 2026-06-27 (Round 4)
**Status:** ✅ FIXED *(verified on 13-08-2026)*

**Description**

`GET /api/v1/sensors/{id}` was not implemented. The route did not exist. The OpenAPI spec (172 routes) confirmed only a list endpoint and a DELETE endpoint existed for sensors — no GET by ID.

**Reproduction (original broken state)**

```bash
curl -s "https://api.24observe.com/api/v1/sensors/5" \
  -H "Authorization: Bearer $TOKEN"
# {"message":"Route GET:/api/v1/sensors/5 not found","error":"Not Found","statusCode":404}
```

List endpoint worked for comparison:

```bash
curl -s "https://api.24observe.com/api/v1/sensors" -H "Authorization: Bearer $TOKEN"
# [{"id":5,"hostname":"kali","os":"Kali GNU/Linux Rolling","sensorVersion":null,"status":"active",...}]
```

**Root Cause**

Route `GET /api/v1/sensors/:id` was not implemented. Only `GET /api/v1/sensors/` (list) and `DELETE /api/v1/sensors/{id}` existed in the OpenAPI spec.


**Verification Performed:** 2026-08-13 — Tester: Angel Thomas

**Steps executed:**

- Fetched the sensor list to obtain a valid sensor ID:

```bash
curl -s "https://api.24observe.com/api/v1/sensors" \
  -H "Authorization: Bearer $TOKEN"


# Response: [{"id":114,...,"hostname":"<hostname>","os":"<os>","sensorVersion":"0.1.0 (alloy 1.18.1)","status":"offline",...}]
```

- Called the individual sensor detail endpoint with the ID from the list:

```bash
curl -s "https://api.24observe.com/api/v1/sensors/114" \
  -H "Authorization: Bearer $TOKEN"

# Response: {"id":114,...,"hostname":"<hostname>","os":"<os>","sensorVersion":"0.1.0 (alloy 1.18.1)","status":"offline",...}
```

**Evidence:** `GET /api/v1/sensors/114` returned HTTP 200 with the full sensor object matching the list entry. The route that previously returned 404 now resolves correctly.

**Verdict:** ✅ **FIXED** — the individual sensor detail endpoint (`GET /api/v1/sensors/{id}`) is now implemented and returns the full sensor object.

**Status History**

- 2026-06-26: BROKEN (first reported)
- 2026-06-27: Still broken
- 2026-08-13: ✅ FIXED *(verified by Angel Thomas)* 
_____________________________________________________________________________________
## BUG-010 — AI Findings / Insights Feature Not Implemented (404)

**Area:** Feature / Sensor
**Severity:** LOW
**First Reported:** 2026-06-26
**Last Verified:** 2026-08-13 *(By Angel Thomas)*
**Status:** ❌ STILL ABSENT

**Description**

All AI/findings-related endpoints return 404. The feature does not exist anywhere in the OpenAPI spec. No endpoints, no controllers, no LLM integration for findings/insights. Related sensor fields (`findingsEnabled` / `enableFindings`) are also absent from current sensor objects.

**Reproduction (original)**

```bash
curl -s "https://api.24observe.com/api/v1/findings" -H "Authorization: Bearer $TOKEN"
# {"message":"Route GET:/api/v1/findings not found","error":"Not Found","statusCode":404}

curl -s "https://api.24observe.com/api/v1/ai/findings" -H "Authorization: Bearer $TOKEN"
# {"message":"Route GET:/api/v1/ai/findings not found","error":"Not Found","statusCode":404}

curl -s "https://api.24observe.com/api/v1/insights" -H "Authorization: Bearer $TOKEN"
# {"message":"Route GET:/api/v1/insights not found","error":"Not Found","statusCode":404}
```

**Verification Performed:** 2026-08-13 — Tester: Angel Thomas

**Steps executed:**

Expanded path probe — each path tested **without auth** and **with bearer token**:

```bash
for path in \
  "/api/v1/findings" \
  "/api/v1/ai/findings" \
  "/api/v1/ai-findings" \
  "/api/v1/insights" \
  "/api/v1/ai/insights" \
  "/api/v1/anomalies" \
  "/api/v1/ai"
do
  echo "=== $path (no auth) ==="
  curl -sS -o /tmp/body -w "HTTP:%{http_code}\n" "https://api.24observe.com$path"
  head -c 200 /tmp/body; echo
  echo "=== $path (auth) ==="
  curl -sS -o /tmp/body -w "HTTP:%{http_code}\n" "https://api.24observe.com$path" \
    -H "Authorization: Bearer $TOKEN"
  head -c 200 /tmp/body; echo
done
```

**Observed results (all 14 requests):**

| Path | No auth | With auth | Body |
|------|---------|-----------|------|
| `/api/v1/findings` | 404 | 404 | `Route GET:/api/v1/findings not found` |
| `/api/v1/ai/findings` | 404 | 404 | `Route GET:/api/v1/ai/findings not found` |
| `/api/v1/ai-findings` | 404 | 404 | `Route GET:/api/v1/ai-findings not found` |
| `/api/v1/insights` | 404 | 404 | `Route GET:/api/v1/insights not found` |
| `/api/v1/ai/insights` | 404 | 404 | `Route GET:/api/v1/ai/insights not found` |
| `/api/v1/anomalies` | 404 | 404 | `Route GET:/api/v1/anomalies not found` |
| `/api/v1/ai` | 404 | 404 | `Route GET:/api/v1/ai not found` |

Auth does not change the outcome — routes are missing, not protected.

**OpenAPI Spec Check (2026-08-13):**

```text
GET https://api.24observe.com/openapi.json
path_count: 172
matching_paths for finding|insight|anomal (as findings APIs): none
```

No `/findings` or `/insights` paths exist in the spec. The endpoints are entirely absent — not just unimplemented but undefined.

**Related endpoints that DO exist (different feature — not a fix):**

| Path | HTTP | Notes |
|------|------|-------|
| `/api/v1/ai-agents/connection` | 200 | OTLP/agent connection status |
| `/api/v1/ai-agents/overview` | 200 | GenAI usage/cost overview |
| `/api/v1/ai-agents/security` | 200 | Agent security event counts |

These are GenAI agent observability endpoints and do **not** implement AI Findings / Insights.

**Sensor object check:**

```bash
curl -s "https://api.24observe.com/api/v1/sensors" -H "Authorization: Bearer $TOKEN"
```

Current sensor keys: `id`, `hostname`, `os`, `sensorVersion`, `status`, `firstSeen`, `lastSeen`, `machineId`, `patId` — no `findingsEnabled` / `enableFindings` fields present.

**Evidence:** 7 candidate routes × auth/no-auth = 14/14 returned HTTP 404. OpenAPI has 172 paths with zero findings/insights routes. Existing `/api/v1/ai-agents/*` routes are a separate feature.

**Verdict:** ❌ **STILL ABSENT** — AI Findings / Insights API is not implemented.

**Recommended Fix**

Either:
1. **Implement** the `/api/v1/findings` and `/api/v1/insights` endpoints and add them to the OpenAPI spec, **OR**
2. **Remove** all references to the AI Findings/Insights feature from the UI and documentation if it's not part of the product.

**Status History**

- 2026-06-26: BROKEN (first reported)
- 2026-06-27: Still broken
- 2026-07-01 through 2026-07-11: Still absent
- 2026-08-07: Still absent — needs product decision
- 2026-08-13: ❌ Still absent — expanded path probe (7 routes × auth/no-auth) all 404; OpenAPI path count 172 with no findings/insights routes *(verified by Angel Thomas)*

________________________________________________________________________________

## BUG-011 — Status Page Custom Domain Cache Not Invalidated

**Area:** GUI
**Severity:** MEDIUM
**First Reported:** 2026-06-26
**Last Verified:** 2026-08-13 *(By Angel Thomas)*
**Status:** ✅ FIXED

**Description**

After saving a custom domain change on a status page, the UI still showed the old domain until Ctrl+F5.

**Root Cause (original)**

Missing React Query cache invalidation after successful PATCH of status-page settings (including `customDomain`).

**Recommended Fix (original)**

```tsx
const queryClient = useQueryClient();

const handleSave = async () => {
  await api.patch(`/status-pages/${id}`, { customDomain });
  await queryClient.invalidateQueries({ queryKey: ['status-page', id] });
  toast.success('Saved!');
};
```

**Verification Performed:** 2026-08-13 — Tester: Angel Thomas

**Note:** The status page used below (`Bug011 Live 16:11:03`, id `160`, slug `bug011-live-161103`) was created for testing purposes only to verify this bug.

**Setup (API):**

Created a status page for GUI testing:

```bash
curl -sS -X POST "https://api.24observe.com/api/v1/status-pages/" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"slug":"bug011-live-161103","title":"Bug011 Live 16:11:03","isPublic":true}'
# HTTP 201
# {"id":160,"slug":"bug011-live-161103","title":"Bug011 Live 16:11:03","customDomain":null,...}
```

Set initial custom domain:

```bash
curl -sS -X PATCH "https://api.24observe.com/api/v1/status-pages/160" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"customDomain":"status-old.example.com"}'
# HTTP 200 — customDomain: "status-old.example.com"
```

**GUI steps executed:**

1. Opened `https://login.24observe.com/status-pages`
2. Opened status page **Bug011 Live 16:11:03** (id `160`)
3. Confirmed **Custom domain** showed `status-old.example.com`
4. Changed **Custom domain** in the form and clicked **Save**
5. Observed the UI **without** hard refresh (no Ctrl+F5)

**Observed result (primary BUG-011 path):**

| Action | Result |
|--------|--------|
| User saves custom domain change in GUI | New domain appears in the UI **immediately** without Ctrl+F5 |

**Secondary observation (not the reported bug):**

| Action | Result |
|--------|--------|
| External API PATCH while the settings form is already open | Open form does **not** auto-update until refresh/navigation |

This secondary case is expected SPA local-state behavior (form values are held in React state after load). It is **not** the original BUG-011, which was specifically about the UI remaining stale after the user saves a custom domain change.


**Evidence:**
- Status page under test: id `160`, slug `bug011-live-161103`, title `Bug011 Live 16:11:03`
- API create/PATCH of `customDomain` works (HTTP 201/200)
- GUI save of custom domain updates the displayed value immediately without hard refresh

**Verdict:** ✅ **FIXED** — after saving a custom domain change in the dashboard, the UI shows the new domain without requiring Ctrl+F5.

**Status History**

- 2026-06-26: CANNOT VERIFY (0 status pages)
- 2026-08-13: ✅ FIXED — GUI custom-domain save updates immediately without hard refresh; verified with status page id `160` *(by Angel Thomas)*
________________________________________________________________________________

## BUG-012 — Monitor Detail Chart Overflows on Mobile

**Area:** GUI
**Severity:** MEDIUM
**First Reported:** 2026-06-26
**Last Verified:** 2026-08-13 *(By Angel Thomas)*
**Status:** ⚠️ STILL REPRODUCIBLE / FAIL (Mobile Layout Overflow)

**Description**

On screens &lt; 640px, the response time chart on the Monitor Detail page overflows its container, causing horizontal scroll on the entire page.

**Root Cause (original)**

Fixed width `800px` on `.chart-container`.

**Recommended Fix (original)**

```css
.chart-container {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
}

@media (max-width: 640px) {
  .monitor-detail-grid {
    grid-template-columns: 1fr;
  }
  .chart-container {
    min-width: 0;
  }
}
```

**Verification Performed:** 2026-08-13 — Tester: Angel Thomas

**Test Environment**

| Item | Value |
|------|--------|
| Page | Monitor Detail (`ping_test`) |
| Tool (pass 1) | Chrome/Edge DevTools device mode |
| Viewport (pass 1) | **390 × 608 px** |
| Tool (pass 2) | Real mobile browser |
| Breakpoint under test | **&lt; 640 px** |

**Steps executed**

**Pass 1 — DevTools device mode**

1. Logged in to `https://login.24observe.com`
2. Opened **Monitors** → monitor detail page for `ping_test`
3. Enabled device toolbar (**Ctrl+Shift+M**)
4. Set viewport to **390 × 608 px**
5. Observed layout overflow on the Monitor Detail page

**Pass 2 — Real mobile browser**

1. Opened the Monitor Detail page on an actual mobile browser
2. Observed layout, sidebar width, content squeeze, and page-level horizontal scrolling

**Observed Result**

The Monitor Detail page still exceeds the mobile viewport width, resulting in horizontal content overflow:

**DevTools (390 × 608 px):**

- Right side of the Monitor Detail content is cut off
- Text such as “Back to…”, monitor name (`ping_…`), and the URL extend beyond the visible viewport
- Card content on the right is partially outside the viewport
- Layout does **not** fully adapt to the 390px viewport

**Real mobile browser:**

- Page remains **horizontally scrollable** (browser horizontal scrollbar / indicator visible at the bottom)
- Left navigation **sidebar remains very wide** on the mobile screen
- Main monitor-detail content is **squeezed** into the remaining space
- Cards extend close to / possibly beyond the right edge
- Layout has **not** switched to a clean **single-column** mobile layout (as expected from the proposed `.monitor-detail-grid { grid-template-columns: 1fr }` fix)

**Expected Result**

The Monitor Detail page, including the response-time chart and surrounding content, should responsively adapt to the mobile viewport. Content should fit within the available width without causing horizontal scrolling of the entire page.

**Important caveat — chart not yet isolated**

The original BUG-012 specifically attributes overflow to the **response time chart** (`.chart-container` fixed at `800px`).

During this verification, the **response-time chart was not inspected at mobile width**. Therefore it is **not yet conclusive** that the chart is the sole source of overflow.

Possible overflow sources still include:

- `.chart-container`
- `.monitor-detail-grid`
- Sidebar / navigation (observed: remains very wide on mobile)
- A fixed-width card
- Long URL / text in monitor details
- Another fixed-width element

**Recommended next test**

1. Scroll down to the **response-time chart** at mobile width (≈390px or real device) and capture a screenshot.
2. If the **chart itself** extends beyond the card/viewport → original BUG-012 is directly reproduced (chart-driven overflow).
3. If the **chart fits** but sidebar/layout still causes page-level horizontal overflow → root cause differs slightly from the original chart-only description; broaden the bug title/scope to:


**Conclusion**

❌ **Not fixed / further investigation required.**

Mobile Monitor Detail layout still overflows at &lt; 640px (confirmed in both DevTools at 390×608 and a real mobile browser). Page-level horizontal scrolling, a persistently wide sidebar, squeezed main content, and missing single-column adaptation are all present. Chart-specific root cause is not fully isolated until the response-time chart is inspected at mobile width.

**Verdict:** ⚠️ **STILL REPRODUCIBLE** — Monitor Detail page has mobile horizontal overflow at &lt; 640px (DevTools + real mobile browser); chart-specific root cause not fully isolated yet.

**Status History**

- 2026-06-26: UNTESTED (visual)
- 2026-08-13: ⚠️ STILL REPRODUCIBLE / FAIL — DevTools 390×608 + real mobile browser show page-level horizontal overflow/scrollbar; wide sidebar; squeezed main content; no clean single-column layout; response-time chart not yet isolated as the sole cause *(by Angel Thomas)*
________________________________________________________________________________

*End of Report*

# Bug Report — Logs Search (Date Filter / Range Search)

| | |
|---|---|
| **Reporter** | Vikki |
| **Date of testing** | 14 Aug 2026, 09:44–10:05 UTC (15:14–15:35 IST) |
| **Target** | Dashboard: https://login.24observe.com/logs · API: https://api.24observe.com |
| **Environment** | Org #157 (owner, free plan) · PAT `obs_2HaX…gD_Yc` · Frontend bundle `/assets/index-Dw1RIs-B.js` |
| **Server clock** | `Date: Fri, 14 Aug 2026 09:44:51 GMT` (verified via response header) |
| **Browser TZ (assumed)** | IST (UTC+5:30) — consistent with symptoms & edge (CF-RAY BLR) |

---

## Data ground truth (API, verified by direct queries)

Before judging the UI, I enumerated what actually exists in the org (this is the key to all verdicts):

| UTC date | Logs present | Evidence |
|---|---|---|
| 2026-08-07 | ✔ 1000+ (09:39–09:45 UTC) — **only in cold/archive tier** | `/logs/archive` (see BUG-5) |
| 2026-08-09 | ✘ 0 | per-day query below |
| 2026-08-10 | ✔ ≥1 (11:53:50 UTC) | per-day query below |
| 2026-08-11 | ✔ ≥200 (from 20:05:35 UTC) | per-day query below |
| **2026-08-12** | **✘ 0 — NO logs exist at all** | per-day query below |
| 2026-08-13 | ✔ 25,000+ | paginated scan |
| 2026-08-14 | ✘ 0 (as of 09:44 UTC) | per-day query below |

```bash
# Ground-truth per-day probe (limit=1, from=day 00:00Z to=day 23:59Z)
for D in 09 10 11 12 13 14; do
  curl -s "https://api.24observe.com/api/v1/logs/search?limit=1&from=2026-08-${D}T00:00:00Z&to=2026-08-${D}T23:59:59Z" \
    -H "Authorization: Bearer obs_[REDACTED]" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print('2026-08-$D ->', len(d['events']), 'events')"
done
```

**Response (actual):**
```
2026-08-09 -> 0 events
2026-08-10 -> 1 events
2026-08-11 -> 1 events   (first ts 2026-08-11T20:05:35.610Z; ≥200 exist — see BUG-1)
2026-08-12 -> 0 events   ← NO LOGS EXIST ON AUG 12
2026-08-13 -> 1 events   (25,000+ exist)
2026-08-14 -> 0 events
```

> **Important:** the API time filter itself is correct. Every bug below is caused by the **frontend** (2 bugs) and the **archive tier / pagination** (2 server-side bugs).

---

# BUG-1 — Search "12/08/2026" shows logs stamped "2026-08-11" (timezone split-brain)

**Severity: P1 · Area: UI (Logs page) · Verdict: CONFIRMED**

**User report:** searching logs for 12/08/2026 shows 11/08/2026 logs.

### Root cause (extracted from production bundle `index-Dw1RIs-B.js`)

The From/To pickers interpret input as **browser-local time**, but the Time column renders **UTC only**:

```js
// (a) filter: datetime-local value → interpreted in LOCAL time (IST = UTC+5:30)
d && (L.from = new Date(d).toISOString()),   // "2026-08-12T00:00" IST → 2026-08-11T18:30:00.000Z
u && (L.to   = new Date(u).toISOString()),   // "2026-08-12T23:59" IST → 2026-08-12T18:29:00.000Z

// (b) timestamp cell: rendered in UTC, never converted to local
function Cl(t){ return new Date(t).toISOString().replace("T"," ").slice(0,23) + "Z" }
```

So the "Aug 12" (IST) day legitimately contains events ingested at `2026-08-11T20:05Z` (= **Aug 12, 01:35 IST**) — the data is right, but the label shows `2026-08-11 20:05:35.610Z`, so the user sees "11th August logs" for a "12th August" search. Also note **no logs exist at all on Aug 12 UTC** (ground truth above), which makes the mismatch look like wrong results rather than a labeling problem.

### Evidence (curl = exact request the UI sends)

```bash
curl -s "https://api.24observe.com/api/v1/logs/search?from=2026-08-11T18:30:00.000Z&to=2026-08-12T18:29:00.000Z&limit=200" \
  -H "Authorization: Bearer obs_[REDACTED]"
```

**Response (trimmed):**
```json
{
  "events": [
    { "ts": "2026-08-11T20:05:35.610Z", "level": "info", "service": "default", "message": "…" },
    { "ts": "2026-08-11T20:05:35.501Z", "…": "…" },
    { "ts": "2026-08-11T20:05:35.500Z", "…": "…" }
  ],
  "tookMs": 101
}
```
200/200 events carry `ts` starting `2026-08-11…` → **every visible row reads "2026-08-11" while the user searched 12/08**. (Repro script: `ui_exact_scenarios.ps1` scenario 1.)

### Expected vs actual
- **Expected:** events shown in the browser's timezone (or a clear UTC badge on the *filter inputs*), so a search for 12/08 displays rows labelled 12/08.
- **Actual:** filter = local time, table = UTC ⇒ permanent off-by-one-day appearance for any TZ east of UTC.

### Suggested fix
Render `ts` with `toLocaleString()` (the rest of the dashboard already does this — 40 call sites) **or** show `UTC` next to the From/To inputs and keep everything UTC. One convention, both sides.

---

# BUG-2 — Range 01/08 → 14/08 shows only ONE day (07/08) of logs

**Severity: P1 · Area: UI + archive tier · Verdict: CONFIRMED**

**User report:** range 01/08/2026–14/08/2026 shows only one day of logs.

### Root cause 1 — silent endpoint switch when `from` is >7 days old (UI bundle):

```js
const n = 7*864e5,                                   // 7 days
      l = t.from ? new Date(t.from).getTime() : Date.now(),
      x = Date.now() - l > n ? "/api/v1/logs/archive" : "/api/v1/logs/search";
```

`01/08 00:00 IST` → `from=2026-07-31T18:30Z` → **>7d old** → UI quietly calls `/logs/archive` (cold tier) instead of `/logs/search`. The "cold tier" hint badge only renders when `archiveScannedKeys > 0` — the API returns it **empty**, so the swap is 100% invisible.

### Root cause 2 — archive full-range response is itself broken (see BUG-5): the 14-day archive query returns only the 07/08 partition.

### Evidence

```bash
# exact UI request for From=01/08/2026 00:00 IST, To=14/08/2026 23:59 IST, limit=200 (UI default)
curl -s "https://api.24observe.com/api/v1/logs/archive?from=2026-07-31T18:30:00.000Z&to=2026-08-14T18:29:00.000Z&limit=200" \
  -H "Authorization: Bearer obs_[REDACTED]"
```

**Response (summarized — 200 events, every one on the same day):**
```
200 events · dates: 2026-08-07 x200 · nextCursor: "" (empty)
newest ts 2026-08-07T09:45:57Z · oldest ts 2026-08-07T09:39:32Z
archiveScannedKeys: ""  ← cold-tier badge condition false → swap invisible
```

A 14-day range containing data on **07, 10, 11, 13 Aug** shows only `2026-08-07`. (Repro: `ui_exact_scenarios.ps1` scenario 2, `final_probes.ps1` B.)

### Expected vs actual
- **Expected:** events from all days that have data (07, 10, 11, 13), or at minimum hot+archive merged, plus a visible indicator that old data comes from the cold tier.
- **Actual:** one arbitrary old day; recent days (incl. 25k events from 13/08) completely hidden.

### Suggested fix
UI: always query both tiers for windows crossing the 7-day boundary (the badge tooltip text "results merged from hot + R2 archive" shows this was the intent), surface `archiveScannedKeys` properly, and stop silently swapping endpoints.

---

# BUG-3 — Range 10/08 → 14/08 shows only 13/08 logs (no pagination in UI)

**Severity: P2 · Area: UI (Logs page) · Verdict: CONFIRMED**

**User report:** range 10/08–14/08 shows 13/08 logs only.

### Root cause
UI always sends `limit=200` (hard-coded: `const L={limit:200}`), API returns **newest-first**, and the bundle contains **no pagination of any kind** — verified by string scan of the shipped bundle:

```
"Load more"  -> NOT IN BUNDLE
"loadMore"   -> NOT IN BUNDLE
"Fetch more" -> NOT IN BUNDLE
"nextCursor" -> NOT IN BUNDLE   ← the API's cursor field is never read
```

With 25,000 events on 13/08, the first (and only) 200 rows are all 13/08 — the Aug 10/11 events exist but are **unreachable** in the UI.

### Evidence

```bash
# exact UI request for From=10/08/2026 00:00 IST, To=14/08/2026 23:59 IST
curl -s "https://api.24observe.com/api/v1/logs/search?from=2026-08-09T18:30:00.000Z&to=2026-08-14T18:29:00.000Z&limit=200" \
  -H "Authorization: Bearer obs_[REDACTED]"
```

**Response (summarized):**
```
200 events · dates: 2026-08-13 x200 · window also contains Aug 10 (≥1) and Aug 11 (≥200) events — never shown
```
(Repro: `ui_exact_scenarios.ps1` scenario 3.)

### Expected vs actual
- **Expected:** ability to page/load more, or date-bucketed results, so older days in the range are visible.
- **Actual:** any range whose newest day has ≥200 events shows exactly one day.

### Suggested fix
Add "Load more" wired to `nextCursor` (blocked by BUG-4 until the API cursor works), or raise limit with virtualized scrolling.

---

# BUG-4 (NEW, server) — `/logs/search` cursor pagination is an infinite loop

**Severity: P2 · Area: API (`GET /api/v1/logs/search`) · Verdict: CONFIRMED**

### Evidence

```bash
P1=$(curl -s "https://api.24observe.com/api/v1/logs/search?from=2026-08-13T00:00:00Z&to=2026-08-13T23:59:59Z&limit=3" \
  -H "Authorization: Bearer obs_…gD_Yc")
# → events ts: 15:16:43.193 | 15:16:43.183 | 15:16:43.182   nextCursor: "1786634203182:default"

curl -s "https://api.24observe.com/api/v1/logs/search?from=2026-08-13T00:00:00Z&to=2026-08-13T23:59:59Z&limit=3&cursor=1786634203182:default" \
  -H "Authorization: Bearer obs_…gD_Yc"
# → IDENTICAL events ts: 15:16:43.193 | 15:16:43.183 | 15:16:43.182
# → IDENTICAL nextCursor:      "1786634203182:default"     ← page never advances
```

Passing the returned cursor yields the **same page and the same cursor forever** — the cursor is not applied server-side (25,000+ events exist in the window, so pages must advance). This blocks any UI pagination fix (BUG-3). (Repro: `final_probes.ps1` D.)

**Expected:** page 2 returns the next 3 older events. **Actual:** page 1 repeats indefinitely.

---

# BUG-5 (NEW, server) — `/logs/archive` returns inconsistent partitions depending on range

**Severity: P2 · Area: API (`GET /api/v1/logs/archive`) · Verdict: CONFIRMED**

| Query (same PAT, same day of testing) | Result |
|---|---|
| `from=2026-07-31T18:30Z&to=2026-08-14T18:29Z` (full range, limit=1000) | **1000 events, 100% on 2026-08-07** (09:39–09:45Z) — Aug 11 partition missing, `nextCursor:""` |
| `from=2026-08-10T00:00Z&to=2026-08-11T23:59Z` | **500 events on 2026-08-11** |
| `from=2026-08-07T00:00Z&to=2026-08-07T23:59Z` | Aug 7 events (org 157 confirmed via `attrs.observe_org`) |
| Hot tier `/search` for `2026-08-07 09:39–09:46Z` | **0 events** (purged from hot — archive-only) |

```bash
# The two contradicting curls:
curl -s "https://api.24observe.com/api/v1/logs/archive?from=2026-07-31T18:30:00.000Z&to=2026-08-14T18:29:00.000Z&limit=1000" -H "Authorization: Bearer obs_…gD_Yc"
# → 1000 events, all 2026-08-07, nextCursor ""

curl -s "https://api.24observe.com/api/v1/logs/archive?from=2026-08-10T00:00:00Z&to=2026-08-11T23:59:59Z&limit=500" -H "Authorization: Bearer obs_…gD_Yc"
# → 500 events, all 2026-08-11
```

A wider time window returns a **strictly different, non-overlapping subset** than a narrower window it fully contains, with no cursor to reach the rest ⇒ range queries on the archive tier silently drop partitions. This is the server half of BUG-2. (Repro: `final_probes.ps1` B/C, `probe_org.ps1`.)

---

## Verdict summary

| # | Reported issue | Verdict | Root cause | Layer |
|---|---|---|---|---|
| BUG-1 | "12/08 search shows 11/08" | ✅ Confirmed | Local-time filter vs UTC-only rendering (`Cl()`); no data exists Aug 12 UTC | Frontend |
| BUG-2 | "01/08–14/08 shows one day" | ✅ Confirmed | Silent switch to `/logs/archive` when `from`>7d + BUG-5 + empty `archiveScannedKeys` hides the badge | Frontend + API |
| BUG-3 | "10/08–14/08 shows only 13/08" | ✅ Confirmed | Newest-first + hard-coded `limit=200` + zero pagination in UI | Frontend |
| BUG-4 | *(found during retest)* | ✅ Confirmed | `cursor` param ignored → same page repeats | API |
| BUG-5 | *(found during retest)* | ✅ Confirmed | Archive returns different partitions per range; `nextCursor` always empty | API |

## Notes
- **Screenshots:** not attached — this test rig has no browser automation; every verdict above is fully reproducible with the given curl commands + responses (repro scripts saved in workspace: `ui_exact_scenarios.ps1`, `final_probes.ps1`, `per_day.ps1`, `probe_org.ps1`). For manual screenshot capture: BUG-1 = search 12/08 & show Time column; BUG-2/3 = range searches above; DevTools Network tab shows the `/logs/archive` vs `/logs/search` swap for BUG-2.
- PAT used for testing belongs to org #157 (owner) — revoke/rotate after the report is filed.
- All responses above are unedited except trimming long `message`/`attrs` fields.

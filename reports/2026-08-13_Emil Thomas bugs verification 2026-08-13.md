# Emil Thomas — Bug Verification Report

**Tested by:** Emil Thomas  
**Bugs verified:** BUG-028, BUG-029, BUG-030, BUG-031  
**Date of verification:** 2026-08-13  
**Platform:** 24Observe (dashboard: login.24observe.com, API: api.24observe.com)  
**Test host:** `test-VMware-Virtual-Platform` (Ubuntu Linux VM) — used for BUG-028 on-host work  


**Verification Summary Table**

| Bug ID | Bug Name | Severity | Last Known Status | Your Verdict | Evidence |
|--------|----------|----------|-------------------|--------------|----------|
| BUG-028 | Host Profiles auditd / syslog / snmp Are Silent No-Ops | MEDIUM | FIXED (2026-07-10 / on-host 2026-07-13) | ✅ FIXED (re-verified on-host 2026-08-13) | Install with `--profile=auditd --profile=syslog --profile=snmp` loads real Alloy components: `loki.source.file.auditd` tails `/var/log/audit/audit.log`; `loki.source.syslog.network` binds UDP+TCP `:514`; `prometheus.scrape.snmp` / `discovery.relabel.snmp` evaluate. Confirmed via `journalctl -u alloy` and `ss`. Dashboard later received journal logs after ownership fix. |

| BUG-029 | Uptime Badge Preview Broken in Dashboard GUI | MEDIUM | STILL PRESENT (2026-07-22) | ❌ STILL PRESENT (deep retest 2026-08-13) | Dashboard uses `<img src="https://api.24observe.com/api/v1/badge/monitors/{id}.svg">` with `onError` → "Preview unavailable…". Badge responses always send `Cross-Origin-Resource-Policy: same-origin`, which blocks cross-origin no-cors `<img>` embeds from `login.24observe.com`. Direct badge URL still returns a valid 839-byte SVG. 15-method retest: 0×HTTP 200; CORP=`same-origin` on every Origin variant. Compounded by BUG-027 (all badges HTTP 404 + `uptime: unknown`). |

| BUG-030 | Monitor Details Page Doesn't Scale (Responsive UI) | LOW | STILL PRESENT (2026-07-17) | ❌ STILL PRESENT (2026-08-13) | Live component `Vr()` still uses Configuration `grid-cols-[160px_1fr]` with no breakpoint; Recent checks is a 5-col table + `overflow-x-auto -mx-6`; title cluster no wrap; sidebar w-60/w-16 @ 1024px. Viewport matrix at 320–414px shows squeezed value column + forced table h-scroll. See `bug030_out/report.json`. |

| BUG-031 | No Bulk Incident Actions | Enhancement | Open (2026-07-13) | ❌ STILL MISSING (2026-08-13) | OpenAPI exposes only single-incident mutation routes (`/api/v1/incidents/{id}/acknowledge`, `/api/v1/incidents/{id}/resolve`, `/api/v1/incidents/{id}/updates`, `/api/v1/incidents/{id}/postmortem`) — no `/api/v1/incidents/bulk*` of any kind. By contrast `/api/v1/monitors/bulk` (POST/PATCH/DELETE) exists, proving the platform's bulk pattern is implemented elsewhere but not for incidents. Route probing: candidate bulk incident paths return 404 (or 401 where they collapse into the `{id}` path param of single-incident routes — confirmed by GET/POST matrix). Live dashboard `Yr()` incidents list component has zero selection state (`useState("open")`, `useState("")` only), zero checkboxes, no "Select all", and renders per-card Acknowledge/Resolve buttons only. Compare: the monitors list component does have a `N.has(P.id)` selection Set + "Select all" checkbox + bulk DELETE/PATCH/POST mutations. |

________________________________________________________________________________

## BUG-028 — Host Profiles auditd / syslog / snmp Are Silent No-Ops

**Endpoint / area:** `POST /api/v1/sensors/enroll-token`, `POST /api/v1/sensors/bootstrap` (profiles field), `install.sh --profile=…`  
**Severity:** MEDIUM  
**First Reported:** 2026-07-08  
**Status:** ✅ FIXED (re-verified on-host 2026-08-13)

**Impact (original bug)**

The Hosts section offered toggles for **auditd**, **syslog**, and **snmp**. The API accepted them (HTTP 201) and the install command echoed `--profile=auditd` etc., but the config generator emitted **zero** Alloy blocks for those three. Customers got a “healthy” sensor that collected none of the promised data — worse than a missing feature because it looked like it worked.

**Original evidence (byte-for-byte, 2026-07-08)**

```
baseline (no profiles): 3931 bytes
docker : 4290 bytes  (real components)
nginx  : 4317 bytes  (real components)
auditd : 3931 bytes  → IDENTICAL to baseline  ← no-op
syslog : 3931 bytes  → IDENTICAL to baseline  ← no-op
snmp   : 3931 bytes  → IDENTICAL to baseline  ← no-op
```

**Last known fix (2026-07-10 / 2026-07-13)**

Generator began emitting real blocks:

- **auditd:** `local.file_match "auditd"` + `loki.source.file "auditd"` on `/var/log/audit/audit.log`
- **syslog:** `loki.source.syslog "network"` on `0.0.0.0:514` (UDP+TCP)
- **snmp:** `discovery.file` / `discovery.relabel` / `prometheus.scrape` via snmp_exporter on `127.0.0.1:9116`

This verification re-tests that fix on a live Ubuntu VMware host on **2026-08-13**.

### Test Environment

| Item | Value |
|------|--------|
| Host | `test-VMware-Virtual-Platform` |
| OS | Ubuntu Linux (VMware Virtual Platform) |
| Agent | Grafana Alloy via 24Observe `install.sh` |
| API | `https://api.24observe.com` |
| Dashboard | `https://login.24observe.com` |
| Tester | Emil Thomas |

### Methods Used

| # | Method | What it checks | Result |
|---|--------|----------------|--------|
| 1 | `install.sh --profile=auditd --profile=syslog --profile=snmp` | Installer accepts profiles and configures root / auditd / snmp_exporter | Pass |
| 2 | `journalctl -u alloy` node evaluation | Real components for all three profiles | Pass |
| 3 | `start tailing file` + `ss :514` | Runtime collection (audit file + syslog listen) | Pass |
| 4 | `logger` / `auditctl` / `nc` to :514 | Local generation into those paths | Pass |
| 5 | SNMP scrape warnings | Scrape job exists (config real); targets may need setup | Pass (config) / ops note |
| 6 | OTLP export journal + curl probe | Shipping reliability during test window | Unstable (separate) |
| 7 | Fresh enroll + ownership repair | Agent can ship after BUG-025-style residue cleared | Pass |
| 8 | Dashboard Logs UI | Host journal logs visible (`job=loki.source.journal.host`) | Pass |

### Phase A — Multi-Profile Enroll (Primary BUG-028 Test)

**Command**

```bash
curl -sSL https://api.24observe.com/install.sh | sudo bash -s -- \
  --enroll-token=<ENROLL_TOKEN> \
  --profile=auditd --profile=syslog --profile=snmp
```

**Installer output (success path)**

```
[24observe] Alloy already installed.
[24observe] enrolling host test-VMware-Virtual-Platform…
[24observe] WARN: auditd/syslog profile → running the Sensor as root (needs audit.log / :514 access).
[24observe] auditd profile: installing auditd + loading 24observe rules…
[24observe] snmp_exporter on 127.0.0.1:9116. Edit /etc/alloy/snmp_targets.json …
[24observe] Sensor running. Logs + host metrics are shipping to https://api.24observe.com.
```

Installer **acknowledges** auditd/syslog (root requirement) and snmp_exporter setup — not silent ignore of flags. Service started as **root** when auditd/syslog profiles are present (expected).

### Phase B — Alloy Component Load (Definitive On-Host Proof)

**Command**

```bash
systemctl status alloy --no-pager
journalctl -u alloy -n 100 --no-pager -l \
  | grep -iE 'audit|syslog|snmp|file_match|scrape|Exporting|error|permission'
ss -ulnp | grep ':514'
```

**Result — all three profile pipelines present**

```
# SNMP
node_id=discovery.relabel.snmp … finished node evaluation
node_id=prometheus.scrape.snmp … finished node evaluation

# auditd
node_id=local.file_match.auditd … finished node evaluation
node_id=loki.source.file.auditd … finished node evaluation
msg="start tailing file" component_id=loki.source.file.auditd path=/var/log/audit/audit.log

# syslog
msg="syslog listening on address" component_id=loki.source.syslog.network address=[::]:514 protocol=udp
msg="syslog listening on address" component_id=loki.source.syslog.network address=[::]:514 protocol=tcp tls=false
```

| Profile | Component evidence | Runtime evidence | Pass? |
|---------|-------------------|------------------|--------|
| **auditd** | `local.file_match.auditd`, `loki.source.file.auditd` | Tailing `/var/log/audit/audit.log` | ✅ |
| **syslog** | `loki.source.syslog.network` | Listening UDP+TCP on `:514` (`ss` confirms) | ✅ |
| **snmp** | `discovery.relabel.snmp`, `prometheus.scrape.snmp` | Scrape job registered (target setup separate) | ✅ |

### Phase C — Local Data Generation + SNMP Side Note

Generated local activity (`logger`, UDP `:514` via `nc`, `auditctl` watch on `/etc/passwd`). Audit log showed fresh events; Alloy was already tailing/listening. SNMP scrape may fail until `snmp_targets.json` / snmp_exporter are configured — that is **ops**, not “zero config emitted.”

### Phase D — New Findings Observed While Testing BUG-028

1. **OTLP edge instability (2026-08-13):** Frequent **520 / 525 / timeouts** (and intermittent **429 / 401**) on `/api/v1/otlp/v1/logs` and `/metrics` while components collected data. Can make the UI look “empty” even when BUG-028 is fixed.
2. **Profile downgrade ownership gap:** Root multi-profile → default `alloy` user re-enroll leaves **root-owned `positions.yml`** → crash-loop. Same family as **BUG-025** Phase C gap.
3. **Installer success message vs reality:** Installer printed “Sensor running / shipping” while Alloy was crash-looping on permission denied.
4. **Enroll tokens expire / 401:** Re-use of an old enroll token fails with HTTP 401.
5. **SNMP not zero-config:** Profile installs scrape config; useful metrics need targets + exporter config.

**Ownership fix applied on host**

```bash
sudo systemctl stop alloy
sudo chown -R alloy:alloy /var/lib/alloy
sudo rm -f /var/lib/alloy/data/loki.source.journal.host/positions.yml
sudo systemctl start alloy
# → active, alloy user, journal pipeline healthy; dashboard later showed job=loki.source.journal.host
```

### Verdict: ✅ FIXED

BUG-028 **no longer reproduces** on the live host:

- auditd, syslog, and snmp profiles produce **real Alloy components** and **run at runtime** (tail audit.log, listen `:514`, register SNMP scrape).
- They are **not** silent no-ops (not identical to empty-profile baseline behavior).

On-host runtime evidence is **sufficient** to call the original bug **FIXED**. Separate issues (export instability, ownership crash-loop) should **not** be filed as “BUG-028 still open.”

**Recommended follow-ups (not BUG-028)**

1. Harden enroll: always `chown -R <service-user> /var/lib/alloy` when switching root ↔ alloy (closes BUG-025 gap).
2. Investigate Cloudflare/origin **520/525** and OTLP timeouts on `api.24observe.com`.
3. Optional: e2e test that asserts dashboard receives a marker via auditd/syslog after multi-profile enroll when OTLP is healthy.

**Status History**

- 2026-07-08: BROKEN (first reported — profiles silent no-ops)
- 2026-07-10: FIXED at generator — real Alloy blocks for auditd/syslog/snmp
- 2026-07-13: FIXED — verified on-host; profile components initialise in `alloy run`
- 2026-08-13: **FIXED (re-verified on-host)** — multi-profile install; auditd tail, syslog `:514`, snmp scrape components live. Separate OTLP edge errors and root-owned `positions.yml` crash after profile downgrade documented as new findings (not BUG-028 regressions).

________________________________________________________________________________

## BUG-029 — Uptime Badge Preview Broken in Dashboard GUI

**Endpoint / area:** Dashboard GUI monitor details (“Public uptime badge” preview) + `GET /api/v1/badge/monitors/{id}.svg`  
**Category:** Functional / UI  
**Severity:** MEDIUM  
**First Reported:** 2026-07-13  
**Last Verified (prior):** 2026-07-22  
**Status:** ❌ STILL PRESENT (deep multi-method retest 2026-08-13)

**Impact (original bug)**

The uptime badge **preview inside the dashboard GUI is broken**. Users open a monitor, see the “Public uptime badge” section, and the preview fails. The same badge **loads correctly** when the generated URL is opened directly in a browser tab. Users may assume badge generation has failed even though the SVG asset itself is valid — and public README embeds are affected by the same response headers.

**Original observation**

- Reference URL pattern: `https://api.24observe.com/api/v1/badge/monitors/482.svg`
- Preview broken **within the application**
- Badge loads correctly when accessed **directly** via that URL

### Test Environment

| Item | Value |
|------|--------|
| API | `https://api.24observe.com` |
| Dashboard | `https://login.24observe.com` |
| Org monitors | 10 (5 `lastStatus=up`, 5 `down`) |
| Primary sample monitor | id=`686` name=`ping` lastStatus=`up` |
| Dashboard bundle | `/assets/index-Dw1RIs-B.js` |
| Tester | Emil Thomas |
| Scripts | `bug029_verify.py`, `bug029_deep_retest.py` |
| Evidence dir | `bug029_out/` |

### Methods Used (15)

| # | Method | What it checks | Result |
|---|--------|----------------|--------|
| M1 | Direct GET (no Origin) | Original “direct URL works” | Pass — SVG body OK (839B), HTTP 404 |
| M2 | Img-like GET (dashboard Origin + Sec-Fetch image/no-cors) | Cross-origin `<img>` embed | **Fail — CORP=same-origin** |
| M3 | OPTIONS preflight | CORS for dashboard | Pass — ACAO allows login |
| M4 | Credentialed GET | Cookies + Origin | CORP still blocks embeds |
| M5 | fetch()-style CORS GET | Future blob-URL path | ACAO OK; CORP still set |
| M6 | HEAD | Header-only policy | CORP=same-origin |
| M7 | Cache-bust ×15 | Flaky CDN / intermittent 200 | 0×200; stable 404 + CORP |
| M8 | Header matrix (all samples + 999999) | Universal policy | CORP=same-origin on all |
| M9 | HTTP vs lastStatus (all monitors) | BUG-027 interaction | All 404 + unknown |
| M10 | Invalid ids | Validation / confusion | 400/404; CORP remains |
| M11 | Status-page membership vs GUI copy | Misleading fallback | Copy not aligned with CORP failure |
| M12 | Live dashboard JS | Preview contract | `<img onError>` → Preview unavailable |
| M13 | Accept / Range / If-None-Match | Negotiation theory | CORP unchanged |
| M14 | Origin variants (none/dash/api/evil/null) | Origin-conditional CORP? | CORP always same-origin |
| M15 | Third-party README-like img | Public embed impact | Also CORP-blocked |

### Phase A — How the GUI Preview Works (Live Dashboard JS)

```js
const ut = "https://api.24observe.com";
const g = `${ut}/api/v1/badge/monitors/${String(w.id)}.svg`;
// N ? <img src={g} onError={() => f(false)} /> : "Preview unavailable — add this monitor to a public status page…"
```

Dashboard CSP: `img-src 'self' data: https:` — **CSP is not the blocker**.

### Phase B — Direct Badge URL Still Produces SVG

| Monitor id | lastStatus | HTTP | len | SVG? | aria-label | CORP |
|------------|------------|------|-----|------|------------|------|
| 686 | up | 404 | 839 | yes | uptime: unknown | same-origin |
| 663 | up | 404 | 839 | yes | uptime: unknown | same-origin |
| 687 | down | 404 | 839 | yes | uptime: unknown | same-origin |
| 999999 | n/a | 404 | 839 | yes | uptime: unknown | same-origin |

Direct URL → renderable SVG body (matches original report). HTTP 404 + `unknown` is BUG-027 interaction.

### Phase C — Cross-Origin `<img>` Embed (Definitive)

```http
GET /api/v1/badge/monitors/686.svg
Origin: https://login.24observe.com
Sec-Fetch-Dest: image
Sec-Fetch-Mode: no-cors
Sec-Fetch-Site: cross-site
```

| Header | Value | Effect on GUI `<img>` |
|--------|-------|------------------------|
| `Cross-Origin-Resource-Policy` | **`same-origin`** | **Blocks** cross-origin no-cors consumers |
| `Access-Control-Allow-Origin` | `https://login.24observe.com` | Helps `fetch()` only; **does not override CORP for no-cors `<img>`** |
| HTTP status | **404** | Body still SVG; CORP is the hard embed block |

| Access path | Document origin | Result |
|-------------|-----------------|--------|
| Navigate to badge URL in a new tab | `api.24observe.com` | **SVG displays** |
| Dashboard `<img src=api…/badge…>` | `login.24observe.com` | **Browser blocks load → onError → Preview unavailable** |
| External README `<img>` | third-party | **Also CORP-blocked** |

### Phase D — Interaction with BUG-027 (Compounding)

All 10 monitors: HTTP **404**, identical 839-byte “unknown” SVG — including 5 healthy `up` monitors. Matches BUG-027 regression (2026-08-12). Even if CORP were fixed, preview would still show grey “unknown” until BUG-027 is fixed.

### Root Cause (High Confidence)

1. **Primary (BUG-029):** `Cross-Origin-Resource-Policy: same-origin` on badge SVG blocks cross-origin no-cors embeds from `login.24observe.com`.
2. **GUI path confirmed in production JS:** bare `<img>` + `onError` → amber fallback.
3. **Not dashboard CSP.**
4. **Secondary (BUG-027):** All badges HTTP 404 + `uptime: unknown`.
5. **Misleading UX copy:** Fallback blames “public status page” for what is primarily an embed policy / load failure.

### New Findings (Beyond Original One-Liner)

1. **CORP is the smoking gun** for “direct works / GUI broken” — API response headers break legitimate cross-origin embeds.
2. **Public README embeds are also broken** (same CORP) — impact wider than the dashboard preview card.
3. **CORS ACAO already allows the dashboard** — a UI `fetch`+blob workaround is theoretically possible; correct fix is still CORP on the badge route.
4. **BUG-027 still fully broken** on 2026-08-13 and compounds UX after preview becomes visible.
5. **Fallback string is inaccurate** for CORP failures — support noise (“I added it to a status page and preview still fails”).

### Verdict: ❌ STILL PRESENT

BUG-029 **still reproduces** on 2026-08-13:

- Direct badge URL → **valid SVG body**.
- Dashboard preview → cross-origin `<img>` **blocked by `CORP: same-origin`** → **Preview unavailable**.
- Not fixed by CSP; not a flaky cache; confirmed across 15 methods.
- Compounded by BUG-027 (404 + unknown for all monitors).

**Recommended fixes**

1. Badge route: set `Cross-Origin-Resource-Policy: cross-origin` (or omit CORP).
2. Fix BUG-027: HTTP 200 whenever SVG is produced; real uptime for healthy monitors.
3. Optional UI: `fetch` + blob URL (ACAO already allows dashboard).
4. Fix fallback copy: distinguish business-rule eligibility from image load failure.
5. E2E: assert badge `<img>` `naturalWidth > 0`; plus third-party embed smoke test.

**Status History**

- 2026-07-13: BROKEN (first reported — GUI badge preview broken; direct URL works)
- 2026-07-22: STILL PRESENT
- 2026-08-13: **STILL PRESENT (deep multi-method retest)** — live dashboard JS uses `<img src=api…/badge… onError>`; badge API always returns `CORP: same-origin` (blocks GUI + README embeds); direct SVG body still valid; all monitors HTTP 404 + `uptime: unknown` (BUG-027). Evidence: `bug029_deep_retest.py`, `bug029_out/deep_report.json`.

________________________________________________________________________________

## BUG-030 — Monitor Details Page Doesn't Scale (Responsive UI)

**Category:** Responsive UI  
**Severity:** LOW  
**First Reported:** 2026-07-13  
**Last Verified (prior):** 2026-07-17  
**Status:** ❌ STILL PRESENT (2026-08-13)

**Impact (original bug)**

When a user opens a monitor details page, the interface does not scale properly by screen size — layout becomes improperly scaled and misaligned on narrower viewports.

**Reference:** `https://login.24observe.com/monitors/502` (and any live `/monitors/{id}`)

### Test Environment

| Item | Value |
|------|--------|
| Dashboard | `https://login.24observe.com` |
| Live component | `function Vr()` (route `/monitors/$id`) |
| Method | Live SPA JS/CSS reverse-engineering + viewport layout math + API sample |
| Scripts | `bug030_verify.py` |
| Evidence dir | `bug030_out/` |
| Tester | Emil Thomas |

### Methods Used

| # | Method | What it checks | Result |
|---|--------|----------------|--------|
| 1 | Fetch live SPA HTML/JS/CSS | Production assets | Pass — bundle loaded |
| 2 | Locate monitor detail component `Vr()` | Route `/monitors/$id` still present | Pass |
| 3 | Catalogue layout classNames on page | Find non-responsive primitives | Fail — fixed grids / table / nowrap |
| 4 | Confirm Tailwind utilities in production CSS | Classes are real, not dead | Pass |
| 5 | Viewport simulation 320–1440px + sidebar `matchMedia (max-width: 1024px)` | Content width / config value col / table scroll | Fail below ~640px |
| 6 | API monitor list for concrete GUI URL | Manual re-check target | Pass |

### Root-Cause Findings (Code-Level)

- **[HIGH] CONFIG_FIXED_GRID** (Configuration): `grid-cols-[160px_1fr]` with **no** responsive breakpoint (no `max-sm:grid-cols-1` / stacked rows). On narrow content widths the label column alone consumes 160px, squeezing values or overflowing the card.
- **[MEDIUM] CHECKS_TABLE_HSCROLL** (Recent checks): 5-column `<table>` inside `overflow-x-auto` with `-mx-6` negative margins. No card/list alternative on mobile/tablet → horizontal scroll and misalignment vs stacked cards.
- **[LOW] ERROR_COL_MAXW** (Recent checks): Error column `max-w-[280px]` inflates intrinsic table width.
- **[LOW] BADGE_NOWRAP** (Public uptime badge): Fallback preview message is `nowrap`; can overflow flex row with URL + Copy.
- **[MEDIUM] TITLE_NO_WRAP** (Page header): Monitor title cluster (name, type badge, ID badge, status) is a non-wrapping flex row — long names + badges overflow before outer `justify-between` wraps actions.

### Section Scorecard

| Section | Responsive? | Notes |
|---------|-------------|-------|
| Page root max-w-3xl | partial | Caps width on large screens; no min-width protection for mobile. |
| Header (title + Pause/Edit/Delete) | partial | Outer flex-wrap OK; title badge cluster does not wrap. |
| URL line | ok | break-all on mono URL. |
| Stats (last 24h) | ok | grid-cols-2 sm:grid-cols-4. |
| Recent checks table | **fail** | Non-reflowing 5-col table + overflow-x-auto -mx-6. |
| Public uptime badge row | partial | flex row; nowrap fallback; truncate on URL (no flex-wrap). |
| Configuration `<dl>` | **fail** | Fixed grid-cols-[160px_1fr] with zero breakpoints — primary scaling defect. |
| App sidebar (shell) | partial | Auto-collapse ≤1024px to w-16; still reserves 64px; forced expand leaves ~80px content at 320. |

### Viewport Matrix (Auto Sidebar)

| Viewport | Sidebar | Content w | Config value col | Table h-scroll? | Misaligned? | Broken? |
|----------|---------|-----------|------------------|-----------------|-------------|---------|
| 320 | 64px | 208 | 0.0 | True | True | True |
| 360 | 64px | 248 | 40.0 | True | True | True |
| 375 | 64px | 263 | 55.0 | True | True | True |
| 390 | 64px | 278 | 70.0 | True | True | True |
| 414 | 64px | 302 | 94.0 | True | True | False |
| 480 | 64px | 368 | 160.0 | True | True | False |
| 640 | 64px | 528 | 320.0 | False | False | False |
| 768 | 64px | 656 | 448.0 | False | False | False |
| 1024 | 64px | 912 | 560.0 | False | False | False |
| 1280 | 240px | 992 | 560.0 | False | False | False |
| 1440 | 240px | 1152 | 560.0 | False | False | False |

### New Findings (Beyond Original One-Liner)

1. **Primary defect is Configuration grid**, not a generic “whole page CSS scale” bug — fixed `160px + 1fr` with zero breakpoints is the high-confidence root cause.
2. **Recent checks table is a second independent defect** — 5-col table + `-mx-6` bleed cannot reflow; only h-scrolls.
3. **Sidebar still consumes 64px at phone widths** after auto-collapse, making content width even tighter (e.g. 208px at 320 viewport).
4. **Title cluster + badge nowrap** are secondary overflow contributors on medium-narrow widths.
5. **Stats grid and URL `break-all` already behave well** — not all sections are broken; scorecard is mixed.

### Verdict: ❌ STILL PRESENT

Monitor details (live component `Vr` on login.24observe.com) still has non-responsive layout primitives: Configuration uses a fixed 160px/1fr grid with no breakpoint, and Recent checks is a 5-column table that only horizontal-scrolls (`overflow-x-auto -mx-6`). Viewport math shows phone/tablet content widths leave a squeezed value column and forced table scroll — matching the original “doesn't scale / misaligned” report.

**Recommended fixes**

1. Configuration: `grid-cols-1 sm:grid-cols-[160px_1fr]` (stack label/value on narrow screens).
2. Recent checks: stacked cards/list below `md`, or responsive column priority; avoid `-mx-6` bleed on small screens.
3. Title cluster: `flex-wrap gap-2` on name/type/id/status row.
4. Badge row: `flex-wrap`; allow amber fallback to wrap (drop or constrain `whitespace-nowrap`).
5. Sidebar: on very small widths consider off-canvas overlay instead of permanent `w-16` rail.
6. Playwright/Chromium e2e at 320/375/768: assert no horizontal page overflow (`scrollWidth <= innerWidth`) and configuration labels/values both visible without clipping.

**Status History**

- 2026-07-13: BROKEN (first reported)
- 2026-07-17: STILL PRESENT
- 2026-08-13: **STILL PRESENT** — live `Vr()` still uses fixed Configuration grid and non-reflowing Recent checks table; viewport math confirms narrow-width misalignment. Evidence: `bug030_out/report.json`, `bug030_out/viewport_matrix.json`.

________________________________________________________________________________

## BUG-031 — No Bulk Incident Actions (Feature Request)

**Endpoint / area:** Incidents list UI (`function Yr()`) + incidents mutation API (`/api/v1/incidents/{id}/acknowledge`, `…/resolve`)  
**Category:** Feature Request  
**Severity:** Enhancement  
**First Reported:** 2026-07-13  
**Status:** ❌ STILL MISSING (2026-08-13)

**Impact (original bug)**

There is currently no option to select multiple incidents and perform bulk actions. Users must acknowledge or resolve incidents **individually**. Expected: select multiple incidents; acknowledge selected; resolve selected. Benefit: operational efficiency and less repetitive manual work.

**Original observation**

- Current behaviour: per-incident Acknowledge / Resolve only.
- Expected behaviour: multi-select + bulk Acknowledge / Resolve.

This verification re-tests that report on **2026-08-13** by checking (a) the API surface for any bulk incidents endpoint, and (b) the live dashboard incidents list component for any multi-select / bulk-action UI.

### Test Environment

| Item | Value |
|------|--------|
| API | `https://api.24observe.com` |
| Dashboard | `https://login.24observe.com` |
| OpenAPI doc | `GET /openapi.json` → HTTP 200, 350,094 bytes, 172 paths |
| Dashboard bundle | `/assets/index-Dw1RIs-B.js` (429,350 bytes) |
| Incidents list component | `function Yr()` (live bundle) |
| Tester | Emil Thomas |
| Evidence dir | (files in workspace root, prefixed `bug031_out_`) |

### Methods Used

| # | Method | What it checks | Result |
|---|--------|----------------|--------|
| 1 | OpenAPI enumeration | Any bulk incident path/method | None — all incident mutations are `{id}`-parameterised |
| 2 | Control: monitors bulk path | Platform has a bulk pattern | Pass — `/api/v1/monitors/bulk` POST/PATCH/DELETE exists |
| 3 | Route probe (POST, no auth) | Hidden bulk endpoints | 404 for all candidate bulk paths |
| 4 | 401-vs-404 disambiguation | Is `bulk/acknowledge` 401 a real bulk route? | No — it's `/incidents/{id}/acknowledge` with `id="bulk"` |
| 5 | GET/POST matrix on `{id}` slot | Confirm `{id}` capture behaviour | `bulk` and `123` behave identically; unknown sub-paths 404 |
| 6 | Dashboard `Yr()` state inspection | Selection state in incidents list | None — only status filter + search `useState` |
| 7 | Dashboard `Yr()` checkbox / "Select all" | Multi-select UI | 0 checkboxes, 0 "Select all" in `Yr` |
| 8 | Dashboard mutation helpers | Array-of-ids payload anywhere | None — all mutations take a single `${id}` |
| 9 | Control: monitors list UI | Platform has multi-select UI | Pass — `N.has(P.id)` Set + "Select all" + per-row checkboxes |

### Phase A — API Surface (OpenAPI)

Fetched the live OpenAPI document and enumerated every path containing `incident`.

**All incident-related paths and their methods**

| Path | Methods | Bulk? |
|------|---------|-------|
| `/api/v1/incidents/` | GET | — (list only; `limit`/`offset`/`status` params) |
| `/api/v1/incidents/{id}` | GET | — (single read) |
| `/api/v1/incidents/{id}/deliveries` | GET | — |
| `/api/v1/incidents/{id}/analysis` | GET | — |
| `/api/v1/incidents/{id}/updates` | POST | single |
| `/api/v1/incidents/{id}/acknowledge` | POST | **single** |
| `/api/v1/incidents/{id}/postmortem` | PUT | single |
| `/api/v1/incidents/{id}/resolve` | POST | **single** |
| `/api/v1/incidents/{id}/context` | GET | — |
| `/api/v1/cases/{id}/incidents` | POST | single (attach one incident; body `{incidentId: integer}`) |
| `/api/v1/cases/{id}/incidents/{incidentId}` | DELETE | single (detach) |
| `/api/v1/context/incident/{incidentKey}/summary` | GET | — |
| `/api/v1/context/incident/{incidentKey}/blast` | GET | — |

- The only incident **mutation** routes are all parameterised by a single `{id}`. There is **no** `/api/v1/incidents/bulk`, no `/incidents/bulk/acknowledge`, no collection-level `/incidents/acknowledge` or `/incidents/resolve`.
- The only collection-level incident route is `GET /api/v1/incidents/` (list); it accepts `limit`/`offset`/`status` (the BUG-026 fix) but no `ids[]` / batch selector.
- The closest thing to "grouping" incidents is the **Cases** feature (`POST /api/v1/cases/{id}/incidents`), but that attaches **one** incident at a time and is a grouping/analysis feature, not a bulk acknowledge/resolve action.

**Control — the platform *does* implement a bulk pattern, for monitors:**

| Path | Methods | Purpose |
|------|---------|---------|
| `/api/v1/monitors/bulk` | POST, PATCH, DELETE | Bulk create / update / delete monitors |

So 24Observe has a known bulk-action pattern in its API design; it is simply **not extended to incidents**.

---

### Phase B — Route Probing (Disambiguating 401 vs 404)

The single-incident routes use `{id}` as a path parameter, so a request to `/api/v1/incidents/bulk/acknowledge` will be **matched by** `/api/v1/incidents/{id}/acknowledge` with `id="bulk"` — and therefore return **401 Unauthorized** (auth runs on a real route) rather than 404. A naive tester could misread that 401 as "secret bulk endpoint exists." This phase rules that out.

**Probe matrix (POST, no auth, body `{}`)**

| Path | POST | GET | Interpretation |
|------|------|-----|----------------|
| `/api/v1/incidents/bulk` | 404 | 401 | 404 POST → no such route; 401 GET = matched by `/incidents/{id}` with `id="bulk"` |
| `/api/v1/incidents/bulk/acknowledge` | **401** | 404 | 401 POST = matched by `/incidents/{id}/acknowledge` with `id="bulk"` (NOT a real bulk route) |
| `/api/v1/incidents/bulk/resolve` | **401** | 404 | 401 POST = matched by `/incidents/{id}/resolve` with `id="bulk"` (NOT a real bulk route) |
| `/api/v1/incidents/bulk/totallyfake` | 404 | — | 404 → no route matches `/incidents/{id}/totallyfake` |
| `/api/v1/incidents/totallyfake/route` | 404 | — | 404 → no route |
| `/api/v1/incidents/acknowledge` | 404 | — | 404 → no collection-level acknowledge |
| `/api/v1/incidents/resolve` | 404 | — | 404 → no collection-level resolve |
| `/api/v1/incidents/bulk-acknowledge` | 404 | — | 404 |
| `/api/v1/incidents/bulk-resolve` | 404 | — | 404 |
| `/api/v1/bulk/incidents/acknowledge` | 404 | — | 404 |
| `/api/v1/incidents/123/acknowledge` | **401** | 404 | control: real single route → 401 (auth) |
| `/api/v1/incidents/123/resolve` | **401** | 404 | control: real single route → 401 (auth) |
| `/api/v1/incidents/123/totallyfake` | 404 | — | control: unknown sub-route → 404 |

**Why the 401s are not evidence of a bulk endpoint**

- `/api/v1/incidents/bulk/acknowledge` and `/api/v1/incidents/123/acknowledge` return the **same** status (401 POST / 404 GET). The only difference is the literal `bulk` vs `123` in the `{id}` slot. Both are matching the documented single-incident route `/api/v1/incidents/{id}/acknowledge`.
- A genuine bulk route would not be a child of `{id}`; it would be a sibling like `/api/v1/incidents/bulk` (which returns 404) or `/api/v1/incidents/acknowledge` (which returns 404).
- Truly unknown sub-paths (`/incidents/{id}/totallyfake`) return 404, confirming routing is specific and the 401s are auth-gating on real single-incident routes only.

### Phase C — Dashboard Incidents List UI (Live JS)

Fetched the live SPA shell and main bundle, then located the incidents list component (`function Yr()`).

**Incidents list component — selection / bulk state**

```js
function Yr(){
  const t=Rs(),s=Be(),n=ns(),l=as(),
        [r,i]=m.useState("open"),   // status filter: "open" | "resolved" | "all"
        [x,p]=m.useState("");      // search text
  // ...
  const b=o=>{ n.mutate(o.id,{onError:h=>{z("Failed to acknowledge",h)}}) },
        c=o=>{ confirm(`Resolve incident "${o.title}"?`) && l.mutate(o.id,{onError:h=>{z("Failed to resolve",h)}}) };
  // ... renders cards, each with its own Acknowledge / Resolve buttons
}
```

- Only two `useState` calls in `Yr`: status filter (`"open"`) and search text (`""`). There is **no** selection Set, no `selectedIds`, no `useState([])` for chosen incidents.
- Zero occurrences of `checkbox`, `Select all`, or `select` (as a selection verb) inside `Yr`.
- Each incident is rendered as a `<article class="card ...">` with per-card buttons:
  - `Acknowledge` → `n.mutate(o.id)` → `POST /api/v1/incidents/${id}/acknowledge`
  - `Resolve` → `l.mutate(o.id)` → `POST /api/v1/incidents/${id}/resolve`
- Both actions take a single `o.id`. There is no "apply to selected" path.

**Per-incident mutation helpers (from bundle)**

```js
// acknowledge
k(`/api/v1/incidents/${String(s)}/acknowledge`,{method:"POST"})
// resolve
k(`/api/v1/incidents/${String(s)}/resolve`,{method:"POST"})
// update
k(`/api/v1/incidents/${String(s)}/updates`,{method:"POST",body:{body:n,status:l}})
// postmortem
k(`/api/v1/incidents/${String(s)}/postmortem`,{method:"PUT",body:{postmortem:n}})
```

All four mutations are `${id}`-parameterised. None accepts an array of ids.

**Control: the monitors list *does* have multi-select + bulk UI**

The monitors list component (separate from `Yr`) contains the selection infrastructure that incidents lack:

```js
// "Select all (N)" checkbox
e.jsx("input",{type:"checkbox",checked:N.size>0&&N.size===q.length,onChange:ae}),"Select all (",q.length,")"
// per-row checkbox bound to a selection Set N
e.jsx("input",{type:"checkbox",checked:N.has(P.id),onChange:()=>{Z(P.id)},"aria-label":...})
// and the bulk mutations:
k("/api/v1/monitors/bulk",{method:"POST",   body:s})    // Fs
k("/api/v1/monitors/bulk",{method:"PATCH",  body:s})    // Ds
k("/api/v1/monitors/bulk",{method:"DELETE", body:{ids:s}}) // qs
```

So the codebase already implements the exact UX/API pattern BUG-031 asks for — selection Set, "Select all", per-row checkboxes, and a `/bulk` endpoint — **for monitors**. It has not been ported to incidents.

### Root Cause (Feature Gap, Not Defect)

1. **API layer:** No bulk incident mutation endpoint is declared or routed. The only incident mutations are `POST /api/v1/incidents/{id}/acknowledge`, `…/resolve`, `…/updates`, and `PUT …/postmortem` — all single-incident.
2. **UI layer:** The incidents list component (`Yr`) has no selection state and no bulk-action controls; Acknowledge/Resolve are per-card buttons calling the single-incident mutations.
3. **Precedent exists:** The monitors feature already implements the requested pattern end-to-end (`/api/v1/monitors/bulk` + selection Set + "Select all" + per-row checkboxes). The work to satisfy BUG-031 is a port of that pattern to incidents, not a greenfield design.

### New Findings (Beyond Original One-Liner)

1. **No hidden bulk API** — the 401s on `/incidents/bulk/acknowledge` and `/incidents/bulk/resolve` are a routing artifact (`bulk` captured as `{id}`), not a secret endpoint. Confirmed by GET/POST matrix against `123`.
2. **Cases ≠ bulk actions** — `POST /api/v1/cases/{id}/incidents` attaches one incident at a time (`{incidentId: integer}`) and is a grouping/analysis feature, not a bulk acknowledge/resolve. Don't conflate the two.
3. **The platform already has the pattern** — monitors list + `/api/v1/monitors/bulk` (POST/PATCH/DELETE) plus selection Set + "Select all" + per-row checkboxes. BUG-031 is a port, not a design problem.
4. **Only collection-level incident route is the list** — `GET /api/v1/incidents/` (with `limit`/`offset`/`status` from BUG-026). There is no batch selector param either.
5. **Confirmation UX already exists per-incident** — `confirm("Resolve incident …?")`; a bulk implementation should adapt this to "Resolve N incidents?".

### Verdict: ❌ STILL MISSING

BUG-031 is **not implemented** on 2026-08-13:

- No bulk incident endpoint in the OpenAPI contract (and none reachable by probing).
- The incidents list UI has no multi-select and no bulk Acknowledge/Resolve.
- The only collection-level incident route is `GET /api/v1/incidents/` (list); the only mutations are per-`{id}`.
- The platform already ships a bulk pattern for monitors (API + UI), so the capability exists in-codebase but has not been extended to incidents.

**Recommended fixes**

1. **API:** Add `POST /api/v1/incidents/bulk/acknowledge` and `POST /api/v1/incidents/bulk/resolve` accepting `{ids: number[]}` (or a single `POST /api/v1/incidents/bulk` with an `action` enum + `ids`). Return per-id results (success/failure) so partial failures are visible. Validate id ownership per-incident.
2. **UI:** In `Yr`, add a selection `Set` (`useState(new Set())`), a "Select all" checkbox, and per-card checkboxes (matching the monitors list pattern), plus a sticky bulk-action bar that appears when `N.size > 0` with Acknowledge/Resolve buttons calling the new bulk endpoints.
3. **Confirmation UX:** Keep the existing `confirm("Resolve incident …?")` semantics but adapt for bulk ("Resolve N incidents?").
4. **E2E guard:** Playwright test — select 3 incidents, click bulk Resolve, assert all three transition to `resolved` and the list refreshes (query invalidation).

**Status History**

- 2026-07-13: Open (feature request — no bulk incident actions)
- 2026-08-13: **STILL MISSING** — no bulk incident API endpoint and no multi-select UI in the live incidents list; monitors bulk pattern exists as a ready precedent. Evidence: `bug031_out_incident_paths.json`, `bug031_out_incidents_list_component.txt`, `bug031_out_incident_mutations.txt`, `bug031_out_monitors_bulk_mutation.txt`, `openapi.json`, `app.js`.

________________________________________________________________________________

## Supporting Note — Cross-Bug / Environment Issues Observed During 2026-08-13 Testing

| Issue | Severity (practical) | Related bug | Notes |
|-------|----------------------|-------------|--------|
| OTLP 520 / 525 / timeouts | High for “do I see logs?” | Observed during BUG-028 | Blocks dashboard visibility; collection may still work |
| OTLP 429 / 401 | Medium | Observed during BUG-028 | Rate limit / stale ingest token during re-enroll windows |
| Root `positions.yml` after root→alloy re-enroll | Medium | BUG-025 defense-in-depth | Crash-loop; not a BUG-028 regression |
| `CORP: same-origin` on badge SVG | **High for embeds** | **BUG-029 root** | Also breaks README badges |
| All badges HTTP 404 + `uptime: unknown` | High for badge meaning | **BUG-027** regression | Compounds BUG-029 after CORP fix |
| GUI “add to public status page” fallback | Medium (support UX) | BUG-029 | Misleading when failure is CORP/load |
| Fixed Configuration grid / checks table | Medium for mobile UX | **BUG-030 root** | Phone viewports still broken |
| No `/api/v1/incidents/bulk*` endpoint | Enhancement | **BUG-031 root** | All incident mutations are `{id}`-parameterised |
| No multi-select UI in incidents list | Enhancement | **BUG-031 root** | `Yr()` has only status filter + search `useState` |
| 401 on `/incidents/bulk/acknowledge` is a routing artifact | Low (testing trap) | BUG-031 | `bulk` captured as `{id}` of single-incident route; not a hidden endpoint |
| Monitors bulk pattern exists but not ported | Enhancement | BUG-031 | `/api/v1/monitors/bulk` + selection Set + "Select all" — ready precedent |
| Cases feature attaches one incident at a time | Low (scope clarity) | BUG-031 | `POST /api/v1/cases/{id}/incidents` body `{incidentId: integer}` — grouping, not bulk action |
| API verdict not authenticated | Low (evidence caveat) | BUG-031 | No live PAT in workspace; API verdict rests on OpenAPI + 404/401 route-shape probing; UI verdict from production JS bundle is solid regardless |

________________________________________________________________________________

*End of report — Emil Thomas, 2026-08-13.*

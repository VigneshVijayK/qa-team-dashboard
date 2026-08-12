24observe Testing Report

Date: 06 August 2026
Tester: Emil Thomas (GUI + Copilot)
Environment: Hosted dashboard (login.24observe.com), API (api.24observe.com)
Account: Org 68
Method: Manual GUI testing and browser DevTools inspection. Reproduced UI behaviour, captured console and network evidence.

________________________________________________________________

Bug 1 — Live tail fails to stream (CORS / CSP blocking)

Severity: Medium
Type: Broken feature / connectivity
Status: Confirmed (observed in browser DevTools)

What happened:

When toggling `Live tail` on the `Logs` page the client attempts to connect to `/api/v1/logs/tail`, but the browser blocks or fails those requests (CORS/CSP). No SSE/WebSocket connection is established and no live events appear in the Logs UI.

What I tested / Steps to reproduce:
1. Open `Logs` in the dashboard.
2. Toggle the `Live tail` checkbox.
3. Open DevTools → Console and Network.
4. Observe the tail endpoint requests failing and CSP/CORS console warnings.

What I observed:
1. Console shows CSP/CORS errors (example: blocked external analytics script and blocked calls to `/api/v1/logs/tail`).
2. Network shows the tail endpoint requests are blocked/failed; no SSE frames are received.

Why this matters:
1. Operational: live-tail is essential for real-time monitoring and incident response; broken tail increases detection and response time.
2. User experience: users expect immediate streaming of logs when toggling live tail.

Workarounds:
1. Use API polling or an external tailing tool until the issue is fixed.

What the fix should look like:
1. Ensure `/api/v1/logs/tail` responds with appropriate CORS headers for the dashboard origin, or use same-origin transport for tail traffic.
2. Audit and adjust CSP policies so essential client-side assets for tailing are not blocked.
3. Improve server/client logging for tail handshake failures and authentication errors.

Evidence (DevTools / logs):
- Console entries showing CSP and CORS blocking (e.g. blocked static.cloudflareinsights.com script; blocked SSE/WebSocket to `/api/v1/logs/tail`).
- Network entries showing blocked/failed tail endpoint requests and no SSE frames.

________________________________________________________________

Bug 2 — Saved searches not openable from Logs UI (no selector / query param ignored)

Severity: Low–Medium
Type: UX bug / missing flow
Status: Confirmed

What happened:

Saved searches are visible under `Saved searches` (for example `synthetic logs` with query `attrs.synthetic = true`) 
but there is no way to run/open them from the `Logs` UI. 
Opening Logs after selecting a saved search shows no related data; there is no dropdown, selector, or run action.
 Navigating to `https://login.24observe.com/logs?query=attrs.synthetic = true` does not apply the query, 
so users must manually re-type saved queries after saving or modifying them.

What I tested / Steps to reproduce:
1. Open `Saved searches` (Logs → Saved searches).
2. Note a saved entry (e.g. `synthetic logs` / `attrs.synthetic = true`).
3. Go to `Logs` and look for a run/open control — none exists (no dropdown/list or run button).
4. Open `https://login.24observe.com/logs?query=attrs.synthetic = true` — the app does not populate or apply the query.

What I observed:
1. Saved-search table rows provide only `Edit` and `Delete` actions; no `Open` or `Run`.
2. Logs does not accept `?query=` parameters; the Logs search field remains empty and no data related to the saved query is shown.

Why this matters:
1. Productivity: users must copy/paste or re-type queries, which is error-prone and time-consuming.
2. Consistency: saved searches should be easily re-usable from the Logs UI and via URL.

Workarounds:
1. Manually copy the saved query and paste into Logs → Search.
2. Use a small bookmarklet or automation that opens `/logs` and fills the search input with the saved query.

What the fix should look like:
1. Add an `Open` / `Run` action on each saved-search row that navigates to `/logs` and applies saved query+filters.
2. Implement URL-driven search state on `Logs` so `?query=` and other saved-search parameters are parsed and applied on load.
3. Add tests to cover saved-search open/run flows.

Evidence (UI / manual):
- Saved-searches table shows the saved query text but rows only have `Edit` and `Delete` buttons.
- Attempting to open `/logs?query=...` did not change the Logs page state during inspection.

________________________________________________________________

Combined notes & next steps

1. Both issues are reproducible via browser DevTools and manual inspection; they are functional/UX regressions rather than immediate security exposures based on current evidence.
2. Triage recommendations: prioritize live-tail fix for operational impact; implement saved-search open/run flow as a UX improvement.

End of report.

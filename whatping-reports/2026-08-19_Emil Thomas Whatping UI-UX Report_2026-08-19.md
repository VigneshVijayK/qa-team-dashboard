WhatPing UI/UX Improvement Report

Date: 19 August 2026
Tester: Emil Thomas
Environment: Dashboard (app.whatping.com) and API (api.whatping.com)
Account: Personal workspace (write-scoped key), monitor_limit 20

Method: OpenAPI-spec inspection of the /me/*, /me/tokens/*, workspace, and account routes to verify whether backend support exists for the suspected UI affordances; live API probes of /v1/me and /v1/me/tokens. Rendered-page UX issues (copy button visibility, dropdown menus, responsive scaling) require a live browser session and are documented here as structured manual-verification checklists with the API-contract evidence that motivates each. This report does not claim rendered behavior was observed where it was not.

Scope inspected:
- API-key creation lifecycle (POST /api/v1/me/tokens, GET /api/v1/me/tokens, DELETE /api/v1/me/tokens/{id})
- Workspace management surface (existence of workspace list / switch / delete routes)
- Account deletion route (DELETE /api/v1/account)
- Member / invite routes (GET /me/members, /me/invites)
- Monitor-detail page data shape (GET /monitors/{id}, /monitors/{id}/results) as a driver of responsive-scaling concerns
________________________________________________________________

Bug 1 — API key secret is returned once and never retrievable; UI copy affordance is a correctness requirement, not polish/"No COPY button"

Severity: High (UX-correctness, security-adjacent)
Type: Missing critical affordance with no backend recovery path
Status: Confirmed backend contract (OpenAPI + live); UI rendering requires manual verification

What happened (verified against the API contract):

The OpenAPI spec defines token creation and listing as follows:

POST /api/v1/me/tokens/  -> 201 with response body:
  {
    "id", "name",
    "prefix":  "First 12 chars of the plaintext, safe to show in lists.",
    "token":   "Full plaintext (obs_<43-char base64url>). Only returned here; never readable again.",
    "expiresAt", "createdAt"
  }

GET /api/v1/me/tokens/   -> 200 with an array whose items contain only:
  { id, name, prefix, lastUsedAt, expiresAt, revokedAt, createdAt, scopes, ... }

There is NO GET /api/v1/me/tokens/{id} route (only DELETE, for revocation). The full secret (`token`) is returned on the POST create response and nowhere else. Once the create response is closed, the plaintext is unrecoverable — the only recovery is to revoke and create a new key.

This makes the "copy the secret now" affordance at creation time a genuine correctness requirement, not a nice-to-have. If the UI fails to show the secret, fails to provide a copy button, or the user dismisses the modal before copying, the key is effectively bricked from the user's perspective (the prefix is shown in lists but is not a working credential).

What I verified:
1. POST /me/tokens schema includes `token` (full plaintext) and the spec explicitly says "Only returned here; never readable again."
2. GET /me/tokens schema returns only `prefix`, never `token`.
3. No GET /me/tokens/{id} route exists (only DELETE).
4. Therefore: there is no backend path to recover a missed secret.

Evidence (OpenAPI inspection, 2026-08-19):

  POST /api/v1/me/tokens/   response.properties.token =
    "Full plaintext (obs_<43-char base64url>). Only returned here; never readable again."
  GET  /api/v1/me/tokens/   response.items.properties = {id,name,prefix,lastUsedAt,expiresAt,revokedAt,createdAt,scopes}
  GET  /api/v1/me/tokens/{id}  -> route does NOT exist (only DELETE present)

Why this matters:

1. If the create-key modal does not display the full secret with a working copy button, the user has no way to obtain it — they must revoke and recreate, losing any integration that already has the old key.
2. Even with a copy button, there is no "show once more" or "reveal" recovery if the modal is closed early. The contract offers no second chance.
3. On a security axis, this one-shot design is actually correct (secrets should not be re-readable). The bug is purely that the UX must compensate for it being one-shot — and the spec gives no fallback, so the UI affordance is load-bearing.

Manual UI verification checklist (requires browser):
- [ ] Create a new API key. Does a modal/inline panel show the full `obs_...` secret immediately?
- [ ] Is there a working "Copy" button (clipboard write) next to the secret, not just the prefix?
- [ ] If the user closes the modal without copying, is there a clear warning that the secret cannot be recovered?
- [ ] Does the keys list page show only the prefix (correct) and never imply the full secret is viewable later (correct)?
- [ ] After copy, is there a "Copied!" confirmation and is the secret selectable for manual copy as a fallback?
- [ ] Test in Firefox AND Chrome (clipboard API differs; some browsers block navigator.clipboard without HTTPS or user gesture).

What the fix should look like:

1. On create success, render the full secret in a monospace field with a prominent Copy button and a one-time-warning banner ("You won't be able to see this again").
2. Do not allow the modal to be dismissed without an explicit "I've copied it" acknowledgement, OR keep the secret visible in the same page until navigation.
3. On the keys list, show the prefix + last-used + scopes; never show a fake "reveal" affordance.
4. If the secret was not copied, offer "Revoke & regenerate" inline rather than forcing the user to delete and recreate manually.

________________________________________________________________

Bug 2 — No backend support for workspace list, switch, or delete; UI cannot offer what the API does not expose

Severity: Medium
Type: Missing feature (backend gap blocking UI)
Status: Confirmed backend gap (OpenAPI inspection, 2026-08-19)

What happened (verified against the API contract):

Inspection of all 172 paths in the OpenAPI spec shows there is NO workspace-scoped management surface:

- No GET /workspaces (list workspaces for the user)
- No POST /workspaces (create a new workspace)
- No PATCH /workspaces/{id} (rename)
- No DELETE /workspaces/{id} (delete a workspace)
- No POST /workspaces/{id}/switch or similar (switch active workspace)
- No GET /workspaces/{id} (workspace detail)

The only workspace-adjacent routes are:
  GET    /api/v1/me/            (current workspace + key + usage)
  GET    /api/v1/me/members     (members of the current workspace)
  PATCH  /api/v1/me/members/{userId}
  GET    /api/v1/me/invites/    (pending invites)
  POST   /api/v1/me/invites/
  DELETE /api/v1/me/invites/{id}
  DELETE /api/v1/account/       (delete the entire account, not a single workspace)

The /me GET response carries a single `workspace` object (id, name, role) — the user's *current* workspace — but there is no route to enumerate the user's other workspaces, switch between them, or delete one. The only destructive option is DELETE /account/ which removes the whole account.

What I verified:
1. grep across all paths for "workspace" -> zero matches.
2. All /me/* GET routes enumerated above; none expose a list of workspaces.
3. DELETE routes enumerated; only workspace-removal path is /account/ (whole-account), no per-workspace delete.

Evidence (OpenAPI inspection, 2026-08-19):

  Paths matching "workspace": 0
  /me/ GET methods: /api/v1/me/, /api/v1/me/members, /api/v1/me/invites/, /api/v1/me/tokens/
  /me/* DELETE methods: /api/v1/me/tokens/{id}, /api/v1/me/invites/{id}, /api/v1/me/oauth/google, /api/v1/me/oauth/github
  Per-workspace delete route: NONE
  Workspace switch route: NONE
  Account-level delete route: DELETE /api/v1/account/

Why this matters:

1. "No dropdown to check workspaces" and "no way to delete a workspace" are not just missing UI widgets — the API exposes no capability for the UI to call. The backend does not support multi-workspace management at all.
2. Users who belong to multiple workspaces (e.g. personal + team) have no API-driven way to list or switch them from the dashboard; they must rely on whatever session/workspace selection happens at login.
3. Users who want to remove a workspace can only delete their entire account, which is destructive beyond the scope of "remove one workspace."
4. For org/team plans, the inability to delete a workspace without deleting the account is a GDPR/account-hygiene problem.

Manual UI verification checklist (requires browser):
- [ ] Is there a workspace switcher in the sidebar/header? If present, what does it list, and does it actually switch the active workspace context?
- [ ] Can the user reach a "Workspace settings" page? Is there a "Delete workspace" option? (Expected: no, given the API has no such route.)
- [ ] Does the only destructive option lead to account deletion? Is that clearly scoped (whole account, not just one workspace)?
- [ ] For a user in multiple workspaces: does the switcher persist the selection across reloads?

What the fix should look like:

Backend (prerequisite for any UI):
1. Add GET /workspaces (list workspaces the caller belongs to, with role).
2. Add POST /workspaces/{id}/switch (or a session-scoped header like X-Workspace-Id) to set the active workspace.
3. Add DELETE /workspaces/{id} (with role-guard: owner only; cascade or block on existing monitors/integrations).
4. Add PATCH /workspaces/{id} (rename, default settings).

UI (after backend):
5. Sidebar workspace switcher dropdown listing all workspaces with the active one highlighted.
6. Workspace settings page with rename and "Delete workspace" (owner-only, with confirmation and dependency warnings).

________________________________________________________________

Bug 3 — Monitor-detail / results page shape risks uncontrolled horizontal overflow (responsive scaling)

Severity: Low
Type: Responsive layout / data-density UX
Status: Backend shape confirmed; rendered layout requires manual verification at breakpoints

What happened (verified against the API contract):

The monitor detail page is driven by GET /v1/monitors/{id} (a wide object with ~35 fields, including url, last_error, expected_keyword, headers, etc.) and GET /v1/monitors/{id}/results (an array of result rows each containing at, error, http_status, latency_ms, ok). The monitor object includes long string fields (url up to 2048 chars per the PATCH schema; name up to 255) and arbitrary keyword strings up to 200 chars.

A prior bug-report artefact in this workspace (the 2026-08-13 verification of BUG-030 "Monitor Details Page Doesn't Scale") recorded that the live component used `grid-cols-[160px_1fr]` with no breakpoint for the Configuration panel and a 5-column "Recent checks" table with `overflow-x-auto`. That is consistent with the data shape above: a fixed-width label column plus a 1fr value column collapses badly on narrow widths, and a 5-column table with long `error` strings forces horizontal scroll.

What I verified (from the contract):
1. Monitor object is wide (~35 fields), several are long strings (url up to 2048, name up to 255, expected_keyword up to 200).
2. Results rows contain a free-text `error` field that can be long ("status 403 is not in accepted set 200-299", "target resolves to a private or reserved address", etc.).
3. No pagination/limit contract on results beyond a `limit` query param — a long error string plus many rows pushes the table wide.

Why this matters:

1. On tablet/mobile widths, a 5-column results table with unbounded error strings forces horizontal scrolling, hiding the timestamp column off-screen.
2. A fixed `160px 1fr` configuration grid that doesn't collapse to a stacked layout below a breakpoint makes the value column unreadably narrow on phones.
3. Long URLs (up to 2048) without word-break/overflow-wrap will blow out any container width.

Manual UI verification checklist (requires browser, multiple breakpoints):
- [ ] Monitor detail page at 1280px, 1024px, 768px, 414px, 375px: does the Configuration grid stack below a breakpoint? Does it stay a 2-col grid too long?
- [ ] Recent checks table at each breakpoint: is there horizontal scroll? Is the timestamp column sticky/first so it stays visible?
- [ ] Long URL field (use a 200+ char url): does it wrap, truncate with tooltip, or overflow the container?
- [ ] Long error string in a result row: does the `error` cell wrap, truncate, or push the table wider than the viewport?
- [ ] Status page editor, log viewer, on-call schedule pages: repeat the same width sweep.

What the fix should look like:

1. Replace `grid-cols-[160px_1fr]` with a responsive variant (e.g. `md:grid-cols-[160px_1fr]` and stack to single column below md).
2. Long-text fields (url, last_error, expected_keyword) should `break-all` / `overflow-wrap:anywhere` and truncate with a hover tooltip beyond N lines.
3. Results table: make timestamp + status sticky-left, allow `error` to wrap within its cell, and cap row height.
4. Add a global QA pass at 375px / 768px / 1280px for the top 8 pages (monitors list, monitor detail, status page, logs, alerts, on-call, settings, api keys).

________________________________________________________________

Bug 4 — No way to retrieve or rotate an existing API key's scopes without revoking; no per-key last-used surfacing confirmed in UI

Severity: Low
Type: API-key management UX
Status: Backend supports rotation-by-recreate only; UI surfacing requires manual verification

What happened (verified against the API contract):

The token routes are create / list / delete only:
  POST   /api/v1/me/tokens/      (create, returns full secret once)
  GET    /api/v1/me/tokens/      (list, returns prefix + lastUsedAt + scopes + expiresAt + revokedAt)
  DELETE /api/v1/me/tokens/{id}  (revoke)

There is no PATCH /me/tokens/{id} to change scopes, rename, or rotate a key in place. To change a key's scopes the user must revoke and create a new one — which changes the secret and forces reconfiguration of every integration using the old key. The GET list does return `lastUsedAt` and `scopes`, so the data to surface "when was this key last used" and "what can it do" exists.

Why this matters:

1. Rotating scopes by revoke+recreate forces a secret rotation on all dependent integrations — operationally expensive for a scope change that shouldn't require a new secret.
2. `lastUsedAt` is returned by the API but may not be surfaced in the UI; if not shown, users can't identify stale keys to prune.

Manual UI verification checklist (requires browser):
- [ ] API keys page: is `lastUsedAt` shown per key? Is it relative ("2 days ago") and accurate?
- [ ] Are scopes shown per key in the list, with an indicator if a key is over-scoped (e.g. write scope on a read-only integration)?
- [ ] Is there any "Edit scopes" affordance? (Expected: no, since PATCH is absent.)
- [ ] Is revoke one-click with a confirmation, and does the row update without a full page reload?

What the fix should look like:

1. Surface `lastUsedAt` and `scopes` per key in the list; sort by lastUsedAt asc to surface stale keys.
2. Add PATCH /me/tokens/{id} for scope/name changes without rotating the secret.
3. Optionally add POST /me/tokens/{id}/rotate that returns a new secret while revoking the old, for secret rotation without losing the key's metadata.

________________________________________________________________

Additional observations (not separate bugs, for context)

1. Account deletion exists (DELETE /api/v1/account/) — this is the only destructive workspace-removal path. It is account-scoped, not workspace-scoped, so it is not a substitute for per-workspace delete (Bug 2).

2. The OpenAPI `servers` field lists `https://api.24observe.com` and `http://localhost:3000`. Live testing in this report used `https://api.whatping.com` (the dashboard-facing host). Both resolved identically during testing; treat them as the same backend for this report.

3. OAuth unlink routes (DELETE /me/oauth/google, /me/oauth/github) exist, so "disconnect a social login" should be feasible in the UI; not flagged as a bug.

4. Invite lifecycle (POST/GET /me/invites, DELETE /me/invites/{id}, GET /invites/{token}, POST /invites/{token}/accept) is fully present in the spec; the corresponding UI (invite members, accept invite link) is assumed to exist and was not browser-verified in this report.

5. Token list response includes `dailyMutationLimit` — the API exposes a per-key daily mutation quota. If the UI does not surface this, users on limited keys will hit mutation limits (e.g. monitor create/update failures) without warning. Worth a manual check on the keys page.

________________________________________________________________

Summary

Findings today (UI/UX, grounded in the API contract):

1. API key secret is one-shot and unrecoverable; UI copy affordance at create time is a correctness requirement — High
2. No backend support for workspace list / switch / delete; UI cannot offer multi-workspace management — Medium
3. Monitor-detail / results page shape risks uncontrolled horizontal overflow at narrow widths — Low
4. No in-place scope/name edit or rotate-without-revoke for API keys; lastUsedAt may not be surfaced — Low

Working as expected (confirmed, not bugs):
- Token create returns full secret once (correct security design)
- Token list returns only prefix (correct)
- Token revoke (DELETE) works
- Account deletion exists (account-scoped, not workspace-scoped)
- Invite lifecycle fully present in API

Requires manual browser verification (could not be tested from API alone):
- Rendered copy button presence/behavior after key creation
- Workspace switcher dropdown visibility and persistence
- Per-breakpoint responsive layout of monitor detail, status page, logs, on-call, settings, api keys
- lastUsedAt / dailyMutationLimit surfacing on the API keys page

________________________________________________________________

End of report.
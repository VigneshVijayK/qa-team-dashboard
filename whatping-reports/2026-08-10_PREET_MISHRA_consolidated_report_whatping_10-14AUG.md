# WhatPing Consolidated Testing Report

Reporting Period: 10 August 2026 – 14 August 2026 (one test report per day)
Report Compiled: 14 August 2026
Platform: WhatPing (Hosted dashboard: https://monitor.whatping.com, API: https://api.whatping.com/v1)
Team Size: 2 members
Reporting Method: REST API functional, validation, lifecycle, idempotency & error-handling testing + GUI / manual testing + incident lifecycle & recovery testing

________________________________________________________________

Team Members

1. Preet Mishra — Report author — API + GUI testing (all five daily reports)
2. Khaja Bandenawaz — QA team member

________________________________________________________________

Daily Report Index

| Date | Report | Focus |
|------|--------|-------|
| 10 Aug 2026 | Section 1 — Core REST API Testing | Auth, monitor CRUD, idempotency, error handling |
| 11 Aug 2026 | Section 2 — Monitor Type, Configuration & Lifecycle | 6 monitor types, schema validation, lifecycle |
| 12 Aug 2026 | Section 3 — GUI Testing (Monitors & Workspace Invites) | Deletion UX, invite email, RBAC |
| 13 Aug 2026 | Section 4 — Workspace Management | Creation/deletion lifecycle gap |
| 14 Aug 2026 | Section 5 — Incident Lifecycle & Recovery | Incident state machine, thresholds, recovery |

________________________________________________________________

Consolidated Findings Summary

Bugs Found (10–14 Aug 2026):

1. Nonexistent monitor resources return HTTP 500 instead of HTTP 404 — Medium — API error handling / resource not found — 10 Aug — Preet Mishra
2. Invalid monitor type returns HTTP 500 instead of HTTP 422 — Medium — API validation / error handling — 11 Aug — Preet Mishra
3. TCP monitor accepts an HTTP-only configuration field and returns HTTP 201 instead of rejecting with HTTP 422 — Medium — Schema validation / cross-type configuration — 11 Aug — Preet Mishra
4. "Something went wrong" error displayed upon monitor deletion; no direct delete action on the Monitors list page — Medium — UI / navigation / error handling — 12 Aug — Preet Mishra
5. Workspace email invite notification not sent; non-admin invitees hit "Something went wrong" error on the Platform tab after accepting — High — Email delivery / RBAC / error handling — 12 Aug — Preet Mishra
6. No workspace deletion capability & uncontrolled workspace creation — Medium/High — Feature gap / workspace lifecycle management — 13 Aug — Preet Mishra

14 Aug 2026 (Incident Lifecycle & Recovery): no defects — 35/35 tests passed.

Total bugs/issues in this report: 6 (5 defects + 1 feature gap)

Severity Distribution

- High: 1 (Bug 5 — workspace invite email + Member role Platform tab error)
- Medium: 4 (Bugs 1, 2, 3, 4)
- Medium/High (feature gap): 1 (Bug 6 — workspace deletion missing)

Test Execution Summary

| Date | Suite | Result |
|------|-------|--------|
| 10 Aug 2026 | Core API (auth, monitor CRUD, idempotency, channels, results) | 22/22 PASS — 1 error-handling defect found during extended error-path testing |
| 11 Aug 2026 | Monitor type, configuration & lifecycle | 38/40 PASS (95%) — 2 defects |
| 12 Aug 2026 | GUI / manual testing | 2 bugs found |
| 13 Aug 2026 | Workspace management review | 1 feature gap found |
| 14 Aug 2026 | Incident lifecycle & recovery | 35/35 PASS (100%) — 0 defects |
| — | Combined automated checks | 95/97 PASS (97.9%) |

________________________________________________________________

Section 1 — 10 August 2026 — Core REST API Testing

Environment: WhatPing REST API (https://api.whatping.com/v1), Bearer API key auth
Test Type: Functional, validation, lifecycle, idempotency, error-handling
Author: Preet Mishra

Core API result: 22/22 passed

| Area | Result |
|------|--------|
| Authentication | PASS |
| List monitors | PASS |
| List channels | PASS |
| List incidents | PASS |
| Validation: missing type | PASS |
| Validation: unknown field | PASS |
| Create HTTP monitor | PASS |
| Idempotency | PASS |
| Get monitor | PASS |
| Update monitor | PASS |
| Verify update | PASS |
| Pause monitor | PASS |
| Verify pause | PASS |
| Resume monitor | PASS |
| Verify resume | PASS |
| Get results | PASS |
| Get monitor channels | PASS |
| Attach channel | PASS |
| Verify attachment | PASS |
| Detach channel | PASS |
| Delete monitor | PASS |
| Verify deletion | PASS |

Idempotency detail: initial request → HTTP 201; replay → HTTP 201 with `idempotent-replay: true`. PASS.

________________________________________________________________

Bug 1 — Nonexistent monitor resources return HTTP 500 instead of HTTP 404

Severity: Medium
Category: API Error Handling / Resource Not Found
Date Found: 10 August 2026
Status: Confirmed (reproduced 25× + 5 diagnostic = 30 total requests)

Affected endpoints:

- GET    /monitors/{monitor_id}
- PATCH  /monitors/{monitor_id}
- DELETE /monitors/{monitor_id}
- GET    /monitors/{monitor_id}/results
- GET    /monitors/{monitor_id}/channels

What happened:

When the API receives a request for a monitor that does not exist, it consistently returns HTTP 500 Internal Server Error with:

```json
{
  "error": {
    "code": "internal_error",
    "message": "Something went wrong"
  }
}
```

The expected behavior for a nonexistent monitor resource is HTTP 404 Not Found with an appropriate structured error response.

What was tested:

1. Sent requests with 6 invalid monitor IDs: `does-not-exist`, `00000000000000000000`, `m0000000000000000000`, `invalid`, `xxxxxxxxxxxxxxxxxxxx`, `Example`
2. Hit all 5 affected endpoints with each ID
3. Every request returned HTTP 500 with the generic `internal_error` body

Example reproduction:

```
Request:
GET /v1/monitors/does-not-exist
Authorization: Bearer <API_KEY>
Accept: application/json

Response:
HTTP/1.1 500 Internal Server Error
Content-Type: application/json
{
  "error": {
    "code": "internal_error",
    "message": "Something went wrong"
  }
}

Expected:
HTTP/1.1 404 Not Found
```

Reproduction matrix (25 reproductions — every combination FAIL):

| Endpoint | Invalid IDs tested | Actual | Expected | Result |
|----------|--------------------|--------|----------|--------|
| GET /monitors/{id} | all 5 IDs | 500 | 404 | FAIL ×5 |
| PATCH /monitors/{id} | all 5 IDs | 500 | 404 | FAIL ×5 |
| DELETE /monitors/{id} | all 5 IDs | 500 | 404 | FAIL ×5 |
| GET /monitors/{id}/results | all 5 IDs | 500 | 404 | FAIL ×5 |
| GET /monitors/{id}/channels | all 5 IDs | 500 | 404 | FAIL ×5 |

Control test:

A real monitor was created and then deleted. After deletion, GET /monitors/{id} → 404. This confirms the API can return 404 correctly in valid deletion flows — the 500 occurs only for never-existed / arbitrary invalid IDs.

Why this matters:

- Client-side resource issues are incorrectly classified as server errors.
- Can cause unnecessary client retries, misleading monitoring/alerting, and incorrect error metrics.
- Debugging confusion: on-call engineers investigating a 500 will look for a server-side outage when the real cause is a bad monitor ID.
- Violation of REST semantics.

What the fix should look like:

1. Ensure missing-resource checks occur before exception handling:

```
lookup monitor
  ├── exists   → proceed
  └── missing  → return 404
```

instead of: missing resource → exception → 500.

2. Return a structured 404 body:

```json
{
  "error": {
    "code": "not_found",
    "message": "Monitor not found"
  }
}
```

3. Regression tests: all 5 endpoints with invalid IDs should return 404 after the fix.

Section 1 Summary

- 1 defect found (Bug 1 above).
- Core monitor-management functionality fully passed: 22/22 including full lifecycle CREATE → GET → PATCH → PAUSE → RESUME → RESULTS → CHANNELS → ATTACH → DETACH → DELETE, plus idempotency and validation (missing type → 422, unknown field → 422).

________________________________________________________________

Section 2 — 11 August 2026 — Monitor Type, Configuration & Lifecycle Testing

Environment: WhatPing REST API, Bearer API key auth
Test client: Python + requests (local machine)
Author: Preet Mishra
Result: 38 PASSED / 2 FAILED — 40 tests — 95% — PARTIAL PASS

Pre-existing monitor inventory (before test execution):

```
push:          1
udp:           1
email-auth:    1
http:          3
tcp:           1
domain:        2
icmp:          1
```

What passed (38/40):

- Authentication (200), list monitors (200)
- HTTP monitor: create (201), get (200), results (200), pause (200, verified enabled=false), resume (200)
- TCP monitor: create (201), get (200), results (200)
- PUSH/heartbeat monitor: create (201), get (200), push token presence, push token rotation (200)
- SSL monitor: create (201), get (200), results (200)
- DOMAIN monitor: create (201), get (200), results (200)
- DNS monitor: create (201), get (200), results (200)
- Validation: invalid HTTP config → 422, invalid TCP config → 422, type immutability → 422
- Full lifecycle CREATE → GET → PAUSE → VERIFY PAUSED → RESUME → DELETE → VERIFY DELETED (deleted monitors return 404)
- Cleanup: all 6 temporary monitors deleted (204 → 404 verification) — PASS

________________________________________________________________

Bug 2 — Invalid monitor type returns HTTP 500 instead of HTTP 422

Severity: Medium
Category: API validation / error handling
Date Found: 11 August 2026
Status: Confirmed (FAIL)

What happened:

Creating a monitor with an unsupported/invalid monitor type produces an internal server error instead of a controlled client-validation response.

```
Expected:  Invalid input → validation layer → HTTP 422 → structured validation error
Observed:  Invalid input → API processing → HTTP 500 → internal error
```

Why this matters:

- Incorrect HTTP semantics for invalid client input; client-side error handling becomes unpredictable.
- Clients may believe the service itself is experiencing an internal failure.
- May expose an unhandled validation path in the backend.
- Automated API clients cannot reliably distinguish malformed monitor configuration from a server-side failure.

What the fix should look like:

1. Validate the monitor type before entering monitor-type-specific business logic.
2. Return a structured HTTP 422 response following the existing WhatPing validation-error convention, e.g.:

```json
{
  "error": {
    "code": "validation_error",
    "message": "unsupported monitor type",
    "field": "type"
  }
}
```

________________________________________________________________

Bug 3 — TCP monitor accepts an HTTP-only configuration field (HTTP 201 instead of 422)

Severity: Medium
Category: Schema validation / cross-type configuration
Date Found: 11 August 2026
Status: Confirmed (FAIL)

What happened:

Creating a TCP monitor while supplying an HTTP-specific field succeeds (HTTP 201) instead of being rejected with HTTP 422. The test was specifically designed to determine whether monitor schemas are type-specific and whether unsupported fields are rejected.

```
Observed:  TCP + HTTP-only field → HTTP 201 → monitor created
Expected:  TCP + HTTP-only field → validation → HTTP 422
```

Why this matters:

- Invalid monitor configurations can be persisted.
- API clients receive false confirmation that their configuration is valid.
- Type-specific schema guarantees are weakened; unsupported configuration may be silently ignored or stored, creating ambiguity about actual monitor behavior.
- Similar cross-type field acceptance may exist for other monitor types.

What the fix should look like:

1. Implement strict per-monitor-type field validation, e.g.:

```
HTTP: url, accepted_status, max_redirects, expected_keyword, ...
TCP:  host, port, timeout, ...
```

2. An HTTP-only field supplied to a TCP monitor should return HTTP 422 with a structured validation error.
3. Expand cross-type validation testing: TCP+HTTP, HTTP+TCP, DNS+HTTP, DOMAIN+DNS, SSL+DNS, PUSH+HTTP, ICMP+HTTP, UDP+TCP; repeat with different field names, nulls, empty values, wrong data types, and boundary values.

Section 2 Summary

- 2 defects found (Bugs 2 and 3 above), both concentrated in API input validation.
- Core monitor lifecycle and all 6 monitor types (HTTP, TCP, PUSH, SSL, DOMAIN, DNS) working correctly.
- Overall assessment: functionally strong with two validation defects — investigate before considering the validation layer fully production-ready.

________________________________________________________________

Section 3 — 12 August 2026 — GUI Testing (Monitors & Workspace Invites)

Environment: Hosted dashboard (https://monitor.whatping.com)
Author: Preet Mishra (QA / Manual Tester)

________________________________________________________________

Bug 4 — "Something went wrong" error upon monitor deletion; missing direct deletion action from Monitors list page

Severity: Medium
Category: UI / Navigation / Error Handling
Environment: Monitor Details View & Monitors List Page
Date Found: 12 August 2026
Status: Confirmed

What happened:

1. When a user opens an individual monitor detail view and deletes the monitor, an error message reading "Something went wrong" appears on screen instead of cleanly redirecting the user back to the Monitors overview tab.
2. Deleting a monitor currently requires opening its detail page — there is no direct delete option on the main Monitors list table/card view.

Steps to reproduce:

1. Navigate to the Monitors tab.
2. Click any existing monitor to open its detail page.
3. Click the "Delete" button.
4. Confirm deletion if prompted.

Expected behavior:

- After deleting, the app should cleanly redirect to /monitors with a success confirmation toast/banner (e.g., "Monitor deleted successfully").
- (Feature request / UX enhancement) A quick "Delete" action should be available next to the "Pause" button on the main Monitors list view.

Actual behavior:

- Generic "Something went wrong" error displayed after deletion.
- Deletion possible only via the individual monitor page.

Why this matters:

- Users cannot tell whether the deletion actually succeeded (note: API-side delete + 404 verification passed in Sections 1–2, suggesting the operation succeeds but the UI response/redirect is broken).
- Extra navigation steps for a routine action; inconsistent with REST-level capabilities.

What the fix should look like:

1. Handle the delete response correctly in the UI: redirect to /monitors with a success toast.
2. Surface real API errors (if any) instead of the generic message.
3. Add a Delete action to the Monitors list row actions (with confirmation), next to Pause.

________________________________________________________________

Bug 5 — Workspace invite email not sent; non-admin invitees hit "Something went wrong" on Platform tab

Severity: High
Category: Email Delivery / Access Control (RBAC) / Error Handling
Environment: Workspace Invites / Member Management & Platform View
Date Found: 12 August 2026
Status: Confirmed

What happened:

1. Inviting a user to a workspace via email does not send an email notification to the invitee. The invitee can only discover the invitation by manually logging into the platform and checking the Platform tab.
2. When a newly invited user accepts the invitation with a standard "Member" role, navigating to or staying on the Platform page causes an unhandled "Something went wrong" error with a redirect button to the homepage.
3. If the user is given "Admin" access, no error occurs on the Platform page.

Steps to reproduce:

1. Go to Workspace Settings → Members / Invites.
2. Send an email invitation to a new user with the "Member" role.
3. Check the invitee's email inbox — no email is received.
4. Log in as the invited user and navigate to the Platform tab.
5. Accept the pending invitation.
6. Observe the error on the Platform tab for the "Member" role user (Admin role does not error).

Expected behavior:

- An invitation email with an acceptance link should be delivered to the invitee's address upon dispatch.
- If a "Member" user opens a tab they lack permissions for, the system should show a clear, graceful access-denied message (e.g., "You do not have permission to access this page") rather than a generic crash/error.

Actual behavior:

- No email notification sent.
- "Member" users get a "Something went wrong" error screen on the Platform page after accepting the invite, forcing a return-home click.

Why this matters:

- Invitations are effectively invisible — collaboration onboarding silently breaks without email delivery.
- The Member-role error is role-dependent (Admin works), strongly indicating a permissions/endpoint-authorization issue handled as an unhandled error rather than a graceful 403 UI state.
- First impression for a newly invited member is an error screen.

What the fix should look like:

1. Deliver invitation emails with an acceptance link (verify email provider integration, retries, and logging).
2. Enforce RBAC on Platform-tab data: return 403 and render an access-denied state for Members, instead of an unhandled error.
3. Hide or disable tabs a Member cannot access.
4. Add an automated test: invite Member → accept → every visible tab renders without error.

Section 3 Summary

Bugs found:

1. Monitor deletion error + missing list delete action — Medium
2. Workspace invite email missing + Member Platform-tab error — High

________________________________________________________________

Section 4 — 13 August 2026 — Workspace Management

Environment: Hosted dashboard — https://monitor.whatping.com/platform
Author: Preet Mishra

________________________________________________________________

Bug 6 — Missing workspace deletion capability & uncontrolled workspace creation

Severity: Medium/High (impacts UI usability & account management)
Category: Feature gap / Platform / Workspace Management
Date Found: 13 August 2026
Status: Confirmed

What happened:

In the "Platform" section of the dashboard, users can create a new workspace via the "+ Workspace" button. Upon creation, a completely fresh workspace is generated (empty dashboards, no monitors, fresh usage data). However, there is no corresponding feature, button, or mechanism within the UI (or under Settings/Platform) to delete or archive an existing workspace once created.

Impact:

1. UX: Users can accidentally create multiple redundant workspaces with no way to clean up or manage the list.
2. Resource/data clutter: Unused/empty workspaces accumulate in the dropdown selector and database.
3. Administrative risk: No way to decommission unwanted or test workspaces.

What the fix should look like (either option):

Option A (recommended — full workspace lifecycle support):

- Implement "Delete Workspace" or "Archive Workspace" in Settings or the Platform tab.
- Safeguards: confirmation modal requiring the user to type the workspace name.
- Permission checks: only workspace owners can delete.

Option B (restricted creation):

- Hide or disable the "+ Workspace" button if multi-tenant creation is not intended to be self-serve or if account creation limits apply.

Section 4 Summary

- 1 feature gap (Bug 6). Creation works; deletion/archival does not exist.

________________________________________________________________

Section 5 — 14 August 2026 — Incident Lifecycle & Recovery Testing

Environment: WhatPing REST API, Bearer API key auth
Author: Preet Mishra
Result: 35/35 tests passed — 100% — PASS, no defects

What was tested and passed:

- Authentication
- Create failure monitor; verify initial monitor state
- First failure recorded; monitor remains up (counter = 1)
- Monitor reaches DOWN after configured threshold (down_threshold = 2)
- Exactly one open incident created per outage
- Repeated failures do not create duplicate incidents
- Monitor recovers to UP after switching to a healthy URL
- Incident resolved after recovery (resolved_at set, no longer open)
- Consecutive failure counter resets to 0 on recovery
- Subsequent outage: new failure starts at 1, reaches DOWN on second failure, creates exactly one new open incident while preserving the previous resolved incident
- Monitor deletion (204) and post-deletion 404 verification

Additional finding (documentation, not a bug):

An earlier HTTP 422 error was caused by using the unsupported field `threshold`; the API uses `down_threshold` in the monitor response.

Section 5 Summary

- 0 defects. The incident state machine, failure thresholding, incident creation, duplicate prevention, recovery, failure-counter reset, subsequent incident creation, and deletion behavior all passed.

________________________________________________________________

Overall Consolidated Summary

Total bugs/issues in this report: 6 (5 defects + 1 feature gap)

By severity:

- High: 1 — Bug 5 (workspace invite email not sent + Member role Platform-tab error)
- Medium: 4 — Bug 1 (500 vs 404), Bug 2 (invalid type 500 vs 422), Bug 3 (TCP accepts HTTP field), Bug 4 (monitor deletion UI error)
- Medium/High (feature gap): 1 — Bug 6 (no workspace deletion)

By area:

- API error handling: 2 — Bug 1 (nonexistent monitor → 500), Bug 2 (invalid type → 500)
- API schema validation: 1 — Bug 3 (cross-type field accepted)
- GUI / UX: 1 — Bug 4 (deletion error + missing list action)
- Email delivery / RBAC: 1 — Bug 5 (invite email + Member error)
- Workspace lifecycle: 1 — Bug 6 (deletion missing)

Test execution totals:

- Core API suite (10 Aug): 22/22 PASS
- Monitor type/config/lifecycle (11 Aug): 38/40 PASS (95%)
- Incident lifecycle & recovery (14 Aug): 35/35 PASS (100%)
- Combined: 95/97 automated checks PASS (97.9%); all 5 defects are in error handling / validation / UI, not core functionality

Confirmed working (no defects):

- Full monitor lifecycle across 6 monitor types (HTTP, TCP, PUSH, SSL, DOMAIN, DNS) including create, get, results, pause/resume, update, delete, and post-deletion 404 verification
- Idempotent monitor creation (replay → 201 with idempotent-replay: true)
- Push/heartbeat token rotation
- Channel attach/verify/detach
- Validation of missing type and unknown fields (422)
- Type immutability (422)
- Complete incident state machine: threshold-based DOWN detection, exactly-one-open-incident per outage, duplicate prevention, recovery + counter reset, subsequent incident creation

Notable findings:

1. The generic "Something went wrong" message surfaces in three unrelated places: the API's internal_error body for nonexistent monitors (Bug 1), the monitor-deletion UI (Bug 4), and the Member-role Platform tab (Bug 5). The UI occurrences may share the same unhandled-error fallback — worth a single investigation into global error handling and dedicated 403/404 UI states.
2. HTTP 500 misclassification appears twice on the API (Bugs 1 and 2): both missing resources and invalid input fall into an unhandled path instead of 404/422. Suggests a common missing validation/lookup layer before business logic.
3. Bug 3 (TCP accepts HTTP-only field) is the only defect where invalid data is persisted (HTTP 201) rather than misclassified — highest data-integrity risk of the API defects; the recommended cross-type matrix (TCP+HTTP, HTTP+TCP, DNS+HTTP, etc.) should be run before fix verification.
4. Bug 5 is the highest-severity finding of the week: broken invite delivery plus a role-dependent crash blocks collaborative onboarding for non-admin users.
5. Core functionality is healthy and ended the week clean: the incident engine, monitor lifecycle, idempotency, and all six monitor types passed 100% on 14 Aug — defects are concentrated in validation, error handling, and edge-case UX.

Suggested fix priority:

1. Bug 5 (High) — invite email delivery + Member-role 403 handling
2. Bug 3 — strict per-type schema validation (invalid data persisted)
3. Bug 1 + Bug 2 — correct 404/422 classification (likely one shared fix in the validation/lookup layer)
4. Bug 4 — deletion UI redirect/toast + list delete action
5. Bug 6 — workspace delete/archive with safeguards (or restrict creation)

________________________________________________________________

End of consolidated report.

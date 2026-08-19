# WhatPing Consolidated Testing Report

Date: 19 August 2026
Platform: WhatPing (Hosted dashboard: https://monitor.whatping.com, API: https://api.whatping.com/v1)
Team Size: 1 member
Reporting Method: GUI / manual exploratory testing + alerting & notification dispatch validation + permissions (RBAC) re-verification + plan-limit / billing enforcement re-verification

Note: This report continues the 10–17 Aug 2026 reporting cycle (see consolidated_report_whatping_17aug_c.md). Three of the four findings below are regressions / still-open items re-confirmed on 19 Aug; cross-references to the 17 Aug bug numbers are noted where relevant. Bug numbering in this report restarts at 1; cumulative tracking continues from Bug 13 (see end of report).

________________________________________________________________

Team Members

1. Preet Mishra — Report author — Alerting/notification logic + RBAC / API-key flow / plan-limit re-verification

________________________________________________________________

Consolidated Findings Summary

Bugs Found (19 Aug 2026):

1. Alert spam on failed checks (alerts fire per-probe, not per state change) — Medium — Alerting / notification dispatch logic — Preet Mishra
2. Members can create "write" access API keys (re-confirmed) — High — Privilege escalation / broken access control — Preet Mishra
3. API key created even after clicking "Cancel" on the confirmation pop-up (re-confirmed) — High — Confirmation dialog not honored / destructive action without consent — Preet Mishra
4. Unlimited workspace creation (plan limit bypass) (re-confirmed) — Medium — Billing / plan enforcement gap — Preet Mishra

Total bugs in this report: 4
Total recommendations: 0

Severity Distribution

- High: 2 (Bug 2 — Member-level write API key creation; Bug 3 — Cancel does not cancel)
- Medium: 2 (Bug 1 — alert spam on failed checks; Bug 4 — unlimited workspaces)
- Low: 0

Regression note: Bugs 2, 3, and 4 were first reported on 17 Aug 2026 (as 17 Aug Bugs 3, 6, and 4 respectively) and remain unfixed as of 19 Aug. Only Bug 1 is a new finding.

________________________________________________________________

Section 1 — 19 August 2026 — Alerting & Notification Dispatch Logic

Environment: Hosted dashboard (https://monitor.whatping.com), API (https://api.whatping.com/v1)
Author: Preet Mishra

________________________________________________________________

Bug 1 — Alert spam on failed checks (alerts fire per-probe, not per state change)

Severity: Medium
Category: Alerting / notification dispatch logic
Date Found: 19 August 2026
Status: Confirmed

What happened:

The UI explicitly promises that alerts fire only on monitor state changes (e.g., up → down, down → up). In practice, the system is currently firing an alert on every failed probe. A monitor that is already "down" and continues to fail across consecutive probes generates a new alert for each failed check, rather than a single alert at the moment the state transitioned from "up" to "down".

Root cause (analysis):

The notification dispatch appears to be hooked directly to the Rust worker's probe result rather than to the database's state mutation. If the worker simply evaluates "probe failed → send alert," it bypasses the historical context of the monitor — i.e., it has no knowledge of whether the monitor was already in a "down" state. The alert trigger is therefore reacting to the per-probe outcome instead of the state transition.

Why this matters:

- Alert fatigue: a single sustained outage can produce dozens or hundreds of duplicate "down" alerts, one per failed probe interval. Recipients stop trusting and start ignoring alerts — the exact opposite of what a monitoring product must guarantee.
- Cost / noise storms: if alerts fan out to webhooks, email, Slack, or PagerDuty, per-probe firing multiplies outbound messages and can trigger downstream incident storms and rate-limit exhaustion.
- Broken product promise: the UI explicitly states alerts fire on state change only. Current behavior directly contradicts that contract — a correctness defect in the core value proposition of the platform.
- Atomicity risk: even after moving the trigger to the state mutation, concurrent failed probes (e.g., from different regions or retries hitting the same monitor) can race and each observe "previous_state === up" before any of them commits, producing duplicate transition alerts.

What the fix should look like:

1. Move the notification trigger away from the worker and into the database mutation logic (in Convex, per the platform's stack). When the worker reports a failure, the mutation should fetch the monitor's current state and only dispatch the alert webhook/notification if previous_state === 'up' and new_state === 'down'.
2. Ensure the state read + state write + alert dispatch happen as one atomic operation so that concurrent failed probes cannot each independently observe the old "up" state and all fire a transition alert. Only the first probe to commit should emit the alert.
3. Mirror the same logic for the recovery direction: dispatch a "down → up" alert only when previous_state === 'down' and new_state === 'up'.
4. Add an automated test: force a monitor into "down", send N consecutive failed probes, and assert exactly one "down" alert was dispatched (not N).

________________________________________________________________

Section 1 Summary

Bugs found:

1. Alert spam on failed checks — Medium

________________________________________________________________

Section 2 — 19 August 2026 — Access Control (RBAC), API-Key Confirmation Flow & Plan-Limit Enforcement (Re-verification)

Environment: Hosted dashboard (https://monitor.whatping.com), API (https://api.whatping.com/v1)
Author: Preet Mishra

________________________________________________________________

Bug 2 — Members can create "write" access API keys (re-confirmed)

Severity: High
Category: Access Control (RBAC) / privilege escalation / broken access control
Date Found: 19 August 2026 (first reported 17 Aug 2026 — 17 Aug Bug 3)
Status: Regression / Still Open (re-confirmed 19 Aug)

What happened:

A user invited to a workspace with "Member" level access is still able to create API keys with "write" access for that workspace. This permission should be reserved for Owners/Admins. The defect persists from the 17 Aug report — no fix has been applied.

Root cause (analysis):

While the frontend UI may hide the "Create Key" button for Members, the backend endpoint (e.g., POST /api/keys) is likely missing authorization middleware that verifies the requester's role. The UI-level restriction is therefore a cosmetic gate, not an enforced one — any Member can call the endpoint directly to mint a write-scoped key.

Why this matters:

- Privilege escalation: a write-scoped API key allows programmatic mutations (create/update/delete monitors, change configurations). A Member can effectively bypass every UI-level permission restriction by using the API directly.
- The API key outlives the session and can be shared, making access revocation and auditing harder. A leaked or misused write key created by a Member can cause destructive changes the Member was never authorized to perform in the UI.
- Defense-in-depth failure: relying on the frontend to enforce authorization is a broken access control pattern. Any client (curl, alternate UI, scripted client) bypasses it entirely.
- Status: this is the second consecutive report in which this High-severity defect appears unfixed (17 Aug Bug 3 → 19 Aug Bug 2). It should be treated as actively exploitable and prioritized above new feature work.

What the fix should look like:

1. Generation check: wrap the key-generation route in an authorization middleware that strictly checks the user's workspace role. Reject the request with 403 Forbidden if user.role !== 'admin' && user.role !== 'owner'. This must happen server-side, independent of any UI gating.
2. Usage check: validate permissions at execution time, not just at key-creation time. The middleware handling an incoming API request must verify that the key's owner currently has write permissions in that workspace — not just that the key itself is valid. This covers the case where a Member somehow obtains a write key, or where an Admin/Owner is later downgraded to Member (their previously-issued write keys must stop working at that point).
3. Audit existing keys: review any write-scope keys created by Members and consider revoking or downgrading them after the fix.
4. Add automated RBAC tests: for each role (Owner/Admin/Member), assert allowed and denied operations across both the UI and the API-key creation endpoint, including direct API calls that bypass the UI.

________________________________________________________________

Bug 3 — API key created even after clicking "Cancel" on the confirmation pop-up (re-confirmed)

Severity: High
Category: Confirmation dialog not honored / destructive action without consent
Date Found: 19 August 2026 (first reported 17 Aug 2026 — 17 Aug Bug 6)
Status: Regression / Still Open (re-confirmed 19 Aug)

What happened:

On the Platform tab, clicking "Create API key" opens a confirmation pop-up with "OK" and "Cancel" options. Clicking "Cancel" should abort the operation, but the API key is still created — the Cancel action is ignored and the operation proceeds as if OK were clicked. The defect persists from the 17 Aug report.

Steps to reproduce:

1. Navigate to the Platform tab.
2. Click "Create API key".
3. The confirmation pop-up appears with "OK" and "Cancel" options.
4. Click "Cancel".
5. Observe that an API key is created anyway.

Expected behavior:

- Clicking "Cancel" must abort the operation. No API key should be created.
- Clicking "OK" proceeds with creation (current behavior).

Actual behavior:

- Clicking "Cancel" still results in an API key being created — the dialog's Cancel button is effectively a no-op.

Why this matters:

- A confirmation dialog exists specifically so the user can opt out. Silently ignoring Cancel removes user consent from a credential-creation flow.
- API keys are sensitive credentials with persistent access. An unintended key creates an untracked entry point into the account that the user did not approve. A user who clicked Cancel believing no key was created will not audit or rotate that key, leaving an orphan credential active.
- This is the second consecutive report in which this High-severity defect appears unfixed (17 Aug Bug 6 → 19 Aug Bug 3). Combined with Bug 2 (still-open), the entire API-key creation/management surface remains defective on two independent fronts — permissions (Members can mint write keys) and confirmation flow (Cancel is ignored). A focused end-to-end review of the whole API-key module is still warranted, not just point fixes.

What the fix should look like:

1. Wire the Cancel button to abort the creation request — no API call, no key persisted.
2. Only the OK button should trigger the create-key request.
3. After the fix, verify both paths: OK → key created; Cancel → no key created and the pop-up closes.
4. Add an automated UI test: click Cancel, then assert no new key appears in the API-key list (compare count before/after).
5. Consider surfacing a clear toast on success ("API key created") vs. silent close on Cancel, so the user has positive confirmation of the actual outcome.
6. Audit for orphan keys created by past Cancel clicks and offer a bulk-revoke path, since users were silently issued keys they never consented to.

________________________________________________________________

Bug 4 — Unlimited workspace creation (plan limit bypass) (re-confirmed)

Severity: Medium
Category: Billing / plan enforcement gap
Date Found: 19 August 2026 (first reported 17 Aug 2026 — 17 Aug Bug 4)
Status: Regression / Still Open (re-confirmed 19 Aug)

What happened:

A single account can still create an unlimited number of workspaces. Because the basic plan limits users to 20 monitors per workspace, a user can bypass their account limitations and provision unlimited monitors simply by creating additional workspaces. The defect persists from the 17 Aug report.

Why this matters:

- Direct billing bypass: per-workspace monitor caps are meaningless when workspace count is unbounded — a basic-plan user can provision unlimited monitors.
- Resource abuse: each new workspace spins up fresh dashboards, usage data, and storage, multiplying infrastructure cost (a denial-of-wallet vector).
- Compounding defect: cross-referencing the 13 Aug finding (17 Aug report) that workspaces cannot be deleted or archived — unbounded creation with no teardown path means workspace clutter and monitor-limit bypass will only grow.
- Status: this is the second consecutive report in which this Medium-severity defect appears unfixed (17 Aug Bug 4 → 19 Aug Bug 4).

What the fix should look like:

1. Implement a hard cap on the number of workspaces a single account can create, tied to the user's billing plan / subscription tier.
2. Return a clear plan-limit error when the cap is reached, with an upgrade prompt.
3. Pair with the outstanding workspace deletion/archival recommendation so users can manage lifecycle within their cap.
4. Consider enforcing aggregate account-level limits (e.g., total monitors across workspaces) rather than only per-workspace limits, since per-workspace caps are trivially bypassed today.

________________________________________________________________

Section 2 Summary

Bugs found:

1. Member can create write API keys (re-confirmed) — High
2. Cancel on API-key confirm pop-up does not cancel (re-confirmed) — High
3. Unlimited workspace creation (re-confirmed) — Medium

________________________________________________________________

Overall Consolidated Summary

Total bugs in this report: 4
Total recommendations: 0

By severity:

- High: 2 — Bug 2 (Member-level write API key creation, re-confirmed), Bug 3 (Cancel ignored, API key created, re-confirmed)
- Medium: 2 — Bug 1 (alert spam on failed checks), Bug 4 (unlimited workspaces, re-confirmed)
- Low: 0

By area:

- Alerting / notification dispatch: 1 — Bug 1 (new)
- Access control (RBAC) / API-key flow: 2 — Bug 2 (Members mint write keys, re-confirmed), Bug 3 (Cancel does not cancel, re-confirmed)
- Plan/billing limits & resource caps: 1 — Bug 4 (workspaces, re-confirmed)

Notable findings:

1. Three of four findings in this report (Bugs 2, 3, 4) are re-confirmations of 17 Aug bugs that remain unfixed. The two High-severity API-key defects (Bug 2 and Bug 3) have now persisted across two consecutive reporting cycles — the API-key creation/management module remains defective on both the permission side and the confirmation-flow side, exactly as flagged on 17 Aug. This is no longer a set of independent point bugs; it is an unfixed module.
2. Bug 1 is the only new finding and it strikes the core product promise: a monitoring platform whose alerts do not fire on state changes (and instead fire per failed probe) undermines the primary reason customers use the product. Alert fatigue and downstream notification storms are the direct consequence. The root cause (dispatch hooked to the worker's probe result instead of the database state mutation, with no atomicity guard) is a structural issue in the notification pipeline, not a UI tweak.
3. The systemic "create-without-teardown" theme observed across the 10–17 Aug cycle continues: Bug 4 (workspaces created without limit, still no deletion path) reinforces that WhatPing supports provisioning resources but consistently lacks the corresponding revoke/delete/cap path.
4. Bug 2's usage-check recommendation (validate the key owner's current role at execution time, not just at key-creation time) is a defense-in-depth principle that, if implemented, would also have contained the impact of Bug 3's orphan keys — a Member-issued or Cancel-issued write key would be inert at the API layer even if it exists. The two High bugs should therefore be fixed together with a shared server-side authorization layer.

Suggested fix priority:

1. Bug 2 + Bug 3 (High, re-confirmed) — API-key module: enforce server-side RBAC on key generation (403 for non-admin/owner) AND validate key-owner role at usage time AND wire Cancel to abort. Audit and revoke existing Member-created and Cancel-created orphan keys. These share one authorization layer and should be fixed as one work item.
2. Bug 1 (Medium, new) — move the alert trigger into the atomic database state mutation so alerts fire only on up↔down transitions; guard against concurrent-probe race conditions.
3. Bug 4 (Medium, re-confirmed) — hard cap on workspaces per account, tied to billing plan; pair with the still-outstanding workspace deletion/archival work.

Cumulative tracking (10–19 Aug 2026): 17 total issues/recommendations — previous cycles 13 (Bugs 1–13) + this report 4 bugs (numbered continuously as Bugs 14–17 if tracked across the full cycle). Of the 17, 3 (Bugs 9, 12, 11 in cumulative numbering — i.e. 17 Aug Bugs 3, 6, 4) are now re-confirmed still-open on 19 Aug.

________________________________________________________________

End of consolidated report.
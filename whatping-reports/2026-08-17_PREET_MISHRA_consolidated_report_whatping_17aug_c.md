# WhatPing Consolidated Testing Report

Date: 17 August 2026
Platform: WhatPing (Hosted dashboard: https://monitor.whatping.com, API: https://api.whatping.com/v1)
Team Size: 2 members
Reporting Method: GUI / manual exploratory testing + permissions (RBAC) validation + plan-limit / billing enforcement checks + access-control & invitation-flow validation

Note: This report continues the 10–14 Aug 2026 reporting cycle (see consolidated_report_whatping.md). Cross-references to earlier bugs are noted where relevant.

________________________________________________________________

Team Members

1. Preet Mishra — Report author — GUI / RBAC / plan-limit / API-key flow & invitation-flow testing
2. Khaja Bandenawaz — QA team member — GUI / RBAC

________________________________________________________________

Consolidated Findings Summary

Bugs Found (17 Aug 2026):

1. Unused "Jobs" tab in navigation — Low — Dead UI element / navigation cleanup — Preet Mishra
2. Unrestricted file uploads (storage vulnerability) — Medium — Missing plan-based storage limits — Preet Mishra
3. Incorrect RBAC: Members can create "write" access API keys — High — Privilege escalation / permission matrix — Preet Mishra
4. Unlimited workspace creation (plan limit bypass) — Medium — Billing / plan enforcement gap — Preet Mishra
5. Unnecessary UI elements in top right corner (Help link + version number) — Low — UI cleanup — Khaja Bandenawaz
6. API key created even after clicking "Cancel" on the confirmation pop-up — High — Confirmation dialog not honored / destructive action without consent — Preet Mishra
7. No option to revoke or delete a pending workspace invitation — Medium — Invitation lifecycle management gap — Preet Mishra

Recommendation:

- Tokenized email invitation link so invitees can access the dashboard directly from the email — Preet Mishra

Total bugs in this report: 7
Total recommendations: 1

Severity Distribution

- High: 2 (Bug 3 — Member-level write API key creation; Bug 6 — Cancel does not cancel)
- Medium: 3 (Bug 2 — unrestricted uploads; Bug 4 — unlimited workspaces; Bug 7 — pending invite cannot be revoked)
- Low: 2 (Bug 1 — unused Jobs tab; Bug 5 — unwanted UI elements)

________________________________________________________________

Section 1 — 17 August 2026 — GUI, RBAC & Plan-Limit Testing

Environment: Hosted dashboard (https://monitor.whatping.com), API (https://api.whatping.com/v1)
Author: Preet Mishra

________________________________________________________________

Bug 1 — Unused "Jobs" tab in navigation

Severity: Low
Category: Dead UI element / navigation cleanup
Date Found: 17 August 2026
Status: Confirmed

What happened:

The "Jobs" tab on the website currently serves no actual purpose and lacks functionality. It is present in the navigation but does nothing useful for the user.

Why this matters:

- A non-functional navigation item confuses users and suggests a feature that does not exist.
- It occupies navigation space and adds noise to the UI.
- If the underlying feature is planned but unfinished, shipping the tab early creates false expectations.

What the fix should look like:

1. Remove or hide the "Jobs" tab from the navigation menu until its intended functionality is developed and ready for release.
2. If the feature is on the roadmap, gate it behind a feature flag so it can be enabled when ready.

________________________________________________________________

Bug 2 — Unrestricted file uploads (storage vulnerability)

Severity: Medium
Category: Resource limits / storage abuse vector
Date Found: 17 August 2026
Status: Confirmed

What happened:

The file upload feature currently allows unlimited file uploads. There is no cap tied to the user's plan, so uploads consume excessive server-side storage and could lead to performance or cost issues.

Why this matters:

- Storage exhaustion: any user (including free/basic accounts) can consume unbounded server storage.
- Cost risk: storage and bandwidth costs scale with usage but are not gated by billing plans — a denial-of-wallet vector.
- Performance risk: unbounded storage growth can degrade backup times, query performance, and overall service health.
- Related gap: this is the same class of issue as Bug 4 (unlimited workspace creation) — resource limits are not tied to billing plans anywhere they should be.

What the fix should look like:

1. Restrict file upload limits based on billing plans (e.g., allocate 5 GB of storage for basic subscriptions), with clear UI indication of usage and remaining quota.
2. Return a clear quota-exceeded error (e.g., HTTP 413/429 or a plan-limit response) when the cap is reached.
3. If the file upload feature is not strictly necessary, consider removing it entirely.

________________________________________________________________

Bug 3 — Incorrect RBAC: Members can create "write" access API keys

Severity: High
Category: Access Control (RBAC) / privilege escalation
Date Found: 17 August 2026
Status: Confirmed

What happened:

When a new user is invited to a workspace with "Member" level access, they are incorrectly granted the ability to create API keys with "write" access for that workspace. This permission should be reserved for Owners/Admins.

Why this matters:

- Privilege escalation: a write-scoped API key allows programmatic mutations (create/update/delete monitors, change configurations) — a Member can effectively bypass every UI-level permission restriction by using the API directly.
- The API key outlives the session and can be shared, making access revocation and auditing harder.
- A leaked or misused write key created by a Member can cause destructive changes the Member was never authorized to perform in the UI.
- Cross-reference (12 Aug, Bug 5 in the previous report): the Member role is simultaneously blocked from viewing the Platform tab (unhandled error) yet allowed to mint write API keys — the Member permission matrix is enforced inconsistently in both directions.
- Related defect in this report: Bug 6 — the API-key creation confirmation pop-up also does not honor Cancel. The API-key creation surface is now defective on both the permission side (this bug) and the confirmation-flow side (Bug 6).

What the fix should look like:

1. Restrict "write" API key creation to workspace Owners/Admins.
2. Members should have restricted or read-only API access depending on the intended permission matrix.
3. Audit existing keys: review any write-scope keys created by Members and consider revoking or downgrading them after the fix.
4. Add automated RBAC tests: for each role (Owner/Admin/Member), assert allowed and denied operations across both the UI and the API-key creation endpoint.

________________________________________________________________

Bug 4 — Unlimited workspace creation (plan limit bypass)

Severity: Medium
Category: Billing / plan enforcement gap
Date Found: 17 August 2026
Status: Confirmed

What happened:

A single account can create an unlimited number of workspaces. Because the basic plan limits users to 20 monitors per workspace, a user can bypass their account limitations and create unlimited monitors simply by creating additional workspaces.

Why this matters:

- Direct billing bypass: per-workspace monitor caps are meaningless when workspace count is unbounded — a basic-plan user can provision unlimited monitors.
- Resource abuse: each new workspace spins up fresh dashboards, usage data, and storage, multiplying infrastructure cost.
- Cross-reference (13 Aug, Bug 6 in the previous report): workspaces can be created without limit AND cannot be deleted or archived — the two issues combine into unbounded, unmanageable workspace growth.

What the fix should look like:

1. Implement a hard cap on the number of workspaces a single account can create, tied to the user's billing plan/subscription tier.
2. Return a clear plan-limit error when the cap is reached, with an upgrade prompt.
3. Pair with the 13 Aug recommendation (workspace deletion/archival) so users can manage lifecycle within their cap.
4. Consider enforcing aggregate account-level limits (e.g., total monitors across workspaces) rather than only per-workspace limits.

________________________________________________________________

Bug 5 — Unnecessary UI elements in top right corner (Help link + version number)

Severity: Low
Category: UI cleanup
Date Found: 17 August 2026
Status: Confirmed

What happened:

The "Help" link and version number are displayed in the top right corner of the application UI and are no longer desired.

Why this matters:

- Visual clutter in a prime UI position for elements that are no longer wanted.
- Displayed version information can also aid attackers in identifying the platform's build for known-vulnerability matching, if it reflects internal build numbers.

What the fix should look like:

1. Remove the "Help" link and the version number from the top right corner of the UI.
2. If Help content is still needed, relocate it to a less prominent location (e.g., settings or user menu).

________________________________________________________________

Section 1 Summary

Bugs found:

1. Unused "Jobs" tab — Low
2. Unrestricted file uploads — Medium
3. Member can create write API keys — High
4. Unlimited workspace creation — Medium
5. Unwanted top-right UI elements — Low

________________________________________________________________

Section 2 — 17 August 2026 — Platform API Key Flow & Workspace Invitation Flow

Environment: Hosted dashboard (https://monitor.whatping.com), API (https://api.whatping.com/v1)
Author: Preet Mishra

________________________________________________________________

Bug 6 — API key created even after clicking "Cancel" on the confirmation pop-up

Severity: High
Category: Confirmation dialog not honored / destructive action without consent
Date Found: 17 August 2026
Status: Confirmed

What happened:

On the Platform tab, clicking "Create API key" opens a confirmation pop-up with two options: "OK" and "Cancel". Clicking "Cancel" should abort the operation, but the API key is still created — the Cancel action is being ignored, and the destructive/irreversible operation proceeds as if OK were clicked.

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

- A confirmation dialog exists specifically so the user can opt out. Silently ignoring Cancel defeats the purpose of the confirmation and removes user consent from a credential-creation flow.
- API keys are sensitive credentials with persistent access. An unintended key creates an untracked entry point into the account that the user did not approve.
- This is the second API-key-related defect in this report (cross-reference Bug 3 — Members can mint write API keys). The API-key creation surface is now buggy on both the permission side and the confirmation-flow side — a focused review of the entire API-key creation/management module is warranted.
- A user who clicked Cancel believing no key was created will not audit or rotate that key, leaving an orphan credential active.

What the fix should look like:

1. Wire the Cancel button to abort the creation request — no API call, no key persisted.
2. Only the OK button should trigger the create-key request.
3. After the fix, verify both paths: OK → key created; Cancel → no key created and the pop-up closes.
4. Add an automated UI test: click Cancel, then assert no new key appears in the API-key list (compare count before/after).
5. Consider surfacing a clear toast on success ("API key created") vs. silent close on Cancel, so the user has positive confirmation of the actual outcome.

________________________________________________________________

Bug 7 — No option to revoke or delete a pending workspace invitation

Severity: Medium
Category: Invitation lifecycle management gap
Date Found: 17 August 2026
Status: Confirmed

What happened:

When a workspace owner invites another user to collaborate, the invitation enters a pending state. There is no option to delete or revoke that pending invitation — even if the invitee takes too long to respond, or the owner invited the wrong person by mistake. Once sent, the invitation cannot be cancelled from the UI.

Steps to reproduce:

1. Go to Workspace Settings → Members / Invites.
2. Send an email invitation to a user.
3. Look for a "Revoke", "Cancel", or "Delete" option on the pending invitation.
4. Observe that no revoke/delete control exists.

Expected behavior:

- Workspace owners/admins should be able to revoke or delete a pending invitation at any time, before the invitee accepts.

Actual behavior:

- Pending invitations cannot be cancelled or removed. They remain pending indefinitely with no owner control.

Why this matters:

- Sent-to-wrong-person: a mistaken invite cannot be retracted — the invitee can still accept later and gain access the owner no longer wants them to have.
- Stale invitations: invitations that never get accepted accumulate in the pending list with no way to clean them up.
- Cross-reference (12 Aug, Bug 5 in the 10–14 Aug report): invitation email delivery itself is currently broken (no email is sent), so a pending invite that the owner cannot revoke AND the invitee never received is doubly stuck — invisible to the invitee and uncontrollable by the owner.
- This is the same lifecycle theme as Bug 4 (workspace creation without deletion) — resources can be created but not torn down.

What the fix should look like:

1. Add a "Revoke" / "Delete" action next to each pending invitation in the invites list.
2. Revoking should mark the invitation as cancelled server-side so it can no longer be accepted.
3. Require a confirmation step before revocation (to prevent accidental clicks).
4. Optional: show a "pending since" timestamp on each invite so stale ones are easy to spot.
5. Add an automated test: send invite → revoke → assert the invite can no longer be accepted and is removed from the pending list.

________________________________________________________________

Recommendation — Tokenized email invitation link

Type: Feature recommendation (not a bug)
Date: 17 August 2026

What is being recommended:

Workspace invitations should use a tokenized, single-use link sent by email, so the invited user can access the dashboard directly by clicking the link — rather than having to log in first and then discover the pending invitation in the Platform tab.

Why this matters:

- Reduces friction: the invitee clicks the link, lands directly in the workspace (or the accept-invite screen), and is productive immediately.
- Pairs directly with the cross-referenced open issues:
  - 12 Aug Bug 5 — invitation emails are currently not sent at all, so there is no link path today.
  - Bug 7 above — once revocation exists, the token can be invalidated server-side on revoke (token-based revocation is cleaner than email-based).
- Tokenized links also support standard patterns: expiry, single-use enforcement, role pre-assignment at accept time, and audit trail of who accepted which token.

What this should look like:

1. On invite, generate a single-use, expiring token bound to (workspace_id, invitee_email, role).
2. Send an email containing a link such as https://monitor.whatping.com/invite?token=<token>.
3. On click: validate the token (exists, not expired, not already used), then either:
   - Auto-accept and redirect into the workspace if already logged in as the invitee, or
   - Show a login screen, then accept on successful login.
4. Invalidate the token on accept or on revoke (ties into Bug 7's fix).
5. Set a sensible default expiry (e.g., 7 days) with the ability for owners to resend.

________________________________________________________________

Section 2 Summary

Bugs found:

1. Cancel on API-key confirm pop-up does not cancel — High
2. Pending workspace invitation cannot be revoked — Medium

Recommendation:

1. Tokenized email invitation link — feature recommendation

________________________________________________________________

Overall Consolidated Summary

Total bugs in this report: 7
Total recommendations: 1

By severity:

- High: 2 — Bug 3 (Member-level write API key creation), Bug 6 (Cancel ignored, API key created)
- Medium: 3 — Bug 2 (unrestricted uploads), Bug 4 (unlimited workspaces), Bug 7 (pending invite cannot be revoked)
- Low: 2 — Bug 1 (unused Jobs tab), Bug 5 (top-right UI elements)

By area:

- Access control (RBAC) / API-key flow: 2 — Bug 3 (Members mint write keys), Bug 6 (Cancel does not cancel)
- Plan/billing limits & resource caps: 2 — Bug 2 (file storage), Bug 4 (workspaces)
- Workspace invitation lifecycle: 1 — Bug 7 + the tokenized-link recommendation
- UI cleanup: 2 — Bug 1 (Jobs tab), Bug 5 (Help link + version)

Notable findings:

1. Bug 3 and Bug 6 together show the API-key creation surface is defective on two independent fronts — permissions (Members can mint write keys) and confirmation flow (Cancel is ignored). A focused end-to-end review of the entire API-key creation/management module is warranted, not just point fixes.
2. Bugs 2 and 4 share one root theme: resource limits are not tied to billing plans. File storage and workspace creation are both unbounded; a single plan-limit enforcement layer would address both.
3. Bug 4 compounds the 13 Aug workspace finding (no deletion): unbounded creation with no cleanup path means workspace clutter and monitor-limit bypass will only grow.
4. Bug 7 + the tokenized-link recommendation together form a single coherent invitation-lifecycle improvement: send a tokenized email (recommendation) AND allow the owner to revoke that token (Bug 7). Cross-references the 12 Aug finding that invitation emails are not sent at all — the email delivery fix and the tokenized-link work should be tackled together.
5. Both Bug 7 and Bug 4 follow the same recurring theme observed across the entire 10–17 Aug cycle: WhatPing supports creating/issuing things (monitors, workspaces, API keys, invitations) but consistently lacks the corresponding revoke/delete/teardown path. This is now a systemic pattern, not an isolated gap.
6. Bugs 1 and 5 are quick UI-cleanup wins suitable for immediate hotfix alongside any of the above.

Suggested fix priority:

1. Bug 3 + Bug 6 (High) — API-key module: restrict write-key creation to Owners/Admins AND wire Cancel to abort; audit existing Member-created and Cancel-created orphan keys
2. Bug 7 + tokenized-link recommendation — implement revoke + tokenized email delivery together as one invitation-lifecycle feature, since they share the token/revocation model
3. Bug 4 — hard cap on workspaces per account, tied to billing plan
4. Bug 2 — plan-based file upload/storage quotas
5. Bug 1 + Bug 5 — remove Jobs tab and top-right Help/version elements

Cumulative tracking (10–17 Aug 2026): 13 total issues/recommendations — previous cycle 6 (Bugs 1–6) + this report 7 bugs + 1 recommendation (numbered continuously as Bugs 7–13 if tracked across the full cycle).

________________________________________________________________

End of consolidated report.

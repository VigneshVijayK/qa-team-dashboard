24observe Audit Log Testing Report

Date: 14 August 2026
Tester: Anubhav 
Environment: Hosted dashboard (login.24observe.com)
Account: Org 169, Free plan
Method: I reviewed the Audit Log section in the dashboard and compared the reported event times with the actual activity performed on the account.

________________________________________________________________

Audit Log Issue — Audit logs are showing account-related activity, but the timestamp column does not show the exact event time

Severity: Medium
Type: Audit visibility / timestamp accuracy
Status: Confirmed (observed during testing of the Audit Log section)

What happened:

I tested the Audit Log section in the 24observe dashboard and observed that it is capturing account-related events and activity. However, the time column is not showing the exact timestamp when the event happened. Instead, it displays relative labels such as:

- 2 hours ago
- 30 minutes ago
- 5 mins ago
- 1 hr ago

This makes it difficult to know the exact date and time of the event, especially for investigation, security review, compliance checks, or troubleshooting. The log is present, but the time detail is not precise enough for accurate review.

What I tested:

I checked the Audit Logs page while performing and reviewing account-level activity. I looked at the entries shown in the audit timeline and compared them with the expected event timing. The system records actions related to my account, but the time column only shows a human-friendly relative time instead of the exact timestamp.

Examples observed:

1. Event appears in the audit log as expected.
2. The time shown is relative, for example “2 hours ago” instead of the exact event timestamp.
3. The UI does not clearly show when the event actually happened down to the exact date/time.
4. This creates confusion when there are multiple events in a short time window.

Why this matters:

1. Investigations become harder — a user cannot quickly determine the exact time an action occurred.
2. Security review becomes weaker — admins need exact timestamps to audit suspicious activity.
3. Compliance and traceability suffer — exact timestamps are essential for proper records.
4. Confusing UI — relative times are useful as a summary, but they should not replace exact time information.
5. Event correlation issues — when multiple actions happen in quick succession, relative labels do not provide enough precision.

My suggestion:

The Audit Log should display the exact time and date of each event, not only the relative time. A good format would be:

- 2026-08-15 10:42:18 UTC
- 2026-08-15 10:42:18 IST
- or show both: “2 hours ago” + “2026-08-15 08:42:18 UTC”

This would make the log more accurate and more useful for review and investigation.

Recommended improvement:

1. Show the actual event timestamp in the column.
2. Keep the relative label as a secondary helper if needed.
3. Include timezone information so the event time is unambiguous.
4. Allow users to sort by the exact time value, not just relative display.
5. If the UI is limited, provide a tooltip or hover detail showing the exact timestamp.

Expected behavior:

Audit logs should clearly show:

- who performed the action
- what action was taken
- when the action happened
- with exact date and time
- and timezone information if applicable

Current gap:

The system does capture activity related to my account, but the time display is not precise enough. It shows “hrs ago” or “m ago” rather than the actual timestamp when the event happened.

________________________________________________________________

Summary

Findings from testing:
1. Audit log records account-related events — Confirmed
2. Exact timestamp is missing in the time column — Confirmed
3. Relative labels such as “hours ago” and “minutes ago” appear instead of exact time — Confirmed
4. Improvement needed: show exact event time and timezone in the audit log — Recommended

________________________________________________________________

End of report.

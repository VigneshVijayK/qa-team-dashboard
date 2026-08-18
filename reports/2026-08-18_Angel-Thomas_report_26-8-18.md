24observe Testing Report

Date: 18 August 2026
Tester: Angel Thomas (GUI + Copilot)
Environment: Hosted dashboard (login.24observe.com), API (api.24observe.com)
Account: Free plan
Feature: Log Alerts Catalog — MITRE ATT&CK Mapping & Brute Force Detection
________________________________________________________________

Test Case 1 — Verification of MITRE ATT&CK mapping and Brute Force alert generation

Severity: N/A (Verification)
Type: Functional Verification
Status: Passed

What happened:

The Log Alerts catalog was seeded to verify that alerts related to a specific
MITRE ATT&CK technique are correctly reflected. The seeded catalog rules are
disabled by default, so the Brute Force attack rule was manually enabled before
generating test logs. Brute force logs were then generated to confirm that the
corresponding alert was created in the Incidents page, and that the brute force
attack pattern was reflected in the Logs Pattern tab.

What I tested:

1. Logged into the 24observe dashboard.
2. Seeded the Log Alerts catalog.
3. Confirmed the seeded catalog rules are disabled by default.
4. Located the Brute Force attack rule and verified its MITRE ATT&CK mapping
   (T1110 — Brute Force).
5. Enabled the Brute Force attack rule.
6. Generated brute force attack logs.
7. Navigated to the Incidents page and checked for the generated alert.
8. Navigated to the Logs Pattern tab and checked for the brute force pattern.

Expected Result:

1. The Brute Force rule should be mapped to the correct MITRE ATT&CK technique
   (T1110 — Brute Force).
2. Enabling the rule should allow alert generation.
3. Generated brute force logs should produce a corresponding incident in the
   Incidents page.
4. The brute force attack pattern should be reflected in the Logs Pattern tab.

Actual Result:

1. The Brute Force rule was correctly mapped to the MITRE ATT&CK technique.
2. The rule was successfully enabled from its default disabled state.
3. The brute force alert was generated and appeared in the Incidents page.
4. The brute force attack pattern was reflected in the Logs Pattern tab.

Observations / Notes:

1. Seeded catalog rules are disabled by default — this is expected behavior and
   is already indicated in the UI during seeding.
2. No discrepancies were found between the MITRE ATT&CK mapping and the
   generated alert.
3. Alert latency (time from log generation to incident appearing in the
   Incidents page) was approximately 4–5 minutes. This should be confirmed
   against the expected SLA for alert delivery, as it may be a concern for
   time-sensitive incident response.
4. The MITRE ATT&CK tag/technique was verified on the rule itself, but the
   propagation of the technique to the generated incident's details was not
   explicitly verified.
5. False positive/negative behavior was not tested — non-brute-force logs were
   not generated to confirm they do not trigger the alert.
6. Rule enablement persistence was not verified — it is unknown whether the
   enabled state persists across page reloads, re-login, or catalog re-seeding.
7. Multiple failed login attempts were correctly consolidated into a single
   incident (no incident flood) — this is expected and desirable behavior for
   high-volume brute force activity.
8. The generated incident did not display a severity level. This should be
   confirmed against the expected behavior, as severity is important for
   prioritization and routing during incident response.

Why this matters:

This verifies the end-to-end flow of the Log Alerts catalog: from MITRE ATT&CK
mapping, through rule enablement, to alert generation and pattern detection.
Correct mapping ensures security teams can trust that alerts correspond to the
intended attack technique, which is critical for accurate threat detection and
incident response.

Suggested follow-ups:

1. Verify the same flow for other MITRE ATT&CK techniques in the catalog.
2. Add an automated test to validate that enabling a rule and generating
   matching logs produces the expected incident and pattern.
________________________________________________________________

Summary

Bugs found today:
None.

Verifications completed today:
1. MITRE ATT&CK mapping and Brute Force alert generation — Passed.

Observations:
1. Alert latency (log generation to incident appearing) was approximately
   4–5 minutes — to be confirmed against the expected SLA.
2. Multiple failed login attempts were consolidated into a single incident.
3. No severity level was displayed on the generated incident.

________________________________________________________________

End of report.

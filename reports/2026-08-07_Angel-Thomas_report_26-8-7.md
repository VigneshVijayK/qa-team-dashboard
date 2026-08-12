24observe Testing Report

Date: 07 August 2026
Tester: Angel Thomas (GUI + Copilot)
Environment: Hosted dashboard (login.24observe.com), API (api.24observe.com)
Account: Free plan
Feature: Monitor-Keyword(HTTPS + Key Match)
________________________________________________________________

Bug 1 — Incorrect keyword validation in Keyword Monitor

Severity: High
Type: Functional Bug/Key Validation Error
Status: Confirmed

What happened:

While creating or editing a monitor using the Keyword (HTTPS + Body Match) template, the monitor generates a "Keyword Not Found" alert even when the configured keyword is present on the webpage.

For example, configuring a monitor with a keyword that is clearly visible in the webpage still results in the monitor reporting Keyword Not Found and changing its status to DOWN. Repeating the test with a keyword that is actually absent also produces the same result.

As a result, the monitor is unable to correctly determine whether the specified keyword exists in the webpage content.

What I tested:

1. Logged into the 24observe dashboard.
2. Navigated to Monitors → New Monitor.
3. Selected the Keyword (HTTPS + Body Match) monitor template.
4. Entered a valid HTTPS URL.
5. Configured a keyword that was present on the webpage.
6. Created the monitor and allowed it to execute.
7. Observed that a "Keyword Not Found" alert was generated and the monitor status changed to DOWN.
8. Repeated the same test using a keyword that was not present on the webpage.
9. Observed that the monitor again generated a "Keyword Not Found" alert and reported the monitor as DOWN.

Expected Result: When the configured keyword is present on the webpage, the monitor should remain UP and no Keyword Not Found alert should be generated.

When the configured keyword is absent, the monitor should generate a Keyword Not Found alert and report the monitor as DOWN.

Why this matters:

This issue directly affects the Keyword Monitoring feature.

Possible consequences include:

1. False alerts for healthy websites.
2. Users receiving unnecessary incident notifications.
3. Inability to verify webpage content correctly.
4. Genuine content changes cannot be distinguished from normal operation.
5. Reduced confidence in the monitoring feature.
6. Increased time spent investigating false-positive alerts.

Since Keyword Monitoring is used to verify critical webpage content such as login pages, dashboards, maintenance pages, and application status pages, incorrect keyword validation can result in unnecessary investigations and unreliable monitoring.

What the fix should look like:

1. The monitor should correctly retrieve the webpage response before performing keyword validation.
2. The configured keyword should be accurately matched against the webpage content.
3. A Keyword Not Found alert should only be generated when the keyword is genuinely absent.
4. The monitor should remain UP when the keyword is successfully found.
5. Validate keyword matching for different webpage responses and supported character formats.
6. Verify keyword validation across different websites and response types.
7. Add automated validation tests to ensure keyword matching behaves correctly for both successful and unsuccessful scenarios.
________________________________________________________________

Summary

Bugs found today:
1. Incorrect keyword validation in Keyword Monitor.

________________________________________________________________

End of report.

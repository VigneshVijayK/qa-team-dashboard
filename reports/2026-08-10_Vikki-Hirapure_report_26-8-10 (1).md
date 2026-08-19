24observe Testing Report

Date: 10 August 2026
Tester: Vikki Hirapure (GUI + Copilot)
Environment: Hosted dashboard (login.24observe.com), API (api.24observe.com)
Account: Free plan
Feature: Linux Host Log Ingestion (Logs Viewer)
________________________________________________________________

Bug 1 — Incorrect timestamp displayed for Linux host logs in Logs section

Severity: High
Type: Functional Bug/Timestamp Mismatch
Status: Confirmed

What happened:

After adding a Linux host to the project and generating logs from it, the logs can be viewed in the project through two options: Explore and Logs. While the Explore option displays the correct log time, the Logs section shows an incorrect time for the same logs.

For example, a log that was actually generated at 4:10 appears with the wrong time in the Logs section. The same log, when viewed through the Explore option, shows the correct time. This indicates that the Logs section is not rendering the log timestamp accurately.

As a result, users relying on the Logs section to review host activity are presented with a timestamp that does not match the actual time the log was generated on the Linux host.

What I tested:

1. Logged into the 24observe dashboard.
2. Added a Linux host to the project.
3. Generated some logs from the Linux host (e.g., a log at 4:10).
4. Navigated to the project and opened the Explore option.
5. Observed that the logs were displayed with the correct timestamp (e.g., 4:10).
6. Navigated to the project and opened the Logs option.
7. Observed that the same logs were displayed with an incorrect timestamp that did not match the actual generation time (4:10).
8. Compared the timestamps shown in Explore and Logs for the same log entry and confirmed the mismatch.

Expected Result: The Logs section should display the same timestamp as shown in the Explore option and should accurately reflect the actual time the log was generated on the Linux host.

Why this matters:

This issue directly affects the Log Viewer feature for Linux hosts.

Possible consequences include:

1. Misleading log timelines during incident investigation.
2. Incorrect correlation between host events and other monitored events.
3. Users making wrong conclusions about when an issue actually occurred.
4. Reduced confidence in the Logs section as a reliable source of activity data.
5. Increased time spent cross-verifying timestamps between Explore and Logs.
6. Potential false root-cause analysis due to shifted event times.

Since logs from Linux hosts are used to track system activity, troubleshoot issues, and correlate events across the infrastructure, an incorrect timestamp in the Logs section can result in misleading analysis and unreliable incident timelines.

What the fix should look like:

1. The Logs section should use the same timestamp source/format as the Explore option to ensure consistency.
2. The timestamp displayed in the Logs section should match the actual log generation time on the Linux host.
3. Verify that timezone handling is applied consistently across Explore and Logs (host time vs. UTC vs. dashboard time).
4. Ensure no offset (e.g., ±hours or ±minutes) is being applied only to the Logs view.
5. Validate timestamp accuracy across logs generated at different times of the day to catch AM/PM and timezone drift.
6. Verify timestamp consistency for multiple Linux hosts in different timezones.
7. Add automated validation tests to ensure the Logs and Explore sections display identical timestamps for the same log entry.
________________________________________________________________

Summary

Bugs found today:
1. Incorrect timestamp displayed for Linux host logs in Logs section.

________________________________________________________________

End of report.
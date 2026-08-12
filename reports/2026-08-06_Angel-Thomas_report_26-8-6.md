24observe Testing Report

Date: 06 August 2026
Tester: Angel Thomas (GUI + Copilot)
Environment: Hosted dashboard (login.24observe.com), API (api.24observe.com)
Account: Free plan
Feature: On-call scheduling
________________________________________________________________

Bug 1 — Incorrect time selected while configuring rotations for On-call Schedule

Severity: High
Type: Functional Bug/Scheduling Error
Status: Confirmed

What happened:

While creating or editing rotations for an On-call schedule the Start Time and End Time fields doesn't match the actual value that is being selected by the user.
For example, selecting one specific time results in a different time being saved or displayed. Because the On-Call schedule determines which engineer is responsible during a given period, this causes incorrect shift assignments.
As a result, alerts may be routed to the wrong on-call engineer during an incident.

What I tested:

1. Logged into the 24observe dashboard.
2. Navigated to On-Call -> New Schedule.
3. Created a new schedule.
4. Added an On-Call participant.
5. Navigated to Schedules -> Rotations 
5. Selected the desired Start Time and End Time.
6. Added the Rotation.
7. Observed that the selected time values did not match the values selected.

Expected Result: The Start Time and End Time displayed should exactly match the values selected by the user.

Actual Result: The application selects or stores a different time than the one chosen by the user.

Example:

Selected Start Time: 05:25 (24hr format)
Saved/Displayed Start Time: 23:55 (24hr format)

Why this matters:

This issue directly affects the On-Call scheduling feature.

Possible consequences include:

1. Alerts being assigned to the wrong engineer.
2. The intended on-call engineer not receiving critical incident notifications.
3. Delayed incident response.
4. Incorrect shift coverage.
5. Confusion during incident escalation.
6. Reduced reliability of the On-Call management feature.

Since On-Call scheduling is used for production incident management, incorrect schedule timings can lead to missed or delayed responses during outages.

What the fix should look like:

1. The selected Start Time should exactly match the stored Start Time.
2. The selected End Time should exactly match the stored End Time.
3. No automatic offset or time modification should occur.
4. The UI should display the same value before and after saving.
5. Validate that schedules are stored using the correct time values.
6. Verify time selection across different browsers and time zones.
7. Add validation tests to ensure the saved schedule always matches the user's selected times.
________________________________________________________________

Summary

Bugs found today:
1. Incorrect time selected while configuring rotations for On-call Schedule.

________________________________________________________________

End of report.

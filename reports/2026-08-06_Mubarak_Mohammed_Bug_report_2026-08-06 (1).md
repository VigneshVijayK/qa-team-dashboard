24observe Testing Report

Date: 06 August 2026
Tester: Mubarak Mohammed (GUI)
Environment: Hosted dashboard (login.24observe.com), API (api.24observe.com)
Account: Free plan
Feature: On-call scheduling
________________________________________________________________

Bug 1 — Selected rotation date and time are not applied correctly

Severity: High
Type: Functional Bug/Scheduling Error
Status: Confirmed

What happened:

While creating a rotation for an On-Call schedule, the Start Time and End Time chosen in the form are not preserved after saving. The rotation is created successfully, but the stored values differ from the user's selection.
After submitting the rotation, the UI displays default or unexpected timestamps instead of the selected values. This may result in incorrect on-call assignments.
As a result, alerts may be routed to the wrong on-call engineer during an incident.

What I tested:

1. Logged into the 24observe dashboard.
2. Navigated to On-Call -> New Schedule.
3. Created a new schedule.
4. Added an On-Call participant.
5. Navigated to Schedules -> Rotations 
5. Selected the desired Start Time and End Time.
6. Added the Rotation.
7. Verified that the newly created rotation displayed different time values than those selected.
8. Refreshed the page and confirmed the incorrect values persisted.

Expected Result: The Start Time and End Time displayed should exactly match the values selected by the user.

Actual Result: The application creates the rotation successfully but stores or displays different Start/End times than those selected.

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
6. Verify correct time handling across different browsers, time zones, and daylight saving scenarios.
7. Add automated unit and end-to-end tests to verify that the selected times are preserved after saving.
________________________________________________________________

Summary

Bugs found today:
1. Selected rotation date and time are not applied correctly.

________________________________________________________________

End of report.

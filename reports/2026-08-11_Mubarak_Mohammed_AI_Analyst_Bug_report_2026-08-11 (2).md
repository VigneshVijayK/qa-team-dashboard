24observe Testing Report

Date: 11 August 2026
Tester: Mubarak Mohammed (GUI)
Environment: Hosted dashboard
Feature: AI Analyst
_______________________________________________________________

Bug 1 — AI Analyst shows a broken “Needs human / 0% confidence” state when backend LLM investigation is unavailable

Severity: High
Type: Functional Bug/AI Investigation Failure
Status: Confirmed

What happened:

The AI Analyst page is visible and loads, but the analyst investigation results are not being generated correctly when the backend LLM provider is unavailable.

Instead of displaying evidence-derived verdicts, confidence scores, investigation steps, and routing/status information, the page renders incidents as failed verdicts with “Needs human” disposition and 0% confidence.

The reported error state indicates that the backend AI provider is unavailable because LLM credits are exhausted. The error details also reference an OpenRouter circuit-open condition and insufficient credits.

As a result, the AI Analyst experience becomes effectively non-functional for incident triage.

What I tested:

1. Opened the 24observe AI Analyst page.
2. Reviewed the analyst verdicts displayed for the available incidents.
3. Verified that the incidents were being rendered with “Needs human” dispositions.
4. Verified that the displayed confidence values were 0%.
5. Verified that the investigation step count was 0.
6. Observed the reported AI Analyst availability error indicating that LLM credits were exhausted.
7. Observed the OpenRouter circuit-open / insufficient-credits condition.
8. Confirmed that usable model investigation results and evidence-derived verdicts were not available.

Expected Result: The AI Analyst should return populated investigation results including verdicts, confidence, evidence, investigation steps, and routing/status metadata. If the backend LLM provider is temporarily unavailable, the application should provide a meaningful fallback or partial-error state rather than converting every incident into a universal “Needs human / 0% confidence” result.

Actual Result: The AI Analyst page displays failed verdicts with “Needs human” disposition, 0% confidence, 0 investigation steps, and approximately 0.0s–0.3s latency. The page also reports that the AI Analyst is currently unavailable because LLM credits are exhausted, with an OpenRouter circuit-open / insufficient-credits condition.

Example:

Displayed Error: AI Analyst is currently unavailable — LLM credits exhausted.
Provider State: OpenRouter circuit open / insufficient credits
Failed Verdicts: 11
Confidence: 0%
Investigation Steps: 0
Latency: Approximately 0.0s–0.3s
Disposition: Needs human

Why this matters:

This issue directly affects the AI Analyst investigation and incident-triage workflow.

Possible consequences include:

1. Customers cannot receive automated incident investigations.
2. Evidence-cited verdicts are unavailable.
3. Confidence and investigation data are missing or zeroed out.
4. Security operations teams are forced to manually review incidents.
5. Incident triage can be delayed when the AI Analyst is expected to assist with investigation.
6. The analyst dashboard provides misleading failure-state results instead of clearly separating unavailable investigations from genuine “Needs human” verdicts.
7. The AI Analyst feature becomes effectively non-functional when the configured LLM provider cannot process requests.

What the fix should look like:

1. The application should clearly distinguish a provider/backend failure from a genuine “Needs human” analyst verdict.
2. Failed LLM investigations should not be represented as valid 0% confidence verdicts.
3. The AI Analyst should surface a clear provider-unavailable or investigation-failed state for affected incidents.
4. Previously available investigation results should remain visible where possible instead of being replaced with zeroed-out values.
5. The UI should provide meaningful status information when LLM credits are exhausted or the OpenRouter circuit is open.
6. New incidents should either be queued for later investigation or routed through a documented fallback path when the LLM provider is unavailable.
7. Confidence, investigation steps, latency, and verdict fields should only be populated as analyst results when an investigation actually occurred.
8. Add automated tests covering LLM credit exhaustion, provider failures, circuit-open conditions, and partial investigation failures.
9. Verify that the AI Analyst does not convert backend/provider failures into universal “Needs human” dispositions.
10. Attach and review browser console/network evidence to confirm the exact backend failure path.

_______________________________________________________________

Summary

Bugs found today:
1. AI Analyst shows a broken “Needs human / 0% confidence” failure state when backend LLM investigation is unavailable.

_______________________________________________________________

End of report.

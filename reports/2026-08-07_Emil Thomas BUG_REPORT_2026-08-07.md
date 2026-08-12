24observe Testing Report

Date: 07 August 2026
Tester: Emil Thomas (GUI + Copilot)
Environment: Hosted dashboard (login.24observe.com), API (api.24observe.com)
Account: Org 68
Method: Manual GUI testing and browser DevTools inspection. Reproduced UI behaviour, captured console and network evidence.

________________________________________________________________

Bug 1 — keyword check not working properly in monitor section

Severity: Medium
Type: UX bug / validation
Status: Confirmed

What happened:

The monitor keyword feature in the Monitors section fails to correctly validate or run keyword checks for public website pages. A keyword monitor created for a known string does not reliably detect the keyword even when the site contains the text, and the monitor often reports failure or misconfiguration.

What I tested / Steps to reproduce:
1. Open `/monitors/new` and select `Keyword on page` or the keyword template.
2. Enter a public website URL such as `https://www.wikipedia.org`.
3. Enter a known keyword such as `Wikipedia`.
4. Save the monitor and observe the check results.

What I observed:
1. The keyword monitor report shows failure or misconfiguration despite the page containing the keyword.
2. The monitor detail or logs do not clearly show whether the failure is due to page fetch, keyword parsing, or the template validation.
3. The UI lacks clear feedback for keyword presence checks in the monitor creation flow.

Why this matters:
1. Keyword monitors are intended to verify content availability; if they fail on valid pages, users cannot rely on them for content checks.
2. This decreases confidence in the monitor section and complicates validation of public website health.

Workarounds:
1. Use a generic `Public website` monitor and manually verify the page separately.
2. Use external synthetic monitoring tools for keyword presence until this bug is fixed.

What the fix should look like:
1. Ensure the keyword monitor correctly fetches the target page and searches the page contents for the configured string.
2. Improve UI messaging that distinguishes page fetch failures from keyword absence.
3. Add tests for keyword monitor creation and evaluation on known public pages.

Evidence (UI / manual):
- A keyword monitor for `https://www.wikipedia.org` with keyword `Wikipedia` reported failure.
- The monitor creation page and detail page did not show a clear keyword validation result.

________________________________________________________________

Combined notes & next steps

1. All issues are reproducible via browser DevTools and manual inspection; they are functional/UX regressions rather than immediate security exposures based on current evidence.
2. Triage recommendations: monitor keyword reliability as UX improvements.

End of report.

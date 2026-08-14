24observe Bug Verification Report

Date: 14 August 2026
Tester: Emil Thomas
Environment: Hosted dashboard (login.24observe.com) and API (api.24observe.com)
Account: Org 68, Free plan
Method: Manual testing of reported bugs on live production environment.

________________________________________________________________

Bugs Reverification

BUG-032 — Settings Pages Scaling Issues

Endpoint / area: Settings pages (/settings#account, /settings#security, /settings#api-tokens)
Category: Responsive UI
Severity: Medium
First Reported: 2026-07-13
Last Verified (prior): 2026-07-17
Status: Confirmed (re-verified on live site 2026-08-14)
Status history:
- 2026-07-13: Reported
- 2026-07-17: STILL PRESENT
- 2026-08-14: STILL PRESENT (Confirmed)

What happened:

The Settings section does not scale properly according to screen size. The scaling issue exists across all Settings sub-pages, with the API Tokens (PATs) section having the most severe scaling issue. UI elements become misaligned and improperly scaled, reducing usability on various screen sizes.

What I tested:

I accessed the Settings pages on different screen sizes and observed the following issues:

Settings pages tested: `/settings#account`, `/settings#security`, `/settings#api-tokens`

1. Account form — On mobile viewports (320-640px), the form uses a fixed grid layout with a 180px label column that squeezes the values off-screen.

2. API tokens table — The table has 4 columns (Name, Scopes, Created, Actions) that only horizontal-scroll on small screens. No stacked card or list view on mobile.

3. Security page — The 2FA setup form has non-wrapping flex rows that can overflow on narrow screens.

4. App sidebar — After auto-collapse at 1024px, the sidebar still consumes 64px at phone widths, making Settings content width even tighter (e.g., 208px at 320 viewport).

Viewport test results:

| Viewport | Content width | Account form usable? | Token table h-scroll? | Broken? |
|----------|---------------|---------------------|----------------------|---------|
| 320px    | 208px         | No                  | Yes                  | Yes     |
| 375px    | 263px         | No                  | Yes                  | Yes     |
| 414px    | 302px         | No                  | Yes                  | Yes     |
| 640px    | 528px         | Yes                 | No                   | No      |
| 768px    | 656px         | Yes                 | No                   | No      |

Why this matters:

1. Users on mobile devices cannot properly use the Settings pages to manage their account, security settings, or API tokens.

2. The account form labels and values get squeezed or clipped, making it impossible to read or edit settings.

3. The API tokens table requires horizontal scrolling on mobile, which is poor UX compared to a stacked card layout.

4. The sidebar still reserves 64px width even after auto-collapse, reducing available content space.

What the fix should look like:

1. Account form: Use stacked layout on small screens, switch to grid layout above 640px.

2. API tokens table: Show stacked cards or list view below tablet breakpoint (~768px), avoid horizontal scroll.

3. Security form: Allow wrapping of flex rows on narrow screens.

4. Settings header: Allow title/icon row to wrap on small screens.

5. Sidebar: Consider off-canvas overlay instead of permanent 64px rail on very small widths.

________________________________________________________________

BUG-033 — API Tokens (PATs) Copy Button No Feedback

Endpoint / area: API tokens page (/settings#api-tokens)
Category: UX
Severity: Low
First Reported: 2026-07-13
Last Verified (prior): 2026-07-22
Status: Confirmed (deep retest on live site 2026-08-14)
Status history:
- 2026-07-13: Reported
- 2026-07-22: STILL PRESENT
- 2026-08-14: STILL PRESENT (Confirmed)

What happened:

After creating a Personal Access Token (PAT), clicking the Copy button provides no visual confirmation. Users cannot determine whether the token has been copied successfully.

What I tested:

I created a new API token and clicked the Copy button. I observed:

1. The button label stays as "Copy" — does not change to "Copied" or show any indicator.

2. No toast notification or popup appears.

3. No checkmark icon or visual feedback of any kind.

4. After clicking Copy, there is no way to know if the action succeeded or failed.

Additional finding: This issue exists on 6 of 8 copy buttons throughout the application:
- PAT reveal Copy (this bug)
- Webhook signing secret Copy
- 2FA backup codes "Copy all"
- 2FA setup URI Copy
- Monitor badge URL Copy (2 instances)

Only 2 copy buttons in the app provide feedback ("Copied ✓"):
- AI Agents ingest token copy
- Linux Hosts install command copy

Why this matters:

1. Security risk — PATs and other secrets are shown only once with the message "copy it now, it won't be shown again." If the copy fails silently and the user clicks Done, they permanently lose access to the token.

2. User frustration — Users don't know if the copy worked and may retry multiple times unnecessarily.

3. Inconsistent UX — Some copy buttons have feedback while others don't, creating confusion.

What the fix should look like:

1. Add visual feedback to all copy buttons: change button text to "Copied ✓" for 2 seconds, then reset.

2. Add error handling: if clipboard write fails, show "Copy failed" message.

3. Use a shared CopyButton component across the app for consistency.

4. No backend changes needed — clipboard is 100% client-side.

________________________________________________________________

BUG-034 — Create API Token Button Hidden / Not Prominent

Endpoint / area: API tokens page (/settings#api-tokens)
Category: UX
Severity: Low
First Reported: 2026-07-13
Last Verified (prior): Open
Status: Confirmed (re-verified on live site 2026-08-14)
Status history:
- 2026-07-13: Reported (Open)
- 2026-08-14: STILL PRESENT (Confirmed)

What happened:

The Create API Token button is not visually prominent. The button blends into the interface and is easy to overlook.

What I tested:

I accessed the API tokens page at `/settings#api-tokens` and observed:

1. The main "Create token" action is labeled "+ New token" and uses ghost styling (low-contrast text-only button with no background color).

2. The button uses `btn-ghost text-xs` which makes it small and easy to miss.

3. The actual "Create token" button with primary styling only appears AFTER you click the ghost "+ New token" button to open the form.

4. When there are no tokens yet, the empty state shows only plain text "No tokens yet." with no prominent "Create your first token" button.

Peer comparison:

- "+ New metric" button uses `btn-primary` (filled background, not ghost)
- "Create your first monitor" uses `btn-primary mt-6`
- "+ New token" uses `btn-ghost text-xs` (weaker, inconsistent)

Why this matters:

1. Users cannot find how to create a token because the button blends into the Settings chrome.

2. Inconsistent with the app's design patterns — similar "create" actions use primary styling.

3. The primary styling exists only on the secondary step (form submit), which is hidden behind the hard-to-find entry button.

What the fix should look like:

1. Change the header "+ New token" button from `btn-ghost text-xs` to `btn-primary` (filled background).

2. Optionally add a prominent "Create your first token" button in the empty state when no tokens exist.

3. Keep the form submit button as primary and the Cancel button as ghost — that hierarchy is correct.

________________________________________________________________

Bugs Found Today(14-08-2026)

BUG-01 — Installer script prints invalid demo command

Endpoint / area: install.sh (CLI)
Category: UX / CLI
Severity: Low
First Reported: 2026-08-14
Last Verified (prior): N/A (New finding)
Status: Confirmed (found during live installation test 2026-08-14)
Status history:
- 2026-08-14: Reported (New finding)

What happened:

After a successful installation of the 24observe sensor with profiles enabled, the installer script prints the message: `[24observe] Try a guided first finding:  sudo bash bash --demo`. Running this literal command fails because standard Linux bash does not accept a `--demo` flag, and `bash bash` attempts to execute the bash binary as a script.

What I tested:

1. Executed the official install command with profiles: `curl -sSL https://api.24observe.com/install.sh | sudo bash -s -- --enroll-token=<TOKEN> --profile=auditd`
2. Observed the final success message instructing the user to run `sudo bash bash --demo`.
3. Ran the suggested command in the VM terminal.
4. Result: `/usr/bin/bash: /usr/bin/bash: cannot execute binary file`

Why this matters:

1. It creates immediate user confusion right after a successful onboarding step.
2. It breaks trust in the CLI tools provided by 24observe.

What the fix should look like:

1. Update the `install.sh` script to print the correct CLI command.
2. Ensure there are no duplicated `$SHELL` or `$COMMAND` variables in the echo statement (e.g., `bash bash`).

________________________________________________________________

BUG-02 — Audit logs lack key-value parsing in backend ingestion

Endpoint / area: Logs Ingestion / `POST /api/v1/logs/query`
Category: Data Ingestion / Search
Severity: Medium
First Reported: 2026-08-14
Last Verified (prior): N/A (New finding)
Status: Confirmed (verified via API query 2026-08-14)
Status history:
- 2026-08-14: Reported (New finding)

What happened:

When the 24observe `auditd` profile ships Linux audit logs to the backend, the backend successfully ingests them but fails to parse the `key=value` pairs into the structured `attrs` database column. The entire raw payload (like `exe="/usr/bin/cat"`) is left trapped inside a giant `message` string.

What I tested:

1. Generated local audit events on the test VM by running `sudo cat /etc/shadow` and other commands.
2. Queried the API directly to fetch the raw JSON representation of the logs (`curl -X POST https://api.24observe.com/api/v1/logs/query -d '{"query": "host=\"test-VMware-Virtual-Platform\""}'`).
3. Observed that critical fields like `exe` and `uid` were only present inside the unparsed `message` string. The `attrs` object only contained generic file metadata.
4. Attempted a structured KQL query: `attrs.exe="/usr/bin/cat"`. This returned an empty array `[]`.

Why this matters:

1. Users cannot perform structured, reliable searches (e.g., `attrs.exe:"/usr/bin/cat" AND attrs.uid:"root"`).
2. Users are forced to rely on inaccurate full-text substring searches across massive strings, which leads to false positives in a SIEM context.

What the fix should look like:

1. Update the backend ingestion pipeline to detect Linux audit log formats and automatically extract `key=value` pairs into the `attrs` JSON object.
2. Ensure fields like `exe`, `uid`, `auid`, and `syscall` are fully indexed and searchable via KQL.

________________________________________________________________

Summary

Bugs verified today:
1. BUG-032: Settings Pages Scaling Issues — Medium
2. BUG-033: API Tokens (PATs) Copy Button No Feedback — Low
3. BUG-034: Create API Token Button Hidden / Not Prominent — Low
Bugs found today
1. BUG-01: Installer script prints invalid demo command — Low (New finding)
2. BUG-02: Audit logs lack key-value parsing in backend ingestion — Medium (New finding)

All five bugs are currently present as of 2026-08-14.

________________________________________________________________

End of report.
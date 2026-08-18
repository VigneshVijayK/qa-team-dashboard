# 24observe Testing Report

**Date:** 17 August 2026  
**Tester:** Mubarak Mohammed (GUI)  
**Environment:** Hosted dashboard  
**Features:** Account, Integrations, AI Analyst, Linux Hosts, API Tokens, Security & Team

_______________________________________________________________

# Today's Testing Summary

Today, the Settings area and related functionality were tested. The tested features below passed their functional checks.

## Account — PASSED

### What I tested:

1. Opened **Settings → Account**.
2. Verified account information was displayed.
3. Verified the connected Google account was shown correctly.
4. Verified the account and organization information loaded correctly.

### Result:

Account information and connected-account details displayed correctly.

**No confirmed bug found.**

---

## Integrations — PASSED

### Event Webhooks

### What I tested:

1. Opened **Settings → Integrations**.
2. Opened **New subscription**.
3. Tested the URL field with an invalid/non-public address.
4. Confirmed the application rejected the non-public address.
5. Created a webhook using a valid public URL.
6. Confirmed the webhook appeared as **active**.
7. Confirmed the subscription remained available after returning to the page.

### Result:

Webhook validation and subscription creation worked correctly.

**No confirmed bug found.**

### Log Redaction

### What I tested:

1. Opened **Log redaction**.
2. Added a regex rule.
3. Tested the pattern and replacement fields.
4. Clicked **Save rules**.
5. Confirmed the rule remained available.

### Result:

The redaction rule could be created and saved successfully.

**No confirmed bug found.**

### Enterprise SSO (OIDC)

### What I tested:

1. Tested the required SSO fields.
2. Tested an invalid issuer value.
3. Entered test issuer, client ID, client secret, and email-domain values.
4. Enabled the SSO configuration.
5. Confirmed the configuration was created.
6. Confirmed **Update SSO** and **Delete** actions appeared.
7. Confirmed the configuration remained after refresh.

### Result:

SSO configuration, validation, update state, and persistence worked correctly.

**No confirmed bug found.**

---

## AI Analyst — PASSED

### What I tested:

1. Opened **Settings → AI Analyst**.
2. Tested the **Platform key** and **Bring your own key** options.
3. Tested the Provider API key field.
4. Tested the Model field.
5. Tested the optional Base URL field.
6. Tested Daily and Monthly token budget fields.
7. Saved the analyst settings.
8. Confirmed the settings were accepted.

### Result:

AI Analyst settings worked correctly and the configuration could be saved.

**No confirmed bug found.**

---

## Linux Hosts — PASSED

### What I tested:

1. Opened **Settings → Linux Hosts**.
2. Generated a host enrollment command.
3. Ran the generated command on Kali Linux.
4. Confirmed the sensor installed and started successfully.
5. Refreshed the Linux Hosts page.
6. Confirmed the newly enrolled `kali` host appeared as **active**.
7. Tested the **auditd** profile.
8. Confirmed the auditd profile installed and the sensor started.
9. Tested the **syslog receiver (:514)** profile.
10. Confirmed the generated installation worked and the host became active.

### Result:

Host enrollment, auditd profile, and syslog receiver profile worked correctly.

**No confirmed bug found.**

---

## API Tokens (PAT) — PASSED

### What I tested:

1. Opened **Settings → API tokens**.
2. Created a new API token.
3. Copied the token for testing.
4. Sent a log through the `/api/v1/logs/ingest` endpoint using the PAT.
5. Confirmed the valid token returned **HTTP 202**.
6. Confirmed the response contained:
   `{"accepted":1,"rejected":[]}`
7. Tested an invalid token.
8. Confirmed the invalid token was rejected with **401 Unauthorized** and `Invalid token`.

### Result:

PAT creation, authentication, valid log ingestion, and invalid-token rejection worked correctly.

**No confirmed bug found.**

---

## Security & Team — PASSED

### Password

### What I tested:

1. Opened **Settings → Security & team**.
2. Tested the password form with empty fields.
3. Confirmed browser validation displayed **Please fill out this field.**
4. Tested the account state where no password was configured.
5. Confirmed the page correctly instructed the user to use the password-reset flow.

### Two-factor Authentication

### What I tested:

1. Opened **Two-factor authentication**.
2. Started the 2FA setup flow.
3. Confirmed a setup URI and secret were generated.
4. Confirmed a 6-digit TOTP field was available.
5. Completed the verification/setup flow successfully.

### Result:

Password validation, no-password handling, and 2FA setup worked correctly.

**No confirmed bug found.**

_______________________________________________________________

# Confirmed Bug

## Bug 1 — Saved Search Cannot Be Opened or Reused

**Severity:** High  
**Type:** Functional Bug / Saved Search Navigation & Reuse  
**Status:** Confirmed

### Note:

This is the previously confirmed bug from the Logs testing session. It is included in this report for continuity, but it was **not a new bug discovered during today's Settings testing**.

### What happened:

The Saved Searches feature allows a search to be created successfully and remain available after refresh. However, the saved-search entry only provides **Edit** and **Delete** actions. There is no **Open**, **Run**, or equivalent action to directly reuse the saved search.

### Expected Result:

A saved search should provide a clear way to open or run the saved query. Selecting it should open Logs, load the saved query and filters, and execute/display the results.

### Actual Result:

The saved search is successfully created and persists after refresh, but only **Edit** and **Delete** are available. There is no direct **Open / Run** action.

### Impact:

Users can save searches but cannot conveniently reuse them from the Saved Searches page, making the saved-search workflow incomplete.

_______________________________________________________________

# Summary

**Today's new bugs found:**

0

**Today's sections passed:** 8  
**Today's confirmed bugs:** 0

**Previously confirmed bug carried forward:**

1. **Saved Search cannot be opened or reused after creation.**

**Overall result:** Today's Settings testing completed successfully with no new confirmed bugs.

_______________________________________________________________

**End of report — Mubarak Mohammed, 2026-08-17.**

# 24observe Testing Report — Log Alerts & ATT&CK Coverage

**Date:** 2026-08-17  
**Tester:** Angel Thomas (GUI + Copilot)  
**Environment:** Hosted dashboard (`login.24observe.com`), API (`api.24observe.com`)  
**Account:** Free plan  
**Area under test:** Logs → **Log alerts**; Security → **ATT&CK coverage**

_______________________________________________________________________________________

## Context — Why lifecycle was exercised

Tester was asked to check the **ATT&CK coverage** page. To validate that page, log alerts had to be **created**, **enabled**, **disabled**, and **deleted** so that correct technique mappings could be confirmed end-to-end (rule on Log alerts ↔ technique on ATT&CK coverage).

Observations below come from that pass on the **Log alerts** page and the linked **ATT&CK coverage** page.

_______________________________________________________________________________________

## LA-001 — ATT&CK Coverage Mappings Verified via Log-Alert Lifecycle

**Area:** GUI / Security / ATT&CK coverage / Log alerts  
**Severity:** N/A (feature verification)  
**First Reported:** 2026-08-15 *(feature check)*  
**Last Verified:** 2026-08-15 *(By Angel Thomas)*  
**Status:** ✅ VERIFIED

**Description**

To check the ATT&CK coverage page, log alerts were created, enabled, disabled, and deleted. This lifecycle exercise was used to confirm that **correct mappings** take place between log-alert rules (with MITRE technique) and the ATT&CK coverage view.

**Verification Performed:** 2026-08-15 — Tester: Angel Thomas

**Steps executed (GUI)**

1. Logged in to `https://login.24observe.com`
2. Navigated to **Logs → Log alerts**
3. **Created** log alert(s) with a valid MITRE ATT&CK technique and match conditions
4. Opened **Security → ATT&CK coverage** and checked technique / rule mapping
5. **Disabled** the log alert → re-checked ATT&CK coverage for mapping behaviour
6. **Enabled** the log alert again → re-checked ATT&CK coverage
7. **Deleted** the log alert → re-checked ATT&CK coverage
8. Confirmed mappings behaved correctly across create / enable / disable / delete

**Observed Result**

| Action | Purpose | Result |
|--------|---------|--------|
| **Create** log alert (with MITRE) | Establish mapping | Mapping can be assessed on ATT&CK coverage |
| **Enable** log alert | Confirm active-rule mapping | Lifecycle supported; used for coverage check |
| **Disable** log alert | Confirm inactive-rule mapping behaviour | Lifecycle supported; used for coverage check |
| **Delete** log alert | Confirm removal of mapping | Lifecycle supported; used for coverage check |
| Correct mappings | Product expectation | **Correct mappings take place** as verified via the above lifecycle on ATT&CK coverage |

**Expected Result**

- Creating a log alert with a valid MITRE technique contributes a correct mapping on ATT&CK coverage.
- Enable / disable / delete update coverage consistently with rule state (or documented product rules for disabled rules).
- No orphaned or incorrect technique mappings after lifecycle changes.

**Evidence**

- ATT&CK coverage page was checked by creating, enabling, disabling, and deleting log alerts
- Lifecycle operations were necessary and sufficient to validate mapping behaviour
- Observations recorded from Log alerts + ATT&CK coverage GUI

**Verdict:** ✅ **VERIFIED** — ATT&CK coverage was checked by exercising create / enable / disable / delete on log alerts; correct mappings take place.

**Status History**

- 2026-08-15: ✅ **VERIFIED** — coverage checked via log-alert lifecycle; correct mappings confirmed *(by Angel Thomas)*

_______________________________________________________________________________________

## LA-002 — Enabling, Disabling, and Deletion of Log Alerts Are Supported

**Area:** GUI / Log alerts  
**Severity:** N/A (feature verification)  
**First Reported:** 2026-08-15 *(feature check)*  
**Last Verified:** 2026-08-15 *(By Angel Thomas)*  
**Status:** ✅ VERIFIED (SUPPORTED)

**Description**

In the course of checking ATT&CK coverage (and independently as a lifecycle check), **enabling**, **disabling**, and **deletion** of log alerts were confirmed as supported operations on the Log alerts page. Dashboard state reflects each action.

**Verification Performed:** 2026-08-15 — Tester: Angel Thomas

**Steps executed (GUI)**

1. Logged in to `https://login.24observe.com`
2. Navigated to **Logs → Log alerts**
3. **Disable** a log alert → observed list/detail
4. **Enable** the same (or another) log alert → observed list/detail
5. **Delete** a log alert → observed list after delete
6. Confirmed dashboard reflected each change

**Observed Result**

| Action | Result |
|--------|--------|
| **Disable** log alert | **Supported**; UI reflects disabled state |
| **Enable** log alert | **Supported**; UI reflects enabled / active state |
| **Delete** log alert | **Supported**; rule removed from Log alerts dashboard |
| Dashboard reflection | Enable / disable / delete are **reflected on the dashboard** |

**Expected Result**

- Disable / enable / delete succeed without error
- UI list matches post-action state after refresh/navigation

**Evidence**

- Enable, disable, and delete work on the Log alerts page
- Changes appear correctly on the dashboard
- Same operations were used while validating ATT&CK coverage mappings (LA-001 / LA-003)

**Verdict:** ✅ **VERIFIED (SUPPORTED)** — Enabling, disabling, and deletion of log alerts are supported and reflected on the dashboard.

**Status History**

- 2026-08-15: ✅ **VERIFIED (SUPPORTED)** — enable / disable / delete supported; dashboard reflects state *(by Angel Thomas)*

_______________________________________________________________________________________

## LA-003 — Rule Match Shows Up on the ATT&CK Coverage Page

**Area:** GUI / Security / ATT&CK coverage / Log alerts  
**Severity:** N/A (feature verification)  
**First Reported:** 2026-08-15 *(feature check)*  
**Last Verified:** 2026-08-15 *(By Angel Thomas)*  
**Status:** ✅ VERIFIED

**Description**

Log alert rules with a MITRE technique (rule match / technique assignment) were checked against **Security → ATT&CK coverage** to confirm the rule match **shows up** on the ATT&CK coverage page. Create / enable / disable / delete were used as part of this check so mappings could be confirmed under changing rule state.

**Verification Performed:** 2026-08-15 — Tester: Angel Thomas

**Steps executed (GUI)**

1. Logged in to `https://login.24observe.com`
2. On **Logs → Log alerts**, created or updated a rule with:
   - Match conditions (query and/or KQL / service / level as needed)
   - Valid **MITRE ATT&CK** technique
   - Rule **enabled** as appropriate for the check
3. Navigated to **Security → ATT&CK coverage**
4. Located the technique associated with the log alert
5. Confirmed the **rule match** / log-alert contribution **shows up** on the ATT&CK coverage page
6. Repeated checks after disable / enable / delete as needed to ensure mapping behaviour stayed correct

**Observed Result**

| Check | Result |
|-------|--------|
| Log alert with MITRE technique created / configured | Done as part of coverage check |
| Rule match / technique visible on **ATT&CK coverage** | **Shows up** on the ATT&CK coverage page |
| Lifecycle (enable / disable / delete) while checking coverage | Used to confirm correct mappings (see LA-001, LA-002) |

**Expected Result**

- A log alert with a valid MITRE technique appears as coverage / detection for that technique on ATT&CK coverage
- Coverage stays consistent when rules are enabled, disabled, or deleted

**Evidence**

- ATT&CK coverage page reviewed after configuring log alerts with MITRE
- Rule match shows up on ATT&CK coverage
- Create / enable / disable / delete used in the same pass to validate mappings

**Verdict:** ✅ **VERIFIED** — Rule match shows up on the ATT&CK coverage page; mappings checked using log-alert lifecycle operations.

**Status History**

- 2026-08-15: ✅ **VERIFIED** — rule match shows on ATT&CK coverage; mappings confirmed with create / enable / disable / delete *(by Angel Thomas)*

_______________________________________________________________________________________

## LA-004 — MITRE ATT&CK Field Accepts Only the Valid Pattern

**Area:** GUI / Log alerts / Validation  
**Severity:** LOW (if invalid values were accepted)  
**First Reported:** 2026-08-15 *(feature / validation check)*  
**Last Verified:** 2026-08-15 *(By Angel Thomas)*  
**Status:** ✅ VERIFIED (VALID PATTERN ONLY)

**Description**

On the Log alerts page (create / edit), the **MITRE ATT&CK** field accepts **only** values that match the valid technique pattern. This was observed while configuring rules for the ATT&CK coverage check.

**API contract (OpenAPI)**

`mitreTechnique` pattern:

```text
^T\d{4}(\.\d{3})?$
```

| Valid examples | Invalid examples |
|----------------|------------------|
| `T1059` | `1059` (missing `T`) |
| `T1552` | `t1059` (wrong case, if pattern-enforced) |
| `T1499` | `T105` (too short) |
| `T1059.001` (sub-technique) | `T1059.01` / `T1059-001` / free text |

**Verification Performed:** 2026-08-15 — Tester: Angel Thomas

**Steps executed (GUI)**

1. Logged in to `https://login.24observe.com`
2. Opened **Logs → Log alerts → New log alert** (or Edit)
3. Entered invalid MITRE values and attempted save
4. Entered valid MITRE values and saved (as needed for coverage mapping checks)
5. Confirmed only the valid pattern is accepted

**Observed Result**

| Input | Accepted? |
|-------|-----------|
| Valid pattern (`T####` / `T####.###` as supported) | **Yes** |
| Invalid / free-text / wrong shape | **No** — field accepts **only** the valid pattern |

**Expected Result**

- Valid technique IDs save on the log alert
- Invalid values are rejected

**Evidence**

- Observation on Log alerts page: MITRE ATT&CK field accepts only the valid pattern
- Aligns with OpenAPI: `^T\d{4}(\.\d{3})?$`

**Verdict:** ✅ **VERIFIED (VALID PATTERN ONLY)** — MITRE ATT&CK field accepts only the valid technique pattern.

**Status History**

- 2026-08-15: ✅ **VERIFIED (VALID PATTERN ONLY)** — only valid MITRE pattern accepted on log alerts *(by Angel Thomas)*

_______________________________________________________________________________________

## Summary

Tester was asked to check the **ATT&CK coverage** page. Checking that page required **creating**, **enabling**, **disabling**, and **deleting** log alerts so that **correct mappings** could be confirmed. Observations on the Log alerts side of that work:

| Finding ID | Observation | Verdict |
|------------|-------------|---------|
| LA-001 | Correct mappings on ATT&CK coverage verified via create / enable / disable / delete | ✅ **VERIFIED** |
| LA-002 | Enabling, disabling, and deletion of log alerts are supported (dashboard reflects state) | ✅ **VERIFIED (SUPPORTED)** |
| LA-003 | Rule match shows up on the ATT&CK coverage page | ✅ **VERIFIED** |
| LA-004 | MITRE ATT&CK field accepts only the valid pattern | ✅ **VERIFIED (VALID PATTERN ONLY)** |

_________________________________________________________________________________

*End of report — Log alerts lifecycle, ATT&CK coverage mappings, and MITRE validation. Verified 2026-08-17 by Angel Thomas.*

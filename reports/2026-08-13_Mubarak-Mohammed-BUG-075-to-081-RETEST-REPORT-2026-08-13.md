# Intern — Bug Re-Verification Report (BUG-075 → BUG-081)

**Tester:** Mubarak Mohammed  
**Report date:** 2026-08-13  
**Scope:** Re-test of previously reported bugs BUG-075 through BUG-081 to confirm whether the reported issues have been fixed.  
**Platform:** 24Observe — dashboard `https://login.24observe.com`  
**Method:** Live GUI and API testing through the 24Observe dashboard using the current application environment.

---

## Summary table

| Bug ID | Bug Name | Severity | Previous Status | Today's Verdict | Evidence |
|---|---|---|---|---|---|
| BUG-075 | Cases: Alert Storm Title Shows Incorrect Related Incident Count | LOW | CONFIRMED | ✅ **FIXED** | Automatically generated Case #136 shows “3 related incidents” and contains exactly 3 linked incidents |
| BUG-076 | Threat Intel: IP Indicator Field Accepts Invalid Values | MEDIUM | CONFIRMED | ❌ **STILL PRESENT** | `999.999.999.999` and arbitrary text were accepted and saved as IP indicators |
| BUG-077 | Threat Intel: Duplicate IOC Submission Gives Incorrect Success Feedback | LOW | CONFIRMED | ❌ **STILL PRESENT** | Duplicate `1.1.1.1` was not added, but the UI incorrectly displayed “Indicator added” |
| BUG-078 | SIEM Context: Asset IP Field Accepts Invalid Values | MEDIUM | CONFIRMED | ❌ **STILL PRESENT** | `999.999.999.999` and `test 123` were saved as assets without validation |
| BUG-079 | Logs: Facets Generate Invalid KQL for `attrs` Fields | MEDIUM | CONFIRMED | ❌ **STILL PRESENT** | `identity_risk:high` was generated and caused a KQL parse error; expected `attrs.identity_risk:high` |
| BUG-080 | Keyword Monitor Incorrectly Reports Keyword Not Detected | MEDIUM | CONFIRMED | ❌ **STILL PRESENT** | Keyword Monitor functionality could not be successfully verified/fixed in the current UI |
| BUG-081 | API Returns 500 for Non-Numeric Entity ID | CRITICAL | CONFIRMED | ✅ **FIXED** | `/api/v1/incidents/abc` returned a validation error instead of HTTP 500 |

**Scorecard (7 bugs in scope, BUG-075→BUG-081):**
- ❌ Still present: 5 (BUG-076, BUG-077, BUG-078, BUG-079, BUG-080)
- 🟡 Partially fixed: 0
- ✅ Fixed: 2 (BUG-075, BUG-081)
- ⚠️ Cannot verify: 0

---

## BUG-075 — Cases: Alert Storm Title Shows Incorrect Related Incident Count

**Severity:** LOW · **Previous:** CONFIRMED · **Today:** ✅ FIXED

### What was tested

1. Created multiple related test incidents using monitors configured against the same failing public endpoint.
2. Allowed the platform to generate the related incidents.
3. Opened **Security → Cases**.
4. Located the automatically generated Alert Storm case.
5. Compared the number of related incidents stated in the title with the actual linked incident count.

### Retest evidence

The platform automatically generated:

```text
Case #136
Alert storm: Alert-Storm-Test-1 — 3 related incidents
```

The case displayed:

```text
Incidents · 3
```

and showed three actual linked incidents for the HTTP 500 test endpoint.

The title therefore stated **3 related incidents**, and the case actually contained **3 linked incidents**.

### Verdict

**✅ FIXED — the Alert Storm title and actual linked incident count are now consistent.**

---

## BUG-076 — Threat Intel: IP Indicator Field Accepts Invalid Values

**Severity:** MEDIUM · **Previous:** CONFIRMED · **Today:** ❌ STILL PRESENT

### What was tested

1. Opened **Security → Threat Intel**.
2. Used **Add custom indicator**.
3. Selected **Type = IP**.
4. Tested `8.8.8.8`.
5. Tested `999.999.999.999`.
6. Tested `uyfweuihfiuwhfiuwehfiuwe`.
7. Checked the custom indicator list.

### Retest evidence

The valid IP was accepted as expected. However, both invalid values were also accepted and persisted as **IP** indicators. No validation error prevented them from being saved.

### Verdict

**❌ STILL PRESENT — the IP indicator field still accepts invalid IP addresses and arbitrary text without validation.**

---

## BUG-077 — Threat Intel: Duplicate IOC Submission Gives Incorrect Success Feedback

**Severity:** LOW · **Previous:** CONFIRMED · **Today:** ❌ STILL PRESENT

### What was tested

1. Opened **Security → Threat Intel**.
2. Added `1.1.1.1`.
3. Submitted the exact same indicator a second time.
4. Checked the notification and custom indicator list.

### Retest evidence

The second submission did **not** create a duplicate; only one `1.1.1.1` remained. However, the UI displayed:

```text
Indicator added
```

even though the duplicate was not added.

### Verdict

**❌ STILL PRESENT — duplicate submission is prevented, but the UI incorrectly reports “Indicator added” instead of clearly informing the user that the IOC already exists.**

---

## BUG-078 — SIEM Context: Asset IP Field Accepts Invalid Values

**Severity:** MEDIUM · **Previous:** CONFIRMED · **Today:** ❌ STILL PRESENT

### What was tested

1. Opened **Security → Context / SIEM Context**.
2. Used the **Assets** form.
3. Added `8.8.8.8`.
4. Added `999.999.999.999`.
5. Added `test 123`.
6. Checked the Assets list.

### Retest evidence

The valid IP was accepted. The invalid IP and arbitrary text were also successfully saved and appeared in the Assets list. No validation message prevented invalid values from being stored.

### Verdict

**❌ STILL PRESENT — the Asset IP field continues to accept and save invalid IP addresses and arbitrary text without validation.**

---

## BUG-079 — Logs: Facets Generate Invalid KQL for `attrs` Fields

**Severity:** MEDIUM · **Previous:** CONFIRMED · **Today:** ❌ STILL PRESENT

### What was tested

1. Opened **Logs → Logs**.
2. Ingested test log events containing `attrs` fields.
3. Confirmed the events appeared and the Facets sidebar populated.
4. Selected `high` under the **identity_risk** facet.
5. Checked the generated query and response.

### Retest evidence

The Facets action generated:

```text
identity_risk:high
```

instead of:

```text
attrs.identity_risk:high
```

The generated query produced:

```text
KQL parse error: unknown field 'identity_risk'
```

### Verdict

**❌ STILL PRESENT — the Facets sidebar continues to generate invalid KQL for `attrs` fields.**

---

## BUG-080 — Keyword Monitor Incorrectly Reports Keyword Not Detected

**Severity:** MEDIUM · **Previous:** CONFIRMED · **Today:** ❌ STILL PRESENT

### What was tested

1. Opened **Monitoring → Monitors**.
2. Reviewed the available monitor types and existing monitors.
3. Checked the **New monitor** form and available templates/options.
4. Looked for the Keyword Monitor functionality required by the original report.

### Retest evidence

The current Monitors UI exposed standard HTTPS/URL monitor configuration, but the Keyword Monitor functionality described in the original bug could not be successfully accessed through the current UI.

The reported Keyword Monitor behavior therefore could not be verified as fixed in the current environment.

### Verdict

**❌ STILL PRESENT / NOT FIXED — the required Keyword Monitor functionality and validation behavior from the original report could not be verified as resolved in the current UI.**

---

## BUG-081 — API Returns 500 for Non-Numeric Entity ID

**Severity:** CRITICAL · **Previous:** CONFIRMED · **Today:** ✅ FIXED

### What was tested

1. Located the incident API request through the browser Network tab.
2. Confirmed the valid endpoint:
   `GET https://api.24observe.com/api/v1/incidents/1408`
3. Tested the same endpoint using:
   `GET https://api.24observe.com/api/v1/incidents/abc`
4. Checked the API response.

### Retest evidence

The non-numeric ID did **not** produce a 500 Internal Server Error.

The API returned:

```text
Validation failed
code: VALIDATION_FAILED
id: invalid_string
message: Invalid
```

The invalid ID was therefore rejected through validation instead of causing an unhandled server error.

### Verdict

**✅ FIXED — non-numeric entity IDs are now handled by validation instead of causing a 500 Internal Server Error.**

---

## Final assessment

Seven bugs were re-tested in the current 24Observe environment:

- **BUG-075:** ✅ FIXED
- **BUG-076:** ❌ STILL PRESENT
- **BUG-077:** ❌ STILL PRESENT
- **BUG-078:** ❌ STILL PRESENT
- **BUG-079:** ❌ STILL PRESENT
- **BUG-080:** ❌ STILL PRESENT / NOT FIXED
- **BUG-081:** ✅ FIXED

### Final scorecard

**5 bugs remain not fixed:**
- BUG-076
- BUG-077
- BUG-078
- BUG-079
- BUG-080

**2 bugs are fixed:**
- BUG-075
- BUG-081

No bugs were classified as partially fixed.

---

*End of re-verification report — Mubarak Mohammed, 2026-08-13.*

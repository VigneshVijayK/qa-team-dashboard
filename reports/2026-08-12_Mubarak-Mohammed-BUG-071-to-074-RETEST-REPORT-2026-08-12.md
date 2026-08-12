# Intern — Bug Re-Verification Report (BUG-071 → BUG-073)

**Tester:** Mubarak Mohammed  
**Report date:** 2026-08-12  
**Scope:** Re-test of previously reported bugs BUG-071 through BUG-074 to confirm whether the reported issues have been fixed.  
**Platform:** 24Observe — dashboard `https://login.24observe.com`  
**Method:** Live GUI testing through the 24Observe dashboard using the current application environment.

---

## Summary table

| Bug ID | Bug Name | Severity | Previous Status | Today's Verdict | Evidence |
|--------|----------|----------|-----------------|-----------------|----------|
| BUG-071 | Error Verdicts Show Accept and Override Buttons Incorrectly | LOW | CONFIRMED | ❌ **STILL PRESENT** | Error/Needs-human verdict cards still show Accept and Override buttons |
| BUG-072 | Cases: Attach Incident Button Does Not Work and Accepts Invalid Input | MEDIUM | CONFIRMED | ❌ **STILL PRESENT** | Valid incident `inc-1352` entered, but incident count remains 0 and no incident is linked |
| BUG-073 | Cases: "Unassign me" Button Throws an Error | LOW | CONFIRMED | ❌ **STILL PRESENT** | Clicking Unassign me produces repeated "Assignee 0 is not a member of this organization" errors |
| BUG-074 | Cases: No Save Button for Status, Severity, and Disposition Changes | MEDIUM | CONFIRMED | ❌ **STILL PRESENT** | Status, Severity, and Disposition can be changed but no Save button is provided |

**Scorecard (4 bugs in scope, BUG-071→BUG-074):**
- ❌ Still present: 4 (BUG-071, BUG-072, BUG-073, BUG-074)
- 🟡 Partially fixed: 0
- ✅ Fixed: 0
- ⚠️ Cannot verify: 0

---

## BUG-071 — Error Verdicts Show Accept and Override Buttons Incorrectly

**Severity:** LOW · **Previous:** CONFIRMED · **Today:** ❌ STILL PRESENT

### What was tested

1. Opened the **AI Analyst** page in the dashboard.
2. Reviewed the available verdict cards under the **All** tab.
3. Checked the verdict cards showing **Needs human** status.
4. Verified whether the **Accept** and **Override** actions were still displayed.

### Retest evidence

The current AI Analyst page still displays verdicts marked **Needs human**, including:

```text
Needs human · 40%    inc-1352
Needs human · 45%    inc-1346
```

The verdict cards still show both:

```text
Accept
Override
```

The original issue is that failed/error investigations should not expose Accept/Override actions because there is no completed investigation result to accept or override. The current UI still presents these actions on the Needs-human verdict cards.

The current confidence values are not identical to the original reported 0% state, but the reported UX issue remains because the action buttons are still available on the affected Needs-human/error-style verdict state.

### Verdict

**❌ STILL PRESENT — the Accept and Override buttons are still displayed on Needs-human verdict cards.**

---

## BUG-072 — Cases: Attach Incident Button Does Not Work and Accepts Invalid Input

**Severity:** MEDIUM · **Previous:** CONFIRMED · **Today:** ❌ STILL PRESENT

### Test environment

The original report referenced Case #109. Case #109 was not available in the current Cases list, so the available case was used for the re-test:

- **Case:** #130
- **Case name:** `[EMAIL REDACTED]`
- **Initial incident count:** 0

A currently existing incident ID was obtained from the AI Analyst page:

```text
inc-1352
```

### What was tested

1. Opened **Security → Cases**.
2. Opened **Case #130 (`[EMAIL REDACTED]`)**.
3. Located the **Attach incident by id...** input.
4. Entered the valid existing incident ID:

```text
inc-1352
```

5. Clicked **Attach**.
6. Checked the incident count and linked-incidents section.

### Retest evidence

After entering `inc-1352`, the case still showed:

```text
Incidents · 0
No incidents linked.
```

The incident ID was present in the input, but the incident was **not attached** to the case.

The original bug described the same failure: a valid incident ID could be entered, but clicking Attach did not result in the incident being linked.

The original report also states that invalid/random input produced no validation feedback. The current valid-ID test already reproduces the primary failure, so the bug remains open.

### Verdict

**❌ STILL PRESENT — valid incident `inc-1352` is not attached and the case remains at 0 linked incidents.**

---

## BUG-073 — Cases: "Unassign me" Button Throws an Error

**Severity:** LOW · **Previous:** CONFIRMED · **Today:** ❌ STILL PRESENT

### What was tested

1. Opened **Case #130 (`[EMAIL REDACTED]`)**.
2. Located the **Assignee** section.
3. Used the **Unassign me** action.
4. Observed the response from the application.

### Retest evidence

The application displayed repeated error notifications:

```text
Update failed: Assignee 0 is not a member of this organization
```

The error appeared multiple times while attempting to use the unassignment functionality.

Instead of successfully removing the current assignment, the application attempts an invalid assignee update and returns an organization-membership error.

### Verdict

**❌ STILL PRESENT — clicking Unassign me continues to produce an error instead of successfully unassigning the user.**

---

## BUG-074 — Cases: No Save Button for Status, Severity, and Disposition Changes

**Severity:** MEDIUM · **Previous:** CONFIRMED · **Today:** ❌ STILL PRESENT

### What was tested

1. Opened the case detail page.
2. Changed the **Status** dropdown from `open` to `investigating`.
3. Looked for a **Save** button — none was found.
4. Changed the **Severity** dropdown from `high` to `medium`.
5. Looked for a **Save** button — none was found.
6. Changed the **Disposition** from `—` to `true positive`.
7. Looked for a **Save** button — none was found.
8. It remained unclear whether these changes were being saved or lost.

### Retest evidence

The case detail page contains dropdowns for **Status**, **Severity**, **Disposition**, and **Assignee**, but there is no visible Save button for committing changes to Status, Severity, or Disposition.

The absence of a Save control makes it unclear to the user whether changes are automatically persisted or whether an explicit action is required to save them.

### Verdict

**❌ STILL PRESENT — there is still no Save button for Status, Severity, and Disposition changes, leaving the persistence behavior unclear.**

---

## Final assessment

All four bugs tested in this re-verification remain reproducible in the current 24Observe environment:

- **BUG-071:** ❌ STILL PRESENT
- **BUG-072:** ❌ STILL PRESENT
- **BUG-073:** ❌ STILL PRESENT
- **BUG-074:** ❌ STILL PRESENT

No fix could be confirmed for any of the four reported issues during this re-test.

---

*End of re-verification report — Mubarak Mohammed, 2026-08-12.*

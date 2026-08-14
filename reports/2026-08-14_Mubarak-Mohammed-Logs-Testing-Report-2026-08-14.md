# 24observe Testing Report

**Date:** 14 August 2026  
**Tester:** Mubarak Mohammed (GUI)  
**Environment:** Hosted dashboard  
**Features:** Explore, Saved Searches, Log Metrics, Metric Alerts

_______________________________________________________________

## Bug 1 — Saved Search Cannot Be Opened or Reused

**Severity:** High  
**Type:** Functional Bug / Saved Search Navigation & Reuse  
**Status:** Confirmed

### What happened:

The Saved Searches feature allows a search to be created successfully and remain available after refresh. However, the saved-search entry only provides **Edit** and **Delete** actions. There is no **Open**, **Run**, or equivalent action to directly reuse the saved search.

The page states that saved queries can be opened later from Logs, but no clear action is available from the saved-search entry to perform this workflow.

### What I tested:

1. Opened **Logs → Saved Searches**.
2. Selected **New search**.
3. Created a saved search named `Test Error Search`.
4. Used the KQL query `level:error`.
5. Set the search range to `60m`.
6. Clicked **Create**.
7. Confirmed the saved search appeared in the list.
8. Refreshed the page and confirmed it remained available.
9. Checked the available actions.
10. Confirmed only **Edit** and **Delete** were available.
11. Confirmed there was no **Open / Run** action.

### Expected Result:

A saved search should provide a clear way to open or run the saved query. Selecting it should open Logs, load the saved query and filters, and execute/display the results.

### Actual Result:

The saved search is successfully created and persists after refresh, but only **Edit** and **Delete** are available. There is no direct **Open / Run** action.

### Why this matters:

Saved Searches are intended to let users reuse previously created queries during investigations. Without a way to open or run the saved search, users may have to manually recreate the query.

### What the fix should look like:

1. Add an **Open / Run** action to each saved search.
2. Navigate to Logs when selected.
3. Load the saved KQL query.
4. Restore associated filters/range.
5. Execute the query and display the results.

_______________________________________________________________

# Other Tested Features

## Explore — PASSED

### What I tested:

1. Ran the basic `*` query.
2. Tested `level:error`.
3. Tested `* | stats count() by service`.
4. Tested `* | timechart span=5m count() by service`.
5. Tested `* | top 10 service`.

### Result:

Queries executed successfully and returned results when matching data was available.

**No confirmed bug found.**

---

## Log Metrics — PASSED

### What I tested:

1. Created `Test 5xx Errors`.
2. Configured a `5 min` bucket and `5xx` match.
3. Confirmed creation.
4. Refreshed and confirmed persistence.
5. Deleted the metric.
6. Refreshed and confirmed it remained deleted.

### Result:

Creation, persistence, and deletion worked correctly.

**No confirmed bug found.**

---

## Metric Alerts — PASSED

### What I tested:

1. Created `Test CPU Alert`.
2. Used `node_load1`, `avg > 0`, and a `300` second window.
3. Confirmed the rule appeared.
4. Refreshed and confirmed persistence.
5. Deleted the rule.
6. Refreshed and confirmed deletion.
7. Tested the Threshold field by changing it to `100`.

### Result:

Creation, persistence, deletion, and threshold input worked correctly.

**No confirmed bug found.**

_______________________________________________________________

# Summary

**Bugs found today:**

1. **Saved Search cannot be opened or reused after creation.**

**Total sections tested:** 4  
**Sections passed:** 3  
**Confirmed bugs:** 1

_______________________________________________________________

**End of report — Mubarak Mohammed, 2026-08-14.**

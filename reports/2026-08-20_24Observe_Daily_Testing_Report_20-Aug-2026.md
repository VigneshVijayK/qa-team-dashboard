# 24Observe — Daily Testing Report

**Tester:** Khaja Bandenawaz  
**Website:** 24Observe  
**Date:** 20-August-2026  
**Sections Tested:** Saved Searches, Log Alerts, Log Metrics

---

## 1. Saved Searches

### Purpose Tested

The Saved Searches section is used to save/reuse KQL-lite log queries with associated filters.

### Tests Performed

#### Test 1 — Create a saved search

Created a saved search with:

```text
Name: High Priority Errors
Description: Test search for service errors
KQL Query: service:api AND level:error
Service Filter: api
Level Filter: error
```

**Result:** PASS

The saved search was successfully created and appeared in the Saved Searches list.

#### Test 2 — Verify saved search details

Verified that the saved search displayed:

```text
Name: High Priority Errors
Query: service:api AND level:error
Filters: service=api · level=error
```

**Result:** PASS

#### Test 3 — Edit saved search

The saved search list provides an **Edit** action.

**Result:** PASS — Edit functionality was available for testing.

#### Test 4 — Delete saved search

The saved search list provides a **Delete** action.

**Result:** PASS — Delete functionality was available for testing.

### Observation / Potential Issue

The Saved Searches page states that saved queries can be opened later from **Logs**, but the Saved Searches list itself only showed **Edit** and **Delete** actions. During testing, the saved search was not directly visible as a selectable/openable item in the Saved Searches list.

**Status:** Needs further verification.

---

# 2. Log Alerts

### Purpose Tested

Log Alerts are intended to create an incident when a specified number of matching log events arrive within a rolling time window.

### Tests Performed

#### Test 1 — Verify existing alert rules

The Log Alerts section was opened and existing alert rules were reviewed.

The section displayed rules with:

- Alert name
- KQL query
- Severity
- Service
- State
- Enable/Disable control
- Edit
- Delete

**Result:** PASS

#### Test 2 — Review alert query conditions

Existing rules were checked to confirm that KQL conditions were displayed correctly.

Examples included queries based on:

```text
attrs.gen_ai_prompt
attrs.gen_ai_output_tokens
attrs.gen_ai_operation
attrs.gen_ai_tool_name
```

**Result:** PASS

#### Test 3 — Verify trigger configuration

The alert rules displayed trigger requirements such as:

```text
Trip when ≥ 1 events match within 300s
```

and:

```text
Trip when ≥ 50 events match within 300s
```

**Result:** PASS

#### Test 4 — Enable/Disable control

The Log Alerts section provides an Enable/Disable control for alert rules.

**Result:** PASS — Control was available and could be used for testing.

### Testing Status

The Log Alert configuration and rule-management UI were verified. Complete end-to-end alert triggering should additionally be tested by generating logs that exactly satisfy an alert's KQL condition and threshold.

**Status:** PASS for configuration/UI testing; end-to-end trigger testing requires matching test events.

---

# 3. Log Metrics

### Purpose Tested

Log Metrics convert saved log queries into time-series data by counting matching events per time bucket.

### Tests Performed

#### Test 1 — Create a log metric

Created an API error metric using:

```text
Metric Name: API Error Count
Search: error
Service: api
Level: error
Bucket: 5m
```

**Result:** PASS

The metric was successfully created and displayed as a metric card.

#### Test 2 — Verify metric values

The metric displayed:

```text
LAST BUCKET
PEAK
TOTAL (6H)
```

A tested metric showed values such as:

```text
Last Bucket: 10
Peak: 10
Total (6H): 10
```

Later testing showed:

```text
Last Bucket: 0
Peak: 11
Total (6H): 28
```

**Result:** PASS

The metric was receiving and calculating matching log events.

#### Test 3 — Verify service and level filtering

The API Error Count metric used:

```text
service=api
level=error
```

Only logs matching the configured service and level should contribute to the metric.

**Result:** PASS based on the observed metric behavior.

#### Test 4 — Verify non-matching logs

Logs with different services or levels were generated to verify filtering.

Examples included services such as:

```text
payment-service
cache-service
auth-service
notification-service
```

and levels such as:

```text
critical
notice
trace
```

**Result:** PASS for filter-isolation testing.

#### Test 5 — Verify metric bucket behavior

The metric was configured with a:

```text
5-minute bucket
```

The metric chart and bucket values were observed after generating matching logs.

**Result:** PASS — bucket-based metric calculation was observed.

#### Test 6 — Verify metric refresh

The Log Metrics page indicates that charts auto-refresh periodically.

The metric values were observed updating after log ingestion.

**Result:** PASS / working as observed.

---

# Overall Testing Summary

| Section | Testing Status | Main Result |
|---|---|---|
| Saved Searches | PASS / Further verification | Creation, display, edit and delete controls verified |
| Log Alerts | PASS / Further verification | Alert rules, queries, thresholds and controls verified |
| Log Metrics | PASS | Metric creation, filtering, bucket calculation and values verified |

## Issues / Observations

### 1. Saved Searches — Open for further verification

The Saved Searches page indicates that saved queries can be opened from Logs, but the Saved Searches list did not display a direct **Open** action. Only **Edit** and **Delete** were visible.

### 2. Log Alerts — End-to-end trigger testing pending

The alert configuration was tested, but a complete trigger test requires generating log events that match the configured KQL query and threshold.

### 3. Log Metrics — Working

Log Metrics successfully calculated matching event counts and displayed:

```text
Last Bucket
Peak
Total (6H)
```

The `service` and `level` filters also behaved as expected during testing.

---

# Conclusion

Today's testing covered the **Saved Searches, Log Alerts, and Log Metrics** sections of 24Observe.

The core UI and configuration functionality of all three sections was successfully exercised. **Log Metrics showed the strongest confirmed functional result**, with matching log events being reflected in metric counts and time buckets.

Further end-to-end testing is recommended for:

1. Opening/reusing Saved Searches directly from Logs.
2. Triggering Log Alerts with controlled matching events.
3. Verifying alert incidents and notification routing after a Log Alert threshold is crossed.

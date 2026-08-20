# 24Observe – Bug Report

**Tester:** Khaja Bandenawaz  
**Website:** 24Observe  
**Test Date:** 19-August-2026  

---

## Bug 1 – Explore Query Level Filter Not Applied Correctly

**Section:** Logs → Explore  
**Severity:** High  
**Priority:** High  
**Status:** Open  

### Description

The Explore query appears to ignore the specified log-level condition when returning/visualizing results.

Queries tested included:

```text
info
| timechart span=5m count() by service
```

and:

```text
debug
| timechart span=5m count() by service
```

### Steps to Reproduce

1. Navigate to **Logs → Explore**.
2. Enter the `info` timechart query.
3. Click **Run**.
4. Inspect the returned results.
5. Repeat with the `debug` timechart query.
6. Compare the returned events with the requested level.

### Expected Result

For an `info` query, only `info` events should participate in the query.

For a `debug` query, only `debug` events should participate in the query.

### Actual Result

The returned data contains multiple log levels, including `error`, `info`, `warn`, and `debug`, even when a specific level is specified in the query.

### Impact

Incorrect filtering can produce inaccurate query results and misleading log analysis.

---

## Bug 2 – Timechart Does Not Correctly Represent Service Series

**Section:** Logs → Explore → Timechart  
**Severity:** Medium  
**Priority:** High  
**Status:** Open  

### Description

The timechart query:

```text
error
| timechart span=5m count() by service
```

does not consistently represent all service series contained in the underlying log data.

The Events data contains services such as:

- `web`
- `checkout`
- `database`
- `my-app`
- `authentication`
- `API_server`
- `website`

However, the visualization sometimes displays only selected services, such as `checkout` and `web`, while other services such as `database` are present in the underlying data.

In some results, the chart legend also displays generic labels such as `service` and `count` rather than the individual service series.

### Steps to Reproduce

1. Navigate to **Logs → Explore**.
2. Run:

```text
error
| timechart span=5m count() by service
```

3. Inspect the returned data.
4. Compare the services in the results with the chart legend and plotted series.
5. Repeat with `info` and `debug` timechart queries.

### Expected Result

Every service returned by `count() by service` should appear as a correctly labeled series in the timechart.

The chart values should match the underlying query results for each 5-minute time bucket.

### Actual Result

Some services present in the underlying data are missing from the chart, and the chart does not consistently represent the returned service groups.

### Impact

The visualization can misrepresent log volume by service and may lead users to incorrect conclusions during monitoring and troubleshooting.

---

## Summary

| Bug | Section | Severity | Status |
|---|---|---|---|
| Level filter not correctly applied | Logs → Explore | High | Open |
| Timechart service series mismatch | Logs → Explore → Timechart | Medium | Open |

## Overall Conclusion

Two issues were identified during testing of the 24Observe Logs module:

1. **Explore level filtering** does not appear to restrict the returned data correctly.
2. **Explore Timechart** does not consistently represent all service series contained in the underlying results.

**Prepared by:** Khaja Bandenawaz  
**Test Date:** 19-August-2026

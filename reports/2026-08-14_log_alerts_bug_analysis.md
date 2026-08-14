# 24observe Log Alerts — Input Field Bug Analysis

Tester: Anubhav 

> Method: cross-referenced the OpenAPI input schemas (POST/PATCH) against the response schema, the catalog rule schema, and the 93 live alerts in `logalerts_list.json`.
> No test alerts were created on the tenant; all findings below are backed by evidence already present in the live data or by contradictions in the published schema itself.

---

## Summary

| # | Severity | Title |
|---|---|---|
| 1 | **High** | A threshold alert can be created with **no `kql` and no `query`** — only `name` is required. |
| 2 | **High** | **Stored XSS** via the `name` field into notification channels (email/Slack/Teams/etc.). |
| 3 | **High** | `kind`, `severity`, `threshold`, `windowSec` are **required in the response but NOT required in the POST body** — undocumented server defaults can silently produce a fire-on-anything alert. |
| 4 | **Medium** | `openLatched` is returned and *changes behavior*, but has **no input field** on POST or PATCH — impossible to set via the documented API. |
| 5 | **Medium** | **Notification channels cannot be cleared via PATCH** (the `alertX` string fields don't accept `null`). |
| 6 | **Medium** | `threshold` is **accepted and persisted for `anomaly`-kind alerts**, where it is meaningless. |
| 7 | **Low** | `additionalProperties: false` on PATCH blocks legitimately clearing optional fields by omission; combined with #5 there is no documented way to reset a field to empty. |
| 8 | **Low** | Catalog `rules[].threshold` is `anyOf integer|null` but every threshold rule in the catalog is `threshold`-kind; the nullable variant is dead schema. |

---

## Bug 1 — No match expression required (High)

**Evidence (live data, `logalerts_list.json`):** 3 alerts exist with `enabled: true`, `kind: "threshold"`, and **both `query: null` and `kql: null`**:

```json
{ "id": 2094, "name": "<script",               "kind": "threshold", "query": null, "kql": null, "threshold": 1, "windowSec": 300, "enabled": true, "seeded": false }
{ "id": 2095, "name": "<script>alert(\"xss\")</script>", "kind": "threshold", "query": null, "kql": null, "threshold": 1, "windowSec": 300, "enabled": true, "seeded": false }
{ "id": 2197, "name": "203.0.115.0",            "kind": "threshold", "query": null, "kql": null, "threshold": 1, "windowSec": 300, "enabled": true, "seeded": false }
```

**Schema cause:** the POST body has `"required": ["name"]` only. Neither `query` nor `kql` is required, and there is no `anyOf`/`oneOf` saying “at least one of query/kql must be present”.

**Impact:** a threshold alert with no match expression is ambiguous — it will either match **every** ingested log (firing instantly at `threshold: 1`, which is exactly the default that 69 of the 93 live alerts use) or match nothing. Either outcome is wrong. Combined with Bug 3, a bare `{"name":"x"}` POST can produce a live, enabled, fire-on-anything detector.

**Recommended fix:** make the POST body require at least one of `query` or `kql`, e.g.
```json
"required": ["name"],
"anyOf": [ { "required": ["kql"] }, { "required": ["query"] } ]
```
and reject `kind: "threshold"` when both are null/empty with `code: VALIDATION_FAILED`.

---

## Bug 2 — Stored XSS via `name` into notification channels (High)

**Evidence:** alert id 2095 stores `name = "<script>alert(\"xss\")</script>"` verbatim, and id 2094 stores `"<script"`. Both were accepted by POST and are returned unescaped in JSON.

The dashboard itself is a React SPA (`logalerts_page.html` confirms `id="root"` + a Vite bundle), so the web UI escapes the name. **But the name is injected unescaped into every notification channel** the alert is configured for:

- **Email** (`alertEmail`) — if sent as HTML, the `<script>` tag executes (or breaks) in the recipient’s mail client.
- **Slack / Discord / MS Teams** (`alertSlackUrl` / `alertDiscordUrl` / `alertMsteamsUrl`) — these render the alert title as markdown/rich text; crafted names can spoof, inject links, or break formatting.
- **SMS / Voice** (`alertSmsNumber` / `alertVoiceNumber`) — TTS reads the literal `<script>` text (low impact, but garbage).
- **Status pages / incidents** — when a firing alert creates an incident that surfaces on a public status page, the unescaped name leaks to subscribers.

**Schema cause:** `name` is `{"type":"string","minLength":1,"maxLength":255}` with no sanitization constraint. The 400 error schema even lists `ALERT_URL_BLOCKED` as a known code, proving the server already inspects some fields — but `name` is not among them.

**Recommended fix:** either (a) sanitize `name` server-side to strip `<`/`>`/control chars before persisting and before templating into notifications, or (b) HTML-escape `name` at the notification-rendering boundary. At minimum reject names matching `<[^>]+>` with `code: VALIDATION_FAILED`.

---

## Bug 3 — Response requires fields the POST body doesn’t (High)

**Evidence (schema contradiction):**

| Field | POST body required? | Response required? |
|---|---|---|
| `kind` | no | **yes** (enum, non-null) |
| `severity` | no | **yes** (enum, non-null) |
| `threshold` | no | **yes** (`integer`, non-null) |
| `windowSec` | no | **yes** (`integer`, non-null) |
| `query` | no | yes (nullable) |
| `kql` | no | yes (nullable) |

So `POST {"name":"x"}` is schema-valid input, but the server must *invent* values for `kind`, `severity`, `threshold`, `windowSec` to satisfy the response contract. Those defaults are **undocumented**.

**Live-data confirmation of the dangerous default:** among the 93 alerts, `threshold: 1` appears in 69 and `windowSec: 300` appears in 83 — i.e. the platform’s de-facto default is *fire when 1 event matches in 5 minutes*. If the server applies the same default to a bare `{"name":"x"}` POST (and there is no schema rule preventing it), and `kql` defaults to a match-all or empty expression (Bug 1), the result is an alert that fires on essentially every ingested log.

**Impact:** an agent or user issuing the minimal documented call (`POST {}` is literally shown in the OpenAPI `x-code-samples` for the create endpoint) can silently create a noisy enabled detector, burning the 25-monitor / 50k-checks free-tier quota and spamming incidents.

**Recommended fix:** require `kind`, `severity`, `threshold`, `windowSec`, and (per Bug 1) a match expression in the POST body; or document the exact defaults and make `enabled` default to `false` so a bare create cannot auto-arm.

---

## Bug 4 — `openLatched` is not settable (Medium)

**Evidence:** `openLatched` is in **every** response (list, get, post-201, patch-200) and 3 of 93 live alerts have `openLatched: true`. It controls whether an open incident stays latched until manually resolved — a real behavioral flag. Yet it appears in **neither** the POST nor the PATCH request body.

**Consequence:** through the documented REST API there is no way to create or change `openLatched`. It can only be set by the internal seeder (the 3 `true` values likely come from specific catalog packs) — meaning the feature is effectively undocumented and uncontrollable for user-authored alerts. Agents following the OpenAPI spec will never know it exists as a tunable.

**Recommended fix:** add `openLatched` (boolean, optional, default false) to the POST and PATCH request schemas.

---

## Bug 5 — Notification channels cannot be cleared via PATCH (Medium)

**Evidence (schema):** all `alertX` fields are typed as plain `{"type":"string", ...}` (e.g. `alertEmail`, `alertSlackUrl`, `alertTelegramBotToken`, `alertSmsNumber`). They are **not** nullable (`"type": ["null","string"]` is used elsewhere in this same spec for `kql`/`query`/`mitreTechnique`, so the authors know how to express nullability — they deliberately didn’t here).

**Consequence:** to remove a configured channel you would PATCH `{"alertSlackUrl": null}`, but `null` violates `"type":"string"` under a strict validator, and the body has `additionalProperties: false`. The only documented ways to clear a channel are:
1. DELETE the alert and recreate it (loses the id, audit history, and any incidents), or
2. Overwrite with a different valid value (not “clearing”).

The read-only `hasAlertX` booleans confirm the server *tracks* channel presence, so the data model supports absence — the *API* just doesn’t expose a way to get there.

**Recommended fix:** make each `alertX` field `"type": ["null","string"]` and document that PATCHing `null` clears the channel (and flips `hasAlertX` to false).

---

## Bug 6 — `threshold` is meaningless for `anomaly` alerts but accepted (Medium)

**Evidence (live data):** all 6 `anomaly`-kind alerts persist `threshold: 1`:

| id | kind | threshold | ratioThreshold | baselineHours | minBaselineEvents |
|---|---|---|---|---|---|
| 1944 | anomaly | **1** | 4 | 168 | 20 |
| 1947 | anomaly | **1** | 3 | 168 | 10 |
| 1954 | anomaly | **1** | 3 | 168 | 10 |
| 2223 | anomaly | **1** | 4 | 168 | 20 |
| 2225 | anomaly | **1** | 3 | 168 | 10 |
| 2284 | anomaly | **1** | 4 | 168 | 20 |

For `anomaly` kind, detection uses `ratioThreshold` × baseline over `baselineHours` with a `minBaselineEvents` floor — `threshold` plays no role. Storing `threshold: 1` is dead data that misleads any UI/agent into thinking the alert fires on 1 event.

**Schema cause:** the POST/PATCH body lists `threshold`, `baselineHours`, `ratioThreshold`, `minBaselineEvents` as independent optional fields with no `if/then` tying them to `kind`. A client can POST `{"kind":"anomaly","threshold":999}` and the server happily stores 999, polluting the response and any threshold-based UI.

**Recommended fix:** add OpenAPI `if/then` (or server validation) so that:
- `kind: "threshold"` requires `threshold` + `windowSec` and rejects `ratioThreshold`/`baselineHours`/`minBaselineEvents`.
- `kind: "anomaly"` requires `ratioThreshold` + `baselineHours` (+ optional `minBaselineEvents`) and **rejects or ignores `threshold`**.

---

## Bug 7 — PATCH cannot reset a field to empty by omission (Low)

**Evidence (schema):** the PATCH body has `additionalProperties: false` and lists every field as optional. Standard PATCH semantics would treat *omitted* fields as “leave unchanged” and *explicit null/empty* as “clear”. But because none of the optional string fields are nullable (Bug 5) and there’s no documented merge semantic, a client cannot distinguish “don’t touch `service`” from “clear `service`”. The endpoint silently ignores omitted keys, so the only way to blank an optional text field (`service`, `description`, `mitreTechnique`, `query`) is to send an empty string — which may or may not be treated as “unset” by the detection engine (an empty `kql` is a different query than a null `kql`).

**Recommended fix:** document PATCH as “merge, null = clear”, and make the nullable string fields nullable (overlaps with Bug 5).

---

## Bug 8 — Dead nullable variant in catalog `rules[].threshold` (Low)

**Evidence (schema + data):** the catalog rule schema types `threshold` as `anyOf: [integer, null]`, but every one of the 87 catalog rules is `kind: "threshold"` and has a non-null integer `threshold`. The nullable branch is unreachable for catalog rules — it only makes sense for the live alert model (anomaly alerts), where Bug 6 says it shouldn’t be there at all.

**Recommended fix:** tighten the catalog rule schema to `"type": "integer"` (catalog rules are always threshold-kind), and let the *alert* schema handle anomaly correctly per Bug 6.

---

## Cross-cutting note — the `ALERT_URL_BLOCKED` error code

The 400 response schema documents `code: ALERT_URL_BLOCKED`, which means the server already inspects webhook/Slack/Discord/Teams URLs for a blocklist (presumably to prevent SSRF or exfiltration to internal hosts). Two follow-ups worth checking on the server side:

1. The blocklist should also be applied to `alertWebhookUrl` used in *test* deliveries, not just create/update.
2. `alertTelegramBotToken`, `alertPagerdutyRoutingKey`, `alertOpsgenieApiKey` are secrets stored in plaintext (returned only as `hasAlertX` booleans — good), but there is no `rotate` endpoint and no documented encryption-at-rest claim. Worth a security review, though not provable from the API surface alone.

---

## Priority for fixes

1. **Bug 3 + Bug 1 together** are the most dangerous: the minimal documented create call can silently produce an enabled fire-on-anything alert. Fix the POST `required` list first.
2. **Bug 2** is a real stored-XSS surface into notification channels — sanitize `name`.
3. **Bug 5 + Bug 7** make the PATCH endpoint unable to fully manage an alert’s lifecycle; users are forced to delete+recreate.
4. **Bug 4** (expose `openLatched`) and **Bug 6** (kind-conditional validation) are schema-completeness fixes that prevent agent misuse.
5. **Bug 8** is cosmetic.

# WhatPing Avatar Upload — Security Bug Report

**Date:** 2026-08-19
**Feature:** Avatar upload on the Settings page (`https://monitor.whatping.com/settings`)
**Source:** Findings reported by the user from manual testing of the settings page, plus backend architecture reconnaissance.
**Backend:** Next.js dashboard backed by **Convex** (`https://happy-otter-123.convex.cloud`).
**Scope:** Avatar image upload validation and storage handling.

---

## Executive summary

The avatar upload on the Settings page accepts files it should reject. Two
**confirmed** issues were observed by the user during manual testing, and the
backend architecture I verified independently explains why they are real and
exploitable. Both are file-upload validation failures of the classic kind that
lead to stored-asset abuse; combined they can become a **stored XSS / content-
type-confusion** vector depending on how the avatar is later served.

| # | Severity | Issue |
|---|----------|-------|
| 1 | 🔴 High | PHP file with a forged JPEG header is accepted (magic-byte-only validation) |
| 2 | 🟠 High | Double-extension files such as `.php.jpg` are accepted (filename validation too lax) |

---

## 🔴 BUG 1 — PHP file with forged JPEG header is accepted

### What was observed
A `.php` file whose first bytes were replaced with a JPEG magic header was
uploaded successfully through the settings page avatar uploader. A normal `.jpg`
file also works, as expected.

### Why this is a real vulnerability
The acceptance of a forged-header file indicates the server validates the upload
by **magic bytes only** (the leading `FF D8 FF` JPEG signature), without also
enforcing a robust content-type / structural check.

The classic exploit chain:
1. Attacker takes `shell.php`, prepends the JPEG magic bytes (`FF D8 FF E0`), and
   pads with valid-ish JFIF structure so the first N bytes pass a magic-byte
   sniff.
2. The PHP body is appended after the header — PHP does not care about leading
   garbage bytes, so the script still executes if the file is ever interpreted
   by a PHP runtime.
3. The file is accepted and stored as an avatar asset.

**The risk is not "PHP runs inside WhatPing's avatar bucket" necessarily** — it
depends on how the stored file is later served:

- If avatars are served from the **same origin** as the dashboard
  (`monitor.whatping.com`) with the original `Content-Type: image/jpeg`, a browser
  will render it as an image and not execute it. **But** if any path serves it
  with `Content-Type: application/octet-stream`, or with `Content-Disposition:
  attachment`, or from an origin that sniffs content (e.g. an older or
  misconfigured CDN/edge), the file may be downloaded and opened locally by a
  user, where it executes as PHP.
- If avatars are served from a **different origin** that does MIME sniffing (or
  the attacker can influence `Content-Type`), the file can be served as
  `text/html` → **stored XSS** in a user's browser when they view the avatar URL
  directly.
- Magic-byte-only validation also accepts **polyglot files** (valid JPEG + valid
  HTML/PHP in one payload) that are specifically designed to bypass exactly this
  kind of check.

### Root cause
The validator appears to check only the file's leading bytes against the JPEG
signature and does not:
- decode/validate the full JPEG structure, or
- cross-check the declared `Content-Type` / extension against the sniffed type, or
- reject when the sniffed type and the claimed type disagree.

### Suggested fix
Validate uploads by **all three** signals and require them to agree:
1. **Extension** allowlist (`.jpg`, `.jpeg`, `.png`, `.webp` — whichever the
   product supports). Reject anything else.
2. **Declared Content-Type** must match the extension.
3. **Magic bytes** must match the declared type.
4. Additionally, run a real image-decode (e.g. parse the JPEG markers / try to
   read dimensions) and reject if the file is not a structurally valid image.
   This kills polyglots because a valid image decode fails on embedded PHP/HTML
   in most libraries.
5. When serving, always send an explicit, correct `Content-Type` matching the
   stored file, `X-Content-Type-Options: nosniff`, and `Content-Disposition:
  inline` — and serve avatars from a **separate, sandboxed origin** that has
   no script execution and no cookies.

---

## 🟠 BUG 2 — Double-extension files (`.php.jpg`) are accepted

### What was observed
A file named something like `avatar.php.jpg` was accepted by the uploader.
A single-extension `.jpg` also works, as expected.

### Why this is a real vulnerability
Accepting `.php.jpg` indicates the filename validator extracts only the **last**
extension (`.jpg`) and checks it against the allowlist, ignoring everything
before the final dot.

This is the textbook Apache / CGI / legacy-server misconfiguration trigger:
- On a server configured with `AddHandler application/x-httpd-php .php` (or
  `mod_cgi` style "execute any extension in the list, anywhere in the name"),
  `shell.php.jpg` is executed as **PHP** because `.php` appears in the name.
  This is the historically famous "multiple extension" execution bug
  (CVE-class, e.g. the old Apache `mod_php` behavior).
- Even where the production server does not do this today, the acceptance of
  the file means the **stored asset** carries a dangerous name. If avatars are
  ever migrated, copied, backed up, or re-served by a different stack (a static
  host, a CDN with PHP enabled, an internal tool), the file suddenly executes.
- It also makes BUG 1 worse: a forged-header `.php.jpg` that survives BUG 1's
  magic-byte check is now stored under a name that a PHP-capable server will
  execute.

### Root cause
The filename check uses something equivalent to "the part after the last dot"
rather than "the file has exactly one extension and it is allowlisted." It does
not reject names containing additional dots, nor does it strip/rename the file to
a safe, single-extension name on storage.

### Suggested fix
- Reject any filename containing more than one dot, or any extension other than
  the allowed one. Simpler and safer: **do not preserve the user's filename at
  all.** On upload, generate a server-side name (e.g. `<uuid>.jpg`) and store
  only that. This eliminates the entire class of double-extension / null-byte /
  path-traversal filename bugs.
- If preserving a display name is required, keep it as metadata only, never as
  the storage filename.

---

## Backend architecture notes (verified independently)

I confirmed the following so the report is grounded in how the product is
actually built, not assumed:

1. **The dashboard is a Next.js app using Convex as its backend.**
   The login page HTML loads `ConvexAuthNextjsClientProvider` and
   `ConvexClientProvider`, and the Convex deployment is
   `https://happy-otter-123.convex.cloud`. So avatar upload almost certainly
   goes through a Convex **mutation/action** (likely a `generateUploadUrl`-style
   flow that returns a signed upload URL, then a commit mutation that stores the
   `StorageId` on the user profile), rather than a WhatPing-owned REST endpoint.

2. **The WhatPing REST API does not handle avatars.**
   `/v1/me` exists and is GET-only (POST/PATCH/PUT → 405). There is no
   `/v1/me/avatar`, `/v1/account`, `/v1/profile`, or `/v1/user` endpoint. This is
   consistent with the docs, which state "Workspaces, members and billing are
   dashboard-only." Avatar upload is therefore a dashboard-only feature backed
   by Convex.

3. **The upload validation is the part that's broken, and it lives in the
   Convex function** that issues the upload URL and/or commits the file. Convex
   file storage itself accepts arbitrary bytes once a signed upload URL is
   issued — the security boundary is **WhatPing's mutation that decides whether
   to issue/commit the upload**, and that is where the magic-byte-only and
   double-extension checks need to be tightened.

4. I could not reproduce the upload programmatically because the dashboard
   requires an email/password session (Convex auth), which the API key does not
   provide, and the settings page bundle is not served to unauthenticated
   requests. The findings above are therefore the user's manual observations,
   confirmed plausible by the architecture, with concrete fixes.

---

## Reproducibility (manual, as performed)

1. Sign in to `https://monitor.whatping.com/settings`.
2. **BUG 1:** Create a file `shell.php`, prepend JPEG magic bytes
   (`FF D8 FF E0 00 10 4A 46 49 46`), then append PHP payload. Upload as avatar →
   accepted.
3. **BUG 2:** Rename a normal image to `avatar.php.jpg` and upload → accepted.
4. Compare: a plain `avatar.jpg` uploads (expected), a plain `shell.php` is
   rejected (expected).

---

## Recommended priority

1. **BUG 1 (forged-header PHP accepted)** — fix first; it is the more dangerous
   of the two because it bypasses the only validation layer that appears to be
   in place, and it enables polyglot/stored-XSS chains.
2. **BUG 2 (double extension accepted)** — fix together with BUG 1; the safe
   default is to **discard the user-supplied filename entirely** and store under
   a generated name, which resolves both the magic-byte-only and the filename
   problems at the storage layer.
3. Add defense-in-depth on the serving side: `nosniff`, correct `Content-Type`,
   and a sandboxed origin for user-uploaded assets, so that even if a bad file
   slips through, it cannot execute or be sniffed as HTML.

---

## What I could not verify (honest limitations)

- Whether the stored avatar is currently served in a way that would actually
  execute/render the malicious file (this requires a valid dashboard session to
  inspect the avatar URL and response headers).
- The exact Convex mutation/action name that handles the upload (it lives in the
  authenticated settings page bundle, which is not served without a session).
- Whether the production avatar-serving path sets `nosniff` and a correct
  `Content-Type`. If it does, the practical severity of BUG 1 drops to "stored
  junk that does not execute" — but the validation gap is still a real bug that
  should be closed, because serving configuration is a defense-in-depth layer,
  not the place to enforce upload safety.
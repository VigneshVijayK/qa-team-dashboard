# 24observe QA Team — Performance Dashboard

A static **HTML / CSS / JS** performance analyser that turns your QA testers'
markdown reports into a graphical leaderboard for the CEO to review.

- 🏆 Ranked leaderboard with productivity scores
- 📊 Charts: total bugs, severity breakdown, cumulative bugs over time
- 📅 Attendance grid (who reported on which day)
- 📄 Daily reports browser — view & download each junior's actual report (redacted)
- ⬇ CSV export + Print/Save-as-PDF for the CEO
- 🚀 Hosted on GitHub Pages — no backend, no database
- 🔄 Daily auto-update via a build script + git push

Team admin **Vignesh Vijay K** is shown as the team lead in the header and
**excluded** from the junior rankings.

---

## Project structure

```
work analyser/
├── index.html        # Dashboard markup
├── style.css         # Dark-theme styling (responsive + print)
├── app.js            # Leaderboard, charts, modal, CSV export, report browser
├── build.js          # Parses reports → generates data.json + copies redacted reports (Node.js, no deps)
├── data.json         # Generated — committed to the repo
├── reports/          # Generated — redacted copies of individual reports (committed)
├── publish.sh        # build + git add/commit/push helper
└── README.md         # This file
```

The source reports live **outside** this repo (in `../24observe.com/consolated report/`)
and are read only by `build.js`. Raw reports are **not** committed — instead,
`build.js` copies **redacted** versions (tokens and emails stripped) into
`reports/` so they can be safely downloaded from the public dashboard.

---

## Setup

### 1. Build the data

```bash
node build.js
```

This scans `../24observe.com/consolated report/<YYYY-MM-DD>/*.md`, parses each
report (skipping `CONSOLIDATED_*.md` and the team admin's `BUG_REPORT_*.md`),
and writes `data.json`.

You should see:

```
✓ Build complete
  Reports parsed:  14
  Reports skipped: 7 (consolidated / admin)
  Members tracked: 5
  Reports copied:  14 (redacted → ./reports/)
  Leaderboard:
    1. Vikki Hirapure    score=125 …
    …
```

`build.js` also copies **redacted** versions of each report into `reports/`,
stripping out PAT tokens (`obs_...`), Bearer tokens, and email addresses
before publishing. The originals are never committed.

### 2. View the dashboard locally

Just open `index.html` in a browser. Because it fetches `data.json` via
`fetch()`, some browsers block that for `file://` URLs. If charts/data don't
load, serve it locally instead:

```bash
# Python
python3 -m http.server 8000
# then open http://localhost:8000

# or Node (npx)
npx serve .
```

### 3. Publish to GitHub Pages

```bash
# one-time: create a GitHub repo and push
git init
git add index.html style.css app.js build.js data.json publish.sh README.md
git commit -m "Initial dashboard"
git remote add origin https://github.com/<your-user>/<repo>.git
git push -u origin main
```

Then in GitHub → **Settings → Pages** → set **Source** to `main` branch /
root folder. Your site goes live at:

```
https://<your-user>.github.io/<repo>/
```

### 4. Daily updates

After new reports come in, rebuild and push:

```bash
./publish.sh
```

Or automate with a cron job (runs at 8 PM daily):

```cron
0 20 * * * cd "/home/vicky/Desktop/test-as-intern/work analyser" && ./publish.sh >> /tmp/qa-publish.log 2>&1
```

Make `publish.sh` executable first:

```bash
chmod +x publish.sh
```

---

## Scoring formula

Each junior's score is:

$$\text{score} = (\text{days present} \times 10) + (\text{total bugs found} \times 5)$$

**Every finding counts equally** — severity is shown on the dashboard for
context, but it does **not** affect the score. This respects all
contributions equally, whether someone found a Critical bug or a Low one.
Tweak the weights in the `WEIGHTS` constant at the top of `build.js` and
re-run `node build.js`.

---

## How reports are parsed

`build.js` handles two report formats found in the folder:

1. **Bug-heading format** — `Bug N — <title>` blocks with a `Severity:` field.
2. **Verification-table format** — markdown tables with a `Severity` column
   (used in retest/verification reports).

For each report it extracts:
- **Tester** name (from `Tester:` or `**Tester:**`), normalised to a canonical
  name (e.g. `Vikki` / `Vickky` → `Vikki Hirapure`)
- **Date** (from the folder name, which is authoritative)
- **Bugs** and their **severity** (Critical / High / Medium / Low–Medium / Low)

Skipped files:
- `CONSOLIDATED_*.md` — team-wide summaries, not individual work
- Any report whose tester is `Vignesh Vijay K` (the team lead)

---

## Adding a new junior

If a new tester joins, just have them submit reports in the same format into
the `consolated report/<date>/` folder. `build.js` will pick them up
automatically on the next build. If their name has variants, add an entry to
the `NAME_MAP` in `build.js`.

---

## Tech

- Vanilla HTML / CSS / JS — no build step, no frameworks
- [Chart.js](https://www.chartjs.org/) via CDN for charts
- Node.js (built-ins only) for `build.js` — no `npm install` needed
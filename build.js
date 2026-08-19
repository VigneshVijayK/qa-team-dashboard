#!/usr/bin/env node
/**
 * build.js — QA Team Performance Analyser data builder
 *
 * Scans the junior QA testers' markdown reports, extracts per-person
 * TOPIC COVERAGE (features explored) and UNDERSTANDING DEPTH (testing
 * methods, root cause analysis, security testing, retest work, etc.),
 * aggregates them into a scored leaderboard, and writes data.json.
 *
 * Performance is NOT measured by bug count — it's measured by how much
 * of the product each tester covered and how deeply they understood it.
 *
 * No external dependencies — uses only Node.js built-ins.
 *
 * Usage:  node build.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────────────────────

// Multi-project config — each project has its own reports dir, output file,
// and redacted-reports output dir. build.js processes all of them.
const PROJECTS = [
  {
    name: '24observe',
    reportsDir: path.join(__dirname, '..', '24observe.com', 'consolated report'),
    outputFile: path.join(__dirname, 'data.json'),
    reportsOutDir: path.join(__dirname, 'reports'),
    reportsUrlPrefix: 'reports/',
    dashboardPage: '24observe.html',
  },
  {
    name: 'whatping',
    reportsDir: path.join(__dirname, '..', 'whatping', 'consolated report'),
    outputFile: path.join(__dirname, 'whatping-data.json'),
    reportsOutDir: path.join(__dirname, 'whatping-reports'),
    reportsUrlPrefix: 'whatping-reports/',
    dashboardPage: 'whatping.html',
  },
];

const TEAM_ADMIN = 'Vignesh Vijay K';

// Scoring weights — performance = topic coverage + understanding depth.
// NOT based on bug-finding ability. Every contribution is respected.
const WEIGHTS = {
  daysPresent: 5,       // per day a report was submitted (consistency)
  perFeature: 12,       // per distinct product feature/area covered
  perMethod: 8,         // per distinct testing method used
  perDepthSignal: 6,    // per depth-of-understanding signal detected
};

// Known product features/areas — matched case-insensitively against text.
// Patterns are deliberately scoped (paths, page names, feature titles) so a
// casual mention (e.g. "free plan: 3 monitors") does NOT count as coverage.
const FEATURE_KEYWORDS = [
  { key: 'On-call scheduling',    patterns: ['on-call', 'on call', 'rotation'] },
  { key: 'Logs',                  patterns: ['logs page', 'live tail', 'log ingest', 'saved search', '/logs', 'logs search'] },
  { key: 'Monitors',              patterns: ['/monitors', 'monitors page', 'monitor type', 'keyword monitor', 'http monitor', 'create a monitor', 'monitor ss', 'bulk monitor'] },
  { key: 'AI Analyst',            patterns: ['ai analyst', 'llm', 'verdict', 'openrouter', '/analyst'] },
  { key: 'Threat Intelligence',   patterns: ['threat intel', 'custom indicator', 'ioc'] },
  { key: 'Context Assets',        patterns: ['context asset', 'context entity', 'neighborhood'] },
  { key: 'Host Installation',     patterns: ['host install', 'host enroll', 'enrollment', 'install.sh', 'agent install', 'sensor', 'alloy'] },
  { key: 'Status Pages',          patterns: ['status page', 'status-page', '/status-pages'] },
  { key: 'Webhooks',              patterns: ['webhook'] },
  { key: 'Metric Alerts',         patterns: ['metric alert', 'metric-alert'] },
  { key: 'Incidents/Cases',       patterns: ['/incidents', 'incident detail', 'incident id', 'incidents list', 'cases:', 'case detail'] },
  { key: 'Security Headers',      patterns: ['content-security-policy', 'csp header', '/metrics endpoint', 'security header'] },
  { key: 'API Tokens',            patterns: ['token', 'bulk revoke', 'pat '] },
  { key: 'ATT&CK Coverage',       patterns: ['attack coverage', 'att&ck'] },
  { key: 'Alerts (Telegram/SMS)', patterns: ['telegram', 'sms alert', 'voice alert', 'twilio'] },
  { key: 'OpenAPI/Version',       patterns: ['openapi.json', '/version', 'openapi spec'] },
  { key: 'Billing',               patterns: ['billing', 'plan limit', 'subscription', 'invoice', 'free plan limit'] },
  { key: 'Audit Log',             patterns: ['audit log', 'audit-log', '/audit'] },
  { key: 'Log Alerts',            patterns: ['log alert', 'log-alert', 'logalerts_list', 'log alerts rule', '/log-alerts'] },
];

// Testing methods — detected from Method: line and report text.
const METHOD_KEYWORDS = [
  { key: 'GUI testing',            patterns: ['gui', 'dashboard', 'manual qa', 'manual gui'] },
  { key: 'API testing',            patterns: ['api', 'curl', 'endpoint', 'http request', 'bearer'] },
  { key: 'DevTools inspection',    patterns: ['devtools', 'console', 'network tab', 'csp error'] },
  { key: 'On-host testing',        patterns: ['on-host', 'on host', 'vm', 'kali', 'ubuntu vm', 'docker desktop', 'wsl'] },
  { key: 'Static analysis',        patterns: ['static analysis', 'install.sh', 'script analysis'] },
  { key: 'Security testing',       patterns: ['xss', 'path traversal', 'stored xss', 'rate limit', 'auth bypass', 'information disclosure'] },
  { key: 'Boundary/input testing', patterns: ['boundary', 'invalid', 'missing param', 'non-numeric', 'oversized'] },
  { key: 'Retest/verification',    patterns: ['retest', 're-verification', 're-verify', 'verification report', 'verdict'] },
];

// Depth signals — indicators of thorough understanding.
const DEPTH_SIGNALS = [
  { key: 'Root cause analysis',       patterns: ['root cause', 'rootcause'] },
  { key: 'API-level testing',         patterns: ['curl', 'http/1.1', 'http/2', 'authorization: bearer', 'get /api', 'post /api', 'endpoint'] },
  { key: 'Security testing',          patterns: ['xss', 'path traversal', 'rate limit', 'information disclosure', 'stored xss', '../../../'] },
  { key: 'Retest/verification',       patterns: ['retest', 're-verification', 're-verify', 'verification report', 'still present', 'partially fixed', 'cannot verify'] },
  { key: 'Fix recommendations',       patterns: ['what the fix should look like', 'recommended fix', 'fix should', 'the fix'] },
  { key: 'Impact analysis',           patterns: ['why this matters', 'why it matters', 'consequences', 'possible consequences'] },
  { key: 'DevTools evidence',         patterns: ['devtools', 'console shows', 'network shows', 'console error', 'csp/cors'] },
  { key: 'On-host runtime testing',   patterns: ['on-host', 'kali vm', 'ubuntu vm', 'alloy run', 'docker container', 'vmware'] },
  { key: 'Static analysis',           patterns: ['static analysis', '82 check', 'phase breakdown', 'script analysis'] },
];

// Known juniors + name variants (lowercase → canonical name).
const NAME_MAP = {
  'angel thomas': 'Angel Thomas',
  'anubhav soni': 'Anubhav Soni',
  'anubhav': 'Anubhav Soni',
  'emil thomas': 'Emil Thomas',
  'emil': 'Emil Thomas',
  'mubarak mohammed': 'Mubarak Mohammed',
  'mubarak': 'Mubarak Mohammed',
  'vikki hirapure': 'Vikki Hirapure',
  'vickky hirapure': 'Vikki Hirapure',
  'vikki': 'Vikki Hirapure',
  'vickky': 'Vikki Hirapure',
  'khaja bandenawaz': 'Khaja Bandenawaz',
  'khaja': 'Khaja Bandenawaz',
  'preet mishra': 'Preet Mishra',
  'preet': 'Preet Mishra',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normaliseSeverity(raw) {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  // P0–P4 priority labels → severity buckets
  if (/^p[012]$/.test(s)) return 'critical';
  if (/^p3$/.test(s)) return 'medium';
  if (/^p[45]$/.test(s)) return 'low';
  if (s === 'critical' || s === 'crit') return 'critical';
  if (s === 'high') return 'high';
  if (s === 'medium' || s === 'med') return 'medium';
  if (s.includes('low') && s.includes('medium')) return 'lowMedium';
  if (s.includes('low–medium') || s.includes('low-medium')) return 'lowMedium';
  if (s === 'low') return 'low';
  if (s.includes('low')) return 'low';
  if (s.includes('med')) return 'medium';
  if (s.includes('high')) return 'high';
  if (s.includes('crit')) return 'critical';
  return 'low';
}

function extractTesterName(testerLine) {
  let line = testerLine.trim();
  line = line.replace(/^\*+|\*+$/g, '').trim();
  const namePart = line.split('(')[0].trim();
  const cleaned = namePart.replace(/\b(GUI|API|Manual QA Testing|Copilot)\b.*$/i, '').trim();
  return cleaned;
}

function canonicaliseName(rawName) {
  const cleaned = rawName.replace(/\*+/g, '').trim();
  const key = cleaned.toLowerCase();
  if (NAME_MAP[key]) return NAME_MAP[key];
  const firstWord = key.split(/\s+/)[0];
  if (NAME_MAP[firstWord]) return NAME_MAP[firstWord];
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

function getInitials(name) {
  return name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function redactReport(content) {
  let out = content;
  out = out.replace(/obs_[A-Za-z0-9_-]{20,}/g, 'obs_[REDACTED]');
  out = out.replace(/(Bearer\s+)[A-Za-z0-9_.~+/=-]{20,}/gi, '$1[REDACTED]');
  out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL REDACTED]');
  return out;
}

function reportOutputName(date, basename) {
  return `${date}_${basename}`;
}

/**
 * Detect which keywords (from a list) appear in the given text.
 * Returns an array of matched keys (deduplicated).
 */
function detectKeywords(text, keywordList) {
  const lower = text.toLowerCase();
  const found = new Set();
  for (const item of keywordList) {
    for (const p of item.patterns) {
      if (lower.includes(p)) {
        found.add(item.key);
        break;
      }
    }
  }
  return Array.from(found);
}

/**
 * Parse a single markdown report file.
 * Returns { tester, date, severities, features, methods, depthSignals, filename } or null.
 */
function parseReport(filePath, folderDate) {
  const content = fs.readFileSync(filePath, 'utf8');
  const basename = path.basename(filePath);

  if (/^consolidated/i.test(basename)) return null;
  // Skip combined reports (multi-tester aggregations, not individual work)
  if (/combined/i.test(basename)) return null;

  // ── Owner detection — filename is the source of truth for ownership ──
  // Try to identify the tester from the filename first (e.g. "Anubhav_BUG_REPORT...",
  // "Angel-Thomas_report...", "Vikki_17-08-2026"). Fall back to the Tester:/
  // Tested by:/Reporter: line inside the file only if the filename has no match.
  const lowerBasename = basename.toLowerCase();
  let filenameOwner = null;
  for (const key of Object.keys(NAME_MAP)) {
    // Match if the filename contains the name (with - or _ or space separators)
    const nameInFile = key.replace(/\s+/g, '[-_]');
    if (lowerBasename.includes(nameInFile) || lowerBasename.includes(key)) {
      filenameOwner = NAME_MAP[key];
      break;
    }
  }

  // Extract tester from content — handles five label formats:
  //   1) "Tester: <name>", "**Tester:** <name>"
  //   2) "Tested by: <name>", "**Tested by:** <name>"
  //   3) "Reporter: <name>", "**Reporter:** <name>"
  //   4) "Reported by: <name>", "**Reported by:** <name>"
  //   5) Markdown table row: "| **Reporter** | <name> |"
  // Also matches mid-line (e.g. "...Feature: Live Tail Tester: Khaja Bandenawaz...")
  const testerMatch = content.match(/\*{0,2}(?:Tester|Tested by|Reporter|Reported by)\*{0,2}:\*{0,2}\s*(.+?)(?:\n|Test Date|Date|$)/im);
  let testerValue = testerMatch ? testerMatch[1].trim() : null;

  if (!testerValue) {
    const tableMatch = content.match(/^\|\s*\*{0,2}Reporter\*{0,2}\s*\|\s*(.+?)\s*\|/im);
    if (tableMatch) testerValue = tableMatch[1];
  }

  // Filename owner takes priority over content tester label
  let rawTester;
  if (filenameOwner) {
    rawTester = filenameOwner;
  } else if (testerValue) {
    rawTester = extractTesterName(testerValue);
  } else {
    return null; // no owner found in filename or content
  }

  if (/vignesh/i.test(rawTester)) return null;

  const tester = canonicaliseName(rawTester);
  const date = folderDate;

  // ── Severity extraction ──────────────────────────────────────────────
  const severities = [];
  const lines = content.split(/\r?\n/);
  let inTable = false;
  let severityColIdx = -1;
  let tableSeverityCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim());
      if (!inTable) {
        const idx = cells.findIndex(
          (c) => c.toLowerCase() === 'severity' || c.toLowerCase().includes('severity')
        );
        if (idx >= 0) { severityColIdx = idx; inTable = true; }
      } else {
        if (cells.every((c) => /^[-:]+$/.test(c))) continue;
        if (severityColIdx >= 0 && cells[severityColIdx]) {
          const val = cells[severityColIdx];
          if (/^(critical|high|medium|low|low[-–]medium|p[0-5])/i.test(val)) {
            severities.push(normaliseSeverity(val));
            tableSeverityCount++;
          }
        }
      }
    } else {
      inTable = false;
      severityColIdx = -1;
    }
  }

  if (tableSeverityCount === 0) {
    const severityFieldRe = /^\*{0,2}Severity\*{0,2}:\*{0,2}\s*(.+)$/gim;
    let m;
    while ((m = severityFieldRe.exec(content)) !== null) {
      severities.push(normaliseSeverity(m[1].trim()));
    }
  }

  // ── Topic coverage & depth analysis ──────────────────────────────────
  const features = detectKeywords(content, FEATURE_KEYWORDS);
  const methods = detectKeywords(content, METHOD_KEYWORDS);
  const depthSignals = detectKeywords(content, DEPTH_SIGNALS);

  return { tester, date, severities, features, methods, depthSignals, filename: basename };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function buildProject(project) {
  const { reportsDir, outputFile, reportsOutDir, reportsUrlPrefix } = project;

  if (!fs.existsSync(reportsDir)) {
    console.log(`  ⚠ Reports directory not found: ${reportsDir} — skipping ${project.name}`);
    // Write empty data so the dashboard shows "no reports" instead of erroring
    const emptyOutput = {
      teamAdmin: TEAM_ADMIN,
      generatedAt: new Date().toISOString(),
      dateRange: [],
      weights: WEIGHTS,
      members: [],
      reports: [],
    };
    fs.writeFileSync(outputFile, JSON.stringify(emptyOutput, null, 2), 'utf8');
    return;
  }

  const dateFolders = fs
    .readdirSync(reportsDir)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();

  if (dateFolders.length === 0) {
    console.log(`  ⚠ No date folders found in ${reportsDir} — writing empty data for ${project.name}`);
    const emptyOutput = {
      teamAdmin: TEAM_ADMIN,
      generatedAt: new Date().toISOString(),
      dateRange: [],
      weights: WEIGHTS,
      members: [],
      reports: [],
    };
    fs.writeFileSync(outputFile, JSON.stringify(emptyOutput, null, 2), 'utf8');
    return;
  }

  const people = new Map();

  function ensurePerson(name) {
    if (!people.has(name)) {
      people.set(name, {
        name,
        initials: getInitials(name),
        datesPresent: new Set(),
        severityCounts: { critical: 0, high: 0, medium: 0, lowMedium: 0, low: 0 },
        dailyLog: [],
        featuresCovered: new Set(),
        methodsUsed: new Set(),
        depthSignals: new Set(),
      });
    }
    return people.get(name);
  }

  let totalReportsParsed = 0;
  let totalReportsSkipped = 0;

  fs.rmSync(reportsOutDir, { recursive: true, force: true });
  fs.mkdirSync(reportsOutDir, { recursive: true });

  const reportsIndex = [];

  for (const folder of dateFolders) {
    const folderPath = path.join(reportsDir, folder);
    const files = fs
      .readdirSync(folderPath)
      .filter((f) => f.toLowerCase().endsWith('.md') || f.toLowerCase().endsWith('.txt'))
      .sort();

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const parsed = parseReport(filePath, folder);
      if (!parsed) { totalReportsSkipped++; continue; }
      totalReportsParsed++;

      const person = ensurePerson(parsed.tester);
      person.datesPresent.add(parsed.date);

      const breakdown = { critical: 0, high: 0, medium: 0, lowMedium: 0, low: 0 };
      for (const sev of parsed.severities) {
        person.severityCounts[sev]++;
        breakdown[sev]++;
      }
      person.dailyLog.push({
        date: parsed.date,
        bugsFound: parsed.severities.length,
        features: parsed.features,
        methods: parsed.methods,
        depthSignals: parsed.depthSignals,
        severityBreakdown: breakdown,
      });

      // Accumulate coverage sets
      parsed.features.forEach((f) => person.featuresCovered.add(f));
      parsed.methods.forEach((m) => person.methodsUsed.add(m));
      parsed.depthSignals.forEach((d) => person.depthSignals.add(d));

      // Copy redacted report
      const rawContent = fs.readFileSync(filePath, 'utf8');
      const redacted = redactReport(rawContent);
      const outName = reportOutputName(folder, parsed.filename);
      fs.writeFileSync(path.join(reportsOutDir, outName), redacted, 'utf8');
      reportsIndex.push({
        date: parsed.date,
        tester: parsed.tester,
        filename: parsed.filename,
        path: `${reportsUrlPrefix}${outName}`,
        bugsFound: parsed.severities.length,
        features: parsed.features,
        methods: parsed.methods,
        depthSignals: parsed.depthSignals,
      });
    }
  }

  // Build final member list with scores
  const members = Array.from(people.values()).map((p) => {
    const sc = p.severityCounts;
    const daysPresent = p.datesPresent.size;
    const totalBugs = sc.critical + sc.high + sc.medium + sc.lowMedium + sc.low;
    const featuresList = Array.from(p.featuresCovered).sort();
    const methodsList = Array.from(p.methodsUsed).sort();
    const depthList = Array.from(p.depthSignals).sort();

    // Score = coverage + depth, NOT bug count
    const score =
      daysPresent * WEIGHTS.daysPresent +
      featuresList.length * WEIGHTS.perFeature +
      methodsList.length * WEIGHTS.perMethod +
      depthList.length * WEIGHTS.perDepthSignal;

    p.dailyLog.sort((a, b) => a.date.localeCompare(b.date));

    return {
      name: p.name,
      initials: p.initials,
      daysPresent,
      datesPresent: Array.from(p.datesPresent).sort(),
      totalBugs,
      severityCounts: sc,
      score,
      featuresCovered: featuresList,
      methodsUsed: methodsList,
      depthSignals: depthList,
      dailyLog: p.dailyLog,
    };
  });

  members.sort((a, b) => b.score - a.score);

  const output = {
    projectName: project.name,
    teamAdmin: TEAM_ADMIN,
    generatedAt: new Date().toISOString(),
    dateRange: dateFolders,
    weights: WEIGHTS,
    members,
    reports: reportsIndex.sort((a, b) =>
      a.date.localeCompare(b.date) || a.tester.localeCompare(b.tester)
    ),
  };

  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), 'utf8');

  console.log(`✓ ${project.name} build complete`);
  console.log(`  Reports parsed:  ${totalReportsParsed}`);
  console.log(`  Reports skipped: ${totalReportsSkipped} (consolidated / admin)`);
  console.log(`  Date folders:    ${dateFolders.length} (${dateFolders[0]} → ${dateFolders[dateFolders.length - 1]})`);
  console.log(`  Members tracked: ${members.length}`);
  console.log(`  Reports copied:  ${reportsIndex.length} (redacted → ${reportsOutDir})`);
  if (members.length > 0) {
    console.log('');
    console.log('  Leaderboard (topic coverage + understanding depth):');
    members.forEach((m, i) => {
      console.log(
        `    ${i + 1}. ${m.name.padEnd(20)} score=${String(m.score).padStart(3)}  ` +
        `days=${m.daysPresent}  features=${m.featuresCovered.length}  methods=${m.methodsUsed.length}  depth=${m.depthSignals.length}  bugs=${m.totalBugs}`
      );
    });
  }
  console.log('');
  console.log(`  Written to: ${outputFile}`);
}

function main() {
  console.log('═══ QA Team Multi-Project Build ═══\n');
  for (const project of PROJECTS) {
    console.log(`\n── Building ${project.name} ──`);
    buildProject(project);
  }
  console.log('\n═══ All projects built ═══');
}

main();
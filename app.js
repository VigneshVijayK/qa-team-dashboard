/* ──────────────────────────────────────────────────────────────────────
   24observe QA Team — Performance Dashboard
   app.js — loads data.json, renders leaderboard (topic coverage + depth),
   charts, attendance grid, report browser, person modal, CSV export.
   ────────────────────────────────────────────────────────────────────── */

'use strict';

const SEV_COLORS = {
  critical: '#ff5c5c', high: '#ff9f43', medium: '#ffd54a',
  lowMedium: '#a3e635', low: '#4ade80',
};
const SEV_LABELS = {
  critical: 'Critical', high: 'High', medium: 'Medium',
  lowMedium: 'Low–Medium', low: 'Low',
};
const SEV_ORDER = ['critical', 'high', 'medium', 'lowMedium', 'low'];

function configureChartDefaults() {
  if (typeof Chart === 'undefined') return;
  const styles = getComputedStyle(document.documentElement);
  Chart.defaults.color = styles.getPropertyValue('--text-muted').trim() || '#9aa3b2';
  Chart.defaults.borderColor = styles.getPropertyValue('--border').trim() || '#2a2f3d';
  Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  Chart.defaults.font.size = 11;
}

// ─── Theme management ────────────────────────────────────────────────────
// Three modes: 'auto' (follow system), 'dark', 'light'
// The toggle cycles: auto → dark → light → auto

const THEME_KEY = 'qa-dashboard-theme';

function getStoredTheme() {
  try { return localStorage.getItem(THEME_KEY); } catch (_) { return null; }
}

function storeTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
}

function resolveTheme(pref) {
  // Convert a preference ('auto'/'dark'/'light') to an actual theme
  if (pref === 'dark' || pref === 'light') return pref;
  // 'auto' or null → follow system
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(pref) {
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.setAttribute('data-theme-pref', pref || 'auto');
  // Re-configure Chart.js colors for the new theme and re-render
  if (DATA && typeof Chart !== 'undefined') {
    configureChartDefaults();
    renderCharts();
  }
}

function toggleTheme() {
  const pref = document.documentElement.getAttribute('data-theme-pref') || 'auto';
  // Cycle: auto → dark → light → auto
  const next = pref === 'auto' ? 'dark' : pref === 'dark' ? 'light' : 'auto';
  applyTheme(next);
  storeTheme(next);
}

function initTheme() {
  const stored = getStoredTheme();
  const pref = (stored === 'dark' || stored === 'light') ? stored : 'auto';
  applyTheme(pref);

  // Listen for system theme changes in real-time (only affects 'auto' mode)
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    const currentPref = document.documentElement.getAttribute('data-theme-pref') || 'auto';
    if (currentPref === 'auto') {
      applyTheme('auto');
    }
  });
}

let DATA = null;
let charts = {};

function el(id) { return document.getElementById(id); }

function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * Animate a number counting up from 0 to target.
 * @param {HTMLElement} element — the element whose textContent to animate
 * @param {number} target — final value
 * @param {number} duration — ms
 */
function animateCountUp(element, target, duration = 800) {
  if (!element) return;
  const start = performance.now();
  const startVal = 0;
  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // easeOutCubic for a nice deceleration
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(startVal + (target - startVal) * eased);
    element.textContent = current;
    if (progress < 1) requestAnimationFrame(tick);
    else element.textContent = target;
  }
  requestAnimationFrame(tick);
}

/**
 * Animate all .score-value elements inside a container from 0 to their value.
 */
function animateScoreValues(container) {
  if (!container) return;
  container.querySelectorAll('.score-value').forEach((el) => {
    const target = parseInt(el.textContent, 10);
    if (!isNaN(target)) animateCountUp(el, target, 1000);
  });
}

async function loadData() {
  try {
    const res = await fetch('data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    DATA = await res.json();
    render();
  } catch (err) {
    showError(err);
  }
}

function showError(err) {
  el('loadingState').classList.add('hidden');
  el('errorState').classList.remove('hidden');
  el('errorDetail').textContent = err.message || String(err);
}

function render() {
  if (!DATA) return;
  el('loadingState').classList.add('hidden');
  el('errorState').classList.add('hidden');
  el('dashboard').classList.remove('hidden');
  renderHeader();
  renderSummaryStats();
  renderLeaderboard();
  renderCharts();
  renderAttendanceGrid();
  renderReportsSection();
  bindGlobalActions();
}

// ─── Header ─────────────────────────────────────────────────────────────

function renderHeader() {
  el('adminName').textContent = DATA.teamAdmin || '—';
  el('lastUpdated').textContent = DATA.generatedAt ? fmtDateTime(DATA.generatedAt) : '—';
  const w = DATA.weights || {};
  el('wDays').textContent = w.daysPresent ?? 5;
  el('wFeature').textContent = w.perFeature ?? 12;
  el('wMethod').textContent = w.perMethod ?? 8;
  el('wDepth').textContent = w.perDepthSignal ?? 6;
}

// ─── Summary stats ──────────────────────────────────────────────────────

function renderSummaryStats() {
  const members = DATA.members || [];
  const totalBugs = members.reduce((s, m) => s + m.totalBugs, 0);
  const totalFeatures = members.reduce((s, m) => s + (m.featuresCovered?.length || 0), 0);
  const totalDays = members.reduce((s, m) => s + m.daysPresent, 0);
  const dates = DATA.dateRange || [];
  const dateSpan = dates.length
    ? `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}` : '—';

  el('summaryStats').innerHTML = `
    <div class="stat-pill"><span class="stat-value">${members.length}</span><span class="stat-label">Members</span></div>
    <div class="stat-pill"><span class="stat-value">${totalFeatures}</span><span class="stat-label">Topics Covered</span></div>
    <div class="stat-pill"><span class="stat-value">${totalBugs}</span><span class="stat-label">Findings</span></div>
    <div class="stat-pill"><span class="stat-value">${totalDays}</span><span class="stat-label">Reports</span></div>
    <div class="stat-pill"><span class="stat-value">${dateSpan}</span><span class="stat-label">Period</span></div>
  `;
}

// ─── Leaderboard ────────────────────────────────────────────────────────

function renderLeaderboard() {
  const container = el('leaderboard');
  const members = DATA.members || [];

  container.innerHTML = members.map((m, i) => {
    const rank = i + 1;
    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    const features = m.featuresCovered || [];
    const methods = m.methodsUsed || [];
    const depth = m.depthSignals || [];

    return `
      <div class="rank-card ${rankClass}" data-name="${escapeHtml(m.name)}" role="button" tabindex="0">
        <div class="rank-card-top">
          <span class="rank-number">${rank}</span>
          <div class="avatar">${escapeHtml(m.initials || '??')}</div>
          <div>
            <div class="rank-name">${escapeHtml(m.name)}</div>
            <div class="rank-score">Score: <span class="score-value">${m.score}</span></div>
          </div>
        </div>
        <div class="rank-stats">
          <div class="rank-stat">
            <div class="rank-stat-value">${features.length}</div>
            <div class="rank-stat-label">Topics</div>
          </div>
          <div class="rank-stat">
            <div class="rank-stat-value">${methods.length}</div>
            <div class="rank-stat-label">Methods</div>
          </div>
          <div class="rank-stat">
            <div class="rank-stat-value">${depth.length}</div>
            <div class="rank-stat-label">Depth</div>
          </div>
          <div class="rank-stat">
            <div class="rank-stat-value">${m.daysPresent}</div>
            <div class="rank-stat-label">Days</div>
          </div>
        </div>
        <div class="coverage-tags">
          ${features.slice(0, 4).map((f) => `<span class="tag tag-feature">${escapeHtml(f)}</span>`).join('')}
          ${features.length > 4 ? `<span class="tag tag-more">+${features.length - 4} more</span>` : ''}
        </div>
        ${depth.length > 0 ? `
          <div class="depth-tags">
            ${depth.slice(0, 3).map((d) => `<span class="tag tag-depth">✓ ${escapeHtml(d)}</span>`).join('')}
            ${depth.length > 3 ? `<span class="tag tag-more">+${depth.length - 3} more</span>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  container.querySelectorAll('.rank-card').forEach((card) => {
    card.addEventListener('click', () => openPersonModal(card.dataset.name));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPersonModal(card.dataset.name);
      }
    });
  });

  // Animate score numbers counting up (delayed to sync with card entrance)
  setTimeout(() => animateScoreValues(container), 400);
}

// ─── Charts ─────────────────────────────────────────────────────────────

function renderCharts() {
  configureChartDefaults();
  destroyCharts();
  const members = DATA.members || [];
  const labels = members.map((m) => m.name);

  // 1. Topic coverage per person
  renderChart('chartTotalBugs', () => new Chart(el('chartTotalBugs'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Topics Covered',
        data: members.map((m) => (m.featuresCovered?.length || 0)),
        backgroundColor: '#4f8cff',
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
      animation: { duration: 1200, easing: 'easeOutQuart', delay: (ctx) => ctx.dataIndex * 80 },
    },
  }));

  // 2. Coverage breakdown (features + methods + depth)
  renderChart('chartSeverity', () => new Chart(el('chartSeverity'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Features', data: members.map((m) => (m.featuresCovered?.length || 0)), backgroundColor: '#4f8cff', borderRadius: 3 },
        { label: 'Methods', data: members.map((m) => (m.methodsUsed?.length || 0)), backgroundColor: '#ff9f43', borderRadius: 3 },
        { label: 'Depth Signals', data: members.map((m) => (m.depthSignals?.length || 0)), backgroundColor: '#4ade80', borderRadius: 3 },
      ],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } } },
      scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true } },
      animation: { duration: 1000, easing: 'easeOutQuart', delay: (ctx) => ctx.datasetIndex * 150 + ctx.dataIndex * 50 },
    },
  }));

  // 3. Cumulative topic coverage over time
  const dates = DATA.dateRange || [];
  const datasets = members.map((m, idx) => {
    const cumulative = [];
    const seenFeatures = new Set();
    for (const d of dates) {
      const entry = (m.dailyLog || []).find((e) => e.date === d);
      if (entry) entry.features.forEach((f) => seenFeatures.add(f));
      cumulative.push(seenFeatures.size);
    }
    return {
      label: m.name, data: cumulative,
      borderColor: memberColor(idx), backgroundColor: memberColor(idx, 0.1),
      tension: 0.25, fill: false, pointRadius: 3, pointHoverRadius: 5,
    };
  });

  renderChart('chartCumulative', () => new Chart(el('chartCumulative'), {
    type: 'line',
    data: { labels: dates.map(fmtDate), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      animation: { duration: 1500, easing: 'easeInOutQuart' },
    },
  }));
}

const MEMBER_PALETTE = ['#4f8cff','#ff9f43','#4ade80','#ff5c5c','#a3e635','#c084fc','#f472b6','#38bdf8','#fbbf24','#fb7185'];
function memberColor(idx, alpha) {
  const hex = MEMBER_PALETTE[idx % MEMBER_PALETTE.length];
  if (alpha === undefined) return hex;
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function renderChart(canvasId, factory) {
  const canvas = el(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  charts[canvasId] = factory();
}

function destroyCharts() {
  Object.values(charts).forEach((c) => { try { c.destroy(); } catch (_) {} });
  charts = {};
}

// ─── Attendance grid ────────────────────────────────────────────────────

function renderAttendanceGrid() {
  const table = el('attendanceTable');
  const members = DATA.members || [];
  const dates = DATA.dateRange || [];

  const head = `<thead><tr>
    <th>Name</th>
    ${dates.map((d) => `<th>${fmtDate(d)}</th>`).join('')}
    <th>Days</th>
  </tr></thead>`;

  const body = `<tbody>` + members.map((m) => {
    const presentSet = new Set(m.datesPresent || []);
    const cells = dates.map((d) => {
      const present = presentSet.has(d);
      return `<td class="day-cell ${present ? 'present' : 'absent'}"></td>`;
    }).join('');
    return `<tr>
      <td class="name-cell" data-name="${escapeHtml(m.name)}">${escapeHtml(m.name)}</td>
      ${cells}
      <td><strong>${m.daysPresent}</strong></td>
    </tr>`;
  }).join('') + `</tbody>`;

  const foot = `<tfoot><tr>
    <td>Reports / day</td>
    ${dates.map((d) => {
      const count = members.filter((m) => (m.datesPresent || []).includes(d)).length;
      return `<td>${count}</td>`;
    }).join('')}
    <td>${members.reduce((s, m) => s + m.daysPresent, 0)}</td>
  </tr></tfoot>`;

  table.innerHTML = head + body + foot;
  table.querySelectorAll('.name-cell').forEach((cell) => {
    cell.addEventListener('click', () => openPersonModal(cell.dataset.name));
  });
}

// ─── Daily reports section ──────────────────────────────────────────────

let reportSearchCache = new Map();

function renderReportsSection() {
  const reports = DATA.reports || [];
  const people = [...new Set(reports.map((r) => r.tester))].sort();
  const dates = [...new Set(reports.map((r) => r.date))].sort().reverse();

  const personSel = el('reportFilterPerson');
  const dateSel = el('reportFilterDate');
  personSel.innerHTML = '<option value="">All people</option>' +
    people.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
  dateSel.innerHTML = '<option value="">All dates</option>' +
    dates.map((d) => `<option value="${d}">${fmtDate(d)}</option>`).join('');

  if (!reportSearchCache.size) {
    Promise.all(
      reports.map(async (r) => {
        try {
          const res = await fetch(r.path);
          const text = await res.text();
          reportSearchCache.set(r.path, text);
        } catch (_) { reportSearchCache.set(r.path, ''); }
      })
    ).then(() => renderReportsTable());
  }

  personSel.onchange = renderReportsTable;
  dateSel.onchange = renderReportsTable;
  el('reportSearch').oninput = renderReportsTable;
  renderReportsTable();
}

function renderReportsTable() {
  const reports = DATA.reports || [];
  const personFilter = el('reportFilterPerson').value;
  const dateFilter = el('reportFilterDate').value;
  const searchQuery = el('reportSearch').value.trim().toLowerCase();

  let filtered = reports.filter((r) => {
    if (personFilter && r.tester !== personFilter) return false;
    if (dateFilter && r.date !== dateFilter) return false;
    if (searchQuery) {
      const content = reportSearchCache.get(r.path) || '';
      const haystack = (r.tester + ' ' + r.date + ' ' + r.filename + ' ' + content).toLowerCase();
      if (!haystack.includes(searchQuery)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => b.date.localeCompare(a.date) || a.tester.localeCompare(b.tester));

  const table = el('reportsTable');
  if (filtered.length === 0) {
    table.innerHTML = '<tbody><tr><td class="reports-empty">No reports match your filter.</td></tr></tbody>';
  } else {
    table.innerHTML = `
      <thead><tr>
        <th>Date</th><th>Tester</th><th>Report</th><th>Topics</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${filtered.map((r) => `
          <tr>
            <td class="date-cell">${fmtDate(r.date)}</td>
            <td class="name-cell">${escapeHtml(r.tester)}</td>
            <td class="report-name" title="${escapeHtml(r.filename)}">${escapeHtml(r.filename)}</td>
            <td class="topics-cell">${(r.features || []).length}</td>
            <td class="actions-cell">
              <button class="btn btn-small btn-secondary" data-action="view" data-path="${escapeHtml(r.path)}" data-filename="${escapeHtml(r.filename)}" data-tester="${escapeHtml(r.tester)}" data-date="${r.date}">👁 View</button>
              <a class="btn btn-small btn-primary" href="${escapeHtml(r.path)}" download="${escapeHtml(r.filename)}">⬇ .md</a>
            </td>
          </tr>
        `).join('')}
      </tbody>
    `;
    table.querySelectorAll('[data-action="view"]').forEach((btn) => {
      btn.addEventListener('click', () => openReportModal({
        path: btn.dataset.path, filename: btn.dataset.filename,
        tester: btn.dataset.tester, date: btn.dataset.date,
      }));
    });
  }
  el('reportsCount').textContent = `${filtered.length} of ${reports.length} reports`;
}

// ─── Report viewer modal ───────────────────────────────────────────────

let currentReport = null;

async function openReportModal(report) {
  currentReport = report;
  el('reportModalTitle').textContent = report.filename;
  el('reportModalMeta').textContent = `${report.tester} · ${fmtDate(report.date)}`;
  el('reportViewer').textContent = 'Loading…';
  el('reportModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  try {
    let text = reportSearchCache.get(report.path);
    if (text === undefined) {
      const res = await fetch(report.path);
      text = await res.text();
      reportSearchCache.set(report.path, text);
    }
    el('reportViewer').textContent = text;
  } catch (err) {
    el('reportViewer').textContent = `Error loading report: ${err.message}`;
  }
}

function closeReportModal() {
  el('reportModal').classList.add('hidden');
  document.body.style.overflow = '';
  currentReport = null;
}

function downloadCurrentReport() {
  if (!currentReport) return;
  const a = document.createElement('a');
  a.href = currentReport.path;
  a.download = currentReport.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─── Person detail modal ────────────────────────────────────────────────

function openPersonModal(name) {
  const member = (DATA.members || []).find((m) => m.name === name);
  if (!member) return;
  const rank = (DATA.members || []).findIndex((m) => m.name === name) + 1;
  const features = member.featuresCovered || [];
  const methods = member.methodsUsed || [];
  const depth = member.depthSignals || [];

  el('modalAvatar').textContent = member.initials || '??';
  el('modalName').textContent = member.name;
  el('modalRank').textContent = `Rank #${rank} · Score ${member.score}`;

  el('modalStats').innerHTML = [
    { v: member.score, l: 'Score' },
    { v: features.length, l: 'Topics' },
    { v: methods.length, l: 'Methods' },
    { v: depth.length, l: 'Depth Signals' },
    { v: member.daysPresent, l: 'Days Present' },
    { v: member.totalBugs, l: 'Findings' },
  ].map((s) => `
    <div class="modal-stat">
      <div class="modal-stat-value">${s.v}</div>
      <div class="modal-stat-label">${s.l}</div>
    </div>
  `).join('');

  // Topics covered
  el('modalTopics').innerHTML = features.length
    ? features.map((f) => `<span class="tag tag-feature">${escapeHtml(f)}</span>`).join('')
    : '<span class="tag tag-more">None detected</span>';

  // Methods used
  el('modalMethods').innerHTML = methods.length
    ? methods.map((m) => `<span class="tag tag-method">${escapeHtml(m)}</span>`).join('')
    : '<span class="tag tag-more">None detected</span>';

  // Depth signals
  el('modalDepth').innerHTML = depth.length
    ? depth.map((d) => `<span class="tag tag-depth">✓ ${escapeHtml(d)}</span>`).join('')
    : '<span class="tag tag-more">None detected</span>';

  // Daily log table
  const log = member.dailyLog || [];
  if (log.length === 0) {
    el('modalTable').innerHTML = `<tr><td colspan="5" style="color:var(--text-dim)">No daily logs.</td></tr>`;
  } else {
    el('modalTable').innerHTML = `
      <thead><tr>
        <th>Date</th><th>Topics</th><th>Methods</th><th>Depth</th><th>Findings</th>
      </tr></thead>
      <tbody>
        ${log.map((e) => `
          <tr>
            <td class="date-cell">${fmtDate(e.date)}</td>
            <td>${(e.features || []).length}</td>
            <td>${(e.methods || []).length}</td>
            <td>${(e.depthSignals || []).length}</td>
            <td><strong>${e.bugsFound}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    `;
  }

  el('modalDates').innerHTML = (member.datesPresent || [])
    .map((d) => `<span class="date-chip">${fmtDate(d)}</span>`)
    .join('') || '<span class="date-chip">None</span>';

  el('personModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closePersonModal() {
  el('personModal').classList.add('hidden');
  document.body.style.overflow = '';
}

// ─── CSV export ─────────────────────────────────────────────────────────

function downloadCsv() {
  if (!DATA) return;
  const members = DATA.members || [];
  const dates = DATA.dateRange || [];
  const w = DATA.weights || {};

  const header = [
    'Rank', 'Name', 'Days Present', 'Topics Covered',
    'Methods Used', 'Depth Signals', 'Findings', 'Score',
  ];
  const rows = members.map((m, i) => [
    i + 1, m.name, m.daysPresent,
    (m.featuresCovered || []).length,
    (m.methodsUsed || []).length,
    (m.depthSignals || []).length,
    m.totalBugs, m.score,
  ]);

  // Per-member detail rows
  const detailRows = [[], ['Detailed Breakdown'], ['Name', 'Topics Covered', 'Methods Used', 'Depth Signals']];
  members.forEach((m) => {
    detailRows.push([m.name, (m.featuresCovered || []).join('; '), (m.methodsUsed || []).join('; '), (m.depthSignals || []).join('; ')]);
  });

  const meta = [
    [],
    ['Team Lead', DATA.teamAdmin || ''],
    ['Generated At', DATA.generatedAt || ''],
    ['Date Range', dates.length ? `${dates[0]} to ${dates[dates.length - 1]}` : ''],
    [],
    ['Scoring Weights (topic coverage + depth, not bug count)'],
    ['Days Present', w.daysPresent ?? 5],
    ['Per Feature/Topic', w.perFeature ?? 12],
    ['Per Method', w.perMethod ?? 8],
    ['Per Depth Signal', w.perDepthSignal ?? 6],
  ];

  const csv = [header, ...rows, ...detailRows, ...meta]
    .map((r) => r.map(csvCell).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `qa-team-performance-${(DATA.generatedAt || '').slice(0, 10) || 'report'}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvCell(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ─── Global actions ─────────────────────────────────────────────────────

function bindGlobalActions() {
  el('downloadCsvBtn').addEventListener('click', downloadCsv);
  el('printBtn').addEventListener('click', () => window.print());
  el('modalClose').addEventListener('click', closePersonModal);
  el('modalBackdrop').addEventListener('click', closePersonModal);
  el('reportModalClose').addEventListener('click', closeReportModal);
  el('reportModalBackdrop').addEventListener('click', closeReportModal);
  el('reportModalDownload').addEventListener('click', downloadCurrentReport);
  el('themeToggle').addEventListener('click', toggleTheme);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePersonModal(); closeReportModal(); }
  });
}

// Initialise theme before DOMContentLoaded to avoid flash of wrong theme
initTheme();

document.addEventListener('DOMContentLoaded', loadData);
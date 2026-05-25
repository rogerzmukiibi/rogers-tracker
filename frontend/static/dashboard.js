import {
  api, formatUGX, initMonthSelector, setActiveNav, ready, toast, spinner, empty
} from './app.js';

const CHART_COLORS = [
  '#1A7A5A','#C0392B','#1A4A8A','#9A6200','#5A2D8A',
  '#2E7D9A','#7A4A1A','#3D7A2A','#8A1A5A','#4A4A8A',
  '#9A4A2A','#1A6A6A','#6A2A7A','#5A7A1A','#7A1A3A',
  '#2A5A7A',
];

let expenseChart = null;
let incomeChart  = null;

ready(async () => {
  setActiveNav();
  const ms = initMonthSelector('month-selector', (y, m) => loadDashboard(y, m));
  await loadDashboard(ms.getYear(), ms.getMonth());
});

async function loadDashboard(year, month) {
  document.getElementById('summary-cards').innerHTML = spinner();
  document.getElementById('tables-section').innerHTML = '';

  try {
    const data = await api(`/dashboard?year=${year}&month=${month}`);
    renderCards(data);
    renderCharts(data);
    renderTables(data);
  } catch (err) {
    toast('Failed to load: ' + err.message, 'error');
  }
}

// ── Summary cards ───────────────────────────────────────────────────
function renderCards(data) {
  const t = data.totals;
  const net = t.net;

  const cards = [
    {
      label: 'Total Expenses',
      value: formatUGX(t.expenses.actual),
      sub: t.expenses.planned
        ? `Planned ${formatUGX(t.expenses.planned)}`
        : 'No budget set',
      negative: true,
    },
    {
      label: 'Total Income',
      value: formatUGX(t.income.actual),
      sub: t.income.planned
        ? `Planned ${formatUGX(t.income.planned)}`
        : null,
      positive: t.income.actual > 0,
    },
    {
      label: 'Net Cash Flow',
      value: formatUGX(net),
      sub: net < 0 ? 'Deficit' : 'Surplus',
      negative: net < 0,
      positive: net >= 0,
    },
    {
      label: 'Liquid Assets',
      value: formatUGX(t.liquid_assets),
      sub: 'Cash + Mobile Money',
    },
    {
      label: 'Financial Assets',
      value: formatUGX(t.financial_assets),
      sub: 'Savings & Investments',
    },
  ];

  document.getElementById('summary-cards').innerHTML = cards.map(c => `
    <div class="card">
      <div class="card-label">${c.label}</div>
      <div class="card-value ${c.negative ? 'negative' : ''} ${c.positive ? 'positive' : ''}">
        ${c.value}
      </div>
      ${c.sub ? `<div class="card-sub">${c.sub}</div>` : ''}
    </div>
  `).join('');
}

// ── Charts ──────────────────────────────────────────────────────────
function renderCharts(data) {
  // Expenses — exclude zero-value and Fees for chart
  const expRows = data.expenses
    .filter(e => e.actual > 0 && e.category !== 'Fees');
  // Income
  const incRows = data.income.filter(i => i.actual > 0);

  const chartDefaults = {
    type: 'doughnut',
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: "'IBM Plex Mono', monospace", size: 10 },
            padding: 10,
            boxWidth: 10,
            color: '#7A7770',
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const val = ctx.parsed;
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? Math.round(val / total * 100) : 0;
              return ` ${formatUGX(val)} (${pct}%)`;
            },
          },
        },
      },
    },
  };

  // Destroy old charts
  if (expenseChart) expenseChart.destroy();
  if (incomeChart)  incomeChart.destroy();

  if (expRows.length === 0) {
    document.getElementById('chart-expenses').parentElement.innerHTML =
      empty('No expenses this month');
  } else {
    expenseChart = new Chart(document.getElementById('chart-expenses'), {
      ...chartDefaults,
      data: {
        labels:   expRows.map(e => e.category),
        datasets: [{
          data:            expRows.map(e => e.actual),
          backgroundColor: CHART_COLORS.slice(0, expRows.length),
          borderWidth:     2,
          borderColor:     '#FFFFFF',
        }],
      },
    });
  }

  if (incRows.length === 0) {
    document.getElementById('chart-income').parentElement.innerHTML =
      empty('No income this month');
  } else {
    incomeChart = new Chart(document.getElementById('chart-income'), {
      ...chartDefaults,
      data: {
        labels:   incRows.map(i => i.source),
        datasets: [{
          data:            incRows.map(i => i.actual),
          backgroundColor: CHART_COLORS.slice(0, incRows.length),
          borderWidth:     2,
          borderColor:     '#FFFFFF',
        }],
      },
    });
  }
}

// ── Tables ──────────────────────────────────────────────────────────
function renderTables(data) {
  const section = document.getElementById('tables-section');

  section.innerHTML = `
    ${expenseTable(data.expenses)}
    ${incomeTable(data.income)}
    ${accountsTable(data.accounts)}
  `;
}

function expenseTable(rows) {
  const total = rows.reduce((s, r) => s + r.actual, 0);
  const tPlanned = rows.reduce((s, r) => s + r.planned, 0);

  return `
  <div class="table-wrap" style="margin-bottom:1.25rem">
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th class="right">Planned</th>
          <th class="right">Actual</th>
          <th class="right">Diff</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
        <tr>
          <td>${r.category}</td>
          <td class="right mono">${r.planned ? formatUGX(r.planned) : '—'}</td>
          <td class="right mono">${r.actual ? formatUGX(r.actual) : '—'}</td>
          <td class="right ${r.diff < 0 ? 'negative' : r.diff > 0 ? 'positive' : 'muted'}">
            ${r.actual === 0 && r.planned === 0 ? '—' : formatUGX(r.diff)}
          </td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td class="right">${formatUGX(tPlanned)}</td>
          <td class="right">${formatUGX(total)}</td>
          <td class="right ${(tPlanned - total) < 0 ? 'negative' : ''}">
            ${formatUGX(tPlanned - total)}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>`;
}

function incomeTable(rows) {
  const total   = rows.reduce((s, r) => s + r.actual, 0);
  const tPlanned = rows.reduce((s, r) => s + r.planned, 0);

  return `
  <div class="table-wrap" style="margin-bottom:1.25rem">
    <table>
      <thead>
        <tr>
          <th>Source</th>
          <th class="right">Planned</th>
          <th class="right">Actual</th>
          <th class="right">Diff</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
        <tr>
          <td>${r.source}</td>
          <td class="right mono">${r.planned ? formatUGX(r.planned) : '—'}</td>
          <td class="right mono">${r.actual ? formatUGX(r.actual) : '—'}</td>
          <td class="right ${r.diff > 0 ? 'positive' : r.diff < 0 ? 'negative' : 'muted'}">
            ${r.actual === 0 && r.planned === 0 ? '—' : formatUGX(r.diff)}
          </td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td class="right">${formatUGX(tPlanned)}</td>
          <td class="right">${formatUGX(total)}</td>
          <td class="right ${(total - tPlanned) < 0 ? 'negative' : 'positive'}">
            ${formatUGX(total - tPlanned)}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>`;
}

function accountsTable(accounts) {
  const groups = [
    { label: 'Liquid Accounts',    type: 'liquid'    },
    { label: 'Financial Assets',   type: 'financial' },
    { label: 'Credit / Debt',      type: 'credit'    },
  ];

  let rows = '';
  for (const g of groups) {
    const accs = accounts.filter(a => a.type === g.type);
    if (accs.length === 0) continue;
    rows += `<tr class="group-header"><td colspan="5">${g.label}</td></tr>`;
    rows += accs.map(a => `
      <tr>
        <td>${a.account}</td>
        <td class="right mono muted">${formatUGX(a.rollover)}</td>
        <td class="right mono positive">${a.earned ? formatUGX(a.earned) : '—'}</td>
        <td class="right mono negative">${a.spent  ? formatUGX(a.spent)  : '—'}</td>
        <td class="right mono ${a.current < 0 ? 'negative' : ''}">${formatUGX(a.current)}</td>
      </tr>`).join('');
  }

  return `
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Account</th>
          <th class="right">Rollover</th>
          <th class="right">Earned</th>
          <th class="right">Spent</th>
          <th class="right">Current</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

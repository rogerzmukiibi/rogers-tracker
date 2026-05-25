import { api, formatUGX, setActiveNav, ready, toast, spinner } from './app.js';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun',
                'Jul','Aug','Sep','Oct','Nov','Dec'];

let netChart = null;
let currentYear = new Date().getFullYear();

ready(() => {
  setActiveNav();

  document.getElementById('year-prev').addEventListener('click', () => {
    currentYear--;
    loadSummary(currentYear);
  });
  document.getElementById('year-next').addEventListener('click', () => {
    currentYear++;
    loadSummary(currentYear);
  });

  loadSummary(currentYear);
});

async function loadSummary(year) {
  document.getElementById('year-label').textContent = String(year);
  document.getElementById('summary-content').innerHTML = spinner();

  try {
    const data = await api(`/summary/year?year=${year}`);
    renderNetChart(data);
    renderSummaryTables(data);
  } catch (err) {
    toast('Failed to load: ' + err.message, 'error');
  }
}

function renderNetChart(data) {
  if (netChart) netChart.destroy();

  const net = data.monthly_net;
  const colors = net.map(v => v >= 0 ? '#1A7A5A' : '#C0392B');

  netChart = new Chart(document.getElementById('chart-net'), {
    type: 'bar',
    data: {
      labels: MONTHS,
      datasets: [{
        label: 'Net',
        data: net,
        backgroundColor: colors,
        borderRadius: 3,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ' ' + formatUGX(ctx.parsed.y) },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: "'IBM Plex Mono', monospace", size: 10 }, color: '#7A7770' },
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.06)' },
          ticks: {
            font: { family: "'IBM Plex Mono', monospace", size: 10 },
            color: '#7A7770',
            callback: v => formatUGX(v),
          },
        },
      },
    },
  });
}

function renderSummaryTables(data) {
  const section = document.getElementById('summary-content');

  section.innerHTML = `
    ${buildTable('Expenses', data.expenses, true)}
    ${buildTable('Income',   data.income,   false)}
    ${buildAccountsTable(data.accounts)}
  `;
}

function buildTable(title, rowData, isExpense) {
  const names = Object.keys(rowData);
  const yearlyTotals = MONTHS.map((_, mi) =>
    names.reduce((s, n) => s + (rowData[n][mi] || 0), 0)
  );
  const grandTotal = yearlyTotals.reduce((s, v) => s + v, 0);

  const headerCols = MONTHS.map(m => `<th class="right month-col">${m}</th>`).join('');
  const rows = names.map(name => {
    const vals = rowData[name];
    const yearly = vals.reduce((s, v) => s + v, 0);
    if (yearly === 0) return ''; // skip empty rows
    const pct = grandTotal > 0 ? Math.round(yearly / grandTotal * 100) : 0;
    const cells = vals.map(v =>
      v === 0
        ? `<td class="month-col zero">—</td>`
        : `<td class="month-col">${formatUGX(v)}</td>`
    ).join('');
    return `
      <tr>
        <td style="white-space:nowrap">${name}</td>
        ${cells}
        <td class="right mono" style="font-weight:600">${formatUGX(yearly)}</td>
        <td class="right muted" style="font-family:var(--font-mono);font-size:0.72rem">${pct}%</td>
      </tr>`;
  }).join('');

  const footCells = yearlyTotals.map(v =>
    v === 0
      ? `<td class="right" style="color:var(--text-light)">—</td>`
      : `<td class="right">${formatUGX(v)}</td>`
  ).join('');

  return `
  <div class="table-wrap" style="margin-bottom:1.25rem;overflow-x:auto">
    <div class="section-label">${title}</div>
    <table class="summary-table">
      <thead>
        <tr>
          <th>Category</th>
          ${headerCols}
          <th class="right">Total</th>
          <th class="right">%</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="15" class="empty" style="text-align:center;padding:1.5rem;color:var(--text-light)">No data</td></tr>'}</tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          ${footCells}
          <td class="right">${formatUGX(grandTotal)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </div>`;
}

function buildAccountsTable(accountData) {
  const names = Object.keys(accountData);
  if (names.length === 0) return '';

  const headerCols = MONTHS.map(m => `<th class="right month-col">${m}</th>`).join('');
  const rows = names.map(name => {
    const { balances, type } = accountData[name];
    const current = balances[balances.length - 1];
    const cells = balances.map(v => {
      const cls = v < 0 ? 'negative' : v === 0 ? 'zero' : '';
      return `<td class="month-col ${cls}">${v === 0 ? '—' : formatUGX(v)}</td>`;
    }).join('');
    return `
      <tr>
        <td style="white-space:nowrap">${name}</td>
        ${cells}
        <td class="right mono ${current < 0 ? 'negative' : ''}">${formatUGX(current)}</td>
        <td class="right muted" style="font-size:0.72rem">${type}</td>
      </tr>`;
  }).join('');

  return `
  <div class="table-wrap" style="overflow-x:auto">
    <div class="section-label">Account Balances</div>
    <table class="summary-table">
      <thead>
        <tr>
          <th>Account</th>
          ${headerCols}
          <th class="right">Dec</th>
          <th class="right">Type</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

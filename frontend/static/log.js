import {
  api, apiPut, apiDelete, formatUGX, initMonthSelector,
  setActiveNav, ready, toast, spinner, empty
} from './app.js';

let allTx = [];
let accounts = [], categories = [], sources = [];
let currentYear, currentMonth;

ready(async () => {
  setActiveNav();

  [accounts, categories, sources] = await Promise.all([
    api('/accounts'),
    api('/categories'),
    api('/sources'),
  ]);

  // Populate filter selects
  const accSel  = document.getElementById('filter-account');
  const catSel  = document.getElementById('filter-category');
  accounts.forEach(a => accSel.insertAdjacentHTML('beforeend',
    `<option value="${a.id}">${a.name}</option>`));
  categories.filter(c => c.name !== 'Fees').forEach(c =>
    catSel.insertAdjacentHTML('beforeend',
      `<option value="${c.id}">${c.name}</option>`));

  // Filters trigger re-render (no re-fetch)
  ['filter-type','filter-account','filter-category'].forEach(id =>
    document.getElementById(id).addEventListener('change', renderTable));
  document.getElementById('filter-search').addEventListener('input', renderTable);

  // Month selector
  const ms = initMonthSelector('month-selector', (y, m) => loadLog(y, m));
  currentYear  = ms.getYear();
  currentMonth = ms.getMonth();
  await loadLog(currentYear, currentMonth);

  // Modal close
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('edit-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('edit-modal')) closeModal();
  });
});

async function loadLog(year, month) {
  currentYear  = year;
  currentMonth = month;
  document.getElementById('log-table').innerHTML = spinner();
  document.getElementById('log-totals').innerHTML = '';

  try {
    allTx = await api(`/log?year=${year}&month=${month}`);
    renderTable();
  } catch (err) {
    toast('Failed to load: ' + err.message, 'error');
  }
}

function getFilters() {
  return {
    search:   document.getElementById('filter-search').value.trim().toLowerCase(),
    type:     document.getElementById('filter-type').value,
    account:  parseInt(document.getElementById('filter-account').value) || null,
    category: parseInt(document.getElementById('filter-category').value) || null,
  };
}

function applyFilters(tx) {
  const f = getFilters();
  return tx.filter(t => {
    if (f.search) {
      const haystack = [
        t.description, t.category, t.source,
        t.account, t.from_account, t.to_account,
      ].map(s => (s || '').toLowerCase()).join(' ');
      if (!haystack.includes(f.search)) return false;
    }
    if (f.type && t.type !== f.type) return false;
    if (f.account) {
      if (t.type === 'transfer') {
        if (t.from_account_id !== f.account && t.to_account_id !== f.account) return false;
      } else {
        if (t.account_id !== f.account) return false;
      }
    }
    if (f.category && t.type === 'expense' && t.category_id !== f.category) return false;
    return true;
  });
}

function renderTable() {
  const filtered = applyFilters(allTx);

  // Totals bar
  const totalIncome   = filtered.filter(t => t.type === 'income').reduce((s,t) => s+t.amount, 0);
  const totalExpenses = filtered.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0);
  const totalFees     = filtered.filter(t => t.type === 'transfer').reduce((s,t) => s+t.fees, 0);
  document.getElementById('log-totals').innerHTML = `
    <div style="display:flex;gap:1rem;flex-wrap:wrap;font-size:0.78rem;color:var(--text-muted);font-family:var(--font-mono)">
      <span>${filtered.length} transaction${filtered.length !== 1 ? 's' : ''}</span>
      ${totalIncome   ? `<span style="color:var(--green)">+${formatUGX(totalIncome)}</span>` : ''}
      ${totalExpenses ? `<span style="color:var(--red)">-${formatUGX(totalExpenses)}</span>` : ''}
      ${totalFees     ? `<span>Fees: ${formatUGX(totalFees)}</span>` : ''}
    </div>`;

  if (filtered.length === 0) {
    document.getElementById('log-table').innerHTML = empty('No transactions match the filters');
    return;
  }

  const rows = filtered.map(t => {
    let desc = t.description || '';
    let sub  = '';
    let amountStr = '';
    let badge = `<span class="badge badge-${t.type}">${t.type}</span>`;

    if (t.type === 'expense') {
      sub = `${t.category} · ${t.account}`;
      amountStr = `<span style="color:var(--red);font-family:var(--font-mono);font-size:0.8rem">-${formatUGX(t.amount)}</span>`;
    } else if (t.type === 'income') {
      sub = `${t.source} → ${t.account}`;
      amountStr = `<span style="color:var(--green);font-family:var(--font-mono);font-size:0.8rem">+${formatUGX(t.amount)}</span>`;
    } else {
      sub = `${t.from_account} → ${t.to_account}`;
      amountStr = `<span style="font-family:var(--font-mono);font-size:0.8rem">${formatUGX(t.amount)}</span>`;
      if (t.fees) sub += ` · Fee: ${formatUGX(t.fees)}`;
    }

    return `
    <tr>
      <td class="muted" style="white-space:nowrap;font-size:0.75rem;font-family:var(--font-mono)">${t.date}</td>
      <td>${badge}</td>
      <td>
        <div style="font-size:0.83rem">${desc || '<span style="color:var(--text-light)">—</span>'}</div>
        <div style="font-size:0.72rem;color:var(--text-muted)">${sub}</div>
      </td>
      <td class="right">${amountStr}</td>
      <td class="right">
        <button class="btn btn-ghost btn-sm" data-edit="${t.type}:${t.id}">Edit</button>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('log-table').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Description</th>
            <th class="right">Amount</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  // Edit buttons
  document.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [type, id] = btn.dataset.edit.split(':');
      const tx = allTx.find(t => t.type === type && t.id === parseInt(id));
      if (tx) openEditModal(tx);
    });
  });
}

// ── Edit modal ───────────────────────────────────────────────────────
function openEditModal(tx) {
  document.getElementById('modal-title').textContent =
    `Edit ${tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}`;
  document.getElementById('modal-body').innerHTML = buildEditForm(tx);
  document.getElementById('edit-modal').classList.add('open');

  document.getElementById('modal-save').addEventListener('click', () => saveEdit(tx));
  document.getElementById('modal-delete').addEventListener('click', () => confirmDelete(tx));
}

function buildEditForm(tx) {
  const accOptions = accounts.map(a =>
    `<option value="${a.id}" ${a.id === tx.account_id ? 'selected' : ''}>${a.name}</option>`
  ).join('');
  const catOptions = categories.filter(c => c.name !== 'Fees').map(c =>
    `<option value="${c.id}" ${c.id === tx.category_id ? 'selected' : ''}>${c.name}</option>`
  ).join('');
  const srcOptions = sources.map(s =>
    `<option value="${s.id}" ${s.id === tx.source_id ? 'selected' : ''}>${s.name}</option>`
  ).join('');
  const fromOptions = accounts.map(a =>
    `<option value="${a.id}" ${a.id === tx.from_account_id ? 'selected' : ''}>${a.name}</option>`
  ).join('');
  const toOptions = accounts.map(a =>
    `<option value="${a.id}" ${a.id === tx.to_account_id ? 'selected' : ''}>${a.name}</option>`
  ).join('');

  let fields = `
    <div class="form-row">
      <div class="form-group">
        <label>Date</label>
        <input type="date" id="edit-date" value="${tx.date}">
      </div>
      <div class="form-group">
        <label>Amount (UGX)</label>
        <input type="number" id="edit-amount" class="amount-input" value="${tx.amount}" min="1">
      </div>
    </div>
    <div class="form-group">
      <label>Description</label>
      <input type="text" id="edit-desc" value="${tx.description || ''}">
    </div>`;

  if (tx.type === 'expense') {
    fields += `
    <div class="form-row">
      <div class="form-group"><label>Category</label><select id="edit-cat">${catOptions}</select></div>
      <div class="form-group"><label>Account</label><select id="edit-acc">${accOptions}</select></div>
    </div>`;
  } else if (tx.type === 'income') {
    fields += `
    <div class="form-row">
      <div class="form-group"><label>Source</label><select id="edit-src">${srcOptions}</select></div>
      <div class="form-group"><label>Account</label><select id="edit-acc">${accOptions}</select></div>
    </div>`;
  } else {
    fields += `
    <div class="form-row">
      <div class="form-group"><label>From</label><select id="edit-from">${fromOptions}</select></div>
      <div class="form-group"><label>To</label><select id="edit-to">${toOptions}</select></div>
    </div>
    <div class="form-group">
      <label>Fees (UGX)</label>
      <input type="number" id="edit-fees" value="${tx.fees || 0}" min="0">
    </div>`;
  }

  fields += `
    <div style="margin-top:1.25rem;display:flex;gap:0.5rem">
      <button class="btn btn-primary" id="modal-save" style="flex:1">Save Changes</button>
      <button class="btn btn-danger" id="modal-delete">Delete</button>
    </div>`;

  return fields;
}

async function saveEdit(tx) {
  const body = {
    date:        document.getElementById('edit-date').value,
    amount:      parseInt(document.getElementById('edit-amount').value, 10),
    description: document.getElementById('edit-desc').value.trim() || null,
  };

  if (tx.type === 'expense') {
    body.category_id = parseInt(document.getElementById('edit-cat').value, 10);
    body.account_id  = parseInt(document.getElementById('edit-acc').value, 10);
  } else if (tx.type === 'income') {
    body.source_id  = parseInt(document.getElementById('edit-src').value, 10);
    body.account_id = parseInt(document.getElementById('edit-acc').value, 10);
  } else {
    body.from_account_id = parseInt(document.getElementById('edit-from').value, 10);
    body.to_account_id   = parseInt(document.getElementById('edit-to').value, 10);
    body.fees            = parseInt(document.getElementById('edit-fees').value, 10) || 0;
  }

  try {
    await apiPut(`/${tx.type}s/${tx.id}`, body);
    toast('Saved ✓');
    closeModal();
    await loadLog(currentYear, currentMonth);
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

function confirmDelete(tx) {
  document.getElementById('modal-body').innerHTML = `
    <p style="margin-bottom:1.25rem;font-size:0.85rem;color:var(--text-muted)">
      Delete this ${tx.type}? This cannot be undone.
    </p>
    <div class="confirm-row">
      <button class="btn btn-ghost btn-sm" id="cancel-delete">Cancel</button>
      <button class="btn btn-danger" id="confirm-delete">Delete</button>
    </div>`;

  document.getElementById('cancel-delete').addEventListener('click', closeModal);
  document.getElementById('confirm-delete').addEventListener('click', async () => {
    try {
      await apiDelete(`/${tx.type}s/${tx.id}`);
      toast('Deleted');
      closeModal();
      await loadLog(currentYear, currentMonth);
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    }
  });
}

function closeModal() {
  document.getElementById('edit-modal').classList.remove('open');
}

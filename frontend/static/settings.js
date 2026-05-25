import { api, apiPost, apiPut, apiDelete, toast, setActiveNav, ready, initMonthSelector, getYM, formatUGX } from './app.js';

// ── Constants ─────────────────────────────────────────────────────────────
// Categories and accounts that ship with the app and have special handling
const PROTECTED_CATEGORIES = ['Fees'];

ready(async () => {
  setActiveNav();
  await Promise.all([loadAccounts(), loadCategories(), loadSources()]);
  bindAddButtons();
  initBudgetSection();
});

// ── Shared helpers ────────────────────────────────────────────────────────

function typeBadge(type) {
  return `<span class="type-badge type-${type}">${type}</span>`;
}

function editBtn(id) {
  return `<button class="btn btn-ghost btn-sm" data-action="edit" data-id="${id}">Edit</button>`;
}

function deleteBtn(id) {
  return `<button class="btn btn-danger btn-sm" data-action="delete" data-id="${id}">✕</button>`;
}

// ── ACCOUNTS ──────────────────────────────────────────────────────────────

async function loadAccounts() {
  const accounts = await api('/accounts');
  renderAccounts(accounts);
}

function renderAccounts(accounts) {
  const list = document.getElementById('accounts-list');
  if (!accounts.length) {
    list.innerHTML = '<li style="color:var(--text-muted);font-size:0.82rem">No accounts yet</li>';
    return;
  }
  list.innerHTML = accounts.map(a => `
    <li data-id="${a.id}" data-type="account">
      <span class="item-name">${a.name}</span>
      ${typeBadge(a.type)}
      <span class="item-meta">#${a.sort_order}</span>
      <div class="item-actions">
        ${editBtn(a.id)}
        ${deleteBtn(a.id)}
      </div>
    </li>`).join('');
  bindListActions(list, 'account', accounts);
}

function buildAccountEditRow(a) {
  return `
    <input type="text"   class="edit-name"  value="${a.name}" style="flex:1;min-width:100px">
    <select class="edit-type">
      <option value="liquid"    ${a.type === 'liquid'    ? 'selected' : ''}>Liquid</option>
      <option value="financial" ${a.type === 'financial' ? 'selected' : ''}>Financial</option>
      <option value="credit"    ${a.type === 'credit'    ? 'selected' : ''}>Credit</option>
    </select>
    <input type="number" class="edit-order" value="${a.sort_order}" style="width:64px">
    <div class="item-actions">
      <button class="btn btn-primary btn-sm" data-action="save"   data-id="${a.id}">Save</button>
      <button class="btn btn-ghost  btn-sm" data-action="cancel" data-id="${a.id}">Cancel</button>
    </div>`;
}

async function saveAccount(id, li) {
  const name  = li.querySelector('.edit-name').value.trim();
  const type  = li.querySelector('.edit-type').value;
  const order = parseInt(li.querySelector('.edit-order').value, 10) || 99;
  if (!name) { toast('Name cannot be empty', 'error'); return; }
  try {
    await apiPut(`/accounts/${id}`, { name, type, sort_order: order });
    toast('Account updated ✓');
    await loadAccounts();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteAccount(id) {
  if (!confirm('Delete this account? This will fail if it has any transactions.')) return;
  try {
    await apiDelete(`/accounts/${id}`);
    toast('Account deleted');
    await loadAccounts();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── CATEGORIES ────────────────────────────────────────────────────────────

async function loadCategories() {
  const cats = await api('/categories');
  renderCategories(cats);
}

function renderCategories(cats) {
  const list = document.getElementById('categories-list');
  if (!cats.length) {
    list.innerHTML = '<li style="color:var(--text-muted);font-size:0.82rem">No categories yet</li>';
    return;
  }
  list.innerHTML = cats.map(c => {
    const isProtected = PROTECTED_CATEGORIES.includes(c.name);
    return `
      <li data-id="${c.id}" data-type="category">
        <span class="item-name">${c.name}</span>
        ${isProtected ? '<span class="protected-badge">auto</span>' : ''}
        <span class="item-meta">#${c.sort_order}</span>
        <div class="item-actions">
          ${!isProtected ? editBtn(c.id) : ''}
          ${!isProtected ? deleteBtn(c.id) : ''}
        </div>
      </li>`;
  }).join('');
  bindListActions(list, 'category', cats);
}

function buildCategoryEditRow(c) {
  return `
    <input type="text"   class="edit-name"  value="${c.name}" style="flex:1;min-width:120px">
    <input type="number" class="edit-order" value="${c.sort_order}" style="width:64px">
    <div class="item-actions">
      <button class="btn btn-primary btn-sm" data-action="save"   data-id="${c.id}">Save</button>
      <button class="btn btn-ghost  btn-sm" data-action="cancel" data-id="${c.id}">Cancel</button>
    </div>`;
}

async function saveCategory(id, li) {
  const name  = li.querySelector('.edit-name').value.trim();
  const order = parseInt(li.querySelector('.edit-order').value, 10) || 99;
  if (!name) { toast('Name cannot be empty', 'error'); return; }
  try {
    await apiPut(`/categories/${id}`, { name, sort_order: order });
    toast('Category updated ✓');
    await loadCategories();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteCategory(id) {
  if (!confirm('Delete this category? This will fail if any expenses use it.')) return;
  try {
    await apiDelete(`/categories/${id}`);
    toast('Category deleted');
    await loadCategories();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── SOURCES ───────────────────────────────────────────────────────────────

async function loadSources() {
  const srcs = await api('/sources');
  renderSources(srcs);
}

function renderSources(srcs) {
  const list = document.getElementById('sources-list');
  if (!srcs.length) {
    list.innerHTML = '<li style="color:var(--text-muted);font-size:0.82rem">No sources yet</li>';
    return;
  }
  list.innerHTML = srcs.map(s => `
    <li data-id="${s.id}" data-type="source">
      <span class="item-name">${s.name}</span>
      <span class="item-meta">#${s.sort_order}</span>
      <div class="item-actions">
        ${editBtn(s.id)}
        ${deleteBtn(s.id)}
      </div>
    </li>`).join('');
  bindListActions(list, 'source', srcs);
}

function buildSourceEditRow(s) {
  return `
    <input type="text"   class="edit-name"  value="${s.name}" style="flex:1;min-width:120px">
    <input type="number" class="edit-order" value="${s.sort_order}" style="width:64px">
    <div class="item-actions">
      <button class="btn btn-primary btn-sm" data-action="save"   data-id="${s.id}">Save</button>
      <button class="btn btn-ghost  btn-sm" data-action="cancel" data-id="${s.id}">Cancel</button>
    </div>`;
}

async function saveSource(id, li) {
  const name  = li.querySelector('.edit-name').value.trim();
  const order = parseInt(li.querySelector('.edit-order').value, 10) || 99;
  if (!name) { toast('Name cannot be empty', 'error'); return; }
  try {
    await apiPut(`/sources/${id}`, { name, sort_order: order });
    toast('Source updated ✓');
    await loadSources();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteSource(id) {
  if (!confirm('Delete this source? This will fail if any income records use it.')) return;
  try {
    await apiDelete(`/sources/${id}`);
    toast('Source deleted');
    await loadSources();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── Generic list action dispatcher ───────────────────────────────────────

function bindListActions(list, entityType, items) {
  list.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id     = parseInt(btn.dataset.id, 10);
    const li     = list.querySelector(`li[data-id="${id}"]`);
    const item   = items.find(i => i.id === id);

    if (action === 'edit') {
      // Collapse any other open edit rows first
      list.querySelectorAll('li.editing').forEach(row => {
        if (row !== li) row.classList.remove('editing');
      });
      li.classList.add('editing');
      const originalHTML = li.innerHTML;
      li.dataset.original = originalHTML;

      if (entityType === 'account')  li.innerHTML = buildAccountEditRow(item);
      if (entityType === 'category') li.innerHTML = buildCategoryEditRow(item);
      if (entityType === 'source')   li.innerHTML = buildSourceEditRow(item);

      li.querySelector('.edit-name')?.focus();
      li.querySelector('.edit-name')?.select();

      // Allow Save on Enter key
      li.querySelector('.edit-name')?.addEventListener('keydown', async ev => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          if (entityType === 'account')  await saveAccount(id, li);
          if (entityType === 'category') await saveCategory(id, li);
          if (entityType === 'source')   await saveSource(id, li);
        }
        if (ev.key === 'Escape') cancelEdit(li);
      });
    }

    if (action === 'save') {
      if (entityType === 'account')  await saveAccount(id, li);
      if (entityType === 'category') await saveCategory(id, li);
      if (entityType === 'source')   await saveSource(id, li);
    }

    if (action === 'cancel') cancelEdit(li);

    if (action === 'delete') {
      if (entityType === 'account')  await deleteAccount(id);
      if (entityType === 'category') await deleteCategory(id);
      if (entityType === 'source')   await deleteSource(id);
    }
  });
}

function cancelEdit(li) {
  if (li.dataset.original) {
    li.innerHTML = li.dataset.original;
    li.classList.remove('editing');
    delete li.dataset.original;
  }
}

// ── Add buttons ───────────────────────────────────────────────────────────

function bindAddButtons() {
  // Account
  document.getElementById('acc-add-btn').addEventListener('click', async () => {
    const name  = document.getElementById('acc-name').value.trim();
    const type  = document.getElementById('acc-type').value;
    const order = parseInt(document.getElementById('acc-order').value, 10) || 99;
    if (!name) { toast('Name is required', 'error'); return; }
    try {
      await apiPost('/accounts', { name, type, sort_order: order });
      toast(`Account "${name}" added ✓`);
      document.getElementById('acc-name').value  = '';
      document.getElementById('acc-order').value = '99';
      await loadAccounts();
    } catch (err) { toast(err.message, 'error'); }
  });

  document.getElementById('acc-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('acc-add-btn').click();
  });

  // Category
  document.getElementById('cat-add-btn').addEventListener('click', async () => {
    const name  = document.getElementById('cat-name').value.trim();
    const order = parseInt(document.getElementById('cat-order').value, 10) || 99;
    if (!name) { toast('Name is required', 'error'); return; }
    try {
      await apiPost('/categories', { name, sort_order: order });
      toast(`Category "${name}" added ✓`);
      document.getElementById('cat-name').value  = '';
      document.getElementById('cat-order').value = '99';
      await loadCategories();
    } catch (err) { toast(err.message, 'error'); }
  });

  document.getElementById('cat-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('cat-add-btn').click();
  });

  // Source
  document.getElementById('src-add-btn').addEventListener('click', async () => {
    const name  = document.getElementById('src-name').value.trim();
    const order = parseInt(document.getElementById('src-order').value, 10) || 99;
    if (!name) { toast('Name is required', 'error'); return; }
    try {
      await apiPost('/sources', { name, sort_order: order });
      toast(`Source "${name}" added ✓`);
      document.getElementById('src-name').value  = '';
      document.getElementById('src-order').value = '99';
      await loadSources();
    } catch (err) { toast(err.message, 'error'); }
  });

  document.getElementById('src-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('src-add-btn').click();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BUDGET & ROLLOVERS
// ═══════════════════════════════════════════════════════════════════════════


let budgetYear, budgetMonth;

function initBudgetSection() {
  const { year, month } = getYM();
  budgetYear  = year;
  budgetMonth = month;

  initMonthSelector('budget-month-selector', (y, m) => {
    budgetYear  = y;
    budgetMonth = m;
    loadBudgetAndRollovers();
  });

  document.getElementById('save-expense-budget').addEventListener('click', saveExpenseBudget);
  document.getElementById('save-income-budget').addEventListener('click', saveIncomeBudget);
  document.getElementById('save-rollovers').addEventListener('click',     saveRollovers);
  document.getElementById('carry-forward-btn').addEventListener('click',  carryForward);

  loadBudgetAndRollovers();
}

async function loadBudgetAndRollovers() {
  const [budget, rollovers] = await Promise.all([
    api(`/budget?year=${budgetYear}&month=${budgetMonth}`),
    api(`/rollovers?year=${budgetYear}&month=${budgetMonth}`),
  ]);
  renderExpenseBudget(budget.expenses);
  renderIncomeBudget(budget.income);
  renderRollovers(rollovers);
}

// ── Expense budget table ──────────────────────────────────────────────────
function renderExpenseBudget(rows) {
  document.getElementById('expense-budget-table').innerHTML = `
    <table class="budget-table">
      <thead>
        <tr><th>Category</th><th class="right">Planned (UGX)</th></tr>
      </thead>
      <tbody>
        ${rows.map(r => `
        <tr>
          <td>${r.category}</td>
          <td style="text-align:right">
            <input class="budget-input"
              type="number" min="0" step="1000"
              data-id="${r.category_id}"
              value="${r.planned}">
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

async function saveExpenseBudget() {
  const inputs = document.querySelectorAll('#expense-budget-table .budget-input');
  const btn = document.getElementById('save-expense-budget');
  btn.disabled = true;
  try {
    await Promise.all([...inputs].map(inp =>
      apiPost('/budget/expense', {
        category_id: parseInt(inp.dataset.id, 10),
        year:    budgetYear,
        month:   budgetMonth,
        planned: parseInt(inp.value, 10) || 0,
      })
    ));
    toast('Expense budget saved ✓');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ── Income budget table ───────────────────────────────────────────────────
function renderIncomeBudget(rows) {
  document.getElementById('income-budget-table').innerHTML = `
    <table class="budget-table">
      <thead>
        <tr><th>Source</th><th class="right">Planned (UGX)</th></tr>
      </thead>
      <tbody>
        ${rows.map(r => `
        <tr>
          <td>${r.source}</td>
          <td style="text-align:right">
            <input class="budget-input"
              type="number" min="0" step="1000"
              data-id="${r.source_id}"
              value="${r.planned}">
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

async function saveIncomeBudget() {
  const inputs = document.querySelectorAll('#income-budget-table .budget-input');
  const btn = document.getElementById('save-income-budget');
  btn.disabled = true;
  try {
    await Promise.all([...inputs].map(inp =>
      apiPost('/budget/income', {
        source_id: parseInt(inp.dataset.id, 10),
        year:    budgetYear,
        month:   budgetMonth,
        planned: parseInt(inp.value, 10) || 0,
      })
    ));
    toast('Income budget saved ✓');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ── Rollovers table ───────────────────────────────────────────────────────
function renderRollovers(rows) {
  const groups = [
    { label: 'Liquid',    type: 'liquid'    },
    { label: 'Financial', type: 'financial' },
    { label: 'Credit',    type: 'credit'    },
  ];

  let bodyRows = '';
  for (const g of groups) {
    const accs = rows.filter(r => r.type === g.type);
    if (!accs.length) continue;
    bodyRows += `<tr><td colspan="2" style="font-family:var(--font-mono);font-size:0.6rem;
      text-transform:uppercase;letter-spacing:0.07em;color:var(--text-light);
      background:var(--surface-2);padding:0.4rem 1rem;border-bottom:1px solid var(--border)">
      ${g.label}</td></tr>`;
    bodyRows += accs.map(r => `
      <tr>
        <td>${r.account}</td>
        <td style="text-align:right">
          <input class="budget-input rollover-input"
            type="number" min="0" step="1000"
            data-id="${r.account_id}"
            value="${r.amount}"
            placeholder="0">
        </td>
      </tr>`).join('');
  }

  document.getElementById('rollovers-table').innerHTML = `
    <table class="budget-table">
      <thead>
        <tr><th>Account</th><th class="right">Opening Balance (UGX)</th></tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>`;
}

async function saveRollovers() {
  const inputs = document.querySelectorAll('.rollover-input');
  const btn = document.getElementById('save-rollovers');
  btn.disabled = true;
  try {
    await Promise.all([...inputs].map(inp =>
      apiPost('/rollover', {
        account_id: parseInt(inp.dataset.id, 10),
        year:   budgetYear,
        month:  budgetMonth,
        amount: parseInt(inp.value, 10) || 0,
      })
    ));
    toast('Rollovers saved ✓');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ── Carry forward ─────────────────────────────────────────────────────────
async function carryForward() {
  const prevLabel = budgetMonth === 1
    ? `Dec ${budgetYear - 1}`
    : `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][budgetMonth - 2]} ${budgetYear}`;

  if (!confirm(`Copy closing balances from ${prevLabel} as opening balances for this month?`)) return;

  const btn = document.getElementById('carry-forward-btn');
  btn.disabled = true;
  try {
    const res = await apiPost(
      `/rollover/carry-forward?year=${budgetYear}&month=${budgetMonth}`, {}
    );
    toast(`Carried forward ${res.carried} account balances ✓`);
    await loadBudgetAndRollovers();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// initBudgetSection is called from within ready() at top of file

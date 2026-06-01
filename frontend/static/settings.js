import { api, apiPut, setActiveNav, ready, toast, spinner } from './app.js';

const editableState = {
  accounts: [],
  categories: [],
  sources: [],
};

ready(async () => {
  setActiveNav();

  const accountList = document.getElementById('accounts-list');
  const categoryList = document.getElementById('categories-list');
  const sourceList = document.getElementById('sources-list');

  accountList.innerHTML = spinner();
  categoryList.innerHTML = spinner();
  sourceList.innerHTML = spinner();

  try {
    const { accounts, categories, sources } = await api('/settings');
    editableState.accounts = accounts;
    editableState.categories = categories;
    editableState.sources = sources;
    renderSettingsLists();
  } catch (error) {
    toast(`Failed to load settings: ${error.message}`, 'error');
    accountList.innerHTML = '<li style="color:var(--text-muted);font-size:0.82rem">Unable to load accounts</li>';
    categoryList.innerHTML = '<li style="color:var(--text-muted);font-size:0.82rem">Unable to load categories</li>';
    sourceList.innerHTML = '<li style="color:var(--text-muted);font-size:0.82rem">Unable to load sources</li>';
  }

  const budgetNotice = '<div style="padding:1rem;color:var(--text-muted);font-size:0.85rem">Budget editing is not available in the Cloudflare Pages migration.</div>';
  const expenseBudget = document.getElementById('expense-budget-table');
  const incomeBudget = document.getElementById('income-budget-table');
  const rollovers = document.getElementById('rollovers-table');
  if (expenseBudget) expenseBudget.innerHTML = budgetNotice;
  if (incomeBudget) incomeBudget.innerHTML = budgetNotice;
  if (rollovers) rollovers.innerHTML = budgetNotice;

  const saveExpenseBudget = document.getElementById('save-expense-budget');
  const saveIncomeBudget = document.getElementById('save-income-budget');
  const saveRollovers = document.getElementById('save-rollovers');
  const carryForward = document.getElementById('carry-forward-btn');
  [saveExpenseBudget, saveIncomeBudget, saveRollovers, carryForward].forEach((button) => {
    if (button) {
      button.disabled = true;
      button.title = 'Disabled in this migration';
    }
  });
});

function renderSettingsLists() {
  document.getElementById('accounts-list').innerHTML = renderAccountItems(editableState.accounts);
  document.getElementById('categories-list').innerHTML = renderCategoryItems(editableState.categories);
  document.getElementById('sources-list').innerHTML = renderSourceItems(editableState.sources);
  bindEditButtons();
}

function renderAccountItems(items) {
  if (!items.length) {
    return '<li style="color:var(--text-muted);font-size:0.82rem">No accounts yet</li>';
  }

  return items.map((item) => `
    <li data-id="${item.id}" data-kind="account">
      <span class="item-name">${escapeHtml(item.name)}</span>
      <span class="item-meta">${escapeHtml(item.type)}</span>
      <div class="item-actions">
        <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${item.id}" data-kind="account">Edit</button>
      </div>
    </li>`).join('');
}

function renderCategoryItems(items) {
  if (!items.length) {
    return '<li style="color:var(--text-muted);font-size:0.82rem">No items yet</li>';
  }

  return items.map((item) => `
    <li data-id="${item.id}" data-kind="category">
      <span class="item-name">${escapeHtml(item.name)}</span>
      <div class="item-actions">
        <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${item.id}" data-kind="category">Edit</button>
      </div>
    </li>`).join('');
}

function renderSourceItems(items) {
  if (!items.length) {
    return '<li style="color:var(--text-muted);font-size:0.82rem">No items yet</li>';
  }

  return items.map((item) => `
    <li data-id="${item.id}" data-kind="source">
      <span class="item-name">${escapeHtml(item.name)}</span>
      <div class="item-actions">
        <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${item.id}" data-kind="source">Edit</button>
      </div>
    </li>`).join('');
}

function bindEditButtons() {
  document.querySelectorAll('#accounts-list [data-action="edit"], #categories-list [data-action="edit"], #sources-list [data-action="edit"]').forEach((button) => {
    button.addEventListener('click', () => startEdit(button.dataset.kind, Number(button.dataset.id)));
  });
}

function listKey(kind) {
  if (kind === 'category') return 'categories';
  if (kind === 'source') return 'sources';
  return 'accounts';
}

function routeKey(kind) {
  if (kind === 'category') return 'categories';
  if (kind === 'source') return 'sources';
  return 'accounts';
}

function startEdit(kind, id) {
  const item = editableState[listKey(kind)].find((entry) => entry.id === id);
  if (!item) return;

  const list = document.getElementById(`${listKey(kind)}-list`);
  const li = list.querySelector(`li[data-id="${id}"]`);
  if (!li) return;

  if (kind === 'account') {
    li.innerHTML = `
      <input type="text" class="edit-name" value="${escapeAttr(item.name)}" style="flex:1;min-width:120px">
      <select class="edit-type" style="min-width:120px">
        <option value="liquid" ${item.type === 'liquid' ? 'selected' : ''}>Liquid</option>
        <option value="financial" ${item.type === 'financial' ? 'selected' : ''}>Financial</option>
        <option value="credit" ${item.type === 'credit' ? 'selected' : ''}>Credit</option>
      </select>
      <div class="item-actions">
        <button class="btn btn-primary btn-sm" data-action="save" data-id="${id}" data-kind="account">Save</button>
        <button class="btn btn-ghost btn-sm" data-action="cancel" data-id="${id}" data-kind="account">Cancel</button>
      </div>`;
  } else {
    li.innerHTML = `
      <input type="text" class="edit-name" value="${escapeAttr(item.name)}" style="flex:1;min-width:120px">
      <div class="item-actions">
        <button class="btn btn-primary btn-sm" data-action="save" data-id="${id}" data-kind="${kind}">Save</button>
        <button class="btn btn-ghost btn-sm" data-action="cancel" data-id="${id}" data-kind="${kind}">Cancel</button>
      </div>`;
  }

  li.querySelector('[data-action="save"]').addEventListener('click', () => saveEdit(kind, id));
  li.querySelector('[data-action="cancel"]').addEventListener('click', () => renderSettingsLists());
}

async function saveEdit(kind, id) {
  const list = document.getElementById(`${listKey(kind)}-list`);
  const li = list.querySelector(`li[data-id="${id}"]`);
  if (!li) return;

  const name = li.querySelector('.edit-name')?.value.trim();
  const body = { name };

  if (kind === 'account') {
    body.type = li.querySelector('.edit-type')?.value;
  }

  if (!name) {
    toast(`${kind === 'account' ? 'Account' : kind === 'category' ? 'Category' : 'Source'} name is required`, 'error');
    return;
  }

  try {
    await apiPut(`/${routeKey(kind)}/${id}`, body);
    toast(`${kind.charAt(0).toUpperCase() + kind.slice(1)} updated ✓`);
    const updated = await api('/settings');
    editableState.accounts = updated.accounts;
    editableState.categories = updated.categories;
    editableState.sources = updated.sources;
    renderSettingsLists();
  } catch (error) {
    toast(error.message, 'error');
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
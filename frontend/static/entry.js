import { api, apiPost, toast, today, setActiveNav, ready } from './app.js';

ready(async () => {
  setActiveNav();

  // ── Load reference data ─────────────────────────────────────────
  const [accounts, categories, sources] = await Promise.all([
    api('/accounts'),
    api('/categories'),
    api('/sources'),
  ]);

  // Filter out Fees category (never entered directly)
  const entryCategories = categories.filter(c => c.name !== 'Fees');

  // ── Populate selects ─────────────────────────────────────────────
  function fillSelect(id, items, labelKey = 'name', valKey = 'id') {
    const el = document.getElementById(id);
    el.innerHTML = items.map(i =>
      `<option value="${i[valKey]}">${i[labelKey]}</option>`
    ).join('');
  }

  fillSelect('e-category', entryCategories);
  fillSelect('e-account',  accounts);
  fillSelect('i-source',   sources);
  fillSelect('i-account',  accounts);
  fillSelect('t-from',     accounts);
  fillSelect('t-to',       accounts);

  // Default accounts to Cash (first in list)
  const cashId = accounts.find(a => a.name === 'Cash')?.id;
  if (cashId) {
    document.getElementById('e-account').value = cashId;
    document.getElementById('i-account').value = cashId;
  }
  // Default transfer: From=Cash, To=MTN
  const mtnId = accounts.find(a => a.name === 'MTN')?.id;
  if (cashId) document.getElementById('t-from').value = cashId;
  if (mtnId)  document.getElementById('t-to').value   = mtnId;

  // ── Set today's date on all forms ────────────────────────────────
  const todayStr = today();
  ['e-date','i-date','t-date'].forEach(id => {
    document.getElementById(id).value = todayStr;
  });

  // ── Tab switching ─────────────────────────────────────────────────
  const tabs   = document.querySelectorAll('.tab-btn');
  const forms  = {
    expense:  document.getElementById('expense-form'),
    income:   document.getElementById('income-form'),
    transfer: document.getElementById('transfer-form'),
  };
  let activeTab = 'expense';

  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      tabs.forEach(t => t.classList.toggle('active', t === btn));
      Object.entries(forms).forEach(([key, form]) => {
        form.hidden = key !== activeTab;
      });
    });
  });

  // ── Helper: reset form but keep date + account ──────────────────
  function resetExpense() {
    const date = document.getElementById('e-date').value;
    const acc  = document.getElementById('e-account').value;
    document.getElementById('expense-form').reset();
    document.getElementById('e-date').value    = date;
    document.getElementById('e-account').value = acc;
  }
  function resetIncome() {
    const date = document.getElementById('i-date').value;
    const acc  = document.getElementById('i-account').value;
    document.getElementById('income-form').reset();
    document.getElementById('i-date').value    = date;
    document.getElementById('i-account').value = acc;
  }
  function resetTransfer() {
    const date = document.getElementById('t-date').value;
    const from = document.getElementById('t-from').value;
    const to   = document.getElementById('t-to').value;
    document.getElementById('transfer-form').reset();
    document.getElementById('t-date').value  = date;
    document.getElementById('t-from').value  = from;
    document.getElementById('t-to').value    = to;
    document.getElementById('t-fees').value  = '';
  }

  // ── Expense submit ────────────────────────────────────────────────
  document.getElementById('expense-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await apiPost('/expenses', {
        date:        document.getElementById('e-date').value,
        amount:      parseInt(document.getElementById('e-amount').value, 10),
        description: document.getElementById('e-desc').value.trim() || null,
        category_id: parseInt(document.getElementById('e-category').value, 10),
        account_id:  parseInt(document.getElementById('e-account').value, 10),
      });
      toast('Expense saved ✓');
      resetExpense();
      document.getElementById('e-amount').focus();
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ── Income submit ─────────────────────────────────────────────────
  document.getElementById('income-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await apiPost('/income', {
        date:        document.getElementById('i-date').value,
        amount:      parseInt(document.getElementById('i-amount').value, 10),
        description: document.getElementById('i-desc').value.trim() || null,
        source_id:   parseInt(document.getElementById('i-source').value, 10),
        account_id:  parseInt(document.getElementById('i-account').value, 10),
      });
      toast('Income saved ✓');
      resetIncome();
      document.getElementById('i-amount').focus();
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ── Transfer submit ───────────────────────────────────────────────
  document.getElementById('transfer-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fromId = parseInt(document.getElementById('t-from').value, 10);
    const toId   = parseInt(document.getElementById('t-to').value, 10);
    if (fromId === toId) {
      toast('From and To accounts must differ', 'error');
      return;
    }
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await apiPost('/transfers', {
        date:            document.getElementById('t-date').value,
        amount:          parseInt(document.getElementById('t-amount').value, 10),
        fees:            parseInt(document.getElementById('t-fees').value, 10) || 0,
        description:     document.getElementById('t-desc').value.trim() || null,
        from_account_id: fromId,
        to_account_id:   toId,
      });
      toast('Transfer saved ✓');
      resetTransfer();
      document.getElementById('t-amount').focus();
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
});

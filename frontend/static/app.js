// ── UGX formatting ────────────────────────────────────────────────
export function formatUGX(amount, opts = {}) {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-UG');
  if (opts.sign === false) return `UGX ${formatted}`;
  return amount < 0 ? `-UGX ${formatted}` : `UGX ${formatted}`;
}

export function formatUGXShort(amount) {
  const abs = Math.abs(amount);
  let str;
  if (abs >= 1_000_000) str = (abs / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  else if (abs >= 1_000)  str = (abs / 1_000).toFixed(0) + 'K';
  else                    str = abs.toLocaleString();
  return amount < 0 ? `-UGX ${str}` : `UGX ${str}`;
}

export const API_BASE = '/api';

// ── API helper ────────────────────────────────────────────────────
export async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export async function apiPost(path, body) {
  return api(path, { method: 'POST', body: JSON.stringify(body) });
}

export async function apiPut(path, body) {
  return api(path, { method: 'PUT', body: JSON.stringify(body) });
}

export async function apiDelete(path) {
  return api(path, { method: 'DELETE' });
}

// ── Current month (stored in localStorage) ───────────────────────
const MONTH_KEY = 'rt_ym';

export function getYM() {
  try {
    const saved = JSON.parse(localStorage.getItem(MONTH_KEY));
    if (saved && saved.year && saved.month) return saved;
  } catch {}
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function setYM(year, month) {
  localStorage.setItem(MONTH_KEY, JSON.stringify({ year, month }));
}

export function monthName(month) {
  return ['Jan','Feb','Mar','Apr','May','Jun',
          'Jul','Aug','Sep','Oct','Nov','Dec'][month - 1];
}

export function monthLongName(month) {
  return ['January','February','March','April','May','June',
          'July','August','September','October','November','December'][month - 1];
}

// ── Month selector widget ─────────────────────────────────────────
// Expects: <div id="month-selector"></div>
// Calls onChange(year, month) when user navigates
export function initMonthSelector(containerId, onChange) {
  const el = document.getElementById(containerId);
  if (!el) return;

  let { year, month } = getYM();

  function render() {
    el.innerHTML = `
      <div class="month-selector">
        <button id="ms-prev" title="Previous month">&#8249;</button>
        <span class="month-label">${monthLongName(month)} ${year}</span>
        <button id="ms-next" title="Next month">&#8250;</button>
      </div>`;
    el.querySelector('#ms-prev').onclick = () => navigate(-1);
    el.querySelector('#ms-next').onclick = () => navigate(1);
  }

  function navigate(dir) {
    month += dir;
    if (month < 1)  { month = 12; year--; }
    if (month > 12) { month = 1;  year++; }
    setYM(year, month);
    render();
    onChange(year, month);
  }

  render();
  return { getYear: () => year, getMonth: () => month };
}

// ── Toast ─────────────────────────────────────────────────────────
let toastTimer;
export function toast(msg, type = 'ok') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = type === 'error' ? 'error' : '';
  clearTimeout(toastTimer);
  // force reflow so re-show animates
  void el.offsetWidth;
  el.classList.add('show');
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── Nav active state ─────────────────────────────────────────────
export function setActiveNav() {
  const path = location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href').replace(/\/$/, '') || '/';
    const isActive = href === path;
    a.classList.toggle('active', isActive);
    a.classList.toggle('nav-button', isActive);
  });
}

// ── Today's date as YYYY-MM-DD ─────────────────────────────────────
export function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── Wait for DOM ──────────────────────────────────────────────────
export function ready(fn) {
  if (document.readyState !== 'loading') fn();
  else document.addEventListener('DOMContentLoaded', fn);
}

// ── Spinner helpers ───────────────────────────────────────────────
export function spinner() {
  return '<div class="spinner"></div>';
}

export function empty(msg = 'No transactions yet') {
  return `<div class="empty"><span>—</span>${msg}</div>`;
}

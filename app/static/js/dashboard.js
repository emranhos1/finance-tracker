// dashboard.js

async function renderDashboard(container) {
  container.innerHTML = '<div class="loading">Loading dashboard...</div>';
  try {
    container.innerHTML = await loadTemplate('dashboard');
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    return;
  }

  document.getElementById('dashDate').textContent = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  let data;
  try {
    data = await API.get('/api/dashboard/summary');
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    return;
  }

  // Top summary cards
  document.getElementById('netWorth').textContent   = fmt(data.net_worth);
  document.getElementById('cashTotal').textContent  = fmt(data.cash_total);
  document.getElementById('bankTotal').textContent  = fmt(data.bank_total);
  document.getElementById('savingsTotal').textContent = fmt(data.dps_total + data.fdr_total);

  // Period cards
  renderCashCard('todayStats', data.today, 'Today');
  renderCashCard('monthStats', data.month, 'This Month');
  renderCashCard('yearStats',  data.year,  'This Year');

  // Account balances
  const accEl = document.getElementById('accountBalances');
  if (!data.accounts.length) {
    accEl.innerHTML = '<div class="empty">No accounts yet</div>';
  } else {
    accEl.innerHTML = data.accounts.map(a => `
      <div style="display:flex;justify-content:space-between;align-items:center;
        padding:0.5rem 0;border-bottom:1px solid var(--border)">
        <div>
          <span class="badge badge-${a.type}">${a.type.toUpperCase()}</span>
          <span style="margin-left:0.5rem">${a.name}</span>
        </div>
        <span style="font-weight:600">${fmt(a.balance)}</span>
      </div>
    `).join('');
  }

  // Category breakdown
  const catEl = document.getElementById('categoryBreakdown');
  if (!data.category_breakdown.length) {
    catEl.innerHTML = '<div class="empty">No expense data this month</div>';
  } else {
    const max = data.category_breakdown.reduce((m, c) => Math.max(m, c.total), 1);
    catEl.innerHTML = data.category_breakdown.map(c => `
      <div class="cat-bar-wrap">
        <div class="cat-bar-label">
          <span>${c.name}</span><span>${fmt(c.total)}</span>
        </div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width:${(c.total / max * 100).toFixed(1)}%"></div>
        </div>
      </div>
    `).join('');
  }
}

function renderCashCard(elId, d, label) {
  document.getElementById(elId).innerHTML = `
    <div style="display:flex;flex-direction:column;gap:0.4rem;margin-top:0.25rem">
      <div style="display:flex;justify-content:space-between;font-size:0.85rem">
        <span style="color:var(--text-muted)">Opening Cash</span>
        <span style="font-weight:600">${fmt(d.opening_cash)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.85rem">
        <span style="color:var(--text-muted)">Total Out</span>
        <span class="amount-expense">−${fmt(d.out)}</span>
      </div>
      <div style="border-top:1px solid var(--border);margin-top:0.25rem;padding-top:0.4rem;
        display:flex;justify-content:space-between">
        <span style="color:var(--text-muted);font-size:0.85rem">Cash in Hand Now</span>
        <span style="font-weight:700;font-size:1rem;color:${d.current_cash >= 0 ? 'var(--income)' : 'var(--expense)'}">${fmt(d.current_cash)}</span>
      </div>
    </div>
  `;
}
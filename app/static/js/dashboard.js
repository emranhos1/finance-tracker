// dashboard.js — data logic only

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
    showAlert(container, e.message, 'error');
    return;
  }

  document.getElementById('netWorth').textContent = fmt(data.net_worth);
  renderPeriodStats('todayStats', data.today);
  renderPeriodStats('monthStats', data.month);
  renderPeriodStats('yearStats', data.year);

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

function renderPeriodStats(elId, d) {
  const netColor = d.net >= 0 ? 'var(--income)' : 'var(--expense)';
  document.getElementById(elId).innerHTML = `
    <div style="display:flex;flex-direction:column;gap:0.3rem">
      <div><span class="amount-income">+${fmt(d.income)}</span>
        <span style="color:var(--text-muted);font-size:0.8rem;margin-left:0.3rem">income</span></div>
      <div><span class="amount-expense">-${fmt(d.expense)}</span>
        <span style="color:var(--text-muted);font-size:0.8rem;margin-left:0.3rem">expense</span></div>
      <div style="border-top:1px solid var(--border);padding-top:0.3rem;margin-top:0.1rem">
        <span style="font-weight:700;color:${netColor}">${d.net >= 0 ? '+' : ''}${fmt(d.net)}</span>
        <span style="color:var(--text-muted);font-size:0.8rem;margin-left:0.3rem">net</span>
      </div>
    </div>
  `;
}

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

  // Top cards
  document.getElementById('netWorth').textContent     = fmt(data.net_worth);
  document.getElementById('cashTotal').textContent    = fmt(data.cash_total);
  document.getElementById('bankTotal').textContent    = fmt(data.bank_total);
  document.getElementById('savingsTotal').textContent = fmt(data.dps_total + data.fdr_total);
  document.getElementById('plotTotal').textContent    = fmt(data.plot_total);

  // Period cards
  renderCashCard('todayStats', data.today);
  renderCashCard('monthStats', data.month);
  renderCashCard('yearStats',  data.year);

  // Account balances
  const accEl = document.getElementById('accountBalances');
  accEl.innerHTML = !data.accounts.length ? '<div class="empty">No accounts yet</div>' :
    data.accounts.map(a => `
      <div style="display:flex;justify-content:space-between;align-items:center;
        padding:0.5rem 0;border-bottom:1px solid var(--border)">
        <div>
          <span class="badge badge-${a.type}">${a.type.toUpperCase()}</span>
          <span style="margin-left:0.5rem">${a.name}</span>
        </div>
        <span style="font-weight:600">${fmt(a.balance)}</span>
      </div>
    `).join('');

  // Category breakdown
  const catEl = document.getElementById('categoryBreakdown');
  if (!data.category_breakdown.length) {
    catEl.innerHTML = '<div class="empty">No expense data this month</div>';
  } else {
    const max = data.category_breakdown.reduce((m, c) => Math.max(m, c.total), 1);
    catEl.innerHTML = data.category_breakdown.map(c => `
      <div class="cat-bar-wrap">
        <div class="cat-bar-label"><span>${c.name}</span><span>${fmt(c.total)}</span></div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width:${(c.total/max*100).toFixed(1)}%"></div>
        </div>
      </div>
    `).join('');
  }

  // Setup chart year/month selectors
  const today = new Date();
  const chartYear  = document.getElementById('chartYear');
  const chartMonth = document.getElementById('chartMonth');

  for (let y = today.getFullYear(); y >= today.getFullYear() - 5; y--) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (y === today.getFullYear()) opt.selected = true;
    chartYear.appendChild(opt);
  }
  chartMonth.value = today.getMonth() + 1;

  async function refreshChart() {
    await loadDailyChart(
      parseInt(chartYear.value),
      parseInt(chartMonth.value)
    );
  }

  chartYear.addEventListener('change',  refreshChart);
  chartMonth.addEventListener('change', refreshChart);
  await refreshChart();
}

function renderCashCard(elId, d) {
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
        <span style="font-weight:700;font-size:1rem;
          color:${d.current_cash >= 0 ? 'var(--income)' : 'var(--expense)'}">
          ${fmt(d.current_cash)}
        </span>
      </div>
    </div>`;
}

async function loadDailyChart(year, month) {
  const chartEl = document.getElementById('dailyChart');
  chartEl.innerHTML = '<div class="loading">Loading chart...</div>';

  let data;
  try {
    data = await API.get(`/api/reports/?period=daily&year=${year}&month=${month}`);
  } catch(e) {
    chartEl.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    return;
  }

  // Aggregate by date
  const byDate = {};
  data.rows.forEach(r => {
    if (!byDate[r.period]) byDate[r.period] = { income: 0, expense: 0, transfer: 0 };
    byDate[r.period].income   += r.income   || 0;
    byDate[r.period].expense  += r.expense  || 0;
    byDate[r.period].transfer += r.transfer || 0;
  });

  // Fill all days of the month
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    days.push({ day: d, key, ...(byDate[key] || { income: 0, expense: 0, transfer: 0 }) });
  }

  const maxVal = Math.max(...days.map(d => Math.max(d.income, d.expense, d.transfer)), 1);
  const barH   = 120; // max bar height px
  const barW   = 28;
  const gap    = 8;
  const totalW = days.length * (barW * 3 + gap + 6);

  // Legend
  const legend = `
    <div style="display:flex;gap:1.25rem;margin-bottom:0.75rem;font-size:0.78rem">
      <span><span style="display:inline-block;width:10px;height:10px;background:var(--income);border-radius:2px;margin-right:4px"></span>Income</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:var(--expense);border-radius:2px;margin-right:4px"></span>Expense</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:var(--primary);border-radius:2px;margin-right:4px"></span>Transfer</span>
    </div>`;

  // Build bars
  const bars = days.map(d => {
    const incH = Math.round((d.income   / maxVal) * barH);
    const expH = Math.round((d.expense  / maxVal) * barH);
    const trH  = Math.round((d.transfer / maxVal) * barH);
    const hasData = d.income > 0 || d.expense > 0 || d.transfer > 0;

    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:${barW*3+gap}px">
        <div style="display:flex;align-items:flex-end;gap:2px;height:${barH}px">
          <div title="Income: ${fmt(d.income)}"
            style="width:${barW}px;height:${incH}px;background:var(--income);border-radius:3px 3px 0 0;
            opacity:${hasData?1:0.15};transition:height 0.3s"></div>
          <div title="Expense: ${fmt(d.expense)}"
            style="width:${barW}px;height:${expH}px;background:var(--expense);border-radius:3px 3px 0 0;
            opacity:${hasData?1:0.15};transition:height 0.3s"></div>
          <div title="Transfer: ${fmt(d.transfer)}"
            style="width:${barW}px;height:${trH}px;background:var(--primary);border-radius:3px 3px 0 0;
            opacity:${hasData?1:0.15};transition:height 0.3s"></div>
        </div>
        <div style="font-size:0.7rem;color:${hasData ? 'var(--text)' : 'var(--text-muted)'};font-weight:${hasData?'600':'400'}">${d.day}</div>
      </div>`;
  }).join('');

  chartEl.innerHTML = legend + `
    <div style="display:flex;align-items:flex-end;gap:6px;padding-bottom:0.5rem;
      min-width:${totalW}px">
      ${bars}
    </div>`;
}
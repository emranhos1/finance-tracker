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

  // Custom category tracking cards
  await loadCustomCards();
  document.getElementById('addCustomCardBtn').addEventListener('click', showAddCustomCardModal);
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

// ---- Custom Category Tracking Cards ----

const CUSTOM_CARDS_KEY = 'dashboard_custom_cards';

function getCustomCardIds() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_CARDS_KEY) || '[]');
  } catch(e) {
    return [];
  }
}

function saveCustomCardIds(ids) {
  localStorage.setItem(CUSTOM_CARDS_KEY, JSON.stringify(ids));
}

async function loadCustomCards() {
  const grid  = document.getElementById('customCardsGrid');
  const empty = document.getElementById('customCardsEmpty');
  const ids   = getCustomCardIds();

  if (!ids.length) {
    grid.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  const cards = await Promise.all(ids.map(async id => {
    try {
      return await API.get(`/api/dashboard/category-summary?category_id=${id}`);
    } catch(e) {
      return null;
    }
  }));

  grid.innerHTML = cards.map((c, i) => {
    if (!c) return '';
    const netColor = c.net >= 0 ? 'var(--income)' : 'var(--expense)';
    return `
      <div class="card" style="position:relative">
        <button class="customCardRemove" data-id="${ids[i]}"
          style="position:absolute;top:0.5rem;right:0.5rem;background:transparent;border:none;
          color:var(--text-muted);cursor:pointer;font-size:0.85rem;line-height:1" title="Remove card">✕</button>
        <div class="card-title">📌 ${c.category_name}</div>
        <div class="card-value" style="color:${netColor}">${fmt(c.net)}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.4rem;display:flex;justify-content:space-between">
          <span class="amount-income">+${fmt(c.total_income)}</span>
          <span class="amount-expense">−${fmt(c.total_expense)}</span>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.customCardRemove').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const updated = getCustomCardIds().filter(x => x !== id);
      saveCustomCardIds(updated);
      loadCustomCards();
    });
  });
}

async function showAddCustomCardModal() {
  let categories;
  try {
    categories = await API.get('/api/categories/');
  } catch(e) {
    categories = [];
  }

  if (!categories.length) {
    alert('কোনো category পাওয়া যায়নি। আগে Categories page থেকে category তৈরি করুন।');
    return;
  }

  const existingIds = getCustomCardIds();
  const available = categories.filter(c => !existingIds.includes(c.id));

  if (!available.length) {
    alert('সব category ইতিমধ্যে track করা হচ্ছে।');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:380px">
      <h2>📌 Add Tracking Card</h2>
      <div class="form-group">
        <label>Category</label>
        <select id="customCardCategory">
          ${available.map(c => `<option value="${c.id}">${c.name} (${c.type})</option>`).join('')}
        </select>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" id="customCardCancel">Cancel</button>
        <button class="btn btn-primary" id="customCardAdd">Add Card</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#customCardCancel').addEventListener('click', () => overlay.remove());

  overlay.querySelector('#customCardAdd').addEventListener('click', async () => {
    const catId = parseInt(overlay.querySelector('#customCardCategory').value);
    const ids = getCustomCardIds();
    ids.push(catId);
    saveCustomCardIds(ids);
    overlay.remove();
    await loadCustomCards();
  });
}
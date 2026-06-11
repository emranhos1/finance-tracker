// reports.js — data logic only

async function renderReports(container) {
  container.innerHTML = '<div class="loading">Loading...</div>';
  try {
    container.innerHTML = await loadTemplate('reports');
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    return;
  }

  const today = new Date();

  // Populate years
  const yearSel = document.getElementById('rYear');
  for (let y = today.getFullYear(); y >= today.getFullYear() - 5; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === today.getFullYear()) opt.selected = true;
    yearSel.appendChild(opt);
  }

  // Set current month
  document.getElementById('rMonth').value = today.getMonth() + 1;

  // Populate accounts
  try {
    const accounts = await API.get('/api/accounts/');
    const accSel = document.getElementById('rAccount');
    accounts.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      accSel.appendChild(opt);
    });
  } catch(e) {}

  // Period change handler
  const periodSel  = document.getElementById('rPeriod');
  const monthGroup = document.getElementById('monthGroup');
  const yearGroup  = document.getElementById('yearGroup');

  periodSel.addEventListener('change', () => {
    monthGroup.style.display = periodSel.value === 'daily'  ? '' : 'none';
    yearGroup.style.display  = periodSel.value === 'yearly' ? 'none' : '';
  });

  document.getElementById('runReport').addEventListener('click', () => loadReport());
  loadReport();
}

async function loadReport() {
  const period     = document.getElementById('rPeriod').value;
  const year       = document.getElementById('rYear')?.value;
  const month      = document.getElementById('rMonth')?.value;
  const account_id = document.getElementById('rAccount').value;

  let url = `/api/reports/?period=${period}`;
  if (year)       url += `&year=${year}`;
  if (month && period === 'daily') url += `&month=${month}`;
  if (account_id) url += `&account_id=${account_id}`;

  const resultsEl = document.getElementById('reportResults');
  resultsEl.innerHTML = '<div class="loading">Generating report...</div>';

  let data;
  try {
    data = await API.get(url);
  } catch(e) {
    resultsEl.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    return;
  }

  const totalIncome  = data.rows.reduce((s, r) => s + r.income,  0);
  const totalExpense = data.rows.reduce((s, r) => s + r.expense, 0);
  const totalNet     = totalIncome - totalExpense;

  resultsEl.innerHTML = `
    <div class="grid-3" style="margin-bottom:1.5rem">
      <div class="card">
        <div class="card-title">Total Income</div>
        <div class="card-value amount-income">${fmt(totalIncome)}</div>
      </div>
      <div class="card">
        <div class="card-title">Total Expense</div>
        <div class="card-value amount-expense">${fmt(totalExpense)}</div>
      </div>
      <div class="card">
        <div class="card-title">Net</div>
        <div class="card-value" style="color:${totalNet >= 0 ? 'var(--income)' : 'var(--expense)'}">
          ${totalNet >= 0 ? '+' : ''}${fmt(totalNet)}
        </div>
      </div>
    </div>
    <div class="card" style="margin-bottom:1.5rem">
      <div class="section-title">Period Breakdown</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Period</th><th>Income</th><th>Expense</th><th>Net</th></tr></thead>
          <tbody>
            ${!data.rows.length
              ? '<tr><td colspan="4" class="empty">No data for selected period</td></tr>'
              : data.rows.map(r => `
                <tr>
                  <td><strong>${r.period}</strong></td>
                  <td class="amount-income">+${fmt(r.income)}</td>
                  <td class="amount-expense">−${fmt(r.expense)}</td>
                  <td style="color:${r.net >= 0 ? 'var(--income)' : 'var(--expense)'}">
                    ${r.net >= 0 ? '+' : ''}${fmt(r.net)}
                  </td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="section-title">Account Balances (Current)</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Account</th><th>Type</th><th>Balance</th></tr></thead>
          <tbody>
            ${data.accounts.map(a => `
              <tr>
                <td><strong>${a.name}</strong></td>
                <td><span class="badge badge-${a.type}">${a.type.toUpperCase()}</span></td>
                <td class="${a.balance >= 0 ? 'amount-income' : 'amount-expense'}">${fmt(a.balance)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

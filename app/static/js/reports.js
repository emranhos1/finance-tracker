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

  const yearSel = document.getElementById('rYear');
  for (let y = today.getFullYear(); y >= today.getFullYear() - 5; y--) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (y === today.getFullYear()) opt.selected = true;
    yearSel.appendChild(opt);
  }
  document.getElementById('rMonth').value = today.getMonth() + 1;

  try {
    const accounts = await API.get('/api/accounts/');
    const accSel = document.getElementById('rAccount');
    accounts.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id; opt.textContent = a.name;
      accSel.appendChild(opt);
    });
  } catch(e) {}

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
  if (year) url += `&year=${year}`;
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

  // Grand totals
  const totalIncome   = data.rows.reduce((s, r) => s + (r.income   || 0), 0);
  const totalExpense  = data.rows.reduce((s, r) => s + (r.expense  || 0), 0);
  const totalTransfer = data.rows.reduce((s, r) => s + (r.transfer || 0), 0);
  const totalNet      = totalIncome - totalExpense;

  // Summary cards
  const summaryHtml = `
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
    </div>`;

  // Transaction details table with pagination
  let currentPage = 1;
  let pageSize = 10;
  const allRows = data.rows;

  function renderTable() {
    const start = (currentPage - 1) * pageSize;
    const end   = start + pageSize;
    const pageRows = allRows.slice(start, end);
    const totalPages = Math.max(1, Math.ceil(allRows.length / pageSize));

    const tbody = document.getElementById('reportTbody');
    const tfoot = document.getElementById('reportTfoot');
    const paginationEl = document.getElementById('reportPagination');

    tbody.innerHTML = !pageRows.length
      ? '<tr><td colspan="8" class="empty">No data for selected period</td></tr>'
      : pageRows.map(r => `
          <tr>
            <td style="white-space:nowrap">${r.period}</td>
            <td><span class="badge badge-${r.type}">${r.type}</span></td>
            <td>${r.type === 'transfer' ? 'Cash' : r.category}</td>
            <td style="font-size:0.8rem;color:var(--text-muted)">
              ${r.type === 'transfer'
                ? `${r.from_account} → ${r.to_account}`
                : r.type === 'income' ? r.to_account : r.from_account}
            </td>
            <td style="font-size:0.82rem;color:var(--text-muted)">${r.note}</td>
            <td style="text-align:right" class="amount-income">${r.income  > 0 ? '+' + fmt(r.income)  : '—'}</td>
            <td style="text-align:right" class="amount-expense">${r.expense > 0 ? '−' + fmt(r.expense) : '—'}</td>
            <td style="text-align:right" class="amount-neutral">${r.transfer > 0 ? fmt(r.transfer) : '—'}</td>
          </tr>`).join('');

    // Grand total row in tfoot
    tfoot.innerHTML = allRows.length > 0 ? `
      <tr style="border-top:2px solid var(--border);font-weight:700;background:var(--surface2)">
        <td colspan="5" style="padding:0.65rem 0.75rem;color:var(--text-muted);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em">
          Grand Total (${allRows.length} transactions)
        </td>
        <td style="text-align:right;padding:0.65rem 0.75rem" class="amount-income">${totalIncome > 0 ? '+' + fmt(totalIncome) : '—'}</td>
        <td style="text-align:right;padding:0.65rem 0.75rem" class="amount-expense">${totalExpense > 0 ? '−' + fmt(totalExpense) : '—'}</td>
        <td style="text-align:right;padding:0.65rem 0.75rem" class="amount-neutral">${totalTransfer > 0 ? fmt(totalTransfer) : '—'}</td>
      </tr>` : '';

    // Pagination controls
    paginationEl.innerHTML = `
    <div class="pg-bar">
      <span style="min-width:130px;white-space:nowrap">Total Arrivals: ${allRows.length}</span>
      <div class="pg-pages">
        <button class="pg-btn" id="pgPrev" ${currentPage===1?'disabled':''}>&#8249;</button>
        ${Array.from({length:Math.min(5,totalPages)},(_,ii)=>{
          const p=Math.max(1,Math.min(currentPage-2,totalPages-4))+ii;
          return p<1||p>totalPages?'':
            `<button class="pg-btn${p===currentPage?' active':''}" data-pg="${p}">${p}</button>`;
        }).join('')}
        <button class="pg-btn" id="pgNext" ${currentPage>=totalPages?'disabled':''}>&#8250;</button>
      </div>
      <div style="display:flex;align-items:center;gap:0.4rem;min-width:130px;justify-content:flex-end;white-space:nowrap">
        Per Page:
        <select id="pageSizeSel" class="pg-size-sel">
          ${[10,25,50,100].map(n=>`<option value="${n}"${n===pageSize?' selected':''}>${n}</option>`).join('')}
        </select>
      </div>
    </div>`

    // Bind pagination controls
    document.getElementById('pageSizeSel').addEventListener('change', e => {
      pageSize = parseInt(e.target.value);
      currentPage = 1;
      renderTable();
    });
    document.getElementById('pgPrev').addEventListener('click', () => { currentPage--; renderTable(); });
    document.getElementById('pgNext').addEventListener('click', () => { currentPage++; renderTable(); });
    document.querySelectorAll('#reportPagination .pg-btn[data-pg]').forEach(b => b.addEventListener('click', () => { currentPage = parseInt(b.dataset.pg); renderTable(); }));
  }

  const breakdownHtml = `
    <div class="card" style="margin-bottom:1.5rem">
      <div class="section-title">Transaction Details</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Category</th>
              <th>Account</th>
              <th>Note</th>
              <th style="text-align:right">Income</th>
              <th style="text-align:right">Expense</th>
              <th style="text-align:right">Transfer</th>
            </tr>
          </thead>
          <tbody id="reportTbody"></tbody>
          <tfoot id="reportTfoot"></tfoot>
        </table>
      </div>
      <div id="reportPagination"></div>
    </div>`;

  // Account balances
  const accountsHtml = `
    <div class="card">
      <div class="section-title">Account Balances (Current)</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Account</th><th>Type</th><th>Balance</th></tr></thead>
          <tbody>
            ${data.accounts.map(a => `
              <tr>
                <td><strong>${a.name}</strong></td>
                <td><span class="badge badge-other">${(a.account_type_name||'—').toUpperCase()}</span></td>
                <td class="${a.balance >= 0 ? 'amount-income' : 'amount-expense'}">${fmt(a.balance)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  resultsEl.innerHTML = summaryHtml + breakdownHtml + accountsHtml;
  renderTable();
}
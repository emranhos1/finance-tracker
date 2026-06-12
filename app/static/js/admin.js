// admin.js — admin panel logic only

async function renderAdmin(container) {
  container.innerHTML = '<div class="loading">Loading...</div>';
  try {
    container.innerHTML = await loadTemplate('admin');
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    return;
  }

  await loadUsers();

  document.getElementById('closeReport').addEventListener('click', () => {
    document.getElementById('userReportSection').style.display = 'none';
  });
}

async function loadUsers() {
  const tbody = document.getElementById('usersBody');
  tbody.innerHTML = '<tr><td colspan="5" class="loading">Loading...</td></tr>';

  let users;
  try {
    users = await API.get('/api/admin/users');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="5" class="alert alert-error">${e.message}</td></tr>`;
    return;
  }

  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No registered users yet</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong>${u.username}</strong></td>
      <td style="color:var(--text-muted);font-size:0.85rem">${u.email}</td>
      <td style="font-size:0.82rem;color:var(--text-muted)">${fmtDate(u.created_at?.split('T')[0])}</td>
      <td>
        <span class="badge ${u.is_active ? 'badge-income' : 'badge-expense'}">
          ${u.is_active ? 'Active' : 'Pending'}
        </span>
      </td>
      <td style="display:flex;gap:0.4rem;align-items:center">
        ${u.is_active
          ? `<button class="btn btn-danger btn-sm" data-action="deactivate" data-id="${u.id}" data-name="${u.username}">Deactivate</button>`
          : `<button class="btn btn-primary btn-sm" data-action="activate" data-id="${u.id}" data-name="${u.username}">Activate</button>`
        }
        <button class="btn btn-outline btn-sm" data-action="report" data-id="${u.id}" data-name="${u.username}">📊 Report</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-action="activate"]').forEach(btn => {
    btn.addEventListener('click', () => toggleUser(parseInt(btn.dataset.id), btn.dataset.name, true));
  });
  tbody.querySelectorAll('[data-action="deactivate"]').forEach(btn => {
    btn.addEventListener('click', () => toggleUser(parseInt(btn.dataset.id), btn.dataset.name, false));
  });
  tbody.querySelectorAll('[data-action="report"]').forEach(btn => {
    btn.addEventListener('click', () => openUserReport(parseInt(btn.dataset.id), btn.dataset.name));
  });
}

async function toggleUser(userId, username, activate) {
  const action = activate ? 'activate' : 'deactivate';
  try {
    await API.post(`/api/admin/users/${userId}/${action}`);
    showAlert(document.getElementById('adminAlert'), `User "${username}" ${activate ? 'activated' : 'deactivated'}`);
    await loadUsers();
  } catch(e) {
    showAlert(document.getElementById('adminAlert'), e.message, 'error');
  }
}

function openUserReport(userId, username) {
  const section = document.getElementById('userReportSection');
  section.style.display = '';
  document.getElementById('reportUsername').textContent = username;

  const today = new Date().toISOString().split('T')[0];
  const yearStart = new Date().getFullYear() + '-01-01';
  document.getElementById('reportStart').value = yearStart;
  document.getElementById('reportEnd').value   = today;

  const loadBtn = document.getElementById('loadReportBtn');
  // Remove old listener
  const newBtn = loadBtn.cloneNode(true);
  loadBtn.parentNode.replaceChild(newBtn, loadBtn);
  newBtn.addEventListener('click', () => loadUserReport(userId));

  loadUserReport(userId);
  section.scrollIntoView({ behavior: 'smooth' });
}

async function loadUserReport(userId) {
  const start      = document.getElementById('reportStart').value;
  const end        = document.getElementById('reportEnd').value;
  const resultsEl  = document.getElementById('reportResults');
  resultsEl.innerHTML = '<div class="loading">Loading report...</div>';

  let data;
  try {
    let url = `/api/admin/users/${userId}/report`;
    if (start) url += `?start_date=${start}`;
    if (end)   url += `${start ? '&' : '?'}end_date=${end}`;
    data = await API.get(url);
  } catch(e) {
    resultsEl.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    return;
  }

  const s = data.summary;
  resultsEl.innerHTML = `
    <div class="grid-3" style="margin-bottom:1.25rem">
      <div class="card">
        <div class="card-title">Net Worth</div>
        <div class="card-value" style="font-size:1.3rem">${fmt(s.net_worth)}</div>
      </div>
      <div class="card">
        <div class="card-title">Income</div>
        <div class="card-value amount-income" style="font-size:1.3rem">+${fmt(s.income)}</div>
      </div>
      <div class="card">
        <div class="card-title">Expense</div>
        <div class="card-value amount-expense" style="font-size:1.3rem">−${fmt(s.expense)}</div>
      </div>
    </div>

    <div class="grid-2" style="margin-bottom:1.25rem">
      <div>
        <div class="section-title">Accounts</div>
        <table><thead><tr><th>Name</th><th>Type</th><th>Balance</th></tr></thead>
        <tbody>
          ${data.accounts.map(a => `
            <tr>
              <td>${a.name}</td>
              <td><span class="badge badge-${a.type}">${a.type.toUpperCase()}</span></td>
              <td class="amount-income">${fmt(a.balance)}</td>
            </tr>`).join('')}
        </tbody></table>
      </div>
      <div>
        <div class="section-title">Recent Transactions</div>
        <table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Amount</th></tr></thead>
        <tbody>
          ${!data.transactions.length
            ? '<tr><td colspan="4" class="empty">No transactions</td></tr>'
            : data.transactions.slice(0, 20).map(t => `
              <tr>
                <td style="font-size:0.8rem">${t.date}</td>
                <td><span class="badge badge-${t.type}">${t.type}</span></td>
                <td style="font-size:0.82rem">${t.category}</td>
                <td class="${t.type === 'income' ? 'amount-income' : t.type === 'expense' ? 'amount-expense' : 'amount-neutral'}">
                  ${fmt(t.amount)}
                </td>
              </tr>`).join('')}
        </tbody></table>
      </div>
    </div>`;
}
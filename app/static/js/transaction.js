// transaction.js — data logic only

async function renderTransaction(container) {
  container.innerHTML = '<div class="loading">Loading...</div>';
  try {
    container.innerHTML = await loadTemplate('transaction');
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    return;
  }

  // Set today's date
  document.getElementById('txnDate').value = new Date().toISOString().split('T')[0];

  let accounts, categories;
  try {
    [accounts, categories] = await Promise.all([
      API.get('/api/accounts/'),
      API.get('/api/categories/'),
    ]);
  } catch(e) {
    showAlert(document.getElementById('txnAlert'), e.message, 'error');
    return;
  }

  const incomeCategories  = categories.filter(c => c.type === 'income' || c.type === 'both');
  const expenseCategories = categories.filter(c => c.type === 'expense' || c.type === 'both');

  // Populate accounts — name only, no balance
  const accSelect = document.getElementById('txnAccount');
  const accBalanceDisplay = document.getElementById('accBalanceDisplay');

  accounts.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = `${a.name} (${a.type})`;
    opt.dataset.balance = a.balance;
    accSelect.appendChild(opt);
  });

  accSelect.addEventListener('change', () => {
    const selected = accSelect.options[accSelect.selectedIndex];
    if (selected.value) {
      accBalanceDisplay.textContent = `Current Balance: ${fmt(selected.dataset.balance)}`;
    } else {
      accBalanceDisplay.textContent = '';
    }
  });

  // Populate categories (income by default)
  populateCategories(incomeCategories);

  // Load recent transactions
  loadRecentTxns();

  // Tab switching
  let currentType = 'income';
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.color = 'var(--text-muted)';
      });
      btn.classList.add('active');
      btn.style.background = 'var(--surface2)';
      currentType = btn.dataset.tab;
      btn.style.color = currentType === 'income' ? 'var(--income)' : 'var(--expense)';
      document.getElementById('accountLabel').textContent = currentType === 'income' ? 'To Account' : 'From Account';
      populateCategories(currentType === 'income' ? incomeCategories : expenseCategories);
    });
  });

  // Save transaction
  document.getElementById('saveTxn').addEventListener('click', async () => {
    const date       = document.getElementById('txnDate').value;
    const account_id = parseInt(document.getElementById('txnAccount').value);
    const category_id = parseInt(document.getElementById('txnCategory').value) || null;
    const amount     = parseFloat(document.getElementById('txnAmount').value);
    const note       = document.getElementById('txnNote').value.trim() || null;

    if (!date || !account_id || !amount) {
      showAlert(document.getElementById('txnAlert'), 'Date, account and amount are required', 'error');
      return;
    }

    const btn = document.getElementById('saveTxn');
    btn.disabled = true; btn.textContent = 'Saving...';

    try {
      await API.post('/api/transactions/', {
        date, type: currentType, amount, category_id, note,
        from_account_id: currentType === 'expense' ? account_id : null,
        to_account_id:   currentType === 'income'  ? account_id : null,
      });
      showAlert(document.getElementById('txnAlert'), 'Transaction recorded');
      document.getElementById('txnAmount').value   = '';
      document.getElementById('txnNote').value     = '';
      document.getElementById('txnCategory').value = '';
      loadRecentTxns();
    } catch(e) {
      showAlert(document.getElementById('txnAlert'), e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Record Transaction';
    }
  });
}

function populateCategories(cats) {
  const sel = document.getElementById('txnCategory');
  sel.innerHTML = '<option value="">— Select category —</option>';
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name + (c.type === 'both' ? ' ↕' : '');
    sel.appendChild(opt);
  });
}

async function loadRecentTxns() {
  const el = document.getElementById('recentTxns');
  el.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const txns = await API.get('/api/transactions/?limit=20');
    if (!txns.length) { el.innerHTML = '<div class="empty">No transactions yet</div>'; return; }
    el.innerHTML = txns.map(t => `
      <div style="display:flex;justify-content:space-between;align-items:center;
        padding:0.55rem 0;border-bottom:1px solid var(--border)">
        <div>
          <span class="badge badge-${t.type}">${t.type}</span>
          <span style="margin-left:0.5rem;font-size:0.85rem">
            ${t.category_name || (t.from_account_name && t.to_account_name ? `${t.from_account_name} → ${t.to_account_name}` : '—')}
          </span>
          ${t.note ? `<div style="font-size:0.75rem;color:var(--text-muted)">${t.note}</div>` : ''}
        </div>
        <div style="text-align:right">
          <div class="${t.type === 'income' ? 'amount-income' : t.type === 'expense' ? 'amount-expense' : 'amount-neutral'}">
            ${t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}${fmt(t.amount)}
          </div>
          <div style="font-size:0.72rem;color:var(--text-muted)">${fmtDate(t.date)}</div>
        </div>
      </div>
    `).join('');
  } catch(e) {
    el.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}
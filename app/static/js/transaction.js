// transaction.js

let _txnEditingId = null;
let _txnCurrentType = 'income';
let _txnAllTxns = [];
let _txnPage = 1;
let _txnPageSize = 10;
let _txnAccounts = [];
let _txnIncCats = [];
let _txnExpCats = [];

async function renderTransaction(container) {
  container.innerHTML = '<div class="loading">Loading...</div>';
  try {
    container.innerHTML = await loadTemplate('transaction');
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    return;
  }

  document.getElementById('txnDate').value = new Date().toISOString().split('T')[0];

  try {
    const [accounts, categories] = await Promise.all([
      API.get('/api/accounts/'),
      API.get('/api/categories/'),
    ]);
    _txnAccounts = accounts;
    _txnIncCats  = categories.filter(c => c.type === 'income' || c.type === 'both');
    _txnExpCats  = categories.filter(c => c.type === 'expense' || c.type === 'both');
  } catch(e) {
    showAlert(document.getElementById('txnAlert'), e.message, 'error');
    return;
  }

  const accSelect = document.getElementById('txnAccount');
  const accBalanceDisplay = document.getElementById('accBalanceDisplay');

  _txnAccounts.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.name;
    opt.dataset.balance = a.balance;
    accSelect.appendChild(opt);
  });

  accSelect.addEventListener('change', () => {
    const sel = accSelect.options[accSelect.selectedIndex];
    accBalanceDisplay.textContent = sel.value ? `Current Balance: ${fmt(sel.dataset.balance)}` : '';
  });

  _txnCurrentType = 'income';
  _txnEditingId   = null;
  populateTxnCategories(_txnIncCats);
  await loadRecentTxns();

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.color = 'var(--text-muted)';
      });
      btn.classList.add('active');
      btn.style.background = 'var(--surface2)';
      _txnCurrentType = btn.dataset.tab;
      btn.style.color = _txnCurrentType === 'income' ? 'var(--income)' : 'var(--expense)';
      document.getElementById('accountLabel').textContent = _txnCurrentType === 'income' ? 'To Account' : 'From Account';
      populateTxnCategories(_txnCurrentType === 'income' ? _txnIncCats : _txnExpCats);
    });
  });

  // Save / Update
  document.getElementById('saveTxn').addEventListener('click', async () => {
    const date        = document.getElementById('txnDate').value;
    const account_id  = parseInt(document.getElementById('txnAccount').value);
    const category_id = parseInt(document.getElementById('txnCategory').value) || null;
    const amount      = parseFloat(document.getElementById('txnAmount').value);
    const note        = document.getElementById('txnNote').value.trim() || null;

    if (!date || !account_id || !amount) {
      showAlert(document.getElementById('txnAlert'), 'Date, account and amount are required', 'error');
      return;
    }

    const btn = document.getElementById('saveTxn');
    btn.disabled = true; btn.textContent = _txnEditingId ? 'Updating...' : 'Saving...';

    const payload = {
      date, type: _txnCurrentType, amount, category_id, note,
      from_account_id: _txnCurrentType === 'expense' ? account_id : null,
      to_account_id:   _txnCurrentType === 'income'  ? account_id : null,
    };

    try {
      if (_txnEditingId) {
        await API.put(`/api/transactions/${_txnEditingId}`, payload);
        showAlert(document.getElementById('txnAlert'), 'Transaction updated');
        cancelTxnEdit();
      } else {
        await API.post('/api/transactions/', payload);
        showAlert(document.getElementById('txnAlert'), 'Transaction recorded');
      }
      document.getElementById('txnAmount').value   = '';
      document.getElementById('txnNote').value     = '';
      document.getElementById('txnCategory').value = '';
      await loadRecentTxns();
    } catch(e) {
      showAlert(document.getElementById('txnAlert'), e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = _txnEditingId ? 'Update Transaction' : 'Record Transaction';
    }
  });
}

function populateTxnCategories(cats) {
  const sel = document.getElementById('txnCategory');
  sel.innerHTML = '<option value="">— Select category —</option>';
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name + (c.type === 'both' ? ' ↕' : '');
    sel.appendChild(opt);
  });
}

function cancelTxnEdit() {
  _txnEditingId = null;
  document.getElementById('saveTxn').textContent = 'Record Transaction';
  const cancelBtn = document.getElementById('cancelTxnEdit');
  if (cancelBtn) cancelBtn.remove();
  const editBanner = document.getElementById('txnEditBanner');
  if (editBanner) editBanner.remove();
  // Reset form
  document.getElementById('txnDate').value     = new Date().toISOString().split('T')[0];
  document.getElementById('txnAmount').value   = '';
  document.getElementById('txnNote').value     = '';
  document.getElementById('txnCategory').value = '';
  document.getElementById('txnAccount').value  = '';
  document.getElementById('accBalanceDisplay').textContent = '';
}

async function loadRecentTxns() {
  const el = document.getElementById('recentTxns');
  el.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const all = await API.get('/api/transactions/?limit=1000');
    _txnAllTxns = all.filter(t => t.type !== 'transfer');
    _txnPage = 1;
    renderTxnTable();
  } catch(e) {
    el.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

function renderTxnTable() {
  const el = document.getElementById('recentTxns');
  if (!_txnAllTxns.length) { el.innerHTML = '<div class="empty">No transactions yet</div>'; return; }

  const total      = _txnAllTxns.length;
  const totalPages = Math.max(1, Math.ceil(total / _txnPageSize));
  _txnPage         = Math.min(_txnPage, totalPages);
  const start      = (_txnPage - 1) * _txnPageSize;
  const rows       = _txnAllTxns.slice(start, start + _txnPageSize);

  el.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
      <thead>
        <tr style="border-bottom:2px solid var(--border);text-align:left;color:var(--text-muted);font-size:0.75rem;text-transform:uppercase">
          <th style="padding:0.4rem 0.5rem">Date</th>
          <th style="padding:0.4rem 0.5rem">Type</th>
          <th style="padding:0.4rem 0.5rem">Category</th>
          <th style="padding:0.4rem 0.5rem">Note</th>
          <th style="padding:0.4rem 0.5rem;text-align:right">Amount</th>
          <th style="padding:0.4rem 0.5rem;text-align:center">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(t => `
          <tr style="border-bottom:1px solid var(--border)" data-id="${t.id}">
            <td style="padding:0.45rem 0.5rem;white-space:nowrap">${fmtDate(t.date)}</td>
            <td style="padding:0.45rem 0.5rem"><span class="badge badge-${t.type}">${t.type}</span></td>
            <td style="padding:0.45rem 0.5rem">${t.category_name || '—'}</td>
            <td style="padding:0.45rem 0.5rem;color:var(--text-muted);font-size:0.78rem">${t.note || '—'}</td>
            <td style="padding:0.45rem 0.5rem;text-align:right" class="${t.type === 'income' ? 'amount-income' : 'amount-expense'}">
              ${t.type === 'income' ? '+' : '−'}${fmt(t.amount)}
            </td>
            <td style="padding:0.45rem 0.5rem;text-align:center;white-space:nowrap">
              <button class="btn btn-outline btn-sm txn-edit-btn" data-id="${t.id}">✏️</button>
              <button class="btn btn-danger  btn-sm txn-del-btn"  data-id="${t.id}">🗑</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
    <div class="pg-bar">
      <span style="min-width:130px;white-space:nowrap">Total Arrivals: ${total}</span>
      <div class="pg-pages">
        <button class="pg-btn" id="txnPgPrev" ${_txnPage===1?'disabled':''}>&#8249;</button>
        ${Array.from({length:Math.min(5,totalPages)},(_,ii)=>{
          const p=Math.max(1,Math.min(_txnPage-2,totalPages-4))+ii;
          return p<1||p>totalPages?'':
            `<button class="pg-btn${p===_txnPage?' active':''}" data-pg="${p}">${p}</button>`;
        }).join('')}
        <button class="pg-btn" id="txnPgNext" ${_txnPage>=totalPages?'disabled':''}>&#8250;</button>
      </div>
      <div style="display:flex;align-items:center;gap:0.4rem;min-width:130px;justify-content:flex-end;white-space:nowrap">
        Per Page:
        <select id="txnPageSizeSel" class="pg-size-sel">
          ${[10,25,50,100].map(n=>`<option value="${n}"${n===_txnPageSize?' selected':''}>${n}</option>`).join('')}
        </select>
      </div>
    </div>`

  // Pagination controls
  el.querySelector('#txnPageSizeSel').addEventListener('change', e => { _txnPageSize = parseInt(e.target.value); _txnPage = 1; renderTxnTable(); });
  el.querySelector('#txnPgPrev').addEventListener('click', () => { _txnPage--; renderTxnTable(); });
  el.querySelector('#txnPgNext').addEventListener('click', () => { _txnPage++; renderTxnTable(); });
  el.querySelectorAll('.pg-btn[data-pg]').forEach(b => b.addEventListener('click', () => { _txnPage = parseInt(b.dataset.pg); renderTxnTable(); }));

  // Edit buttons
  el.querySelectorAll('.txn-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = _txnAllTxns.find(x => x.id === parseInt(btn.dataset.id));
      if (!t) return;
      _txnEditingId = t.id;

      // Switch tab to correct type
      document.querySelectorAll('.tab-btn').forEach(b => {
        const isActive = b.dataset.tab === t.type;
        b.classList.toggle('active', isActive);
        b.style.background = isActive ? 'var(--surface2)' : 'transparent';
        b.style.color = isActive ? (t.type === 'income' ? 'var(--income)' : 'var(--expense)') : 'var(--text-muted)';
      });
      _txnCurrentType = t.type;
      document.getElementById('accountLabel').textContent = t.type === 'income' ? 'To Account' : 'From Account';
      populateTxnCategories(t.type === 'income' ? _txnIncCats : _txnExpCats);

      // Fill form
      document.getElementById('txnDate').value     = t.date;
      document.getElementById('txnAmount').value   = t.amount;
      document.getElementById('txnNote').value     = t.note || '';
      document.getElementById('txnAccount').value  = t.type === 'income' ? t.to_account_id : t.from_account_id;
      document.getElementById('txnCategory').value = t.category_id || '';
      document.getElementById('accBalanceDisplay').textContent = '';

      // Update save button + show edit banner + cancel button
      document.getElementById('saveTxn').textContent = 'Update Transaction';
      if (!document.getElementById('txnEditBanner')) {
        const banner = document.createElement('div');
        banner.id = 'txnEditBanner';
        banner.className = 'alert alert-info';
        banner.style.cssText = 'margin-bottom:0.75rem;font-size:0.85rem';
        banner.textContent = `✏️ Editing transaction #${t.id}`;
        document.getElementById('txnAlert').after(banner);
      }
      if (!document.getElementById('cancelTxnEdit')) {
        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancelTxnEdit';
        cancelBtn.className = 'btn btn-danger';
        cancelBtn.style.cssText = 'font-size:0.82rem';
        cancelBtn.textContent = '✕ Cancel Edit';
        cancelBtn.addEventListener('click', cancelTxnEdit);
        document.getElementById('txnBtnRow').appendChild(cancelBtn);
      }
      // Scroll to form
      document.getElementById('txnDate').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  // Delete buttons
  el.querySelectorAll('.txn-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await customConfirm('এই transaction টি delete করবেন?', 'Balance automatically reverse হবে।'); if (!ok) return;
      try {
        await API.delete(`/api/transactions/${btn.dataset.id}`);
        if (_txnEditingId === parseInt(btn.dataset.id)) cancelTxnEdit();
        await loadRecentTxns();
      } catch(e) {
        showAlert(document.getElementById('txnAlert'), e.message, 'error');
      }
    });
  });
}
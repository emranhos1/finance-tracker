// transfer.js

let _trEditingId = null;
let _trAllTxns   = [];
let _trPage      = 1;
let _trPageSize  = 10;
let _trAccounts  = [];

async function renderTransfer(container) {
  container.innerHTML = '<div class="loading">Loading...</div>';
  try {
    container.innerHTML = await loadTemplate('transfer');
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    return;
  }

  document.getElementById('trDate').value = new Date().toISOString().split('T')[0];

  try {
    _trAccounts = await API.get('/api/accounts/');
  } catch(e) {
    showAlert(document.getElementById('transferAlert'), e.message, 'error');
    return;
  }

  populateTrAccounts();
  _trEditingId = null;
  await loadRecentTransfers();

  document.getElementById('trFrom').addEventListener('change', () => {
    const sel = document.getElementById('trFrom');
    const opt = sel.options[sel.selectedIndex];
    document.getElementById('trFromBalance').textContent = opt.value ? `Current Balance: ${fmt(opt.dataset.balance)}` : '';
  });
  document.getElementById('trTo').addEventListener('change', () => {
    const sel = document.getElementById('trTo');
    const opt = sel.options[sel.selectedIndex];
    document.getElementById('trToBalance').textContent = opt.value ? `Current Balance: ${fmt(opt.dataset.balance)}` : '';
  });

  document.getElementById('saveTransfer').addEventListener('click', async () => {
    const date            = document.getElementById('trDate').value;
    const from_account_id = parseInt(document.getElementById('trFrom').value);
    const to_account_id   = parseInt(document.getElementById('trTo').value);
    const amount          = parseFloat(document.getElementById('trAmount').value);
    const note            = document.getElementById('trNote').value.trim() || null;

    if (!date || !from_account_id || !to_account_id || !amount) {
      showAlert(document.getElementById('transferAlert'), 'All fields except note are required', 'error');
      return;
    }
    if (from_account_id === to_account_id) {
      showAlert(document.getElementById('transferAlert'), 'Source and destination must differ', 'error');
      return;
    }

    const btn = document.getElementById('saveTransfer');
    btn.disabled = true; btn.textContent = _trEditingId ? 'Updating...' : 'Processing...';

    try {
      if (_trEditingId) {
        await API.put(`/api/transactions/transfer/${_trEditingId}`, { date, from_account_id, to_account_id, amount, note });
        showAlert(document.getElementById('transferAlert'), 'Transfer updated');
        cancelTrEdit();
      } else {
        await API.post('/api/transactions/transfer', { date, from_account_id, to_account_id, amount, note });
        showAlert(document.getElementById('transferAlert'), 'Transfer completed');
      }
      document.getElementById('trAmount').value = '';
      document.getElementById('trNote').value   = '';
      await loadRecentTransfers();
    } catch(e) {
      showAlert(document.getElementById('transferAlert'), e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = _trEditingId ? 'Update Transfer' : '🔄 Execute Transfer';
    }
  });
}

function populateTrAccounts() {
  const fromSel = document.getElementById('trFrom');
  const toSel   = document.getElementById('trTo');
  fromSel.innerHTML = '<option value="">— Select account —</option>';
  toSel.innerHTML   = '<option value="">— Select account —</option>';
  _trAccounts.forEach(a => {
    const makeOpt = () => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      opt.dataset.balance = a.balance;
      return opt;
    };
    fromSel.appendChild(makeOpt());
    toSel.appendChild(makeOpt());
  });
}

function cancelTrEdit() {
  _trEditingId = null;
  document.getElementById('saveTransfer').textContent = '🔄 Execute Transfer';
  const cancelBtn = document.getElementById('cancelTrEdit');
  if (cancelBtn) cancelBtn.remove();
  const banner = document.getElementById('trEditBanner');
  if (banner) banner.remove();
  document.getElementById('trDate').value   = new Date().toISOString().split('T')[0];
  document.getElementById('trAmount').value = '';
  document.getElementById('trNote').value   = '';
  populateTrAccounts();
  document.getElementById('trFromBalance').textContent = '';
  document.getElementById('trToBalance').textContent   = '';
}

async function loadRecentTransfers() {
  const el = document.getElementById('recentTransfers');
  el.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const all = await API.get('/api/transactions/?limit=1000');
    _trAllTxns = all.filter(t => t.type === 'transfer');
    _trPage = 1;
    renderTrTable();
  } catch(e) {
    el.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

function renderTrTable() {
  const el = document.getElementById('recentTransfers');
  if (!_trAllTxns.length) { el.innerHTML = '<div class="empty">No transfers yet</div>'; return; }

  const total      = _trAllTxns.length;
  const totalPages = Math.max(1, Math.ceil(total / _trPageSize));
  _trPage          = Math.min(_trPage, totalPages);
  const start      = (_trPage - 1) * _trPageSize;
  const rows       = _trAllTxns.slice(start, start + _trPageSize);

  el.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
      <thead>
        <tr style="border-bottom:2px solid var(--border);text-align:left;color:var(--text-muted);font-size:0.75rem;text-transform:uppercase">
          <th style="padding:0.4rem 0.5rem">Date</th>
          <th style="padding:0.4rem 0.5rem">From</th>
          <th style="padding:0.4rem 0.5rem">To</th>
          <th style="padding:0.4rem 0.5rem">Note</th>
          <th style="padding:0.4rem 0.5rem;text-align:right">Amount</th>
          <th style="padding:0.4rem 0.5rem;text-align:center">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(t => `
          <tr style="border-bottom:1px solid var(--border)" data-id="${t.id}">
            <td style="padding:0.45rem 0.5rem;white-space:nowrap">${fmtDate(t.date)}</td>
            <td style="padding:0.45rem 0.5rem;color:var(--expense)">${t.from_account_name || '—'}</td>
            <td style="padding:0.45rem 0.5rem;color:var(--income)">${t.to_account_name || '—'}</td>
            <td style="padding:0.45rem 0.5rem;color:var(--text-muted);font-size:0.78rem">${t.note || '—'}</td>
            <td style="padding:0.45rem 0.5rem;text-align:right" class="amount-neutral">${fmt(t.amount)}</td>
            <td style="padding:0.45rem 0.5rem;text-align:center;white-space:nowrap">
              <button class="btn btn-outline btn-sm tr-edit-btn" data-id="${t.id}">✏️</button>
              <button class="btn btn-danger  btn-sm tr-del-btn"  data-id="${t.id}">🗑</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
    <div class="pg-bar">
      <span style="min-width:130px;white-space:nowrap">Total Arrivals: ${total}</span>
      <div class="pg-pages">
        <button class="pg-btn" id="trPgPrev" ${_trPage===1?'disabled':''}>&#8249;</button>
        ${Array.from({length:Math.min(5,totalPages)},(_,ii)=>{
          const p=Math.max(1,Math.min(_trPage-2,totalPages-4))+ii;
          return p<1||p>totalPages?'':
            `<button class="pg-btn${p===_trPage?' active':''}" data-pg="${p}">${p}</button>`;
        }).join('')}
        <button class="pg-btn" id="trPgNext" ${_trPage>=totalPages?'disabled':''}>&#8250;</button>
      </div>
      <div style="display:flex;align-items:center;gap:0.4rem;min-width:130px;justify-content:flex-end;white-space:nowrap">
        Per Page:
        <select id="trPageSizeSel" class="pg-size-sel">
          ${[10,25,50,100].map(n=>`<option value="${n}"${n===_trPageSize?' selected':''}>${n}</option>`).join('')}
        </select>
      </div>
    </div>`

  el.querySelector('#trPageSizeSel').addEventListener('change', e => { _trPageSize = parseInt(e.target.value); _trPage = 1; renderTrTable(); });
  el.querySelector('#trPgPrev').addEventListener('click', () => { _trPage--; renderTrTable(); });
  el.querySelector('#trPgNext').addEventListener('click', () => { _trPage++; renderTrTable(); });
  el.querySelectorAll('.pg-btn[data-pg]').forEach(b => b.addEventListener('click', () => { _trPage = parseInt(b.dataset.pg); renderTrTable(); }));

  // Edit
  el.querySelectorAll('.tr-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = _trAllTxns.find(x => x.id === parseInt(btn.dataset.id));
      if (!t) return;
      _trEditingId = t.id;

      document.getElementById('trDate').value   = t.date;
      document.getElementById('trAmount').value = t.amount;
      document.getElementById('trNote').value   = t.note || '';

      populateTrAccounts();
      document.getElementById('trFrom').value = t.from_account_id;
      document.getElementById('trTo').value   = t.to_account_id;
      document.getElementById('trFromBalance').textContent = '';
      document.getElementById('trToBalance').textContent   = '';

      document.getElementById('saveTransfer').textContent = 'Update Transfer';

      if (!document.getElementById('trEditBanner')) {
        const banner = document.createElement('div');
        banner.id = 'trEditBanner';
        banner.className = 'alert alert-info';
        banner.style.cssText = 'margin-bottom:0.75rem;font-size:0.85rem';
        banner.textContent = `✏️ Editing transfer #${t.id}`;
        document.getElementById('transferAlert').after(banner);
      }
      if (!document.getElementById('cancelTrEdit')) {
        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancelTrEdit';
        cancelBtn.className = 'btn btn-danger';
        cancelBtn.style.cssText = 'font-size:0.82rem';
        cancelBtn.textContent = '✕ Cancel Edit';
        cancelBtn.addEventListener('click', cancelTrEdit);
        document.getElementById('trBtnRow').appendChild(cancelBtn);
      }
      document.getElementById('trDate').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  // Delete
  el.querySelectorAll('.tr-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await customConfirm('এই transfer টি delete করবেন?', 'উভয় account এর balance reverse হবে।'); if (!ok) return;
      try {
        await API.delete(`/api/transactions/${btn.dataset.id}`);
        if (_trEditingId === parseInt(btn.dataset.id)) cancelTrEdit();
        await loadRecentTransfers();
      } catch(e) {
        showAlert(document.getElementById('transferAlert'), e.message, 'error');
      }
    });
  });
}
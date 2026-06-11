// transfer.js — data logic only

async function renderTransfer(container) {
  container.innerHTML = '<div class="loading">Loading...</div>';
  try {
    container.innerHTML = await loadTemplate('transfer');
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    return;
  }

  document.getElementById('trDate').value = new Date().toISOString().split('T')[0];

  let accounts;
  try {
    accounts = await API.get('/api/accounts/');
  } catch(e) {
    showAlert(document.getElementById('transferAlert'), e.message, 'error');
    return;
  }

  const fromSel = document.getElementById('trFrom');
  const toSel   = document.getElementById('trTo');

  accounts.forEach(a => {
    const optFrom = document.createElement('option');
    optFrom.value = a.id;
    optFrom.textContent = `${a.name} (${a.type}) — ${fmt(a.balance)}`;
    fromSel.appendChild(optFrom);

    const optTo = document.createElement('option');
    optTo.value = a.id;
    optTo.textContent = `${a.name} (${a.type}) — ${fmt(a.balance)}`;
    toSel.appendChild(optTo);
  });

  loadRecentTransfers();

  document.getElementById('saveTransfer').addEventListener('click', async () => {
    const date           = document.getElementById('trDate').value;
    const from_account_id = parseInt(document.getElementById('trFrom').value);
    const to_account_id   = parseInt(document.getElementById('trTo').value);
    const amount         = parseFloat(document.getElementById('trAmount').value);
    const note           = document.getElementById('trNote').value.trim() || null;

    if (!date || !from_account_id || !to_account_id || !amount) {
      showAlert(document.getElementById('transferAlert'), 'All fields except note are required', 'error');
      return;
    }
    if (from_account_id === to_account_id) {
      showAlert(document.getElementById('transferAlert'), 'Source and destination must differ', 'error');
      return;
    }

    const btn = document.getElementById('saveTransfer');
    btn.disabled = true; btn.textContent = 'Processing...';

    try {
      await API.post('/api/transactions/transfer', { date, from_account_id, to_account_id, amount, note });
      showAlert(document.getElementById('transferAlert'), 'Transfer completed');
      document.getElementById('trAmount').value = '';
      document.getElementById('trNote').value   = '';
      loadRecentTransfers();
    } catch(e) {
      showAlert(document.getElementById('transferAlert'), e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '🔄 Execute Transfer';
    }
  });
}

async function loadRecentTransfers() {
  const el = document.getElementById('recentTransfers');
  el.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const txns = await API.get('/api/transactions/?type=transfer&limit=20');
    if (!txns.length) { el.innerHTML = '<div class="empty">No transfers yet</div>'; return; }
    el.innerHTML = txns.map(t => `
      <div style="display:flex;justify-content:space-between;align-items:center;
        padding:0.55rem 0;border-bottom:1px solid var(--border)">
        <div>
          <span style="color:var(--expense)">${t.from_account_name || '—'}</span>
          <span style="color:var(--text-muted);margin:0 0.4rem">→</span>
          <span style="color:var(--income)">${t.to_account_name || '—'}</span>
          ${t.note ? `<div style="font-size:0.75rem;color:var(--text-muted)">${t.note}</div>` : ''}
        </div>
        <div style="text-align:right">
          <div class="amount-neutral">${fmt(t.amount)}</div>
          <div style="font-size:0.72rem;color:var(--text-muted)">${fmtDate(t.date)}</div>
        </div>
      </div>
    `).join('');
  } catch(e) {
    el.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

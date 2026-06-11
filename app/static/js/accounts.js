// accounts.js — data logic only

async function renderAccounts(container) {
  container.innerHTML = '<div class="loading">Loading...</div>';
  try {
    container.innerHTML = await loadTemplate('accounts');
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    return;
  }

  document.getElementById('addAccountBtn').addEventListener('click', () => showAccountModal(container));
  await loadAccounts(container);
}

async function loadAccounts(container) {
  const tbody = document.getElementById('accountsBody');
  tbody.innerHTML = '<tr><td colspan="6" class="loading">Loading...</td></tr>';

  let accounts;
  try {
    accounts = await API.get('/api/accounts/');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="6" class="alert alert-error">${e.message}</td></tr>`;
    return;
  }

  if (!accounts.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No accounts yet. Add one!</td></tr>';
    return;
  }

  tbody.innerHTML = accounts.map(a => `
    <tr>
      <td><strong>${a.name}</strong></td>
      <td><span class="badge badge-${a.type}">${a.type.toUpperCase()}</span></td>
      <td class="${a.balance >= 0 ? 'amount-income' : 'amount-expense'}">${fmt(a.balance)}</td>
      <td>${a.starting_date ? fmtDate(a.starting_date) : '—'}</td>
      <td>${a.maturity_date ? fmtDate(a.maturity_date) : '—'}</td>
      <td>${a.installment_amount ? fmt(a.installment_amount) : '—'}</td>
      <td style="display:flex;gap:0.4rem">
        <button class="btn btn-outline btn-sm" data-action="edit" data-id="${a.id}">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${a.id}">🗑 Delete</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-action="edit"]').forEach(btn => {
    const a = accounts.find(x => x.id === parseInt(btn.dataset.id));
    btn.addEventListener('click', () => showAccountModal(container, a));
  });

  tbody.querySelectorAll('[data-action="delete"]').forEach(btn => {
    const a = accounts.find(x => x.id === parseInt(btn.dataset.id));
    btn.addEventListener('click', () => confirmDeleteAccount(container, a));
  });
}

function showAccountModal(container, existing = null) {
  const isEdit = !!existing;
  const tpl = document.getElementById('tplAccountModal');
  const clone = tpl.content.cloneNode(true);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.appendChild(clone);
  document.body.appendChild(overlay);

  overlay.querySelector('#modalTitle').textContent = isEdit ? '✏️ Edit Account' : '➕ New Account';
  overlay.querySelector('#saveAccount').textContent = isEdit ? 'Save Changes' : 'Create Account';

  if (isEdit) {
    overlay.querySelector('#accName').value    = existing.name;
    overlay.querySelector('#accType').value    = existing.type;
    overlay.querySelector('#accBalance').value = existing.balance;
    if (existing.starting_date)      overlay.querySelector('#accStarting').value    = existing.starting_date;
    if (existing.maturity_date)      overlay.querySelector('#accMaturity').value    = existing.maturity_date;
    if (existing.installment_amount) overlay.querySelector('#accInstallment').value = existing.installment_amount;
    updateDpsFields();
  }

  const accType   = overlay.querySelector('#accType');
  const dpsFields = overlay.querySelector('#dpsFields');
  const installmentGroup = overlay.querySelector('#installmentGroup');

  function updateDpsFields() {
    const t = accType.value;
    dpsFields.style.display = ['dps','fdr'].includes(t) ? '' : 'none';
    installmentGroup.style.display = t === 'dps' ? '' : 'none';
  }
  accType.addEventListener('change', updateDpsFields);

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#cancelModal').addEventListener('click', () => overlay.remove());

  overlay.querySelector('#saveAccount').addEventListener('click', async () => {
    const name      = overlay.querySelector('#accName').value.trim();
    const type      = accType.value;
    const balance   = parseFloat(overlay.querySelector('#accBalance').value) || 0;
    const starting  = overlay.querySelector('#accStarting').value || null;
    const maturity  = overlay.querySelector('#accMaturity').value || null;
    const installment = overlay.querySelector('#accInstallment').value || null;

    if (!name) { showAlert(overlay.querySelector('#modalAlert'), 'Account name is required', 'error'); return; }

    const btn = overlay.querySelector('#saveAccount');
    btn.disabled = true; btn.textContent = 'Saving...';

    try {
      if (isEdit) {
        await API.put(`/api/accounts/${existing.id}`, { name, type, balance, starting_date: starting, maturity_date: maturity, installment_amount: installment ? parseFloat(installment) : null });
        showAlert(document.getElementById('accountAlert'), 'Account updated');
      } else {
        await API.post('/api/accounts/', { name, type, balance, starting_date: starting, maturity_date: maturity, installment_amount: installment ? parseFloat(installment) : null });
        showAlert(document.getElementById('accountAlert'), 'Account created');
      }
      overlay.remove();
      await loadAccounts(container);
    } catch(e) {
      showAlert(overlay.querySelector('#modalAlert'), e.message, 'error');
      btn.disabled = false;
      btn.textContent = isEdit ? 'Save Changes' : 'Create Account';
    }
  });
}

function confirmDeleteAccount(container, account) {
  const tpl = document.getElementById('tplDeleteModal');
  const clone = tpl.content.cloneNode(true);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.appendChild(clone);
  document.body.appendChild(overlay);

  overlay.querySelector('#deleteAccountName').textContent = account.name;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#cancelDel').addEventListener('click', () => overlay.remove());

  overlay.querySelector('#confirmDel').addEventListener('click', async () => {
    const btn = overlay.querySelector('#confirmDel');
    btn.textContent = 'Deleting...'; btn.disabled = true;
    try {
      await API.delete(`/api/accounts/${account.id}`);
      overlay.remove();
      showAlert(document.getElementById('accountAlert'), `"${account.name}" deleted`);
      await loadAccounts(container);
    } catch(e) {
      showAlert(overlay.querySelector('#delAlert'), e.message, 'error');
      btn.textContent = 'Yes, Delete'; btn.disabled = false;
    }
  });
}
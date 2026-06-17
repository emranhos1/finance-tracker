// accounts.js

let __accountTypesCache = [];

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

async function fetchAccountTypesForDropdown() {
  try {
    _accountTypesCache = await API.get('/api/account-types/');
  } catch(e) {
    _accountTypesCache = [];
  }
  return _accountTypesCache;
}

async function loadAccounts(container) {
  const tbody = document.getElementById('accountsBody');
  tbody.innerHTML = '<tr><td colspan="8" class="loading">Loading...</td></tr>';

  let accounts;
  try {
    accounts = await API.get('/api/accounts/');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="8" class="alert alert-error">${e.message}</td></tr>`;
    return;
  }

  if (!accounts.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">No accounts yet. Add one!</td></tr>';
    return;
  }

  tbody.innerHTML = accounts.map(a => `
    <tr>
      <td><strong>${a.name}</strong></td>
      <td><span class="badge badge-other">${(a.account_type_name || '—').toUpperCase()}</span></td>
      <td style="font-size:0.82rem;color:var(--text-muted)">${a.account_number || '—'}</td>
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
  const tpl    = document.getElementById('tplAccountModal');
  const clone  = tpl.content.cloneNode(true);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.appendChild(clone);
  document.body.appendChild(overlay);

  overlay.querySelector('#modalTitle').textContent    = isEdit ? '✏️ Edit Account' : '➕ New Account';
  overlay.querySelector('#saveAccount').textContent   = isEdit ? 'Save Changes' : 'Create Account';

  const accType    = overlay.querySelector('#accType');
  const modalAlert = overlay.querySelector('#modalAlert');

  // --- Attach Cancel / close listeners FIRST, so they always work ---
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#cancelModal').addEventListener('click', () => overlay.remove());

  // --- Fill in known fields immediately (doesn't depend on types) ---
  if (isEdit) {
    overlay.querySelector('#accName').value    = existing.name;
    overlay.querySelector('#accBalance').value = existing.balance;
    if (existing.account_number)     overlay.querySelector('#accNumber').value      = existing.account_number;
    if (existing.starting_date)      overlay.querySelector('#accStarting').value    = existing.starting_date;
    if (existing.maturity_date)      overlay.querySelector('#accMaturity').value    = existing.maturity_date;
    if (existing.installment_amount) overlay.querySelector('#accInstallment').value = existing.installment_amount;
  }

  // --- Attach Save listener FIRST (reads dropdown value at click-time) ---
  overlay.querySelector('#saveAccount').addEventListener('click', async () => {
    const name        = overlay.querySelector('#accName').value.trim();
    const account_type_id = parseInt(accType.value);
    const balance     = parseFloat(overlay.querySelector('#accBalance').value) || 0;
    const acct_number = overlay.querySelector('#accNumber').value.trim() || null;
    const starting    = overlay.querySelector('#accStarting').value || null;
    const maturity    = overlay.querySelector('#accMaturity').value || null;
    const installment = overlay.querySelector('#accInstallment').value || null;

    if (!name) { showAlert(modalAlert, 'Account name is required', 'error'); return; }
    if (!account_type_id || isNaN(account_type_id)) { showAlert(modalAlert, 'Please select an account type', 'error'); return; }

    const btn = overlay.querySelector('#saveAccount');
    btn.disabled = true; btn.textContent = 'Saving...';

    const payload = {
      name, account_type_id, balance,
      account_number: acct_number,
      starting_date: starting,
      maturity_date: maturity,
      installment_amount: installment ? parseFloat(installment) : null
    };

    try {
      if (isEdit) {
        await API.put(`/api/accounts/${existing.id}`, payload);
        showAlert(document.getElementById('accountAlert'), 'Account updated');
      } else {
        await API.post('/api/accounts/', payload);
        showAlert(document.getElementById('accountAlert'), 'Account created');
      }
      overlay.remove();
      await loadAccounts(container);
    } catch(e) {
      showAlert(modalAlert, e.message, 'error');
      btn.disabled = false;
      btn.textContent = isEdit ? 'Save Changes' : 'Create Account';
    }
  });

  // --- Load account types from DB (async, doesn't block buttons above) ---
  accType.innerHTML = '<option value="">Loading...</option>';
  (async () => {
    const types = await fetchAccountTypesForDropdown();

    if (!types.length) {
      accType.innerHTML = '<option value="">— No types available —</option>';
      showAlert(modalAlert, '"Account Types" page এ গিয়ে আগে একটা Account Type তৈরি করুন।', 'error');
      return;
    }

    accType.innerHTML = types.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    if (isEdit) accType.value = existing.account_type_id;
  })();
}

function confirmDeleteAccount(container, account) {
  const tpl   = document.getElementById('tplDeleteModal');
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
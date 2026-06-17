// account_types.js — simple CRUD for account type names

async function renderAccountTypes(container) {
  container.innerHTML = '<div class="loading">Loading...</div>';
  try {
    container.innerHTML = await loadTemplate('account_types');
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    return;
  }

  document.getElementById('addTypeBtn').addEventListener('click', () => showTypeModal(container));
  await loadAccountTypes(container);
}

async function loadAccountTypes(container) {
  const tbody = document.getElementById('typesBody');
  tbody.innerHTML = '<tr><td colspan="3" class="loading">Loading...</td></tr>';

  let types;
  try {
    types = await API.get('/api/account-types/');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="3" class="alert alert-error">${e.message}</td></tr>`;
    return;
  }

  if (!types.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty">No account types yet</td></tr>';
    return;
  }

  tbody.innerHTML = types.map(t => `
    <tr>
      <td><strong>${t.name}</strong></td>
      <td style="font-size:0.82rem;color:var(--text-muted)">${t.created_at ? fmtDate(t.created_at.split('T')[0]) : '—'}</td>
      <td style="display:flex;gap:0.4rem">
        <button class="btn btn-outline btn-sm" data-action="edit" data-id="${t.id}">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${t.id}">🗑 Delete</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-action="edit"]').forEach(btn => {
    const t = types.find(x => x.id === parseInt(btn.dataset.id));
    btn.addEventListener('click', () => showTypeModal(container, t));
  });
  tbody.querySelectorAll('[data-action="delete"]').forEach(btn => {
    const t = types.find(x => x.id === parseInt(btn.dataset.id));
    btn.addEventListener('click', () => confirmDeleteType(container, t));
  });
}

function showTypeModal(container, existing = null) {
  const isEdit = !!existing;
  const tpl = document.getElementById('tplTypeModal');
  const clone = tpl.content.cloneNode(true);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.appendChild(clone);
  document.body.appendChild(overlay);

  overlay.querySelector('#typeModalTitle').textContent = isEdit ? '✏️ Edit Account Type' : '➕ New Account Type';
  overlay.querySelector('#saveType').textContent = isEdit ? 'Save Changes' : 'Create Type';

  if (isEdit) {
    overlay.querySelector('#typeName').value = existing.name;
  }

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#cancelType').addEventListener('click', () => overlay.remove());

  overlay.querySelector('#saveType').addEventListener('click', async () => {
    const name = overlay.querySelector('#typeName').value.trim();
    if (!name) { showAlert(overlay.querySelector('#typeModalAlert'), 'Name is required', 'error'); return; }

    const btn = overlay.querySelector('#saveType');
    btn.disabled = true; btn.textContent = 'Saving...';

    try {
      if (isEdit) {
        await API.put(`/api/account-types/${existing.id}`, { name });
        showAlert(document.getElementById('typeAlert'), 'Account type updated');
      } else {
        await API.post('/api/account-types/', { name });
        showAlert(document.getElementById('typeAlert'), 'Account type created');
      }
      overlay.remove();
      await loadAccountTypes(container);
    } catch(e) {
      showAlert(overlay.querySelector('#typeModalAlert'), e.message, 'error');
      btn.disabled = false;
      btn.textContent = isEdit ? 'Save Changes' : 'Create Type';
    }
  });
}

function confirmDeleteType(container, type) {
  const tpl = document.getElementById('tplTypeDeleteModal');
  const clone = tpl.content.cloneNode(true);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.appendChild(clone);
  document.body.appendChild(overlay);

  overlay.querySelector('#deleteTypeName').textContent = type.name;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#cancelDelType').addEventListener('click', () => overlay.remove());

  overlay.querySelector('#confirmDelType').addEventListener('click', async () => {
    const btn = overlay.querySelector('#confirmDelType');
    btn.textContent = 'Deleting...'; btn.disabled = true;
    try {
      await API.delete(`/api/account-types/${type.id}`);
      overlay.remove();
      showAlert(document.getElementById('typeAlert'), `"${type.name}" deleted`);
      await loadAccountTypes(container);
    } catch(e) {
      showAlert(overlay.querySelector('#delTypeAlert'), e.message, 'error');
      btn.textContent = 'Yes, Delete'; btn.disabled = false;
    }
  });
}
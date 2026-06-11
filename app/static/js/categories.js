// categories.js — data logic only

async function renderCategories(container) {
  container.innerHTML = '<div class="loading">Loading...</div>';
  try {
    container.innerHTML = await loadTemplate('categories');
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    return;
  }

  document.getElementById('addCatBtn').addEventListener('click', () => showCatModal(container));
  await loadCategories(container);
}

async function loadCategories(container) {
  let categories;
  try {
    categories = await API.get('/api/categories/');
  } catch(e) {
    showAlert(document.getElementById('catAlert'), e.message, 'error');
    return;
  }

  const income  = categories.filter(c => c.type === 'income');
  const expense = categories.filter(c => c.type === 'expense');
  const both    = categories.filter(c => c.type === 'both');

  renderCatBody('incomeBody',  income,  categories);
  renderCatBody('expenseBody', expense, categories);
  renderCatBody('bothBody',    both,    categories);
}

function renderCatBody(tbodyId, cats, allCats) {
  const tbody = document.getElementById(tbodyId);
  if (!cats.length) {
    tbody.innerHTML = '<tr><td colspan="2" class="empty">None</td></tr>';
    return;
  }
  tbody.innerHTML = cats.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td style="display:flex;gap:0.4rem">
        <button class="btn btn-outline btn-sm" data-action="edit" data-id="${c.id}">✏️</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${c.id}">🗑</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-action="edit"]').forEach(btn => {
    const c = allCats.find(x => x.id === parseInt(btn.dataset.id));
    btn.addEventListener('click', () => showCatModal(document.getElementById('mainContent'), c));
  });

  tbody.querySelectorAll('[data-action="delete"]').forEach(btn => {
    const c = allCats.find(x => x.id === parseInt(btn.dataset.id));
    btn.addEventListener('click', () => confirmDeleteCat(c));
  });
}

function showCatModal(container, existing = null) {
  const isEdit = !!existing;
  const tpl = document.getElementById('tplCatModal');
  const clone = tpl.content.cloneNode(true);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.appendChild(clone);
  document.body.appendChild(overlay);

  overlay.querySelector('#catModalTitle').textContent = isEdit ? '✏️ Edit Category' : '➕ New Category';
  overlay.querySelector('#saveCat').textContent = isEdit ? 'Save Changes' : 'Create Category';

  if (isEdit) {
    overlay.querySelector('#catName').value = existing.name;
    const radio = overlay.querySelector(`input[name="catType"][value="${existing.type}"]`);
    if (radio) radio.checked = true;
  }

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#cancelCat').addEventListener('click', () => overlay.remove());

  overlay.querySelector('#saveCat').addEventListener('click', async () => {
    const name = overlay.querySelector('#catName').value.trim();
    const type = overlay.querySelector('input[name="catType"]:checked')?.value;

    if (!name) { showAlert(overlay.querySelector('#catModalAlert'), 'Name is required', 'error'); return; }
    if (!type) { showAlert(overlay.querySelector('#catModalAlert'), 'Select a type', 'error'); return; }

    const btn = overlay.querySelector('#saveCat');
    btn.disabled = true; btn.textContent = 'Saving...';

    try {
      if (isEdit) {
        await API.put(`/api/categories/${existing.id}`, { name, type });
        showAlert(document.getElementById('catAlert'), 'Category updated');
      } else {
        await API.post('/api/categories/', { name, type });
        showAlert(document.getElementById('catAlert'), 'Category created');
      }
      overlay.remove();
      await loadCategories(container);
    } catch(e) {
      showAlert(overlay.querySelector('#catModalAlert'), e.message, 'error');
      btn.disabled = false;
      btn.textContent = isEdit ? 'Save Changes' : 'Create Category';
    }
  });
}

function confirmDeleteCat(cat) {
  const tpl = document.getElementById('tplCatDeleteModal');
  const clone = tpl.content.cloneNode(true);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.appendChild(clone);
  document.body.appendChild(overlay);

  overlay.querySelector('#deleteCatName').textContent = cat.name;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#cancelDelCat').addEventListener('click', () => overlay.remove());

  overlay.querySelector('#confirmDelCat').addEventListener('click', async () => {
    const btn = overlay.querySelector('#confirmDelCat');
    btn.textContent = 'Deleting...'; btn.disabled = true;
    try {
      await API.delete(`/api/categories/${cat.id}`);
      overlay.remove();
      showAlert(document.getElementById('catAlert'), `"${cat.name}" deleted`);
      await loadCategories(document.getElementById('mainContent'));
    } catch(e) {
      showAlert(overlay.querySelector('#delCatAlert'), e.message, 'error');
      btn.textContent = 'Yes, Delete'; btn.disabled = false;
    }
  });
}

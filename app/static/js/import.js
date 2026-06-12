// import.js

let importState = {
  rows: [],        // parsed rows from preview
  accounts: [],
  categories: [],
};

async function renderImport(container) {
  container.innerHTML = '<div class="loading">Loading...</div>';
  try {
    container.innerHTML = await loadTemplate('import');
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    return;
  }

  importState = { rows: [], accounts: [], categories: [] };
  document.getElementById('previewSection').style.display = 'none';
  document.getElementById('previewBtn').addEventListener('click', handlePreview);
}

async function handlePreview() {
  const fileInput = document.getElementById('importFile');
  const alertEl   = document.getElementById('importAlert');
  const btn       = document.getElementById('previewBtn');

  alertEl.innerHTML = '';

  if (!fileInput.files.length) {
    showAlert(alertEl, 'Please choose an .xlsx file', 'error'); return;
  }

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  btn.disabled = true; btn.textContent = 'Reading...';

  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/import/preview', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to read file');

    if (!data.rows.length) {
      showAlert(alertEl, 'No valid transaction rows found in this file.', 'error');
      return;
    }
    if (!data.accounts.length) {
      showAlert(alertEl, 'You need at least one account before importing. Go to Accounts page first.', 'error');
      return;
    }

    importState.rows = data.rows.map((r, i) => ({
      ...r,
      _id: i,
      _account_id: data.accounts[0].id,
      _to_account_id: data.accounts.length > 1 ? data.accounts[1].id : data.accounts[0].id,
    }));
    importState.accounts   = data.accounts;
    importState.categories = data.categories;

    renderPreviewTable();
    document.getElementById('previewSection').style.display = '';
    document.getElementById('importResult').innerHTML = '';
  } catch(e) {
    showAlert(alertEl, e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '🔍 Read & Preview';
  }
}

function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function accountOptionsHtml() {
  return importState.accounts.map(a =>
    `<option value="${a.id}">${a.name} (${a.type.toUpperCase()})</option>`
  ).join('');
}

function categoryOptionsHtml() {
  const opts = importState.categories.map(c =>
    `<option value="${c.id}">${escapeAttr(c.name)} (${c.type})</option>`
  ).join('');
  return opts + `<option value="__custom__">➕ New Category...</option>`;
}

function renderPreviewTable() {
  const tbody = document.getElementById('previewBody');

  tbody.innerHTML = importState.rows.map(row => {
    const matchedCat = importState.categories.find(c => c.name === row.category_name);
    const catSelectValue = matchedCat ? matchedCat.id : '__custom__';
    const customDisplay  = matchedCat ? 'none' : '';

    return `
    <tr data-id="${row._id}">
      <td><input type="checkbox" class="rowCheck" checked></td>
      <td><input type="date" class="rowDate" value="${row.date}" style="padding:0.35rem;font-size:0.8rem;width:auto"></td>
      <td>
        <select class="rowType" style="padding:0.35rem;font-size:0.8rem;width:auto">
          <option value="income" ${row.type === 'income' ? 'selected' : ''}>Income</option>
          <option value="expense" ${row.type === 'expense' ? 'selected' : ''}>Expense</option>
          <option value="transfer">🔄 Transfer</option>
        </select>
      </td>
      <td class="categoryCell">
        <select class="rowCategorySelect" style="padding:0.35rem;font-size:0.8rem;width:170px">
          ${categoryOptionsHtml()}
        </select>
        <input type="text" class="rowCategoryCustom" value="${escapeAttr(row.category_name)}"
               placeholder="Category name"
               style="padding:0.35rem;font-size:0.8rem;width:170px;margin-top:0.3rem;display:${customDisplay}">
        <span class="categoryPlaceholder" style="display:none;color:var(--text-muted);font-size:0.8rem">—</span>
      </td>
      <td><input type="text" class="rowNote" value="${escapeAttr(row.note || '')}" style="padding:0.35rem;font-size:0.8rem;width:140px"></td>
      <td><input type="number" class="rowAmount" value="${row.amount}" step="0.01" style="padding:0.35rem;font-size:0.8rem;width:90px"></td>
      <td class="accountCell">
        <select class="rowAccount" style="padding:0.35rem;font-size:0.8rem;width:auto">
          ${accountOptionsHtml()}
        </select>
        <div class="toAccountWrap" style="display:none;margin-top:0.3rem">
          <span style="font-size:0.75rem;color:var(--text-muted)">→ To:</span>
          <select class="rowToAccount" style="padding:0.35rem;font-size:0.8rem;width:auto">
            ${accountOptionsHtml()}
          </select>
        </div>
      </td>
      <td style="display:flex;gap:0.4rem">
        <button class="btn btn-primary btn-sm rowSaveBtn">💾 Save</button>
        <button class="btn btn-danger btn-sm rowDeleteBtn">🗑</button>
      </td>
    </tr>`;
  }).join('');

  // set selected values per row + initial visibility
  tbody.querySelectorAll('tr').forEach(tr => {
    const id  = parseInt(tr.dataset.id);
    const row = importState.rows.find(r => r._id === id);

    const catSelect = tr.querySelector('.rowCategorySelect');
    const matchedCat = importState.categories.find(c => c.name === row.category_name);
    catSelect.value = matchedCat ? String(matchedCat.id) : '__custom__';

    tr.querySelector('.rowAccount').value   = row._account_id;
    tr.querySelector('.rowToAccount').value = row._to_account_id;

    updateRowVisibility(tr);
  });

  attachRowListeners();
  updateSelectedCount();

  // master checkbox
  document.getElementById('masterCheck').onclick = (e) => {
    tbody.querySelectorAll('.rowCheck').forEach(cb => cb.checked = e.target.checked);
    updateSelectedCount();
  };

  document.getElementById('selectAllBtn').onclick = () => {
    tbody.querySelectorAll('.rowCheck').forEach(cb => cb.checked = true);
    document.getElementById('masterCheck').checked = true;
    updateSelectedCount();
  };
  document.getElementById('deselectAllBtn').onclick = () => {
    tbody.querySelectorAll('.rowCheck').forEach(cb => cb.checked = false);
    document.getElementById('masterCheck').checked = false;
    updateSelectedCount();
  };

  document.getElementById('importSelectedBtn').onclick = handleBulkCommit;
}

function updateRowVisibility(tr) {
  const type = tr.querySelector('.rowType').value;
  const isTransfer = type === 'transfer';

  const catSelect  = tr.querySelector('.rowCategorySelect');
  const catCustom  = tr.querySelector('.rowCategoryCustom');
  const catPlaceholder = tr.querySelector('.categoryPlaceholder');

  if (isTransfer) {
    catSelect.style.display = 'none';
    catCustom.style.display = 'none';
    catPlaceholder.style.display = '';
  } else {
    catSelect.style.display = '';
    catPlaceholder.style.display = 'none';
    catCustom.style.display = (catSelect.value === '__custom__') ? '' : 'none';
  }

  tr.querySelector('.toAccountWrap').style.display = isTransfer ? '' : 'none';
}

function attachRowListeners() {
  document.querySelectorAll('#previewBody tr').forEach(tr => {
    tr.querySelector('.rowCheck').addEventListener('change', updateSelectedCount);

    tr.querySelector('.rowType').addEventListener('change', () => updateRowVisibility(tr));

    tr.querySelector('.rowCategorySelect').addEventListener('change', (e) => {
      const customInput = tr.querySelector('.rowCategoryCustom');
      customInput.style.display = e.target.value === '__custom__' ? '' : 'none';
    });

    tr.querySelector('.rowSaveBtn').addEventListener('click', () => handleRowSave(tr));
    tr.querySelector('.rowDeleteBtn').addEventListener('click', () => removeRow(tr));
  });
}

function updateSelectedCount() {
  const total = document.querySelectorAll('#previewBody .rowCheck').length;
  const checked = document.querySelectorAll('#previewBody .rowCheck:checked').length;
  document.getElementById('selectedCount').textContent = `${checked} of ${total} rows selected`;
}

/**
 * Reads current values from a table row and returns a transaction payload,
 * or null if the row is incomplete/invalid.
 */
function gatherRowData(tr) {
  const date   = tr.querySelector('.rowDate').value;
  const type   = tr.querySelector('.rowType').value;
  const note   = tr.querySelector('.rowNote').value.trim();
  const amount = parseFloat(tr.querySelector('.rowAmount').value);
  const account_id = parseInt(tr.querySelector('.rowAccount').value);

  if (!date || !amount || amount <= 0 || !account_id) return null;

  if (type === 'transfer') {
    const to_account_id = parseInt(tr.querySelector('.rowToAccount').value);
    if (!to_account_id || to_account_id === account_id) return null;
    return { date, type, amount, account_id, to_account_id, note: note || null };
  }

  const catSelect = tr.querySelector('.rowCategorySelect');
  const catCustom = tr.querySelector('.rowCategoryCustom');
  let category_name, category_type;

  if (catSelect.value === '__custom__') {
    category_name = catCustom.value.trim();
    category_type = type;
  } else {
    const cat = importState.categories.find(c => String(c.id) === catSelect.value);
    category_name = cat ? cat.name : catCustom.value.trim();
    category_type = cat ? cat.type : type;
  }

  if (!category_name) return null;

  return { date, type, amount, category_name, category_type, account_id, note: note || null };
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `alert alert-${type}`;
  toast.style.cssText = `
    position: fixed; top: 1rem; right: 1rem; z-index: 999;
    max-width: 320px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: fadeIn 0.2s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function removeRow(tr) {
  const id = parseInt(tr.dataset.id);
  importState.rows = importState.rows.filter(r => r._id !== id);
  tr.remove();
  updateSelectedCount();
  if (!importState.rows.length) {
    document.getElementById('previewSection').style.display = 'none';
  }
}

async function handleRowSave(tr) {
  const alertEl = document.getElementById('importAlert');
  alertEl.innerHTML = '';

  const data = gatherRowData(tr);
  if (!data) {
    showAlert(alertEl, 'This row is incomplete — check date, amount, category/account.', 'error');
    return;
  }

  const btn = tr.querySelector('.rowSaveBtn');
  btn.disabled = true; btn.textContent = '...';

  try {
    await API.post('/api/import/commit', { transactions: [data] });
    showToast('✅ Row saved successfully');
    removeRow(tr);
  } catch(e) {
    showAlert(alertEl, e.message, 'error');
    btn.disabled = false; btn.textContent = '💾 Save';
  }
}

async function handleBulkCommit() {
  const alertEl  = document.getElementById('importAlert');
  const resultEl = document.getElementById('importResult');
  const btn      = document.getElementById('importSelectedBtn');
  alertEl.innerHTML = '';
  resultEl.innerHTML = '';

  const transactions = [];
  const rowsToRemove = [];

  document.querySelectorAll('#previewBody tr').forEach(tr => {
    if (!tr.querySelector('.rowCheck').checked) return;
    const data = gatherRowData(tr);
    if (data) {
      transactions.push(data);
      rowsToRemove.push(tr);
    }
  });

  if (!transactions.length) {
    showAlert(alertEl, 'No valid rows selected', 'error'); return;
  }

  btn.disabled = true; btn.textContent = 'Importing...';

  try {
    const data = await API.post('/api/import/commit', { transactions });

    resultEl.innerHTML = `
      <div class="alert alert-success" style="margin-bottom:1rem">${data.message}</div>
      <table>
        <tbody>
          <tr><td>Date Range</td><td><strong>${data.date_range.start} → ${data.date_range.end}</strong></td></tr>
          <tr><td>Transactions Created</td><td><strong>${data.transactions_created}</strong></td></tr>
          <tr><td>New Categories Created</td><td><strong>${data.categories_created}</strong></td></tr>
          ${data.accounts.map(a => `<tr><td>${a.name} — New Balance</td><td><strong>${fmt(a.balance)}</strong></td></tr>`).join('')}
        </tbody>
      </table>`;

    rowsToRemove.forEach(tr => removeRow(tr));
    document.getElementById('importFile').value = '';
  } catch(e) {
    showAlert(alertEl, e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '📤 Import Selected';
  }
}
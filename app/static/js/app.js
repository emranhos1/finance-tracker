// app.js — routing only

const pages = {
  dashboard:   renderDashboard,
  accounts:    renderAccounts,
  categories:  renderCategories,
  transaction: renderTransaction,
  transfer:    renderTransfer,
  reports:     renderReports,
  import:      renderImport,
  admin:       renderAdmin,
};

function navigate(page) {
  if (!pages[page]) return;
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });
  pages[page](document.getElementById('mainContent'));
  if (role === 'admin') refreshPendingBadge();
}

const role     = localStorage.getItem('role');
const username = localStorage.getItem('username');

if (role === 'admin') {
  document.getElementById('adminMenuItem').style.display = '';
}

if (username) {
  document.getElementById('userInfo').textContent = `👤 ${username}${role === 'admin' ? ' (admin)' : ''}`;
}

async function refreshPendingBadge() {
  if (role !== 'admin') return;
  try {
    const data  = await API.get('/api/admin/users/pending-count');
    const badge = document.getElementById('pendingBadge');
    if (data.count > 0) {
      badge.textContent   = data.count;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  } catch(e) {}
}

function showChangePasswordModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:400px">
      <h2>🔑 Change Password</h2>
      <div id="cpAlert"></div>
      <div class="form-group">
        <label>Current Password</label>
        <input type="password" id="cpOld" placeholder="••••••••">
      </div>
      <div class="form-group">
        <label>New Password</label>
        <input type="password" id="cpNew" placeholder="Min. 6 characters">
      </div>
      <div class="form-group">
        <label>Confirm New Password</label>
        <input type="password" id="cpConfirm" placeholder="••••••••">
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" id="cpCancel">Cancel</button>
        <button class="btn btn-primary" id="cpSave">Change Password</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#cpCancel').addEventListener('click', () => overlay.remove());

  overlay.querySelector('#cpSave').addEventListener('click', async () => {
    const old_password = overlay.querySelector('#cpOld').value;
    const new_password = overlay.querySelector('#cpNew').value;
    const confirm      = overlay.querySelector('#cpConfirm').value;
    const alertEl      = overlay.querySelector('#cpAlert');

    if (!old_password || !new_password || !confirm) {
      showAlert(alertEl, 'All fields are required', 'error'); return;
    }
    if (new_password !== confirm) {
      showAlert(alertEl, 'New passwords do not match', 'error'); return;
    }
    if (new_password.length < 6) {
      showAlert(alertEl, 'Minimum 6 characters required', 'error'); return;
    }

    const btn = overlay.querySelector('#cpSave');
    btn.disabled = true; btn.textContent = 'Saving...';

    try {
      await API.post('/api/auth/change-password', { old_password, new_password });
      overlay.remove();
      const alertDiv = document.createElement('div');
      alertDiv.className = 'alert alert-success';
      alertDiv.style.cssText = 'position:fixed;top:1rem;right:1rem;z-index:999;max-width:300px';
      alertDiv.textContent = '✅ Password changed successfully';
      document.body.appendChild(alertDiv);
      setTimeout(() => alertDiv.remove(), 4000);
    } catch(e) {
      showAlert(alertEl, e.message, 'error');
      btn.disabled = false; btn.textContent = 'Change Password';
    }
  });
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.page));
});

document.getElementById('changePassBtn').addEventListener('click', showChangePasswordModal);

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  localStorage.removeItem('username');
  window.location.href = '/';
});

navigate('dashboard');

if (role === 'admin') {
  refreshPendingBadge();
  setInterval(refreshPendingBadge, 60000);
}
// app.js — routing only

const pages = {
  dashboard:   renderDashboard,
  accounts:    renderAccounts,
  categories:  renderCategories,
  transaction: renderTransaction,
  transfer:    renderTransfer,
  reports:     renderReports,
};

function navigate(page) {
  if (!pages[page]) return;
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });
  pages[page](document.getElementById('mainContent'));
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.page));
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('token');
  window.location.href = '/';
});

navigate('dashboard');

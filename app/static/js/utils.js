// utils.js — shared helpers only, zero HTML

async function loadTemplate(name) {
  const res = await fetch(`/static/html/${name}.html?v=${Date.now()}`);
  if (!res.ok) throw new Error(`Template not found: ${name}`);
  return await res.text();
}

function fmt(amount) {
  return '৳' + Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function showAlert(container, msg, type = 'success') {
  if (!container) return;
  const el = document.createElement('div');
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  container.prepend(el);
  setTimeout(() => el.remove(), 4000);
}

function showModal(html) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });
  return overlay;
}

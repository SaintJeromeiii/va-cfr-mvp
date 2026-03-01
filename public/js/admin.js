async function showAdminMessage(msg, err=false) {
  const n = document.getElementById('adminNotification');
  n.textContent = msg;
  n.style.color = err ? 'crimson' : 'green';
  setTimeout(() => { n.textContent = ''; }, 5000);
}

function makeBtn(text, onClick) {
  const b = document.createElement('button');
  b.textContent = text;
  b.addEventListener('click', onClick);
  b.style.marginLeft = '6px';
  return b;
}

async function fetchSessions(secret) {
  try {
    const res = await fetch(`/api/admin/sessions?adminSecret=${encodeURIComponent(secret)}`);
    if (!res.ok) throw new Error('fetch failed');
    return await res.json();
  } catch (e) { throw e; }
}

async function revokeByToken(secret, token) {
  const res = await fetch('/api/admin/revoke', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
    body: JSON.stringify({ token })
  });
  return res.ok;
}

async function revokeByUsername(secret, username) {
  const res = await fetch('/api/admin/revoke', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
    body: JSON.stringify({ username })
  });
  return res.ok;
}

function renderSessions(list, secret) {
  const host = document.getElementById('sessionsList');
  host.innerHTML = '';
  if (!list || !list.length) { host.textContent = 'No sessions found'; return; }
  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Token</th><th>Username</th><th>Created</th><th>Expires</th><th>Actions</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  list.forEach(s => {
    const tr = document.createElement('tr');
    const tokenTd = document.createElement('td'); tokenTd.textContent = s.token || ''; tokenTd.style.wordBreak = 'break-all';
    const userTd = document.createElement('td'); userTd.textContent = s.username || '';
    const cTd = document.createElement('td'); cTd.textContent = s.createdAt ? new Date(s.createdAt).toLocaleString() : '';
    const eTd = document.createElement('td'); eTd.textContent = s.expires ? new Date(s.expires).toLocaleString() : '';
    const actionsTd = document.createElement('td');
    const revokeTokenBtn = makeBtn('Revoke Token', async () => {
      try {
        const ok = await revokeByToken(secret, s.token);
        if (ok) { showAdminMessage('Revoked token'); tr.remove(); }
      } catch (e) { showAdminMessage('Revoke failed', true); }
    });
    const revokeUserBtn = makeBtn('Revoke User', async () => {
      if (!s.username) return showAdminMessage('No username for this session', true);
      try {
        const ok = await revokeByUsername(secret, s.username);
        if (ok) { showAdminMessage('Revoked user sessions'); tr.remove(); }
      } catch (e) { showAdminMessage('Revoke failed', true); }
    });
    actionsTd.appendChild(revokeTokenBtn); actionsTd.appendChild(revokeUserBtn);
    tr.appendChild(tokenTd); tr.appendChild(userTd); tr.appendChild(cTd); tr.appendChild(eTd); tr.appendChild(actionsTd);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  host.appendChild(table);
}

document.getElementById('btnFetch').addEventListener('click', async () => {
  const secret = document.getElementById('adminSecret').value.trim();
  if (!secret) return showAdminMessage('Admin secret required', true);
  try {
    const list = await fetchSessions(secret);
    renderSessions(list, secret);
  } catch (e) { showAdminMessage('Fetch failed', true); }
});

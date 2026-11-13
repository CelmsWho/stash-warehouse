// Lietotāju saraksts ar rediģēšanas un dzēšanas pogām (tikai administratoram)
(async () => {
  const me = await initPage();
  if (!me) return;

  const tbody = document.getElementById('usersBody');
  const msg = document.getElementById('listMsg');

  function showMsg(text, ok) {
    msg.textContent = text;
    msg.className = ok ? 'alert ok' : 'alert';
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function formatDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
  }

  function cell(text) {
    const td = document.createElement('td');
    td.textContent = text;
    return td;
  }

  async function removeUser(u) {
    if (!window.confirm('Vai tiešām dzēst lietotāju "' + u.username + '"? Šo darbību nevar atcelt.')) return;

    const res = await api('/api/users/' + u.id, { method: 'DELETE' });
    if (res.ok) {
      await load();
      showMsg('Lietotājs "' + u.username + '" ir dzēsts.', true);
    } else {
      showMsg(res.data.error || 'Neizdevās dzēst lietotāju.', false);
    }
  }

  function buildRow(u) {
    const tr = document.createElement('tr');

    const nameCell = cell(u.username);
    if (u.id === me.user.id) {
      const you = document.createElement('span');
      you.className = 'you';
      you.textContent = '(jūs)';
      nameCell.appendChild(you);
    }
    tr.appendChild(nameCell);
    tr.appendChild(cell(u.firstName));
    tr.appendChild(cell(u.genderName));
    tr.appendChild(cell(u.roleName));
    tr.appendChild(cell(formatDate(u.createdAt)));

    const actions = document.createElement('td');
    const box = document.createElement('div');
    box.className = 'actions';

    const edit = document.createElement('a');
    edit.className = 'btn-sm';
    edit.href = '/lietotaji/rediget?id=' + u.id;
    edit.textContent = 'Rediģēt';
    box.appendChild(edit);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn-sm danger';
    del.textContent = 'Dzēst';
    if (u.id === me.user.id) {
      del.disabled = true;
      del.title = 'Savu kontu dzēst nevar';
    } else {
      del.addEventListener('click', () => removeUser(u));
    }
    box.appendChild(del);

    actions.appendChild(box);
    tr.appendChild(actions);
    return tr;
  }

  async function load() {
    const res = await api('/api/users');
    if (!res.ok) {
      showMsg(res.data.error || 'Neizdevās ielādēt lietotājus.', false);
      return;
    }
    msg.className = 'alert hidden';
    tbody.replaceChildren();
    res.data.users.forEach((u) => tbody.appendChild(buildRow(u)));
  }

  load();
})();
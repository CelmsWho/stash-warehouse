// Lietotāja rediģēšanas forma (tikai administratoram). Adrese: /lietotaji/rediget?id=5
(async () => {
  const me = await initPage();
  if (!me) return;

  const form = document.getElementById('editForm');
  const msg = document.getElementById('formMsg');
  const fields = ['username', 'firstName', 'gender', 'password', 'role'];

  function showMsg(text, ok) {
    msg.textContent = text;
    msg.className = (ok ? 'alert ok' : 'alert') + ' form-narrow';
  }

  function clearErrors() {
    msg.className = 'alert hidden form-narrow';
    msg.textContent = '';
    fields.forEach((f) => {
      document.querySelector('[data-err="' + f + '"]').textContent = '';
      document.getElementById('f-' + f).classList.remove('bad');
    });
  }

  const id = Number(new URLSearchParams(window.location.search).get('id'));
  if (!Number.isInteger(id) || id < 1) {
    showMsg('Nederīgs lietotāja identifikators.', false);
    return;
  }

  const res = await api('/api/users/' + id);
  if (!res.ok) {
    showMsg(res.data.error || 'Lietotājs nav atrasts.', false);
    return;
  }

  // Aizpilda formu ar esošajiem datiem
  const u = res.data.user;
  form.elements.username.value = u.username;
  form.elements.firstName.value = u.firstName;
  form.elements.gender.value = u.gender;
  form.elements.role.value = u.role;

  // Savu lomu mainīt nevar
  if (u.id === me.user.id) {
    form.elements.role.disabled = true;
    document.getElementById('roleNote').classList.remove('hidden');
  }
  form.classList.remove('hidden');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const body = {};
    fields.forEach((f) => { body[f] = form.elements[f].value; });

    try {
      const r = await api('/api/users/' + id, { method: 'PUT', body });

      if (r.ok) {
        showMsg('Izmaiņas ir saglabātas.', true);
        form.elements.password.value = '';
      } else if (r.data.errors) {
        Object.keys(r.data.errors).forEach((f) => {
          const holder = document.querySelector('[data-err="' + f + '"]');
          if (holder) holder.textContent = r.data.errors[f];
          const wrap = document.getElementById('f-' + f);
          if (wrap) wrap.classList.add('bad');
        });
      } else {
        showMsg(r.data.error || 'Neizdevās saglabāt izmaiņas.', false);
      }
    } catch (err) {
      showMsg('Nav savienojuma ar serveri.', false);
    }
  });
})();
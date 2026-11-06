(async () => {
  const me = await initPage();
  if (!me) return;

  const form = document.getElementById('productForm');
  const msg = document.getElementById('formMsg');
  const fields = ['sku', 'category', 'name', 'quantity', 'price', 'description'];

  function showMsg(text, ok) {
    msg.textContent = text;
    msg.className = ok ? 'alert ok' : 'alert';
  }

  function clearErrors() {
    msg.className = 'alert hidden';
    msg.textContent = '';
    fields.forEach((f) => {
      document.querySelector('[data-err="' + f + '"]').textContent = '';
      document.getElementById('f-' + f).classList.remove('bad');
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const body = {};
    fields.forEach((f) => { body[f] = form.elements[f].value; });

    try {
      const res = await api('/api/products', { method: 'POST', body });

      if (res.ok) {
        showMsg('Produkts "' + res.data.name + '" ir pievienots.', true);
        form.reset();
      } else if (res.data.errors) {
        Object.keys(res.data.errors).forEach((f) => {
          const holder = document.querySelector('[data-err="' + f + '"]');
          if (holder) holder.textContent = res.data.errors[f];
          const wrap = document.getElementById('f-' + f);
          if (wrap) wrap.classList.add('bad');
        });
      } else {
        showMsg(res.data.error || 'Neizdevās saglabāt produktu.', false);
      }
    } catch (err) {
      showMsg('Nav savienojuma ar serveri.', false);
    }
  });
})();

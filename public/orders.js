// Pasūtījumi (noliktavas darbinieks): izveide, saraksts, statusu maiņa pēc izpildes procesa
(async () => {
  const me = await initPage();
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  const msg = $('msg');
  const form = $('orderForm');
  const itemsBox = $('items');
  const dialog = $('orderDialog');
  let products = [];

  // Pogu nosaukumi statusu maiņai
  const ACTIONS = {
    picking: 'Sākt komplektēšanu',
    shipped: 'Atzīmēt kā nosūtītu',
    completed: 'Atzīmēt kā izpildītu',
    cancelled: 'Atcelt pasūtījumu',
  };

  function showMsg(text, ok) {
    msg.textContent = text;
    msg.className = ok ? 'alert ok' : 'alert';
  }

  function clearErrors() {
    form.querySelectorAll('.err').forEach((p) => { p.textContent = ''; });
    form.querySelectorAll('.field').forEach((f) => f.classList.remove('bad'));
  }

  function showErrors(errors) {
    Object.keys(errors).forEach((k) => {
      const p = form.querySelector('[data-err="' + k + '"]');
      if (p) p.textContent = errors[k];
      const f = form.querySelector('[data-field="' + k + '"]');
      if (f) f.classList.add('bad');
    });
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function formatDateTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function cell(text, cls) {
    const td = document.createElement('td');
    td.textContent = text === null || text === undefined ? '' : text;
    if (cls) td.className = cls;
    return td;
  }

  function badge(status, label) {
    const b = document.createElement('span');
    b.className = 'badge ' + status;
    b.textContent = label;
    return b;
  }

  // ---------- Preču rindas formā ----------
  function fillSelect(select) {
    const keep = select.value;
    select.replaceChildren();

    const first = document.createElement('option');
    first.value = '';
    first.disabled = true;
    first.textContent = 'Izvēlieties preci';
    select.appendChild(first);

    products.forEach((p) => {
      const available = p.quantity - p.reserved;
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.sku + ' - ' + p.name + ' (pieejams: ' + available + ')';
      if (available <= 0) opt.disabled = true;
      select.appendChild(opt);
    });
    select.value = keep || '';
  }

  function addRow() {
    const row = document.createElement('div');
    row.className = 'item-row';

    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Prece');
    fillSelect(select);

    const qty = document.createElement('input');
    qty.type = 'number';
    qty.min = '1';
    qty.max = '1000000';
    qty.step = '1';
    qty.placeholder = 'Daudzums';
    qty.setAttribute('aria-label', 'Daudzums');

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn-sm';
    del.textContent = 'Noņemt';
    del.addEventListener('click', () => {
      if (itemsBox.children.length > 1) {
        row.remove();
      } else {
        select.value = '';
        qty.value = '';
      }
    });

    row.appendChild(select);
    row.appendChild(qty);
    row.appendChild(del);
    itemsBox.appendChild(row);
  }

  function resetRows() {
    itemsBox.replaceChildren();
    addRow();
  }

  async function loadProducts() {
    const res = await api('/api/products');
    if (!res.ok) { showMsg(res.data.error || 'Neizdevās ielādēt preces.', false); return; }
    products = res.data.products;
    itemsBox.querySelectorAll('select').forEach(fillSelect);
  }

  // ---------- Pasūtījumu saraksts ----------
  async function loadOrders() {
    const status = $('filter').value;
    const res = await api('/api/orders' + (status ? '?status=' + encodeURIComponent(status) : ''));
    if (!res.ok) { showMsg(res.data.error || 'Neizdevās ielādēt pasūtījumus.', false); return; }

    const tbody = $('ordersBody');
    tbody.replaceChildren();

    if (!res.data.orders.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.textContent = 'Pasūtījumu nav.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    res.data.orders.forEach((o) => {
      const tr = document.createElement('tr');
      tr.appendChild(cell('#' + o.id));
      tr.appendChild(cell(o.customer));
      tr.appendChild(cell(o.lines + ' veidi, ' + o.units + ' gab.'));

      const st = document.createElement('td');
      st.appendChild(badge(o.status, o.statusName));
      tr.appendChild(st);

      tr.appendChild(cell(formatDateTime(o.createdAt) + (o.createdBy ? ' (' + o.createdBy + ')' : '')));

      const act = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-sm';
      btn.textContent = 'Skatīt';
      btn.addEventListener('click', () => openOrder(o.id));
      act.appendChild(btn);
      tr.appendChild(act);

      tbody.appendChild(tr);
    });
  }

  // ---------- Pasūtījuma skats ----------
  function addInfo(dl, label, value) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    if (value instanceof Node) dd.appendChild(value);
    else dd.textContent = value;
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  async function changeStatus(id, status) {
    if (status === 'cancelled' && !window.confirm('Vai atcelt pasūtījumu #' + id + '?')) return;
    if (status === 'shipped' &&
      !window.confirm('Nosūtot pasūtījumu, preces tiks norakstītas no noliktavas un plauktiem. Turpināt?')) return;

    const res = await api('/api/orders/' + id + '/status', { method: 'POST', body: { status } });
    if (res.ok) {
      await Promise.all([loadOrders(), loadProducts()]);
      await openOrder(id);
    } else {
      const box = $('dMsg');
      box.textContent = res.data.error || (res.data.errors && res.data.errors.status) || 'Neizdevās mainīt statusu.';
      box.className = 'alert';
    }
  }

  async function openOrder(id) {
    const res = await api('/api/orders/' + id);
    if (!res.ok) { showMsg(res.data.error || 'Neizdevās ielādēt pasūtījumu.', false); return; }
    const { order, items, history } = res.data;

    $('dTitle').textContent = 'Pasūtījums #' + order.id;
    $('dMsg').className = 'alert hidden';

    const info = $('dInfo');
    info.replaceChildren();
    addInfo(info, 'Klients', order.customer);
    addInfo(info, 'Statuss', badge(order.status, order.statusName));
    addInfo(info, 'Piezīme', order.note || '-');
    addInfo(info, 'Izveidots', formatDateTime(order.createdAt) + (order.createdBy ? ' (' + order.createdBy + ')' : ''));

    const tbody = $('dItems');
    tbody.replaceChildren();
    items.forEach((i) => {
      const tr = document.createElement('tr');
      tr.appendChild(cell(i.sku || '(dzēsta prece)'));
      tr.appendChild(cell(i.name || ''));
      tr.appendChild(cell(i.quantity, 'num'));
      tbody.appendChild(tr);
    });

    const hist = $('dHistory');
    hist.replaceChildren();
    history.forEach((h) => {
      const li = document.createElement('li');
      li.textContent = formatDateTime(h.createdAt) + ' - ' + h.statusName + (h.username ? ' (' + h.username + ')' : '');
      hist.appendChild(li);
    });

    const actions = $('dActions');
    actions.replaceChildren();
    order.nextStatuses.forEach((st) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = st === 'cancelled' ? 'btn-sm danger' : 'btn-sm primary';
      b.textContent = ACTIONS[st];
      b.addEventListener('click', () => changeStatus(order.id, st));
      actions.appendChild(b);
    });
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn-sm';
    close.textContent = 'Aizvērt';
    close.addEventListener('click', () => dialog.close());
    actions.appendChild(close);

    if (!dialog.open) dialog.showModal();
  }

  // ---------- Jauns pasūtījums ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    msg.className = 'alert hidden';

    const items = [];
    itemsBox.querySelectorAll('.item-row').forEach((row) => {
      const productId = row.querySelector('select').value;
      const quantity = row.querySelector('input').value;
      if (productId || quantity) items.push({ productId, quantity });
    });

    const body = {
      customer: form.elements.customer.value,
      note: form.elements.note.value,
      items,
    };

    try {
      const res = await api('/api/orders', { method: 'POST', body });
      if (res.ok) {
        form.reset();
        resetRows();
        await Promise.all([loadOrders(), loadProducts()]);
        showMsg('Pasūtījums #' + res.data.id + ' izveidots.', true);
      } else if (res.data.errors) {
        showErrors(res.data.errors);
      } else {
        showMsg(res.data.error || 'Neizdevās izveidot pasūtījumu.', false);
      }
    } catch (err) {
      showMsg('Nav savienojuma ar serveri.', false);
    }
  });

  $('addRow').addEventListener('click', addRow);
  $('filter').addEventListener('change', loadOrders);

  resetRows();
  await loadProducts();
  loadOrders();
})();
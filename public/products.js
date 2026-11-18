// Produktu saraksts: meklēšana, rediģēšana (administrators un darbinieks), dzēšana (administrators)
(async () => {
    const me = await initPage();
    if (!me) return;

    const isAdmin = me.user.role === 'admin';
    const $ = (id) => document.getElementById(id);
    const msg = $('msg');
    const editForm = $('editForm');
    const dialog = $('editDialog');
    let products = [];
    let editId = null;

    function showMsg(text, ok) {
        msg.textContent = text;
        msg.className = ok ? 'alert ok' : 'alert';
    }

    function clearErrors() {
        editForm.querySelectorAll('.err').forEach((p) => { p.textContent = ''; });
        editForm.querySelectorAll('.field').forEach((f) => f.classList.remove('bad'));
    }

    function showErrors(errors) {
        Object.keys(errors).forEach((k) => {
            const p = editForm.querySelector('[data-err="' + k + '"]');
            if (p) p.textContent = errors[k];
            const f = editForm.querySelector('[data-field="' + k + '"]');
            if (f) f.classList.add('bad');
        });
    }

    function cell(text, cls) {
        const td = document.createElement('td');
        td.textContent = text === null || text === undefined ? '' : text;
        if (cls) td.className = cls;
        return td;
    }

    function openEdit(p) {
        editId = p.id;
        clearErrors();
        $('eSku').value = p.sku;
        $('eCategory').value = p.category || '';
        $('eName').value = p.name;
        $('eQuantity').value = p.quantity;
        $('ePrice').value = p.price;
        $('eDescription').value = p.description || '';
        dialog.showModal();
    }

    async function removeProduct(p) {
        if (!window.confirm('Vai dzēst preci "' + p.sku + ' - ' + p.name + '"? Šo darbību nevar atcelt.')) return;
        const res = await api('/api/products/' + p.id, { method: 'DELETE' });
        if (res.ok) {
            await load();
            showMsg('Prece "' + p.sku + '" ir dzēsta.', true);
        } else {
            showMsg(res.data.error || 'Neizdevās dzēst preci.', false);
        }
    }

    function render() {
        const term = $('search').value.trim().toLowerCase();
        const list = products.filter((p) =>
            !term || [p.sku, p.name, p.category || ''].some((v) => v.toLowerCase().includes(term))
        );

        const tbody = $('productsBody');
        tbody.replaceChildren();

        if (!list.length) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 8;
            td.textContent = products.length ? 'Nekas netika atrasts.' : 'Vēl nav pievienotu produktu.';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        list.forEach((p) => {
            const tr = document.createElement('tr');
            tr.appendChild(cell(p.sku));
            tr.appendChild(cell(p.name));
            tr.appendChild(cell(p.category || ''));
            tr.appendChild(cell(p.quantity, 'num'));
            tr.appendChild(cell(p.placed, 'num'));
            tr.appendChild(cell(p.reserved, 'num'));
            tr.appendChild(cell(p.price, 'num'));

            const td = document.createElement('td');
            const box = document.createElement('div');
            box.className = 'actions';

            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'btn-sm';
            edit.textContent = 'Rediģēt';
            edit.addEventListener('click', () => openEdit(p));
            box.appendChild(edit);

            if (isAdmin) {
                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'btn-sm danger';
                del.textContent = 'Dzēst';
                del.addEventListener('click', () => removeProduct(p));
                box.appendChild(del);
            }

            td.appendChild(box);
            tr.appendChild(td);
            tbody.appendChild(tr);
        });
    }

    async function load() {
        const res = await api('/api/products');
        if (!res.ok) { showMsg(res.data.error || 'Neizdevās ielādēt produktus.', false); return; }
        products = res.data.products;
        render();
    }

    $('search').addEventListener('input', render);
    $('editCancel').addEventListener('click', () => dialog.close());

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();

        const body = {};
        ['sku', 'category', 'name', 'quantity', 'price', 'description'].forEach((f) => {
            body[f] = editForm.elements[f].value;
        });

        try {
            const res = await api('/api/products/' + editId, { method: 'PUT', body });
            if (res.ok) {
                dialog.close();
                await load();
                showMsg('Produkts atjaunināts.', true);
            } else if (res.data.errors) {
                showErrors(res.data.errors);
            } else {
                dialog.close();
                showMsg(res.data.error || 'Neizdevās saglabāt izmaiņas.', false);
            }
        } catch (err) {
            showMsg('Nav savienojuma ar serveri.', false);
        }
    });

    load();
})();
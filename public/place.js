// Preču izvietošana noliktavā (plauktu kārtotājs): izvietot, labot, noņemt, izmaiņu vēsture
(async () => {
    const me = await initPage();
    if (!me) return;

    const $ = (id) => document.getElementById(id);
    const msg = $('msg');
    const placeForm = $('placeForm');
    const editForm = $('editForm');
    const dialog = $('editDialog');
    let editId = null;

    function showMsg(text, ok) {
        msg.textContent = text;
        msg.className = ok ? 'alert ok' : 'alert';
    }

    function clearErrors(form) {
        form.querySelectorAll('.err').forEach((p) => { p.textContent = ''; });
        form.querySelectorAll('.field').forEach((f) => f.classList.remove('bad'));
    }

    function showErrors(form, errors) {
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

    function cell(text) {
        const td = document.createElement('td');
        td.textContent = text === null || text === undefined ? '' : text;
        return td;
    }

    function emptyRow(tbody, cols, text) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = cols;
        td.textContent = text;
        tr.appendChild(td);
        tbody.appendChild(tr);
    }

    // ---------- Preces ----------
    async function loadProducts() {
        const res = await api('/api/products');
        if (!res.ok) { showMsg(res.data.error || 'Neizdevās ielādēt preces.', false); return; }

        const select = $('productId');
        const keep = select.value;
        select.replaceChildren(select.options[0]);
        const tbody = $('productsBody');
        tbody.replaceChildren();

        if (!res.data.products.length) emptyRow(tbody, 6, 'Noliktavā vēl nav pievienotu preču.');

        res.data.products.forEach((p) => {
            const free = p.quantity - p.placed;

            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.sku + ' - ' + p.name + ' (neizvietots: ' + free + ')';
            if (free <= 0) opt.disabled = true;
            select.appendChild(opt);

            const tr = document.createElement('tr');
            [p.sku, p.name, p.category || '', p.quantity, p.placed, free].forEach((v) => tr.appendChild(cell(v)));
            tbody.appendChild(tr);
        });
        if (keep) select.value = keep;
    }

    // ---------- Izvietojumi ----------
    async function removePlacement(pl) {
        if (!window.confirm('Vai noņemt "' + pl.sku + '" (' + pl.quantity + ' gab.) no vietas ' + pl.location + '?')) return;
        const res = await api('/api/placements/' + pl.id, { method: 'DELETE' });
        if (res.ok) {
            await reloadAll();
            showMsg('Prece noņemta no vietas ' + pl.location + '.', true);
        } else {
            showMsg(res.data.error || 'Neizdevās noņemt preci.', false);
        }
    }

    function openEdit(pl) {
        editId = pl.id;
        clearErrors(editForm);
        $('editInfo').textContent = pl.sku + ' - ' + pl.name;
        $('editLocation').value = pl.location;
        $('editQuantity').value = pl.quantity;
        dialog.showModal();
    }

    async function loadPlacements() {
        const res = await api('/api/placements');
        if (!res.ok) { showMsg(res.data.error || 'Neizdevās ielādēt izvietojumus.', false); return; }

        const tbody = $('placementsBody');
        tbody.replaceChildren();
        if (!res.data.placements.length) emptyRow(tbody, 6, 'Neviena prece vēl nav izvietota.');

        res.data.placements.forEach((pl) => {
            const tr = document.createElement('tr');
            [pl.location, pl.sku, pl.name, pl.quantity].forEach((v) => tr.appendChild(cell(v)));
            tr.appendChild(cell(formatDateTime(pl.updatedAt) + (pl.updatedBy ? ' (' + pl.updatedBy + ')' : '')));

            const td = document.createElement('td');
            const box = document.createElement('div');
            box.className = 'actions';

            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'btn-sm';
            edit.textContent = 'Labot';
            edit.addEventListener('click', () => openEdit(pl));

            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'btn-sm danger';
            del.textContent = 'Noņemt';
            del.addEventListener('click', () => removePlacement(pl));

            box.appendChild(edit);
            box.appendChild(del);
            td.appendChild(box);
            tr.appendChild(td);
            tbody.appendChild(tr);
        });
    }

    // ---------- Vēsture ----------
    function describe(e) {
        if (e.action === 'place') {
            return 'Izvietots +' + (e.newQuantity - e.oldQuantity) + ' vietā ' + e.newLocation + ' (kopā ' + e.newQuantity + ')';
        }
        if (e.action === 'remove') {
            return 'Noņemts no ' + e.oldLocation + ' (' + e.oldQuantity + ' gab.)';
        }
        const moved = e.oldLocation !== e.newLocation;
        const changed = e.oldQuantity !== e.newQuantity;
        if (moved && changed) return 'Pārvietots ' + e.oldLocation + ' → ' + e.newLocation + ', daudzums ' + e.oldQuantity + ' → ' + e.newQuantity;
        if (moved) return 'Pārvietots ' + e.oldLocation + ' → ' + e.newLocation;
        return 'Daudzums ' + e.oldQuantity + ' → ' + e.newQuantity + ' (' + e.newLocation + ')';
    }

    async function loadLog() {
        const res = await api('/api/placement-log');
        if (!res.ok) return;
        const tbody = $('logBody');
        tbody.replaceChildren();
        if (!res.data.log.length) emptyRow(tbody, 4, 'Izmaiņu vēl nav.');

        res.data.log.forEach((e) => {
            const tr = document.createElement('tr');
            tr.appendChild(cell(formatDateTime(e.createdAt)));
            tr.appendChild(cell(e.username || '(dzēsts lietotājs)'));
            tr.appendChild(cell(e.sku ? e.sku + ' - ' + e.name : '(dzēsta prece)'));
            tr.appendChild(cell(describe(e)));
            tbody.appendChild(tr);
        });
    }

    function reloadAll() {
        return Promise.all([loadProducts(), loadPlacements(), loadLog()]);
    }

    // ---------- Jauns izvietojums ----------
    placeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors(placeForm);
        msg.className = 'alert hidden';

        const body = {
            productId: placeForm.elements.productId.value,
            location: placeForm.elements.location.value,
            quantity: placeForm.elements.quantity.value,
        };

        try {
            const res = await api('/api/placements', { method: 'POST', body });
            if (res.ok) {
                placeForm.reset();
                await reloadAll();
                showMsg('Prece izvietota vietā ' + body.location.trim().toUpperCase() + '.', true);
            } else if (res.data.errors) {
                showErrors(placeForm, res.data.errors);
            } else {
                showMsg(res.data.error || 'Neizdevās izvietot preci.', false);
            }
        } catch (err) {
            showMsg('Nav savienojuma ar serveri.', false);
        }
    });

    // ---------- Labošana ----------
    $('editCancel').addEventListener('click', () => dialog.close());

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors(editForm);

        const body = {
            location: editForm.elements.location.value,
            quantity: editForm.elements.quantity.value,
        };

        try {
            const res = await api('/api/placements/' + editId, { method: 'PUT', body });
            if (res.ok) {
                dialog.close();
                await reloadAll();
                showMsg('Izvietojums atjaunināts.', true);
            } else if (res.data.errors) {
                showErrors(editForm, res.data.errors);
            } else {
                dialog.close();
                showMsg(res.data.error || 'Neizdevās saglabāt izmaiņas.', false);
            }
        } catch (err) {
            showMsg('Nav savienojuma ar serveri.', false);
        }
    });

    reloadAll();
})();
// Datu ievade (plauktu kārtotājs): preču stāvokļa reģistrēšana un pārbaužu vēsture
(async () => {
    const me = await initPage();
    if (!me) return;

    const $ = (id) => document.getElementById(id);
    const msg = $('msg');
    const form = $('conditionForm');
    const LABELS = { good: 'Labā stāvoklī', check: 'Jāpārbauda', damaged: 'Bojāts' };
    let placements = [];

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

    function cell(text) {
        const td = document.createElement('td');
        td.textContent = text === null || text === undefined ? '' : text;
        return td;
    }

    function badgeCell(status) {
        const td = document.createElement('td');
        const b = document.createElement('span');
        b.className = 'badge ' + status;
        b.textContent = LABELS[status] || status;
        td.appendChild(b);
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

    // Aizpilda formu ar izvēlēto izvietojumu (poga "Reģistrēt" tabulā)
    function prefill(pl) {
        $('placementId').value = pl.id;
        $('status').value = pl.conditionStatus;
        $('note').value = pl.conditionNote || '';
        clearErrors();
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        $('note').focus();
    }

    function renderPlacements() {
        const tbody = $('placementsBody');
        tbody.replaceChildren();
        const filter = $('filter').value;
        const list = placements.filter((p) => filter === 'all' || p.conditionStatus === filter);

        if (!placements.length) { emptyRow(tbody, 7, 'Neviena prece vēl nav izvietota.'); return; }
        if (!list.length) { emptyRow(tbody, 7, 'Nav izvietojumu ar šādu stāvokli.'); return; }

        list.forEach((pl) => {
            const tr = document.createElement('tr');
            tr.appendChild(cell(pl.location));
            tr.appendChild(cell(pl.sku + ' - ' + pl.name));
            tr.appendChild(cell(pl.quantity));
            tr.appendChild(badgeCell(pl.conditionStatus));
            tr.appendChild(cell(pl.conditionNote || ''));
            tr.appendChild(cell(pl.checkedAt ? formatDateTime(pl.checkedAt) + (pl.checkedBy ? ' (' + pl.checkedBy + ')' : '') : 'Vēl nav pārbaudīts'));

            const td = document.createElement('td');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-sm';
            btn.textContent = 'Reģistrēt';
            btn.addEventListener('click', () => prefill(pl));
            td.appendChild(btn);
            tr.appendChild(td);
            tbody.appendChild(tr);
        });
    }

    async function loadPlacements() {
        const res = await api('/api/placements');
        if (!res.ok) { showMsg(res.data.error || 'Neizdevās ielādēt izvietojumus.', false); return; }
        placements = res.data.placements;

        const select = $('placementId');
        const keep = select.value;
        select.replaceChildren(select.options[0]);
        placements.forEach((pl) => {
            const opt = document.createElement('option');
            opt.value = pl.id;
            opt.textContent = pl.location + ' | ' + pl.sku + ' - ' + pl.name + ' (' + pl.quantity + ' gab.)';
            select.appendChild(opt);
        });
        if (keep) select.value = keep;

        renderPlacements();
    }

    async function loadLog() {
        const res = await api('/api/condition-log');
        if (!res.ok) return;
        const tbody = $('logBody');
        tbody.replaceChildren();
        if (!res.data.log.length) { emptyRow(tbody, 6, 'Pārbaužu vēl nav.'); return; }

        res.data.log.forEach((e) => {
            const tr = document.createElement('tr');
            tr.appendChild(cell(formatDateTime(e.createdAt)));
            tr.appendChild(cell(e.username || '(dzēsts lietotājs)'));
            tr.appendChild(cell(e.location));
            tr.appendChild(cell(e.sku ? e.sku + ' - ' + e.name : '(dzēsta prece)'));
            tr.appendChild(badgeCell(e.status));
            tr.appendChild(cell(e.note || ''));
            tbody.appendChild(tr);
        });
    }

    const reloadAll = () => Promise.all([loadPlacements(), loadLog()]);

    $('filter').addEventListener('change', renderPlacements);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();
        msg.className = 'alert hidden';

        const body = {
            placementId: form.elements.placementId.value,
            status: form.elements.status.value,
            note: form.elements.note.value,
        };

        try {
            const res = await api('/api/conditions', { method: 'POST', body });
            if (res.ok) {
                form.reset();
                await reloadAll();
                showMsg('Stāvoklis saglabāts.', true);
            } else if (res.data.errors) {
                showErrors(res.data.errors);
            } else {
                showMsg(res.data.error || 'Neizdevās saglabāt stāvokli.', false);
            }
        } catch (err) {
            showMsg('Nav savienojuma ar serveri.', false);
        }
    });

    reloadAll();
})();
// Atskaišu sagatavošana: izvēlas veidu, ģenerē, skatās, lejupielādē CSV vai drukā
(async () => {
    const me = await initPage();
    if (!me) return;

    const $ = (id) => document.getElementById(id);
    const msg = $('msg');
    const form = $('reportForm');
    const typeSel = $('type');
    let types = [];
    let generatedFor = null;

    function showMsg(text, ok) {
        msg.textContent = text;
        msg.className = (ok ? 'alert ok' : 'alert') + ' no-print';
    }

    function pad(n) { return String(n).padStart(2, '0'); }
    function isoLocal(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

    const current = () => types.find((t) => t.id === typeSel.value);

    function syncType() {
        const t = current();
        $('typeHint').textContent = t ? t.description : '';
        $('fromWrap').classList.toggle('hidden', !(t && t.dates));
        $('toWrap').classList.toggle('hidden', !(t && t.dates));
    }

    function query(format) {
        const p = new URLSearchParams();
        if (current().dates) {
            p.set('from', $('from').value);
            p.set('to', $('to').value);
        }
        if (format) p.set('format', format);
        return p.toString();
    }

    function render(d) {
        $('rTitle').textContent = d.title;
        $('rMeta').textContent = 'Sagatavots: ' + d.generatedAt + ' (' + d.generatedBy + ')' +
            (d.period ? ' | Periods: ' + d.period : '');

        const stats = $('rStats');
        stats.replaceChildren();
        d.summary.forEach((s) => {
            const box = document.createElement('div');
            box.className = 'stat';
            const value = document.createElement('span');
            value.className = 'stat-value';
            value.textContent = s.value;
            const label = document.createElement('span');
            label.className = 'stat-label';
            label.textContent = s.label;
            box.appendChild(value);
            box.appendChild(label);
            stats.appendChild(box);
        });

        const head = $('rHead');
        head.replaceChildren();
        const hr = document.createElement('tr');
        d.columns.forEach((c) => {
            const th = document.createElement('th');
            th.textContent = c.label;
            if (c.num) th.className = 'num';
            hr.appendChild(th);
        });
        head.appendChild(hr);

        const body = $('rBody');
        body.replaceChildren();
        if (!d.rows.length) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = d.columns.length;
            td.textContent = 'Nav datu šai atskaitei.';
            tr.appendChild(td);
            body.appendChild(tr);
        }
        d.rows.forEach((row) => {
            const tr = document.createElement('tr');
            row.forEach((v, i) => {
                const td = document.createElement('td');
                td.textContent = v === null || v === undefined ? '' : v;
                if (d.columns[i].num) td.className = 'num';
                tr.appendChild(td);
            });
            body.appendChild(tr);
        });

        $('csvLink').href = '/api/reports/' + generatedFor + '?' + query('csv');
        $('result').classList.remove('hidden');
    }

    // Pieejamie atskaišu veidi šai lomai
    const tr = await api('/api/reports');
    if (!tr.ok) {
        showMsg(tr.data.error || 'Neizdevās ielādēt atskaišu veidus.', false);
        return;
    }
    types = tr.data.types;
    types.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.label;
        typeSel.appendChild(opt);
    });

    $('to').value = isoLocal(new Date());
    $('from').value = isoLocal(new Date(Date.now() - 29 * 86400000));
    typeSel.addEventListener('change', syncType);
    syncType();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        msg.className = 'alert hidden no-print';

        try {
            const type = typeSel.value;
            const res = await api('/api/reports/' + type + '?' + query());
            if (res.ok) {
                generatedFor = type;
                render(res.data);
            } else {
                $('result').classList.add('hidden');
                showMsg(res.data.error || 'Neizdevās sagatavot atskaiti.', false);
            }
        } catch (err) {
            showMsg('Nav savienojuma ar serveri.', false);
        }
    });

    $('printBtn').addEventListener('click', () => window.print());
})();
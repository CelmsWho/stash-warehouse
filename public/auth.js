// Kopīgās funkcijas visām lapām + pieteikšanās formas loģika

let csrfToken = null;

async function getCsrf() {
  if (!csrfToken) {
    const r = await fetch('/api/csrf', { credentials: 'same-origin' });
    csrfToken = (await r.json()).csrf;
  }
  return csrfToken;
}

// Palīgfunkcija API izsaukumiem (pievieno CSRF žetonu POST pieprasījumiem)
async function api(url, options = {}) {
  const opts = { credentials: 'same-origin', headers: {}, ...options };
  if (opts.body !== undefined) {
    opts.body = JSON.stringify(opts.body);
    opts.headers['Content-Type'] = 'application/json';
  }
  if (opts.method && opts.method !== 'GET') opts.headers['X-CSRF-Token'] = await getCsrf();

  const res = await fetch(url, opts);
  let data = {};
  try { data = await res.json(); } catch (e) { /* atbilde bez JSON */ }
  return { ok: res.ok, status: res.status, data };
}

// Izsauc katra aizsargātā lapa: pārbauda pieteikšanos un uzzīmē sānjoslu
async function initPage() {
  const res = await api('/api/me');
  if (!res.ok) {
    window.location.href = '/login';
    return null;
  }
  renderSidebar(res.data);
  return res.data;
}

function renderSidebar(me) {
  const aside = document.getElementById('sidebar');
  if (!aside) return;
  aside.className = 'side';
  // Konstants HTML bez lietotāja datiem
  aside.innerHTML =
    '<div class="tape"></div>' +
    '<a class="brand" href="/">' +
    '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 29V13L16 4l13 9v16h-5V15L16 9.5 8 15v14z" fill="currentColor"/>' +
    '<rect x="11" y="17" width="10" height="3" fill="currentColor"/><rect x="11" y="22" width="10" height="3" fill="currentColor"/></svg>' +
    '<span>STASH</span></a>' +
    '<nav id="nav"></nav>' +
    '<div class="out"><div class="who"><span id="whoName"></span><small id="whoRole"></small></div>' +
    '<button type="button" id="logoutBtn">Iziet</button></div>';

  const nav = document.getElementById('nav');
  const links = [{ path: '/', label: 'Sākums' }].concat(me.menu);
  links.forEach((item) => {
    const a = document.createElement('a');
    a.href = item.path;
    a.textContent = item.label;
    if (item.path === window.location.pathname) a.className = 'on';
    nav.appendChild(a);
  });

  document.getElementById('whoName').textContent = me.user.username;
  document.getElementById('whoRole').textContent = me.user.roleName;
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  });
}

// ---------- Pieteikšanās lapa ----------
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  const errBox = document.getElementById('loginError');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.classList.add('hidden');

    try {
      const res = await api('/api/login', {
        method: 'POST',
        body: {
          username: loginForm.elements.username.value,
          password: loginForm.elements.password.value,
        },
      });
      if (res.ok) {
        window.location.href = '/';
      } else {
        errBox.textContent = res.data.error || 'Neizdevās pieteikties.';
        errBox.classList.remove('hidden');
      }
    } catch (err) {
      errBox.textContent = 'Nav savienojuma ar serveri.';
      errBox.classList.remove('hidden');
    }
  });
}

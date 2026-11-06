require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { pool, init } = require('./db');

const PUBLIC = path.join(__dirname, 'public');
const file = (name) => path.join(PUBLIC, name);

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'nomaini-mani') {
  console.warn('BRĪDINĀJUMS: iestatiet drošu SESSION_SECRET failā .env');
}

// ---------- Lomas, lapas un izvēlne ----------
const roleNames = {
  admin: 'Administrators',
  worker: 'Noliktavas darbinieks',
  sorter: 'Plauktu kārtotājs',
};

// Katra lapa: adrese, HTML fails un lomas, kurām tā ir atļauta.
// Lapas, kas vēl nav gatavas, izmanto placeholder.html.
const pages = [
  { path: '/produkti/jauns',  file: 'add-product.html', label: 'Pievienot produktu',  roles: ['admin'] },
  { path: '/lietotaji/jauns', file: 'placeholder.html', label: 'Pievienot lietotāju', roles: ['admin'] },
  { path: '/lietotaji',       file: 'placeholder.html', label: 'Lietotāji',           roles: ['admin'] },
  { path: '/izvietot',        file: 'placeholder.html', label: 'Izvietot preces',     roles: ['sorter'] },
  { path: '/atskaites',       file: 'placeholder.html', label: 'Sagatavot atskaiti',  roles: ['sorter', 'worker'] },
  { path: '/datu-ievade',     file: 'placeholder.html', label: 'Datu ievade',         roles: ['sorter'] },
  { path: '/pasutijumi',      file: 'placeholder.html', label: 'Veikt pasūtījumu',    roles: ['worker'] },
];

const menuOrder = {
  admin:  ['/produkti/jauns', '/lietotaji/jauns', '/lietotaji'],
  sorter: ['/izvietot', '/atskaites', '/datu-ievade'],
  worker: ['/pasutijumi', '/atskaites'],
};

function menuFor(role) {
  return (menuOrder[role] || [])
    .map((p) => pages.find((x) => x.path === p))
    .map(({ path: p, label }) => ({ path: p, label }));
}

// ---------- Aizsargi ----------
// Lapām: bez pieteikšanās uz /login, ar nepareizu lomu 403 lapa
function pageGuard(...roles) {
  return (req, res, next) => {
    const u = req.session.user;
    if (!u) return res.redirect('/login');
    if (roles.length && !roles.includes(u.role)) return res.status(403).sendFile(file('forbidden.html'));
    next();
  };
}

// API: JSON atbildes ar 401/403
function apiGuard(...roles) {
  return (req, res, next) => {
    const u = req.session.user;
    if (!u) return res.status(401).json({ error: 'Nav pieteicies.' });
    if (roles.length && !roles.includes(u.role)) return res.status(403).json({ error: 'Nav piekļuves tiesību.' });
    next();
  };
}

function verifyCsrf(req, res, next) {
  const sent = req.get('x-csrf-token');
  const real = req.session.csrf;
  if (typeof sent === 'string' && real && sent.length === real.length &&
      crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(real))) return next();
  return res.status(403).json({ error: 'Nederīgs drošības žetons. Atsvaidziniet lapu.' });
}

// ---------- Lietotne ----------
const app = express();
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
      },
    },
  })
);

// Tiešu piekļuvi .html failiem bloķējam: lapas tiek atdotas tikai caur maršrutiem ar lomu pārbaudi
app.use((req, res, next) => {
  if (req.path.toLowerCase().endsWith('.html')) return res.status(404).sendFile(file('404.html'));
  next();
});

// Publiskie resursi (css, js)
app.use(express.static(PUBLIC, { index: false }));

app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use(express.json({ limit: '10kb' }));

app.use(
  session({
    name: 'stash.sid',
    secret: process.env.SESSION_SECRET || 'dev-only-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

app.use((req, res, next) => {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  next();
});

// ---------- Lapas ----------
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.sendFile(file('login.html'));
});
app.get('/', pageGuard(), (req, res) => res.sendFile(file('dashboard.html')));
for (const p of pages) {
  app.get(p.path, pageGuard(...p.roles), (req, res) => res.sendFile(file(p.file)));
}

// ---------- API: autorizācija ----------
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Par daudz mēģinājumu. Uzgaidiet 15 minūtes.' },
});

app.get('/api/csrf', (req, res) => res.json({ csrf: req.session.csrf }));

app.post(
  '/api/login',
  loginLimiter,
  verifyCsrf,
  [
    body('username').trim().isLength({ min: 3, max: 32 }).matches(/^[A-Za-z0-9_.-]+$/),
    body('password').isString().isLength({ min: 8, max: 72 }),
  ],
  async (req, res) => {
    if (!validationResult(req).isEmpty()) {
      return res.status(400).json({ error: 'Pārbaudiet ievadītos datus: lietotājvārds 3-32 simboli, parole 8-72 simboli.' });
    }
    try {
      // Parametrizēts vaicājums (aizsardzība pret SQL injekcijām)
      const [rows] = await pool.execute(
        'SELECT id, username, password_hash, role FROM users WHERE username = ?',
        [req.body.username]
      );
      const row = rows[0];
      const ok = await bcrypt.compare(req.body.password, row ? row.password_hash : DUMMY_HASH);
      if (!row || !ok) return res.status(401).json({ error: 'Nepareizs lietotājvārds vai parole.' });

      // Jauna sesija pēc pieteikšanās (aizsardzība pret session fixation)
      req.session.regenerate((err) => {
        if (err) return res.status(500).json({ error: 'Neizdevās izveidot sesiju.' });
        req.session.user = { id: row.id, username: row.username, role: row.role };
        res.json({ ok: true });
      });
    } catch (err) {
      console.error('Pieteikšanās kļūda:', err.message);
      res.status(500).json({ error: 'Servera kļūda. Mēģiniet vēlāk.' });
    }
  }
);

app.post('/api/logout', apiGuard(), verifyCsrf, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('stash.sid');
    res.json({ ok: true });
  });
});

app.get('/api/me', apiGuard(), (req, res) => {
  const u = req.session.user;
  res.json({
    user: { id: u.id, username: u.username, role: u.role, roleName: roleNames[u.role] },
    menu: menuFor(u.role),
  });
});

// ---------- API: produkti ----------
const productRules = [
  body('sku').trim()
    .isLength({ min: 3, max: 32 }).withMessage('Artikula kodam jābūt 3-32 simbolus garam.').bail()
    .matches(/^[A-Za-z0-9_-]+$/).withMessage('Artikula kods drīkst saturēt tikai burtus, ciparus, - un _.'),
  body('name').trim()
    .isLength({ min: 2, max: 100 }).withMessage('Nosaukumam jābūt 2-100 simbolus garam.'),
  body('category').trim()
    .isLength({ max: 50 }).withMessage('Kategorija nedrīkst būt garāka par 50 simboliem.'),
  body('quantity').trim()
    .isInt({ min: 0, max: 1000000 }).withMessage('Daudzums ir vesels skaitlis no 0 līdz 1 000 000.'),
  body('price').trim()
    .customSanitizer((v) => String(v).replace(',', '.'))
    .matches(/^\d{1,7}(\.\d{1,2})?$/).withMessage('Cena ir skaitlis ar ne vairāk kā 2 cipariem aiz komata.'),
  body('description').trim()
    .isLength({ max: 500 }).withMessage('Apraksts nedrīkst būt garāks par 500 simboliem.'),
];

app.post('/api/products', apiGuard('admin'), verifyCsrf, productRules, async (req, res) => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const errors = {};
    for (const [field, e] of Object.entries(result.mapped())) errors[field] = e.msg;
    return res.status(400).json({ errors });
  }

  const s = (k) => String(req.body[k] ?? '');
  try {
    const [r] = await pool.execute(
      `INSERT INTO products (sku, name, category, quantity, price, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [s('sku'), s('name'), s('category') || null, Number(s('quantity')), s('price'), s('description') || null, req.session.user.id]
    );
    res.status(201).json({ ok: true, id: r.insertId, name: s('name') });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ errors: { sku: 'Produkts ar šādu artikula kodu jau eksistē.' } });
    }
    console.error('Produkta pievienošanas kļūda:', err.message);
    res.status(500).json({ error: 'Servera kļūda. Produkts netika saglabāts.' });
  }
});

// ---------- 404 un kļūdas ----------
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Nav atrasts.' });
  res.status(404).sendFile(file('404.html'));
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Nederīgs pieprasījums.' });
  console.error(err.message);
  res.status(500).json({ error: 'Servera kļūda.' });
});

const port = process.env.PORT || 3000;
init()
  .then(() => app.listen(port, () => console.log(`STASH darbojas: http://localhost:${port}`)))
  .catch((err) => {
    console.error('Neizdevās savienoties ar MySQL:', err.message);
    console.error('Pārbaudiet DB_* iestatījumus failā .env un vai ir palaists MySQL serveris.');
    process.exit(1);
  });

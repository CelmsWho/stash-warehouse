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
  { path: '/produkti/jauns', file: 'add-product.html', label: 'Pievienot produktu', roles: ['admin'] },
  { path: '/lietotaji/jauns', file: 'add-user.html', label: 'Pievienot lietotāju', roles: ['admin'] },
  { path: '/lietotaji', file: 'users.html', label: 'Lietotāji', roles: ['admin'] },
  { path: '/lietotaji/rediget', file: 'edit-user.html', label: 'Rediģēt lietotāju', roles: ['admin'] },
  { path: '/izvietot', file: 'place.html', label: 'Izvietot preces', roles: ['sorter', 'admin'] },
  { path: '/atskaites', file: 'placeholder.html', label: 'Sagatavot atskaiti', roles: ['sorter', 'worker'] },
  { path: '/datu-ievade', file: 'placeholder.html', label: 'Datu ievade', roles: ['sorter'] },
  { path: '/pasutijumi', file: 'placeholder.html', label: 'Veikt pasūtījumu', roles: ['worker'] },
];

const menuOrder = {
  admin: ['/produkti/jauns', '/lietotaji/jauns', '/lietotaji'],
  sorter: ['/izvietot', '/atskaites', '/datu-ievade'],
  worker: ['/pasutijumi', '/atskaites'],
};

function menuFor(role) {
  return (menuOrder[role] || [])
    .map((p) => pages.find((x) => x.path === p))
    .map(({ path: p, label }) => ({ path: p, label }));
}

// ---------- Uzruna (vokatīvs) ----------
// Vīriešu vārdiem, kas beidzas ar -s vai -š, noņem pēdējo burtu:
// Jānis -> Jāni, Edgars -> Edgar, Mārtiņš -> Mārtiņ, Matīss -> Matīs.
// Sieviešu vārdi (Anna, Inese) paliek nemainīti.
function vocative(name, gender) {
  if (gender !== 'male') return name;
  return name.replace(/[\p{L}]+/gu, (w) => (w.length > 2 && /[sš]$/i.test(w) ? w.slice(0, -1) : w));
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

// Katrā pieprasījumā pārbauda, vai lietotājs vēl eksistē, un atjauno viņa datus.
// Tā dzēsts lietotājs tiek uzreiz izlogots, un lomas maiņa stājas spēkā uzreiz.
app.use(async (req, res, next) => {
  const u = req.session.user;
  if (!u) return next();
  try {
    const [rows] = await pool.execute(
      'SELECT username, first_name, gender, role FROM users WHERE id = ?',
      [u.id]
    );
    if (!rows[0]) {
      delete req.session.user;
    } else {
      u.username = rows[0].username;
      u.firstName = rows[0].first_name;
      u.gender = rows[0].gender;
      u.role = rows[0].role;
    }
    next();
  } catch (err) {
    next(err);
  }
});

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
        'SELECT id, username, first_name, gender, password_hash, role FROM users WHERE username = ?',
        [req.body.username]
      );
      const row = rows[0];
      const ok = await bcrypt.compare(req.body.password, row ? row.password_hash : DUMMY_HASH);
      if (!row || !ok) return res.status(401).json({ error: 'Nepareizs lietotājvārds vai parole.' });

      // Jauna sesija pēc pieteikšanās (aizsardzība pret session fixation)
      req.session.regenerate((err) => {
        if (err) return res.status(500).json({ error: 'Neizdevās izveidot sesiju.' });
        req.session.user = {
          id: row.id, username: row.username,
          firstName: row.first_name, gender: row.gender, role: row.role,
        };
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
    user: {
      id: u.id,
      username: u.username,
      firstName: u.firstName || u.username,
      gender: u.gender,
      greeting: u.gender === 'female' ? 'Sveika' : 'Sveiks', // uzruna pēc dzimuma
      welcome: (u.gender === 'female' ? 'Sveika' : 'Sveiks') + ', ' + vocative(u.firstName || u.username, u.gender),
      role: u.role,
      roleName: roleNames[u.role],
    },
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

// ---------- API: lietotāji (tikai administrators) ----------
const ROLES = ['admin', 'worker', 'sorter'];
const GENDERS = ['male', 'female'];

const usernameRule = () => body('username').trim()
  .isLength({ min: 3, max: 32 }).withMessage('Lietotājvārdam jābūt 3-32 simbolus garam.').bail()
  .matches(/^[A-Za-z0-9_.-]+$/).withMessage('Lietotājvārds drīkst saturēt tikai burtus, ciparus, punktu, - un _.');

const firstNameRule = () => body('firstName').trim()
  .isLength({ min: 2, max: 50 }).withMessage('Vārdam jābūt 2-50 simbolus garam.').bail()
  .matches(/^\p{L}[\p{L} '’-]*$/u).withMessage('Vārds drīkst saturēt tikai burtus, atstarpes un defisi.');

const genderRule = () => body('gender')
  .isIn(GENDERS).withMessage('Izvēlieties dzimumu.');

const roleRule = () => body('role')
  .isIn(ROLES).withMessage('Izvēlieties derīgu lomu.');

// Rediģējot parole ir neobligāta: tukšs lauks nozīmē "nemainīt"
const passwordRule = (optional) => {
  let chain = body('password');
  if (optional) chain = chain.optional({ values: 'falsy' });
  return chain
    .isString().isLength({ min: 8, max: 72 }).withMessage('Parolei jābūt 8-72 simbolus garai.').bail()
    .custom((v) => Buffer.byteLength(v, 'utf8') <= 72).withMessage('Parole ir pārāk gara.').bail()
    .matches(/[A-Za-z]/).withMessage('Parolē jābūt vismaz vienam burtam.').bail()
    .matches(/\d/).withMessage('Parolē jābūt vismaz vienam ciparam.');
};

const createRules = [usernameRule(), firstNameRule(), genderRule(), passwordRule(false), roleRule()];
const updateRules = [usernameRule(), firstNameRule(), genderRule(), passwordRule(true), roleRule()];

function validationErrors(req) {
  const result = validationResult(req);
  if (result.isEmpty()) return null;
  const errors = {};
  for (const [field, e] of Object.entries(result.mapped())) errors[field] = e.msg;
  return errors;
}

function parseId(req) {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function userDto(r) {
  return {
    id: r.id,
    username: r.username,
    firstName: r.first_name,
    gender: r.gender,
    genderName: r.gender === 'female' ? 'Sieviete' : 'Vīrietis',
    role: r.role,
    roleName: roleNames[r.role],
    createdAt: r.created_at,
  };
}

const USER_COLUMNS = 'id, username, first_name, gender, role, created_at';

// Saraksts
app.get('/api/users', apiGuard('admin'), async (req, res) => {
  try {
    const [rows] = await pool.execute(`SELECT ${USER_COLUMNS} FROM users ORDER BY id`);
    res.json({ users: rows.map(userDto) });
  } catch (err) {
    console.error('Lietotāju saraksta kļūda:', err.message);
    res.status(500).json({ error: 'Servera kļūda.' });
  }
});

// Viens lietotājs
app.get('/api/users/:id', apiGuard('admin'), async (req, res) => {
  const id = parseId(req);
  if (!id) return res.status(400).json({ error: 'Nederīgs lietotāja identifikators.' });
  try {
    const [rows] = await pool.execute(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Lietotājs nav atrasts.' });
    res.json({ user: userDto(rows[0]) });
  } catch (err) {
    console.error('Lietotāja ielādes kļūda:', err.message);
    res.status(500).json({ error: 'Servera kļūda.' });
  }
});

// Izveide
app.post('/api/users', apiGuard('admin'), verifyCsrf, createRules, async (req, res) => {
  const errors = validationErrors(req);
  if (errors) return res.status(400).json({ errors });

  const { username, firstName, gender, password, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 12); // parole tiek saglabāta tikai kā hash
    await pool.execute(
      'INSERT INTO users (username, first_name, gender, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [username, firstName, gender, hash, role]
    );
    res.status(201).json({ ok: true, username });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ errors: { username: 'Šis lietotājvārds jau ir aizņemts.' } });
    }
    console.error('Lietotāja izveides kļūda:', err.message);
    res.status(500).json({ error: 'Servera kļūda. Lietotājs netika izveidots.' });
  }
});

// Rediģēšana
app.put('/api/users/:id', apiGuard('admin'), verifyCsrf, updateRules, async (req, res) => {
  const id = parseId(req);
  if (!id) return res.status(400).json({ error: 'Nederīgs lietotāja identifikators.' });

  const errors = validationErrors(req);
  if (errors) return res.status(400).json({ errors });

  const { username, firstName, gender, password, role } = req.body;

  // Administrators nevar mainīt savu lomu, lai nevarētu nejauši pazaudēt piekļuvi
  if (id === req.session.user.id && role !== req.session.user.role) {
    return res.status(400).json({ errors: { role: 'Savu lomu mainīt nevar.' } });
  }

  try {
    const [exist] = await pool.execute('SELECT id FROM users WHERE id = ?', [id]);
    if (!exist[0]) return res.status(404).json({ error: 'Lietotājs nav atrasts.' });

    if (password) {
      const hash = await bcrypt.hash(password, 12);
      await pool.execute(
        'UPDATE users SET username = ?, first_name = ?, gender = ?, role = ?, password_hash = ? WHERE id = ?',
        [username, firstName, gender, role, hash, id]
      );
    } else {
      await pool.execute(
        'UPDATE users SET username = ?, first_name = ?, gender = ?, role = ? WHERE id = ?',
        [username, firstName, gender, role, id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ errors: { username: 'Šis lietotājvārds jau ir aizņemts.' } });
    }
    console.error('Lietotāja atjaunošanas kļūda:', err.message);
    res.status(500).json({ error: 'Servera kļūda. Izmaiņas netika saglabātas.' });
  }
});

// Dzēšana
app.delete('/api/users/:id', apiGuard('admin'), verifyCsrf, async (req, res) => {
  const id = parseId(req);
  if (!id) return res.status(400).json({ error: 'Nederīgs lietotāja identifikators.' });
  if (id === req.session.user.id) return res.status(400).json({ error: 'Savu kontu dzēst nevar.' });

  try {
    const [r] = await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Lietotājs nav atrasts.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Lietotāja dzēšanas kļūda:', err.message);
    res.status(500).json({ error: 'Servera kļūda. Lietotājs netika dzēsts.' });
  }
});

// ---------- API: preces (skatīšana) ----------
// Preču sarakstu drīkst redzēt visas lomas; katrai precei parāda, cik vienību jau izvietots
app.get('/api/products', apiGuard('admin', 'worker', 'sorter'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT p.id, p.sku, p.name, p.category, p.quantity, COALESCE(SUM(pl.quantity), 0) AS placed
       FROM products p LEFT JOIN placements pl ON pl.product_id = p.id
       GROUP BY p.id ORDER BY p.sku`
    );
    res.json({
      products: rows.map((r) => ({
        id: r.id, sku: r.sku, name: r.name, category: r.category,
        quantity: r.quantity, placed: Number(r.placed),
      })),
    });
  } catch (err) {
    console.error('Preču saraksta kļūda:', err.message);
    res.status(500).json({ error: 'Servera kļūda.' });
  }
});

// ---------- API: preču izvietojums (plauktu kārtotājs un administrators) ----------
class HttpError extends Error {
  constructor(status, payload) { super('HttpError'); this.status = status; this.payload = payload; }
}

// Izpilda darbību transakcijā: vai nu izdodas viss, vai nekas
async function withTx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function sendError(res, err, label) {
  if (err instanceof HttpError) return res.status(err.status).json(err.payload);
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ errors: { location: 'Šajā vietā šī prece jau ir izvietota.' } });
  }
  console.error(label, err.message);
  return res.status(500).json({ error: 'Servera kļūda. Izmaiņas netika saglabātas.' });
}

async function logPlacement(conn, e) {
  await conn.execute(
    `INSERT INTO placement_log (product_id, action, old_location, new_location, old_quantity, new_quantity, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [e.productId, e.action, e.oldLocation ?? null, e.newLocation ?? null, e.oldQuantity ?? null, e.newQuantity ?? null, e.userId]
  );
}

const locationRule = () => body('location').trim()
  .customSanitizer((v) => String(v).toUpperCase())
  .matches(/^[A-Z]{1,2}-\d{1,3}-\d{1,2}$/).withMessage('Vietas formāts: zona-plaukts-līmenis, piemēram, A-03-2.');

const placeQuantityRule = () => body('quantity').trim()
  .isInt({ min: 1, max: 1000000 }).withMessage('Daudzums ir vesels skaitlis no 1 līdz 1 000 000.')
  .toInt();

const placeRules = [
  body('productId').trim().isInt({ min: 1 }).withMessage('Izvēlieties preci.').toInt(),
  locationRule(),
  placeQuantityRule(),
];
const placeEditRules = [locationRule(), placeQuantityRule()];

const PLACERS = ['sorter', 'admin'];

// Izvietojumu saraksts
app.get('/api/placements', apiGuard(...PLACERS), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT pl.id, pl.product_id, p.sku, p.name, pl.location, pl.quantity, pl.updated_at, u.username AS updated_by
       FROM placements pl
       JOIN products p ON p.id = pl.product_id
       LEFT JOIN users u ON u.id = pl.updated_by
       ORDER BY pl.location, p.sku`
    );
    res.json({
      placements: rows.map((r) => ({
        id: r.id, productId: r.product_id, sku: r.sku, name: r.name, location: r.location,
        quantity: r.quantity, updatedAt: r.updated_at, updatedBy: r.updated_by,
      })),
    });
  } catch (err) {
    console.error('Izvietojumu saraksta kļūda:', err.message);
    res.status(500).json({ error: 'Servera kļūda.' });
  }
});

// Izmaiņu vēsture (pēdējie 30 ieraksti)
app.get('/api/placement-log', apiGuard(...PLACERS), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT l.id, l.action, l.old_location, l.new_location, l.old_quantity, l.new_quantity, l.created_at,
              p.sku, p.name, u.username
       FROM placement_log l
       LEFT JOIN products p ON p.id = l.product_id
       LEFT JOIN users u ON u.id = l.user_id
       ORDER BY l.id DESC LIMIT 30`
    );
    res.json({
      log: rows.map((r) => ({
        id: r.id, action: r.action, oldLocation: r.old_location, newLocation: r.new_location,
        oldQuantity: r.old_quantity, newQuantity: r.new_quantity, createdAt: r.created_at,
        sku: r.sku, name: r.name, username: r.username,
      })),
    });
  } catch (err) {
    console.error('Vēstures kļūda:', err.message);
    res.status(500).json({ error: 'Servera kļūda.' });
  }
});

// Jauns izvietojums (ja šajā vietā prece jau ir, daudzums tiek pieskaitīts)
app.post('/api/placements', apiGuard(...PLACERS), verifyCsrf, placeRules, async (req, res) => {
  const errors = validationErrors(req);
  if (errors) return res.status(400).json({ errors });

  const { productId, location, quantity } = req.body;
  const userId = req.session.user.id;

  try {
    await withTx(async (conn) => {
      const [prod] = await conn.execute('SELECT quantity FROM products WHERE id = ? FOR UPDATE', [productId]);
      if (!prod[0]) throw new HttpError(404, { errors: { productId: 'Prece nav atrasta.' } });

      const [sum] = await conn.execute(
        'SELECT COALESCE(SUM(quantity), 0) AS placed FROM placements WHERE product_id = ?', [productId]
      );
      const free = prod[0].quantity - Number(sum[0].placed);
      if (quantity > free) {
        const text = free <= 0 ? 'Šī prece jau ir pilnībā izvietota.' : 'Var izvietot ne vairāk kā ' + free + ' vienības.';
        throw new HttpError(400, { errors: { quantity: text } });
      }

      const [ex] = await conn.execute(
        'SELECT id, quantity FROM placements WHERE product_id = ? AND location = ? FOR UPDATE', [productId, location]
      );
      const oldQuantity = ex[0] ? ex[0].quantity : 0;
      if (ex[0]) {
        await conn.execute('UPDATE placements SET quantity = ?, updated_by = ? WHERE id = ?', [oldQuantity + quantity, userId, ex[0].id]);
      } else {
        await conn.execute(
          'INSERT INTO placements (product_id, location, quantity, updated_by) VALUES (?, ?, ?, ?)',
          [productId, location, quantity, userId]
        );
      }
      await logPlacement(conn, {
        productId, action: 'place', newLocation: location,
        oldQuantity, newQuantity: oldQuantity + quantity, userId,
      });
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    sendError(res, err, 'Izvietošanas kļūda:');
  }
});

// Izvietojuma labošana (vieta un/vai daudzums)
app.put('/api/placements/:id', apiGuard(...PLACERS), verifyCsrf, placeEditRules, async (req, res) => {
  const id = parseId(req);
  if (!id) return res.status(400).json({ error: 'Nederīgs identifikators.' });
  const errors = validationErrors(req);
  if (errors) return res.status(400).json({ errors });

  const { location, quantity } = req.body;
  const userId = req.session.user.id;

  try {
    await withTx(async (conn) => {
      const [cur] = await conn.execute(
        'SELECT id, product_id, location, quantity FROM placements WHERE id = ? FOR UPDATE', [id]
      );
      if (!cur[0]) throw new HttpError(404, { error: 'Izvietojums nav atrasts.' });
      const pl = cur[0];

      const [prod] = await conn.execute('SELECT quantity FROM products WHERE id = ? FOR UPDATE', [pl.product_id]);
      const [others] = await conn.execute(
        'SELECT COALESCE(SUM(quantity), 0) AS q FROM placements WHERE product_id = ? AND id <> ?', [pl.product_id, id]
      );
      const room = prod[0].quantity - Number(others[0].q);
      if (quantity > room) {
        throw new HttpError(400, { errors: { quantity: 'Šai precei var norādīt ne vairāk kā ' + room + ' vienības.' } });
      }

      if (location !== pl.location) {
        const [taken] = await conn.execute(
          'SELECT id FROM placements WHERE product_id = ? AND location = ?', [pl.product_id, location]
        );
        if (taken[0]) throw new HttpError(409, { errors: { location: 'Šajā vietā šī prece jau ir izvietota.' } });
      }

      if (location === pl.location && quantity === pl.quantity) return; // nekas nav mainīts

      await conn.execute('UPDATE placements SET location = ?, quantity = ?, updated_by = ? WHERE id = ?', [location, quantity, userId, id]);
      await logPlacement(conn, {
        productId: pl.product_id, action: 'update',
        oldLocation: pl.location, newLocation: location,
        oldQuantity: pl.quantity, newQuantity: quantity, userId,
      });
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, 'Izvietojuma atjaunošanas kļūda:');
  }
});

// Preces noņemšana no vietas
app.delete('/api/placements/:id', apiGuard(...PLACERS), verifyCsrf, async (req, res) => {
  const id = parseId(req);
  if (!id) return res.status(400).json({ error: 'Nederīgs identifikators.' });
  const userId = req.session.user.id;

  try {
    await withTx(async (conn) => {
      const [cur] = await conn.execute(
        'SELECT product_id, location, quantity FROM placements WHERE id = ? FOR UPDATE', [id]
      );
      if (!cur[0]) throw new HttpError(404, { error: 'Izvietojums nav atrasts.' });
      await conn.execute('DELETE FROM placements WHERE id = ?', [id]);
      await logPlacement(conn, {
        productId: cur[0].product_id, action: 'remove',
        oldLocation: cur[0].location, oldQuantity: cur[0].quantity, userId,
      });
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, 'Izvietojuma dzēšanas kļūda:');
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
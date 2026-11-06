require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { locals } = require('./middleware/auth');
const { roleNames } = require('./menu');
const { init } = require('./db');

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'nomaini-mani') {
  console.warn('BRĪDINĀJUMS: iestatiet drošu SESSION_SECRET failā .env');
}

const app = express();
app.engine('html', require('ejs').__express);
app.set('view engine', 'html');
app.set('views', path.join(__dirname, '..', 'views'));
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

app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

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

app.use(locals);
app.use((req, res, next) => { res.locals.roleNames = roleNames; next(); });

app.use(require('./routes/auth'));
app.use(require('./routes/products'));
app.use(require('./routes/pages'));

app.use((req, res) =>
  res.status(404).render('forbidden', { message: 'Te nekā nav. Lapa neeksistē.', code: 404 })
);

const port = process.env.PORT || 3000;
init()
  .then(() => app.listen(port, () => console.log(`STASH darbojas: http://localhost:${port}`)))
  .catch((err) => {
    console.error('Neizdevās savienoties ar MySQL:', err.message);
    console.error('Pārbaudiet DB_* iestatījumus failā .env un vai ir palaists MySQL serveris.');
    process.exit(1);
  });

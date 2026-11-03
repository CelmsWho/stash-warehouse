const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { pool } = require('../db');
const { verifyCsrf } = require('../middleware/auth');

const router = express.Router();

// Neesoša lietotāja hash, lai atbildes laiks neatklātu, vai lietotājvārds eksistē
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).render('login', { error: 'Par daudz mēģinājumu. Uzgaidiet 15 minūtes.', username: '' }),
});


router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null, username: '' });
});

router.post(
  '/login',
  loginLimiter,
  verifyCsrf,
  [
    body('username').trim().isLength({ min: 3, max: 32 }).matches(/^[A-Za-z0-9_.-]+$/),
    body('password').isString().isLength({ min: 8, max: 72 }),
  ],
  async (req, res) => {
    const username = (req.body.username || '').toString().slice(0, 32);
    const fail = (msg) => res.status(401).render('login', { error: msg, username });

    if (!validationResult(req).isEmpty()) {
      return fail('Pārbaudiet ievadītos datus: lietotājvārds 3-32 simboli, parole 8-72 simboli.');
    }

    try {
      // Parametrizēts vaicājums (aizsardzība pret SQL injekcijām)
      const [rows] = await pool.execute(
        'SELECT id, username, password_hash, role FROM users WHERE username = ?',
        [req.body.username.trim()]
      );
      const row = rows[0];
      const ok = await bcrypt.compare(req.body.password, row ? row.password_hash : DUMMY_HASH);
      if (!row || !ok) return fail('Nepareizs lietotājvārds vai parole.');

      // Jauna sesija pēc pieteikšanās (aizsardzība pret session fixation)
      req.session.regenerate((err) => {
        if (err) return fail('Neizdevās izveidot sesiju.');
        req.session.user = { id: row.id, username: row.username, role: row.role };
        res.redirect('/');
      });
    } catch (err) {
      console.error('Pieteikšanās kļūda:', err.message);
      res.status(500).render('login', { error: 'Servera kļūda. Mēģiniet vēlāk.', username });
    }
  }
);

router.post('/logout', verifyCsrf, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('stash.sid');
    res.redirect('/login');
  });
});

module.exports = router;

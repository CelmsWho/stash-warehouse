const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../db');
const { requireRole, verifyCsrf } = require('../middleware/auth');
const { menuFor } = require('../menu');

const router = express.Router();

const rules = [
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

function renderForm(req, res, extra = {}) {
  res.render('add-product', {
    title: 'Pievienot produktu',
    menu: menuFor(req.session.user.role),
    errors: {},
    values: {},
    success: null,
    formError: null,
    ...extra,
  });
}

router.get('/produkti/jauns', requireRole('admin'), (req, res) => {
  const success = req.session.flash || null;
  delete req.session.flash;
  renderForm(req, res, { success });
});

router.post('/produkti/jauns', requireRole('admin'), verifyCsrf, rules, async (req, res) => {
  const v = (k) => String(req.body[k] ?? '');
  const values = {
    sku: v('sku'), name: v('name'), category: v('category'),
    quantity: v('quantity'), price: v('price'), description: v('description'),
  };

  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(400).render('add-product', {
      title: 'Pievienot produktu',
      menu: menuFor(req.session.user.role),
      errors: result.mapped(), values, success: null, formError: null,
    });
  }

  try {
    // Parametrizēts vaicājums (aizsardzība pret SQL injekcijām)
    await pool.execute(
      `INSERT INTO products (sku, name, category, quantity, price, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        values.sku, values.name, values.category || null,
        Number(values.quantity), values.price, values.description || null,
        req.session.user.id,
      ]
    );
    req.session.flash = `Produkts "${values.name}" ir pievienots.`;
    req.session.save(() => res.redirect('/produkti/jauns'));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).render('add-product', {
        title: 'Pievienot produktu',
        menu: menuFor(req.session.user.role),
        errors: { sku: { msg: 'Produkts ar šādu artikula kodu jau eksistē.' } },
        values, success: null, formError: null,
      });
    }
    console.error('Produkta pievienošanas kļūda:', err.message);
    res.status(500).render('add-product', {
      title: 'Pievienot produktu',
      menu: menuFor(req.session.user.role),
      errors: {}, values, success: null,
      formError: 'Servera kļūda. Produkts netika saglabāts.',
    });
  }
});

module.exports = router;

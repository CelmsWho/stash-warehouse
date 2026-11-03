const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
const { items, menuFor } = require('../menu');

const router = express.Router();

router.get('/', requireLogin, (req, res) => {
  res.render('dashboard', { menu: menuFor(req.session.user.role) });
});

// Pagaidu lapas katram izvēlnes punktam, jau aizsargātas ar lomu pārbaudi.
// Nākamajos posmos katru aizstāsim ar īstu funkcionalitāti.
for (const item of items) {
  router.get(item.path, requireRole(...item.roles), (req, res) => {
    res.render('placeholder', { title: item.label, menu: menuFor(req.session.user.role) });
  });
}

module.exports = router;

const crypto = require('crypto');

// Katram pieprasījumam nodrošina CSRF žetonu un padara lietotāju pieejamu skatos
function locals(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrf = req.session.csrf;
  res.locals.user = req.session.user || null;
  res.locals.currentPath = req.path;
  next();
}

// POST pieprasījumiem jāatnes derīgs CSRF žetons
function verifyCsrf(req, res, next) {
  const sent = req.body && req.body._csrf;
  const real = req.session.csrf;
  if (
    typeof sent === 'string' && real &&
    sent.length === real.length &&
    crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(real))
  ) return next();
  return res.status(403).render('forbidden', {
    code: 403,
    message: 'Sesija nav derīga. Atsvaidziniet lapu un mēģiniet vēlreiz.',
  });
}

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// Servera puses lomu pārbaude: paslēpta izvēlne nav drošība
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render('forbidden', {
        code: 403,
        message: 'Šī zona nav paredzēta jūsu lomai.',
      });
    }
    next();
  };
}

module.exports = { locals, verifyCsrf, requireLogin, requireRole };

// Novērošanas kameras laika zīmogs
(function () {
  var els = document.querySelectorAll('[data-clock]');
  if (!els.length) return;
  function pad(n) { return String(n).padStart(2, '0'); }
  function tick() {
    var d = new Date();
    var t = pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + '  ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    els.forEach(function (e) { e.textContent = t; });
  }
  tick();
  setInterval(tick, 1000);
})();

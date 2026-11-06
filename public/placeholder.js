// Pagaidu lapa sadaļām, kas vēl nav izveidotas
(async () => {
  const me = await initPage();
  if (!me) return;

  const item = me.menu.find((m) => m.path === window.location.pathname);
  const title = item ? item.label : 'Sadaļa';
  document.getElementById('pageTitle').textContent = title;
  document.title = title + ' | STASH';
})();

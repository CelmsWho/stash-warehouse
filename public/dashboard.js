(async () => {
  const me = await initPage();
  if (!me) return;

  document.getElementById('welcome').textContent = 'Sveiks, ' + me.user.username;
  document.getElementById('roleStamp').textContent = me.user.roleName;

  const tiles = document.getElementById('tiles');
  me.menu.forEach((item) => {
    const a = document.createElement('a');
    a.className = 'tile';
    a.href = item.path;
    a.textContent = item.label;
    tiles.appendChild(a);
  });
})();

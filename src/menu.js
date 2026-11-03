// Navigācija un piekļuve katrai lomai. Viens avots gan izvēlnei, gan maršrutu aizsardzībai.
const items = [
  { path: '/produkti/jauns',  label: 'Pievienot produktu',  roles: ['admin'] },
  { path: '/lietotaji/jauns', label: 'Pievienot lietotāju', roles: ['admin'] },
  { path: '/lietotaji',       label: 'Lietotāji',           roles: ['admin'] },
  { path: '/izvietot',        label: 'Izvietot preces',     roles: ['sorter'] },
  { path: '/atskaites',       label: 'Sagatavot atskaiti',  roles: ['sorter', 'worker'] },
  { path: '/datu-ievade',     label: 'Datu ievade',         roles: ['sorter'] },
  { path: '/pasutijumi',      label: 'Veikt pasūtījumu',    roles: ['worker'] },
];

const roleNames = {
  admin: 'Administrators',
  worker: 'Noliktavas darbinieks',
  sorter: 'Plauktu kārtotājs',
};

// Izvēlnes secība katrai lomai (kā ekrānuzņēmumos)
const order = {
  admin:  ['/produkti/jauns', '/lietotaji/jauns', '/lietotaji'],
  sorter: ['/izvietot', '/atskaites', '/datu-ievade'],
  worker: ['/pasutijumi', '/atskaites'],
};

function menuFor(role) {
  return (order[role] || []).map((p) => items.find((i) => i.path === p));
}

module.exports = { items, roleNames, menuFor };

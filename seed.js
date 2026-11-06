// Izveido datubāzi (ja nav) un trīs testa kontus. Drīkst palaist atkārtoti.
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { pool, init, config } = require('./db');

const users = [
  { username: 'admin',  email: 'admin@stash.local',  password: 'admin123',  role: 'admin'  },
  { username: 'worker', email: 'worker@stash.local', password: 'worker123', role: 'worker' },
  { username: 'sorter', email: 'sorter@stash.local', password: 'worker123', role: 'sorter' },
];

async function main() {
  const root = await mysql.createConnection({
    host: config.host, port: config.port, user: config.user, password: config.password,
  });
  const dbName = config.database.replace(/[^A-Za-z0-9_]/g, '');
  await root.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4`);
  await root.end();

  await init();

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 12);
    const [result] = await pool.execute(
      'INSERT IGNORE INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [u.username, u.email, hash, u.role]
    );
    console.log(`${u.role.padEnd(7)} ${u.username} ${result.affectedRows ? 'izveidots' : 'jau eksistē'}`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error('Seed neizdevās:', err.message);
  process.exit(1);
});

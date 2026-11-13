// Izveido datubāzi (ja nav) un trīs testa kontus. Drīkst palaist atkārtoti:
// esošiem kontiem atjaunina vārdu un dzimumu, paroles neaiztiek.
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { pool, init, config } = require('./db');

const users = [
  { username: 'admin',  firstName: 'Jānis',   gender: 'male',   password: 'Admin#2026',  role: 'admin'  },
  { username: 'worker', firstName: 'Anna',    gender: 'female', password: 'Worker#2026', role: 'worker' },
  { username: 'sorter', firstName: 'Pēteris', gender: 'male',   password: 'Sorter#2026', role: 'sorter' },
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
      `INSERT INTO users (username, first_name, gender, password_hash, role)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), gender = VALUES(gender)`,
      [u.username, u.firstName, u.gender, hash, u.role]
    );
    // affectedRows: 1 = izveidots, 2 = atjaunināts, 0 = nemainīts
    console.log(`${u.role.padEnd(7)} ${u.username} ${result.affectedRows === 1 ? 'izveidots' : 'atjaunināts'}`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error('Seed neizdevās:', err.message);
  process.exit(1);
});
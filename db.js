const mysql = require('mysql2/promise');
require('dotenv').config();

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'stash',
};

const pool = mysql.createPool({
  ...config,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
});

async function columnExists(table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0].c) > 0;
}

// Izveido tabulas, ja to vēl nav, un atjauno vecāku users tabulas versiju
async function init() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      username      VARCHAR(32)  NOT NULL UNIQUE,
      first_name    VARCHAR(50)  NOT NULL,
      gender        ENUM('male', 'female') NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role          ENUM('admin', 'worker', 'sorter') NOT NULL,
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Migrācija: vecajā versijā bija e-pasts, nebija vārda un dzimuma
  if (await columnExists('users', 'email')) {
    await pool.execute('ALTER TABLE users DROP COLUMN email');
  }
  if (!(await columnExists('users', 'first_name'))) {
    await pool.execute("ALTER TABLE users ADD COLUMN first_name VARCHAR(50) NOT NULL DEFAULT '' AFTER username");
  }
  if (!(await columnExists('users', 'gender'))) {
    await pool.execute("ALTER TABLE users ADD COLUMN gender ENUM('male', 'female') NOT NULL DEFAULT 'male' AFTER first_name");
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      sku         VARCHAR(32)   NOT NULL UNIQUE,
      name        VARCHAR(100)  NOT NULL,
      category    VARCHAR(50)   NULL,
      quantity    INT UNSIGNED  NOT NULL DEFAULT 0,
      price       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      description VARCHAR(500)  NULL,
      created_by  INT NULL,
      created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_products_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

module.exports = { pool, init, config };
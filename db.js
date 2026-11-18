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

  // Preču izvietojums noliktavā: viena prece var atrasties vairākās vietās
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS placements (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      location   VARCHAR(20) NOT NULL,
      quantity   INT UNSIGNED NOT NULL,
      updated_by INT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_product_location (product_id, location),
      CONSTRAINT fk_pl_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      CONSTRAINT fk_pl_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Izvietojuma izmaiņu vēsture
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS placement_log (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      product_id   INT NULL,
      action       ENUM('place', 'update', 'remove') NOT NULL,
      old_location VARCHAR(20) NULL,
      new_location VARCHAR(20) NULL,
      old_quantity INT UNSIGNED NULL,
      new_quantity INT UNSIGNED NULL,
      user_id      INT NULL,
      created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_log_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Izvietojuma stāvoklis (migrācija esošai tabulai)
  if (!(await columnExists('placements', 'condition_status'))) {
    await pool.execute(`
      ALTER TABLE placements
        ADD COLUMN condition_status ENUM('good', 'check', 'damaged') NOT NULL DEFAULT 'good',
        ADD COLUMN condition_note VARCHAR(200) NULL,
        ADD COLUMN checked_at TIMESTAMP NULL DEFAULT NULL,
        ADD COLUMN checked_by INT NULL,
        ADD CONSTRAINT fk_pl_checked FOREIGN KEY (checked_by) REFERENCES users(id) ON DELETE SET NULL
    `);
  }

  // Stāvokļa pārbaužu vēsture
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS condition_checks (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NULL,
      location   VARCHAR(20) NOT NULL,
      status     ENUM('good', 'check', 'damaged') NOT NULL,
      note       VARCHAR(200) NULL,
      user_id    INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_cc_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      CONSTRAINT fk_cc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Pasūtījumi
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      customer   VARCHAR(100) NOT NULL,
      note       VARCHAR(200) NULL,
      status     ENUM('new', 'picking', 'shipped', 'completed', 'cancelled') NOT NULL DEFAULT 'new',
      created_by INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_orders_status (status),
      CONSTRAINT fk_orders_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS order_items (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      order_id   INT NOT NULL,
      product_id INT NOT NULL,
      quantity   INT UNSIGNED NOT NULL,
      UNIQUE KEY uq_order_product (order_id, product_id),
      CONSTRAINT fk_oi_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT fk_oi_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS order_status_log (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      order_id   INT NOT NULL,
      status     ENUM('new', 'picking', 'shipped', 'completed', 'cancelled') NOT NULL,
      user_id    INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_osl_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT fk_osl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

module.exports = { pool, init, config };
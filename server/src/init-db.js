// Loads schema.sql, runs idempotent ALTERs for newer columns, and promotes
// the oldest user to admin if there's no admin yet.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./db');

// Each entry is a single statement. ER_DUP_FIELDNAME / ER_DUP_KEYNAME are
// swallowed so re-running is safe.
const MIGRATIONS = [
  `ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMP NULL`,
  `ALTER TABLE movies ADD COLUMN notes TEXT NULL`,
];

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('Schema applied.');

    for (const m of MIGRATIONS) {
      try {
        await pool.query(m);
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_KEYNAME') continue;
        throw err;
      }
    }
    console.log('Migrations applied.');

    const [adm] = await pool.query("SELECT COUNT(*) AS c FROM users WHERE is_admin = TRUE");
    if (adm[0].c === 0) {
      const [first] = await pool.query("SELECT id, email FROM users ORDER BY id LIMIT 1");
      if (first.length) {
        await pool.query("UPDATE users SET is_admin = TRUE WHERE id = ?", [first[0].id]);
        console.log(`Bootstrapped admin: ${first[0].email}`);
      } else {
        console.log('No users yet — re-run init-db after the first signup to bootstrap admin.');
      }
    }
  } catch (err) {
    console.error('init-db failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();

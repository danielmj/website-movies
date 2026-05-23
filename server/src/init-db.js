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
  `ALTER TABLE user_movies ADD COLUMN want_to_see BOOLEAN NOT NULL DEFAULT FALSE`,
  // Backfill: any existing rows with status='want_to_see' become
  // status='not_interested' + want_to_see=TRUE so the new column captures the
  // intent. After this migration the 'want_to_see' enum value is unused but
  // kept for forward-compat with any old client traffic.
  `UPDATE user_movies SET want_to_see = TRUE WHERE status = 'want_to_see'`,
  `UPDATE user_movies SET status = 'not_interested' WHERE status = 'want_to_see'`,
  // Phone-based sign-in: phone is unique-nullable, password and email
  // become nullable so OTP-only users can exist without either.
  `ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL`,
  `ALTER TABLE users ADD UNIQUE KEY uniq_phone (phone)`,
  `ALTER TABLE users MODIFY password_hash VARCHAR(255) NULL`,
  `ALTER TABLE users MODIFY email VARCHAR(255) NULL`,
  // Sign in with Apple (no longer used — Google replaced it). Column kept
  // so existing dev DBs still match the migration history.
  `ALTER TABLE users ADD COLUMN apple_user_id VARCHAR(255) NULL`,
  `ALTER TABLE users ADD UNIQUE KEY uniq_apple (apple_user_id)`,
  // Sign in with Google: stable per-user identifier ("sub" claim from
  // Google's id_token JWT). Indexed unique so we can match returning users
  // in O(1).
  `ALTER TABLE users ADD COLUMN google_user_id VARCHAR(255) NULL`,
  `ALTER TABLE users ADD UNIQUE KEY uniq_google (google_user_id)`,
  // Soft-hide flag — admin-controlled. Hidden users are filtered out of the
  // user picker on the Maybe Movie attendee modal and from the public users
  // list, but their existing user_movies + ratings stay intact for history.
  `ALTER TABLE users ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE`,
  // Interest: 3-state segmented control replacing the old want_to_see boolean.
  // Backfill: any row with want_to_see=TRUE becomes 'want_to_see'; everything
  // else stays at the default 'indifferent'. The old boolean column is dropped
  // once the data is migrated.
  `ALTER TABLE user_movies ADD COLUMN interest ENUM('want_to_see','indifferent','not_interested') NOT NULL DEFAULT 'indifferent'`,
  `UPDATE user_movies SET interest = 'want_to_see' WHERE want_to_see = TRUE`,
  `ALTER TABLE user_movies DROP COLUMN want_to_see`,
  // Per-attendee dismiss timestamp for the post-Maybe-Movie rating prompt.
  // The home-page banner that asks attendees to update their rating is
  // suppressed once this is set (or once they attend a newer ended session).
  `ALTER TABLE maybe_attendees ADD COLUMN rating_prompt_dismissed_at TIMESTAMP NULL`,
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
        // ER_DUP_FIELDNAME / ER_DUP_KEYNAME — column/key already added.
        // ER_BAD_FIELD_ERROR — column referenced by a backfill UPDATE has
        //   already been dropped on a previous run.
        // ER_CANT_DROP_FIELD_OR_KEY — column already dropped.
        if (
          err.code === 'ER_DUP_FIELDNAME' ||
          err.code === 'ER_DUP_KEYNAME' ||
          err.code === 'ER_BAD_FIELD_ERROR' ||
          err.code === 'ER_CANT_DROP_FIELD_OR_KEY'
        ) continue;
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

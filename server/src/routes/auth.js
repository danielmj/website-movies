const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const { requireAuth } = require('../auth');
const google = require('../services/google');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function userPayload(userId, adminUserId = null) {
  const [rows] = await pool.query(
    'SELECT id, name, email, is_admin FROM users WHERE id = ?',
    [userId],
  );
  if (!rows.length) return null;
  let admin_name = null;
  if (adminUserId) {
    const [a] = await pool.query('SELECT name FROM users WHERE id = ?', [adminUserId]);
    admin_name = a.length ? a[0].name : null;
  }
  return {
    ...rows[0],
    is_admin: !!rows[0].is_admin,
    impersonating_admin_id: adminUserId,
    admin_name,
  };
}

// ---------- email + password ---------------------------------------------

router.post('/signup', async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    if (!name) return res.status(400).json({ error: 'name required' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'valid email required' });
    if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 chars' });

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) return res.status(409).json({ error: 'email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name, email, hash],
    );

    req.session.userId = result.insertId;
    res.json(await userPayload(result.insertId));
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const [rows] = await pool.query(
      'SELECT id, password_hash FROM users WHERE email = ?',
      [email],
    );
    if (!rows.length || !rows[0].password_hash) {
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    req.session.userId = rows[0].id;
    res.json(await userPayload(rows[0].id));
  } catch (err) {
    next(err);
  }
});

// ---------- Sign in with Google ------------------------------------------

// The frontend uses Google Identity Services (GIS) and sends us the id_token
// (JWT signed by Google) it received in the credential callback. We verify
// the signature against Google's JWKS, then either match an existing user by
// google_user_id / email or create a new account using the name from the
// token's `name` claim.
router.post('/google', async (req, res, next) => {
  try {
    const { id_token } = req.body || {};
    if (!id_token) return res.status(400).json({ error: 'id_token required' });

    const claims = await google.verifyIdToken(id_token);
    const sub = claims.sub;
    const email = (claims.email || '').toLowerCase() || null;
    const niceName = (claims.name || '').trim()
      || (email ? email.split('@')[0] : 'New user');

    // Try to find by Google sub first, then by email (existing email/password
    // user upgrading to Google), else create new.
    let [rows] = await pool.query('SELECT id FROM users WHERE google_user_id = ?', [sub]);
    let userId;
    if (rows.length) {
      userId = rows[0].id;
    } else if (email) {
      [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      if (rows.length) {
        userId = rows[0].id;
        await pool.query('UPDATE users SET google_user_id = ? WHERE id = ?', [sub, userId]);
      }
    }
    if (!userId) {
      const [ins] = await pool.query(
        'INSERT INTO users (name, email, google_user_id) VALUES (?, ?, ?)',
        [niceName, email, sub],
      );
      userId = ins.insertId;
    }
    req.session.userId = userId;
    res.json(await userPayload(userId));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ---------- session lifecycle --------------------------------------------

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('mmm.sid');
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const payload = await userPayload(req.session.userId, req.session.adminUserId);
    if (!payload) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'not authenticated' });
    }
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.get('/users', requireAuth, async (req, res, next) => {
  try {
    // Hidden users are excluded from the public picker (attendee selection,
    // etc.) but their existing user_movies stay in place for ratings/history.
    const [rows] = await pool.query('SELECT id, name, email FROM users WHERE hidden = FALSE ORDER BY name');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ---------- profile edit (name / email / password) ----------------------
//
// Email change just requires the current password (or none if the user
// signed up via Apple and never set one). Phone editing is gone with the
// OTP flow.
router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const [meRows] = await pool.query(
      'SELECT id, name, email, password_hash FROM users WHERE id = ?',
      [userId],
    );
    if (!meRows.length) return res.status(404).json({ error: 'user not found' });
    const me = meRows[0];

    const updates = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name cannot be empty' });
      updates.push('name = ?');
      params.push(name);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'email') && req.body.email !== me.email) {
      const email = String(req.body.email || '').trim().toLowerCase();
      if (req.body.email && !EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'invalid email' });
      }
      if (email) {
        const [dup] = await pool.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
        if (dup.length) return res.status(409).json({ error: 'email already in use' });
      }
      updates.push('email = ?');
      params.push(email || null);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'new_password')) {
      const newPw = String(req.body.new_password || '');
      if (newPw.length < 8) return res.status(400).json({ error: 'password must be at least 8 chars' });
      if (me.password_hash) {
        const ok = await bcrypt.compare(String(req.body.current_password || ''), me.password_hash);
        if (!ok) return res.status(400).json({ error: 'current password incorrect' });
      }
      updates.push('password_hash = ?');
      params.push(await bcrypt.hash(newPw, 12));
    }

    if (!updates.length) return res.status(400).json({ error: 'no changes' });
    params.push(userId);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json(await userPayload(userId, req.session.adminUserId));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;

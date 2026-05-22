const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();

// All admin lookup/mutation routes require an admin session.
router.get('/users', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id, u.name, u.email, u.is_admin, u.last_seen_at, u.created_at,
        (SELECT COUNT(*) FROM user_movies WHERE user_id = u.id) AS movie_count
      FROM users u
      ORDER BY (u.last_seen_at IS NULL), u.last_seen_at DESC, u.created_at DESC
    `);
    res.json(rows.map((r) => ({ ...r, is_admin: !!r.is_admin })));
  } catch (err) {
    next(err);
  }
});

// Reset a user's password to a random one and return it once. Also clears the
// user's existing sessions so they're forced to log back in.
router.post('/users/:id/reset-password', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const newPw = crypto.randomBytes(9).toString('base64url'); // ~12 chars
    const hash = await bcrypt.hash(newPw, 12);
    const [r] = await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'user not found' });
    // express-mysql-session stores session payload as JSON in `data`.
    await pool
      .query("DELETE FROM sessions WHERE JSON_EXTRACT(data, '$.userId') = ?", [id])
      .catch(() => {});
    res.json({ password: newPw });
  } catch (err) {
    next(err);
  }
});

// Begin impersonating another user. Stashes the original admin's id in the
// session so /stop-impersonating can restore it.
router.post('/users/:id/impersonate', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.session.userId) return res.status(400).json({ error: 'cannot impersonate yourself' });
    const [rows] = await pool.query('SELECT id FROM users WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'user not found' });
    if (!req.session.adminUserId) req.session.adminUserId = req.session.userId;
    req.session.userId = id;
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Stop impersonating. Available to any authenticated session that holds an
// adminUserId — only the original admin's cookie has that, so it's safe.
router.post('/stop-impersonating', requireAuth, async (req, res, next) => {
  try {
    if (!req.session.adminUserId) return res.status(400).json({ error: 'not impersonating' });
    req.session.userId = req.session.adminUserId;
    delete req.session.adminUserId;
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.session.userId) return res.status(400).json({ error: 'cannot delete yourself' });
    const [r] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'user not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/toggle-admin', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.session.userId) return res.status(400).json({ error: 'cannot change your own admin flag' });
    const [r] = await pool.query('UPDATE users SET is_admin = NOT is_admin WHERE id = ?', [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'user not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

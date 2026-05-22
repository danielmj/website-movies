const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    res.json({
      id: result.insertId,
      name,
      email,
      is_admin: false,
      impersonating_admin_id: null,
      admin_name: null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const [rows] = await pool.query('SELECT id, name, email, password_hash, is_admin FROM users WHERE email = ?', [email]);
    if (!rows.length) return res.status(401).json({ error: 'invalid credentials' });
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    req.session.userId = user.id;
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      is_admin: !!user.is_admin,
      impersonating_admin_id: null,
      admin_name: null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('mmm.sid');
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, is_admin FROM users WHERE id = ?',
      [req.session.userId],
    );
    if (!rows.length) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'not authenticated' });
    }
    let admin_name = null;
    if (req.session.adminUserId) {
      const [a] = await pool.query('SELECT name FROM users WHERE id = ?', [req.session.adminUserId]);
      admin_name = a.length ? a[0].name : null;
    }
    res.json({
      ...rows[0],
      is_admin: !!rows[0].is_admin,
      impersonating_admin_id: req.session.adminUserId || null,
      admin_name,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/users', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, name, email FROM users ORDER BY name');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

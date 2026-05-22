const pool = require('./db');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'not authenticated' });
  }
  next();
}

async function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'not authenticated' });
  }
  try {
    const [rows] = await pool.query('SELECT is_admin FROM users WHERE id = ?', [req.session.userId]);
    if (!rows.length || !rows[0].is_admin) return res.status(403).json({ error: 'admin only' });
    next();
  } catch (err) {
    next(err);
  }
}

// Update users.last_seen_at on each authenticated request, throttled per-user
// in-memory so we don't hammer MySQL with one UPDATE per page load.
const TOUCH_THROTTLE_MS = 60_000;
const lastTouch = new Map();
function touchLastSeen(req, res, next) {
  const uid = req.session && req.session.userId;
  if (uid) {
    const now = Date.now();
    const prev = lastTouch.get(uid) || 0;
    if (now - prev > TOUCH_THROTTLE_MS) {
      lastTouch.set(uid, now);
      pool
        .query('UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', [uid])
        .catch(() => {});
    }
  }
  next();
}

module.exports = { requireAuth, requireAdmin, touchLastSeen };

const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

async function loadSession(sessionId) {
  const [rows] = await pool.query(
    `SELECT s.id, s.started_by_user_id, s.started_at, s.ended_at, s.watched_movie_id, s.active,
            u.name AS started_by_name
       FROM maybe_sessions s
       JOIN users u ON u.id = s.started_by_user_id
      WHERE s.id = ?`,
    [sessionId],
  );
  if (!rows.length) return null;
  const session = rows[0];
  const [attendees] = await pool.query(
    `SELECT a.user_id, u.name
       FROM maybe_attendees a JOIN users u ON u.id = a.user_id
      WHERE a.session_id = ?
      ORDER BY u.name`,
    [sessionId],
  );
  const [votes] = await pool.query(
    `SELECT v.movie_id, v.user_id, v.vote, u.name
       FROM maybe_votes v JOIN users u ON u.id = v.user_id
      WHERE v.session_id = ?`,
    [sessionId],
  );
  return { ...session, attendees, votes };
}

// Currently active session (or null). Used by the global banner poller.
router.get('/active', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id FROM maybe_sessions WHERE active = TRUE ORDER BY started_at DESC LIMIT 1',
    );
    if (!rows.length) return res.json(null);
    res.json(await loadSession(rows[0].id));
  } catch (err) {
    next(err);
  }
});

// Start a new session. Ends any currently active one.
router.post('/', requireAuth, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const attendeeIds = Array.from(
      new Set([req.session.userId, ...(Array.isArray(req.body.attendee_ids) ? req.body.attendee_ids : [])]),
    ).map(Number).filter(Boolean);

    await conn.beginTransaction();
    await conn.query('UPDATE maybe_sessions SET active = FALSE, ended_at = CURRENT_TIMESTAMP WHERE active = TRUE');
    const [ins] = await conn.query(
      'INSERT INTO maybe_sessions (started_by_user_id) VALUES (?)',
      [req.session.userId],
    );
    const sessionId = ins.insertId;
    if (attendeeIds.length) {
      await conn.query(
        'INSERT INTO maybe_attendees (session_id, user_id) VALUES ?',
        [attendeeIds.map((uid) => [sessionId, uid])],
      );
    }
    await conn.commit();
    res.json(await loadSession(sessionId));
  } catch (err) {
    try { await conn.rollback(); } catch {}
    next(err);
  } finally {
    conn.release();
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const data = await loadSession(Number(req.params.id));
    if (!data) return res.status(404).json({ error: 'not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Replace the attendee list. Anyone can edit per spec.
router.put('/:id/attendees', requireAuth, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const sessionId = Number(req.params.id);
    const ids = Array.from(new Set((req.body.attendee_ids || []).map(Number).filter(Boolean)));

    const [exists] = await conn.query('SELECT id FROM maybe_sessions WHERE id = ?', [sessionId]);
    if (!exists.length) {
      conn.release();
      return res.status(404).json({ error: 'not found' });
    }

    await conn.beginTransaction();
    await conn.query('DELETE FROM maybe_attendees WHERE session_id = ?', [sessionId]);
    if (ids.length) {
      await conn.query(
        'INSERT INTO maybe_attendees (session_id, user_id) VALUES ?',
        [ids.map((uid) => [sessionId, uid])],
      );
    }
    await conn.commit();
    res.json(await loadSession(sessionId));
  } catch (err) {
    try { await conn.rollback(); } catch {}
    next(err);
  } finally {
    conn.release();
  }
});

// Up/down vote on a movie. POST {movie_id, vote: 'up'|'down'|null}. null clears the vote.
router.post('/:id/vote', requireAuth, async (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const movieId = Number(req.body.movie_id);
    const vote = req.body.vote;
    if (!movieId) return res.status(400).json({ error: 'movie_id required' });
    if (vote !== 'up' && vote !== 'down' && vote !== null) {
      return res.status(400).json({ error: 'vote must be up, down, or null' });
    }
    if (vote === null) {
      await pool.query(
        'DELETE FROM maybe_votes WHERE session_id = ? AND user_id = ? AND movie_id = ?',
        [sessionId, req.session.userId, movieId],
      );
    } else {
      await pool.query(
        `INSERT INTO maybe_votes (session_id, movie_id, user_id, vote) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE vote = VALUES(vote)`,
        [sessionId, movieId, req.session.userId, vote],
      );
    }
    res.json(await loadSession(sessionId));
  } catch (err) {
    next(err);
  }
});

// Mark a movie as watched: every attendee gets a 'seen' status (rating left null
// so users can fill it in afterwards). Closes the session.
router.post('/:id/watched', requireAuth, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const sessionId = Number(req.params.id);
    const movieId = Number(req.body.movie_id);
    if (!movieId) return res.status(400).json({ error: 'movie_id required' });

    const [attendees] = await conn.query(
      'SELECT user_id FROM maybe_attendees WHERE session_id = ?',
      [sessionId],
    );

    await conn.beginTransaction();
    for (const a of attendees) {
      await conn.query(
        `INSERT INTO user_movies (user_id, movie_id, status, rating)
         VALUES (?, ?, 'seen', NULL)
         ON DUPLICATE KEY UPDATE status = 'seen'`,
        [a.user_id, movieId],
      );
    }
    await conn.query(
      'UPDATE maybe_sessions SET active = FALSE, ended_at = CURRENT_TIMESTAMP, watched_movie_id = ? WHERE id = ?',
      [movieId, sessionId],
    );
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    next(err);
  } finally {
    conn.release();
  }
});

router.post('/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE maybe_sessions SET active = FALSE, ended_at = CURRENT_TIMESTAMP WHERE id = ?',
      [Number(req.params.id)],
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

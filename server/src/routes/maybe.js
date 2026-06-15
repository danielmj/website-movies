const express = require('express');
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();

async function loadSession(sessionId) {
  const [rows] = await pool.query(
    `SELECT s.id, s.started_by_user_id, s.started_at, s.ended_at, s.watched_movie_id,
            s.cancelled_by_user_id, s.active,
            u.name AS started_by_name,
            cu.name AS cancelled_by_name,
            m.title AS watched_movie_title,
            m.year AS watched_movie_year,
            m.poster_url AS watched_movie_poster_url
       FROM maybe_sessions s
       JOIN users u ON u.id = s.started_by_user_id
       LEFT JOIN users cu ON cu.id = s.cancelled_by_user_id
       LEFT JOIN movies m ON m.id = s.watched_movie_id
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
  // Comments on the watched movie are surfaced on the past-session page so
  // viewers can read what attendees thought without bouncing to the movie
  // detail page. Only loaded when there's a watched movie.
  let comments = [];
  if (session.watched_movie_id) {
    const [rows2] = await pool.query(
      `SELECT c.id, c.user_id, c.body, c.created_at, c.updated_at, u.name
         FROM movie_comments c
         JOIN users u ON u.id = c.user_id
        WHERE c.movie_id = ?
        ORDER BY c.created_at`,
      [session.watched_movie_id],
    );
    comments = rows2;
  }
  return { ...session, attendees, votes, comments };
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

// Most recent ended session that the current user attended, where a movie
// was actually watched and the user hasn't dismissed the rating prompt yet.
// Powers the home-page banner that nudges attendees to (re)rate the movie.
// Returns null if no eligible session — the banner stays hidden.
//
// Defined before GET /:id below so the literal path doesn't collide with
// the :id wildcard.
router.get('/rating-prompt', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.id AS session_id, s.watched_movie_id AS movie_id,
              m.title AS movie_title, s.ended_at
       FROM maybe_attendees a
       JOIN maybe_sessions s ON s.id = a.session_id
       JOIN movies m         ON m.id = s.watched_movie_id
       WHERE a.user_id = ?
         AND a.rating_prompt_dismissed_at IS NULL
         AND s.watched_movie_id IS NOT NULL
         AND s.ended_at IS NOT NULL
       ORDER BY s.ended_at DESC
       LIMIT 1`,
      [req.session.userId],
    );
    res.json(rows[0] || null);
  } catch (err) {
    next(err);
  }
});

// Past Maybe Movie sessions — anything that's been ended (cancelled or
// concluded with a watched movie). Includes attendees + watched-movie
// title + cancelled flag so the UI can render a single combined list.
//
// Also defined before GET /:id so the literal /history path takes
// precedence over the :id wildcard.
router.get('/history', requireAuth, async (req, res, next) => {
  try {
    const [sessions] = await pool.query(
      `SELECT s.id, s.started_at, s.ended_at, s.watched_movie_id,
              m.title AS watched_movie_title,
              m.poster_url AS watched_movie_poster_url,
              u.name  AS started_by_name
       FROM maybe_sessions s
       LEFT JOIN movies m ON m.id = s.watched_movie_id
       LEFT JOIN users  u ON u.id = s.started_by_user_id
       WHERE s.ended_at IS NOT NULL
       ORDER BY s.ended_at DESC
       LIMIT 200`,
    );
    if (!sessions.length) return res.json([]);
    const ids = sessions.map((s) => s.id);
    const [att] = await pool.query(
      `SELECT a.session_id, a.user_id, u.name
       FROM maybe_attendees a
       JOIN users u ON u.id = a.user_id
       WHERE a.session_id IN (?)
       ORDER BY u.name`,
      [ids],
    );
    const byId = new Map(sessions.map((s) => [s.id, { ...s, cancelled: !s.watched_movie_id, attendees: [] }]));
    for (const a of att) byId.get(a.session_id)?.attendees.push({ user_id: a.user_id, name: a.name });
    res.json([...byId.values()]);
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
    // Auto-dismiss any older still-pending rating prompts for these
    // attendees — attending+watching a new session supersedes the previous
    // nudge, so they only ever see one prompt at a time.
    if (attendees.length) {
      const userIds = attendees.map((a) => a.user_id);
      await conn.query(
        `UPDATE maybe_attendees SET rating_prompt_dismissed_at = CURRENT_TIMESTAMP
         WHERE rating_prompt_dismissed_at IS NULL
           AND session_id <> ?
           AND user_id IN (?)`,
        [sessionId, userIds],
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
      `UPDATE maybe_sessions
          SET active = FALSE,
              ended_at = CURRENT_TIMESTAMP,
              cancelled_by_user_id = ?
        WHERE id = ?`,
      [req.session.userId, Number(req.params.id)],
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/dismiss-prompt', requireAuth, async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE maybe_attendees SET rating_prompt_dismissed_at = CURRENT_TIMESTAMP
       WHERE session_id = ? AND user_id = ?`,
      [Number(req.params.id), req.session.userId],
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Admin-only: edit a past session's metadata + attendees. Accepts any
// subset of {watched_movie_id, started_by_user_id, cancelled_by_user_id,
// cancelled, attendee_ids, ended_at}. cancelled=true clears the watched
// movie and requires a cancelled_by; cancelled=false clears cancelled_by
// and requires a watched movie.
router.patch('/:id', requireAdmin, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const id = Number(req.params.id);
    const [exists] = await conn.query('SELECT id, ended_at FROM maybe_sessions WHERE id = ?', [id]);
    if (!exists.length) {
      conn.release();
      return res.status(404).json({ error: 'not found' });
    }

    const body = req.body || {};
    const sets = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(body, 'cancelled')) {
      if (body.cancelled) {
        sets.push('watched_movie_id = NULL');
        const cb = body.cancelled_by_user_id != null ? Number(body.cancelled_by_user_id) : null;
        if (!cb) {
          conn.release();
          return res.status(400).json({ error: 'cancelled_by_user_id required when cancelled=true' });
        }
        sets.push('cancelled_by_user_id = ?');
        params.push(cb);
      } else {
        const wm = body.watched_movie_id != null ? Number(body.watched_movie_id) : null;
        if (!wm) {
          conn.release();
          return res.status(400).json({ error: 'watched_movie_id required when cancelled=false' });
        }
        sets.push('watched_movie_id = ?');
        params.push(wm);
        sets.push('cancelled_by_user_id = NULL');
      }
    } else {
      // Allow editing watched_movie_id / cancelled_by_user_id without
      // toggling cancelled state, e.g. fixing a typo on who hit cancel.
      if (Object.prototype.hasOwnProperty.call(body, 'watched_movie_id')) {
        const wm = body.watched_movie_id != null ? Number(body.watched_movie_id) : null;
        sets.push('watched_movie_id = ?');
        params.push(wm || null);
      }
      if (Object.prototype.hasOwnProperty.call(body, 'cancelled_by_user_id')) {
        const cb = body.cancelled_by_user_id != null ? Number(body.cancelled_by_user_id) : null;
        sets.push('cancelled_by_user_id = ?');
        params.push(cb || null);
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'started_by_user_id')) {
      const sb = Number(body.started_by_user_id);
      if (!sb) {
        conn.release();
        return res.status(400).json({ error: 'started_by_user_id must be a valid user id' });
      }
      sets.push('started_by_user_id = ?');
      params.push(sb);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'ended_at')) {
      const v = body.ended_at;
      if (!v || typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(v)) {
        conn.release();
        return res.status(400).json({ error: 'ended_at must be YYYY-MM-DD or YYYY-MM-DD HH:MM:SS' });
      }
      sets.push('ended_at = ?');
      params.push(v);
    }

    await conn.beginTransaction();

    if (sets.length) {
      await conn.query(`UPDATE maybe_sessions SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    }

    if (Array.isArray(body.attendee_ids)) {
      const ids = Array.from(new Set(body.attendee_ids.map(Number).filter(Boolean)));
      await conn.query('DELETE FROM maybe_attendees WHERE session_id = ?', [id]);
      if (ids.length) {
        await conn.query(
          'INSERT INTO maybe_attendees (session_id, user_id) VALUES ?',
          [ids.map((uid) => [id, uid])],
        );
      }
    }

    await conn.commit();
    res.json(await loadSession(id));
  } catch (err) {
    try { await conn.rollback(); } catch {}
    next(err);
  } finally {
    conn.release();
  }
});

// Admin-only: wipe a session from the history view. Cascades take care of
// attendees + votes via the FK ON DELETE CASCADE.
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [r] = await pool.query('DELETE FROM maybe_sessions WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

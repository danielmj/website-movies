const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

const STATUSES = new Set(['seen', 'want_to_see', 'not_interested']);
const RATINGS = new Set(['high_rec', 'rec', 'neutral', 'dont_like', 'really_dont_like']);

// Upsert the current user's response to a movie.
//
// The body may contain any subset of:
//   status:       'seen' | 'not_interested'   (UI no longer sends 'want_to_see';
//                                              that value still validates for
//                                              forward-compat with old clients)
//   rating:       valid only when status='seen'
//   want_to_see:  boolean — independent flag, can be true alongside any status
//                 so users who've seen a film can still flag "want to see again".
//
// At least one of those must be present. Missing fields keep their previous
// values (or default for new rows).
router.put('/:movieId', requireAuth, async (req, res, next) => {
  try {
    const movieId = Number(req.params.movieId);
    const body = req.body || {};
    const hasStatus = Object.prototype.hasOwnProperty.call(body, 'status');
    const hasWant   = Object.prototype.hasOwnProperty.call(body, 'want_to_see');
    if (!hasStatus && !hasWant) return res.status(400).json({ error: 'status or want_to_see required' });

    if (hasStatus && !STATUSES.has(body.status)) return res.status(400).json({ error: 'invalid status' });
    if (hasStatus && body.status === 'seen') {
      if (!RATINGS.has(body.rating)) return res.status(400).json({ error: 'rating required when seen' });
    }
    const wantBool = hasWant ? !!body.want_to_see : null;

    const [movie] = await pool.query('SELECT id FROM movies WHERE id = ?', [movieId]);
    if (!movie.length) return res.status(404).json({ error: 'movie not found' });

    // Look up the existing row (if any) so we can preserve fields the caller
    // didn't include in this PATCH-style request.
    const [existing] = await pool.query(
      'SELECT status, rating, want_to_see FROM user_movies WHERE user_id = ? AND movie_id = ?',
      [req.session.userId, movieId],
    );
    const prev = existing[0];

    const finalStatus = hasStatus ? body.status : (prev?.status ?? 'not_interested');
    const finalRating = hasStatus
      ? (body.status === 'seen' ? body.rating : null)
      : (prev?.rating ?? null);
    const finalWant = hasWant ? wantBool : !!(prev?.want_to_see);

    await pool.query(
      `INSERT INTO user_movies (user_id, movie_id, status, rating, want_to_see)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), rating = VALUES(rating), want_to_see = VALUES(want_to_see)`,
      [req.session.userId, movieId, finalStatus, finalRating, finalWant],
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:movieId', requireAuth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM user_movies WHERE user_id = ? AND movie_id = ?', [
      req.session.userId,
      Number(req.params.movieId),
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

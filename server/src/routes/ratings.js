const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

const STATUSES = new Set(['seen', 'not_interested']);
const RATINGS = new Set(['high_rec', 'rec', 'neutral', 'dont_like', 'really_dont_like']);
const INTERESTS = new Set(['want_to_see', 'indifferent', 'not_interested']);

// Upsert the current user's response to a movie.
//
// The body may contain any subset of:
//   status:    'seen' | 'not_interested'   ("not_interested" = "haven't seen")
//   rating:    valid only when status='seen'
//   interest:  'want_to_see' | 'indifferent' | 'not_interested' — independent
//              axis from status, so a user who's seen a film can still flag
//              "want to see again" (or be explicitly not interested in a
//              rewatch).
//
// At least one of those must be present. Missing fields keep their previous
// values (or default for new rows).
router.put('/:movieId', requireAuth, async (req, res, next) => {
  try {
    const movieId = Number(req.params.movieId);
    const body = req.body || {};
    const hasStatus   = Object.prototype.hasOwnProperty.call(body, 'status');
    const hasInterest = Object.prototype.hasOwnProperty.call(body, 'interest');
    if (!hasStatus && !hasInterest) {
      return res.status(400).json({ error: 'status or interest required' });
    }

    if (hasStatus && !STATUSES.has(body.status)) return res.status(400).json({ error: 'invalid status' });
    if (hasStatus && body.status === 'seen') {
      if (!RATINGS.has(body.rating)) return res.status(400).json({ error: 'rating required when seen' });
    }
    if (hasInterest && !INTERESTS.has(body.interest)) {
      return res.status(400).json({ error: 'invalid interest' });
    }

    const [movie] = await pool.query('SELECT id FROM movies WHERE id = ?', [movieId]);
    if (!movie.length) return res.status(404).json({ error: 'movie not found' });

    // Look up the existing row (if any) so we can preserve fields the caller
    // didn't include in this PATCH-style request.
    const [existing] = await pool.query(
      'SELECT status, rating, interest FROM user_movies WHERE user_id = ? AND movie_id = ?',
      [req.session.userId, movieId],
    );
    const prev = existing[0];

    const finalStatus = hasStatus ? body.status : (prev?.status ?? 'not_interested');
    const finalRating = hasStatus
      ? (body.status === 'seen' ? body.rating : null)
      : (prev?.rating ?? null);
    const finalInterest = hasInterest ? body.interest : (prev?.interest ?? 'indifferent');

    await pool.query(
      `INSERT INTO user_movies (user_id, movie_id, status, rating, interest)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), rating = VALUES(rating), interest = VALUES(interest)`,
      [req.session.userId, movieId, finalStatus, finalRating, finalInterest],
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

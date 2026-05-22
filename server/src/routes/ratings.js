const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

const STATUSES = new Set(['seen', 'want_to_see', 'not_interested']);
const RATINGS = new Set(['high_rec', 'rec', 'neutral', 'dont_like', 'really_dont_like']);

// Upsert the current user's status (and rating if seen) for a movie.
router.put('/:movieId', requireAuth, async (req, res, next) => {
  try {
    const movieId = Number(req.params.movieId);
    const { status, rating } = req.body || {};
    if (!STATUSES.has(status)) return res.status(400).json({ error: 'invalid status' });

    let finalRating = null;
    if (status === 'seen') {
      if (!RATINGS.has(rating)) return res.status(400).json({ error: 'rating required when seen' });
      finalRating = rating;
    }

    const [movie] = await pool.query('SELECT id FROM movies WHERE id = ?', [movieId]);
    if (!movie.length) return res.status(404).json({ error: 'movie not found' });

    await pool.query(
      `INSERT INTO user_movies (user_id, movie_id, status, rating)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), rating = VALUES(rating)`,
      [req.session.userId, movieId, status, finalRating],
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

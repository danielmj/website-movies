const express = require('express');
const pool = require('../db');
const { requireAuth, optionalAuth } = require('../auth');
const tmdb = require('../services/tmdb');
const omdb = require('../services/omdb');
const bechdel = require('../services/bechdel');

const router = express.Router();

// Search TMDB by title — used by the "Add movie" flow.
router.get('/search', requireAuth, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const results = await tmdb.search(q);
    res.json(results.slice(0, 12));
  } catch (err) {
    next(err);
  }
});

// Preview a TMDB movie's full metadata WITHOUT saving it. Powers the
// detailed card on the Add page so the user can decide before committing.
router.get('/preview/:tmdbId', requireAuth, async (req, res, next) => {
  try {
    const tmdbId = Number(req.params.tmdbId);
    if (!tmdbId) return res.status(400).json({ error: 'tmdb_id required' });
    res.json(await previewByTmdbId(tmdbId));
  } catch (err) {
    next(err);
  }
});

// Same preview shape, addressed by IMDb id instead of TMDB id. Used by the
// Bechdel-browse flow on the Add page (bechdeltest entries only carry
// imdb_id, so we have to translate before pulling TMDB details).
router.get('/preview-by-imdb/:imdbId', requireAuth, async (req, res, next) => {
  try {
    const imdbId = String(req.params.imdbId || '').trim();
    if (!imdbId) return res.status(400).json({ error: 'imdb_id required' });
    const tmdbId = await tmdb.findByImdb(imdbId);
    if (!tmdbId) return res.status(404).json({ error: 'not on TMDB' });
    res.json(await previewByTmdbId(tmdbId));
  } catch (err) {
    next(err);
  }
});

// Full bechdel-test dataset for the Add page's browse mode. The frontend
// filters by title client-side as the user types — across passes and fails.
router.get('/bechdel-list', requireAuth, async (req, res, next) => {
  try {
    res.json(await bechdel.listForBrowse());
  } catch (err) {
    next(err);
  }
});

async function previewByTmdbId(tmdbId) {
  const meta = await tmdb.details(tmdbId);
  const [imdbRating, bech, existing] = await Promise.all([
    omdb.imdbRating(meta.imdb_id),
    bechdel.lookup(meta.imdb_id),
    pool.query('SELECT id FROM movies WHERE tmdb_id = ? OR imdb_id = ? LIMIT 1', [meta.tmdb_id, meta.imdb_id]),
  ]);
  return {
    tmdb_id: meta.tmdb_id,
    imdb_id: meta.imdb_id,
    title: meta.title,
    year: meta.year,
    decade: meta.decade,
    duration_minutes: meta.duration_minutes,
    poster_url: meta.poster_url,
    overview: meta.overview,
    genres: meta.genres,
    imdb_rating: imdbRating,
    bechdel_rating: bech.rating,
    bechdel_passes: bech.passes,
    existing_id: existing[0]?.[0]?.id ?? null,
  };
}

// Add a movie by tmdb_id. Pulls TMDB details + OMDB rating + Bechdel result.
// If already in DB returns existing row.
router.post('/', requireAuth, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const tmdbId = Number(req.body.tmdb_id);
    if (!tmdbId) return res.status(400).json({ error: 'tmdb_id required' });

    const [existing] = await conn.query('SELECT id FROM movies WHERE tmdb_id = ?', [tmdbId]);
    if (existing.length) {
      conn.release();
      return res.json({ id: existing[0].id, existed: true });
    }

    const meta = await tmdb.details(tmdbId);
    const [imdbRating, bech] = await Promise.all([
      omdb.imdbRating(meta.imdb_id),
      bechdel.lookup(meta.imdb_id),
    ]);

    await conn.beginTransaction();
    const [ins] = await conn.query(
      `INSERT INTO movies
        (tmdb_id, imdb_id, title, year, decade, duration_minutes, imdb_rating,
         poster_url, overview, bechdel_rating, bechdel_passes, added_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        meta.tmdb_id,
        meta.imdb_id,
        meta.title,
        meta.year,
        meta.decade,
        meta.duration_minutes,
        imdbRating,
        meta.poster_url,
        meta.overview,
        bech.rating,
        bech.passes,
        req.session.userId,
      ],
    );
    const movieId = ins.insertId;

    if (meta.genres && meta.genres.length) {
      const values = meta.genres.map((g) => [movieId, g]);
      await conn.query('INSERT IGNORE INTO movie_genres (movie_id, genre) VALUES ?', [values]);
    }

    await conn.commit();
    res.json({ id: movieId, existed: false });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    next(err);
  } finally {
    conn.release();
  }
});

// List all movies. Public (no auth required) so the homepage works for
// anonymous visitors, but per-user state (user_movies) is only attached when
// the caller is logged in — anonymous viewers see metadata only.
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const [movies] = await pool.query(`
      SELECT id, tmdb_id, imdb_id, title, year, decade, duration_minutes,
             imdb_rating, poster_url, overview, bechdel_rating, bechdel_passes,
             notes, added_by_user_id, created_at
      FROM movies
      ORDER BY created_at DESC
    `);
    if (!movies.length) return res.json([]);

    const ids = movies.map((m) => m.id);
    const [genres] = await pool.query(
      'SELECT movie_id, genre FROM movie_genres WHERE movie_id IN (?)',
      [ids],
    );

    const byId = new Map(movies.map((m) => [m.id, { ...m, genres: [], user_movies: [] }]));
    for (const g of genres) byId.get(g.movie_id).genres.push(g.genre);

    if (req.session && req.session.userId) {
      const [um] = await pool.query(
        `SELECT um.movie_id, um.user_id, um.status, um.rating, um.interest, u.name
         FROM user_movies um
         JOIN users u ON u.id = um.user_id
         WHERE um.movie_id IN (?)`,
        [ids],
      );
      for (const r of um) byId.get(r.movie_id).user_movies.push({ ...r });
    }

    res.json([...byId.values()]);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(
      `SELECT m.*, u.name AS added_by_name
       FROM movies m
       LEFT JOIN users u ON u.id = m.added_by_user_id
       WHERE m.id = ?`,
      [id],
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    const [genres] = await pool.query('SELECT genre FROM movie_genres WHERE movie_id = ?', [id]);

    const result = { ...rows[0], genres: genres.map((g) => g.genre) };

    // Manual watch events are public (just dates + free-text notes).
    const [watchEvents] = await pool.query(
      `SELECT id, watched_at, notes
       FROM watch_events WHERE movie_id = ?
       ORDER BY watched_at DESC`,
      [id],
    );
    result.watch_events = watchEvents;

    // Anonymous viewers see metadata only — no per-user table, no Maybe-
    // session watch history. The frontend gates the UI sections on user state.
    if (req.session && req.session.userId) {
      const [allUsers] = await pool.query('SELECT id, name FROM users ORDER BY name');
      const [um] = await pool.query(
        `SELECT user_id, status, rating, interest, updated_at
         FROM user_movies WHERE movie_id = ?`,
        [id],
      );
      const byUser = new Map(um.map((r) => [r.user_id, r]));
      result.user_movies = allUsers.map((u) => {
        const r = byUser.get(u.id);
        return {
          user_id: u.id,
          name: u.name,
          status: r ? r.status : null,
          rating: r ? r.rating : null,
          interest: r ? r.interest : 'indifferent',
          updated_at: r ? r.updated_at : null,
        };
      });

      const [watch_history] = await pool.query(
        `SELECT ms.id, ms.started_at, ms.ended_at,
                GROUP_CONCAT(u.name ORDER BY u.name SEPARATOR ', ') AS attendees
         FROM maybe_sessions ms
         LEFT JOIN maybe_attendees ma ON ma.session_id = ms.id
         LEFT JOIN users u ON u.id = ma.user_id
         WHERE ms.watched_movie_id = ? AND ms.ended_at IS NOT NULL
         GROUP BY ms.id, ms.started_at, ms.ended_at
         ORDER BY ms.ended_at DESC`,
        [id],
      );
      result.watch_history = watch_history;
    }

    // Comments are public (visible to anonymous viewers); posting/editing
    // is auth-gated below.
    const [comments] = await pool.query(
      `SELECT c.id, c.user_id, c.body, c.created_at, c.updated_at, u.name
       FROM movie_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.movie_id = ?
       ORDER BY c.created_at`,
      [id],
    );
    result.comments = comments;

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const movieId = Number(req.params.id);
    const body = String(req.body?.body ?? '').trim();
    if (!movieId) return res.status(400).json({ error: 'invalid movie id' });
    if (!body) return res.status(400).json({ error: 'body is required' });
    if (body.length > 4000) return res.status(400).json({ error: 'body too long (max 4000 chars)' });
    const [m] = await pool.query('SELECT id FROM movies WHERE id = ?', [movieId]);
    if (!m.length) return res.status(404).json({ error: 'movie not found' });
    const [r] = await pool.query(
      'INSERT INTO movie_comments (movie_id, user_id, body) VALUES (?, ?, ?)',
      [movieId, req.session.userId, body],
    );
    res.json({ id: r.insertId });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/comments/:commentId', requireAuth, async (req, res, next) => {
  try {
    const commentId = Number(req.params.commentId);
    const body = String(req.body?.body ?? '').trim();
    if (!body) return res.status(400).json({ error: 'body is required' });
    if (body.length > 4000) return res.status(400).json({ error: 'body too long (max 4000 chars)' });
    // Author-only edit. Admin still has DELETE; editing someone else's words
    // is a different bar that we don't grant here.
    const [r] = await pool.query(
      'UPDATE movie_comments SET body = ? WHERE id = ? AND user_id = ?',
      [body, commentId, req.session.userId],
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'not found or not yours' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/comments/:commentId', requireAuth, async (req, res, next) => {
  try {
    const commentId = Number(req.params.commentId);
    const [rows] = await pool.query('SELECT user_id FROM movie_comments WHERE id = ?', [commentId]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    const [me] = await pool.query('SELECT is_admin FROM users WHERE id = ?', [req.session.userId]);
    const isAdmin = !!me[0]?.is_admin;
    if (rows[0].user_id !== req.session.userId && !isAdmin) {
      return res.status(403).json({ error: 'not yours' });
    }
    await pool.query('DELETE FROM movie_comments WHERE id = ?', [commentId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const [r] = await pool.query('DELETE FROM movies WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const tmdb = require('../services/tmdb');
const omdb = require('../services/omdb');
const bechdel = require('../services/bechdel');

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

// ---------- movie metadata: export, import, edit, watch events -----------

// Full dump of every movie + its genres + per-user statuses + watch events.
// Use as a backup, a migration source, or sync'ing data between environments.
router.get('/movies/export', requireAdmin, async (req, res, next) => {
  try {
    const [movies] = await pool.query('SELECT * FROM movies ORDER BY id');
    const [genres] = await pool.query('SELECT movie_id, genre FROM movie_genres');
    const [um] = await pool.query(
      `SELECT um.movie_id, u.email AS user_email, um.status, um.rating, um.created_at, um.updated_at
       FROM user_movies um JOIN users u ON u.id = um.user_id`,
    );
    const [we] = await pool.query(
      'SELECT movie_id, watched_at, notes FROM watch_events ORDER BY movie_id, watched_at',
    );
    const byMovie = new Map(movies.map((m) => [m.id, { ...m, genres: [], user_movies: [], watch_events: [] }]));
    for (const g of genres) byMovie.get(g.movie_id)?.genres.push(g.genre);
    for (const r of um) byMovie.get(r.movie_id)?.user_movies.push(r);
    for (const w of we) byMovie.get(w.movie_id)?.watch_events.push({ watched_at: w.watched_at, notes: w.notes });
    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      movies: [...byMovie.values()],
    };
    res.setHeader('Content-Disposition', `attachment; filename="movies-export-${Date.now()}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    next(err);
  }
});

// Replay an export. For each movie keyed by tmdb_id (preferred) or imdb_id,
// upsert metadata + genres + per-user statuses (matching by user email) +
// watch events. Idempotent — re-running with the same dump is a no-op.
router.post('/movies/import', requireAdmin, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const dump = req.body;
    if (!dump || !Array.isArray(dump.movies)) {
      return res.status(400).json({ error: 'expected { movies: [...] }' });
    }
    await conn.beginTransaction();
    let inserted = 0, updated = 0, statusesApplied = 0, eventsAdded = 0;

    for (const m of dump.movies) {
      let movieId;
      const findKey = m.tmdb_id ? ['tmdb_id', m.tmdb_id] : m.imdb_id ? ['imdb_id', m.imdb_id] : null;
      if (!findKey) continue;
      const [existing] = await conn.query(`SELECT id FROM movies WHERE ${findKey[0]} = ?`, [findKey[1]]);
      if (existing.length) {
        movieId = existing[0].id;
        await conn.query(
          `UPDATE movies SET title = ?, year = ?, decade = ?, duration_minutes = ?,
                             imdb_rating = ?, poster_url = ?, overview = ?,
                             bechdel_rating = ?, bechdel_passes = ?, notes = ?
           WHERE id = ?`,
          [m.title, m.year, m.decade, m.duration_minutes, m.imdb_rating, m.poster_url,
           m.overview, m.bechdel_rating, m.bechdel_passes, m.notes ?? null, movieId],
        );
        updated++;
      } else {
        const [ins] = await conn.query(
          `INSERT INTO movies
             (tmdb_id, imdb_id, title, year, decade, duration_minutes, imdb_rating,
              poster_url, overview, bechdel_rating, bechdel_passes, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [m.tmdb_id ?? null, m.imdb_id ?? null, m.title, m.year, m.decade, m.duration_minutes,
           m.imdb_rating, m.poster_url, m.overview, m.bechdel_rating, m.bechdel_passes, m.notes ?? null],
        );
        movieId = ins.insertId;
        inserted++;
      }
      if (Array.isArray(m.genres) && m.genres.length) {
        const values = m.genres.map((g) => [movieId, g]);
        await conn.query('INSERT IGNORE INTO movie_genres (movie_id, genre) VALUES ?', [values]);
      }
      for (const r of (m.user_movies || [])) {
        if (!r.user_email || !r.status) continue;
        const [u] = await conn.query('SELECT id FROM users WHERE email = ?', [r.user_email]);
        if (!u.length) continue;
        await conn.query(
          `INSERT INTO user_movies (user_id, movie_id, status, rating)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE status = VALUES(status), rating = VALUES(rating)`,
          [u[0].id, movieId, r.status, r.rating ?? null],
        );
        statusesApplied++;
      }
      for (const w of (m.watch_events || [])) {
        if (!w.watched_at) continue;
        // Skip if an event with same date already exists — keeps re-imports idempotent.
        const [dup] = await conn.query(
          'SELECT id FROM watch_events WHERE movie_id = ? AND watched_at = ?',
          [movieId, w.watched_at],
        );
        if (dup.length) continue;
        await conn.query(
          'INSERT INTO watch_events (movie_id, watched_at, notes) VALUES (?, ?, ?)',
          [movieId, w.watched_at, w.notes ?? null],
        );
        eventsAdded++;
      }
    }
    await conn.commit();
    res.json({ ok: true, inserted, updated, statuses_applied: statusesApplied, watch_events_added: eventsAdded });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    next(err);
  } finally {
    conn.release();
  }
});

// Phase 1 of the title-list import flow: take `[{ title, added_by? }]`,
// search TMDB for each, return candidates so the admin can resolve any
// non-exact matches in the UI before phase 2 commits.
router.post('/movies/import-titles/search', requireAdmin, async (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items) return res.status(400).json({ error: 'expected { items: [{ title, added_by? }] }' });

    const out = [];
    for (const it of items) {
      const title = String(it.title || '').trim();
      if (!title) { out.push({ input: it, candidates: [], status: 'empty' }); continue; }
      const note = Array.isArray(it.added_by) ? `Added by: ${it.added_by.join(', ')}`
                  : it.added_by ? `Added by: ${it.added_by}` : null;

      let candidates = [];
      try {
        candidates = (await tmdb.search(title)).slice(0, 5);
      } catch (e) {
        out.push({ input: it, note, candidates: [], status: 'search_failed', error: e.message });
        continue;
      }
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const exactMatches = candidates.filter((c) => norm(c.title) === norm(title));

      // Already in the DB? skip search and tell the UI it'll be a no-op.
      let existingId = null;
      if (candidates.length) {
        const [rows] = await pool.query(
          'SELECT id FROM movies WHERE tmdb_id IN (?)',
          [candidates.map((c) => c.tmdb_id)],
        );
        if (rows.length) existingId = rows[0].id;
      }

      let status;
      if (!candidates.length) status = 'no_results';
      else if (existingId) status = 'already_in_db';
      else if (exactMatches.length === 1) status = 'auto';
      else status = 'needs_confirm';

      out.push({
        input: it,
        note,
        status,
        existing_id: existingId,
        chosen_tmdb_id: status === 'auto' ? exactMatches[0].tmdb_id : null,
        candidates,
      });
    }
    res.json({ items: out });
  } catch (err) {
    next(err);
  }
});

// Phase 2: take resolved selections (tmdb_id per item, plus the note text),
// fetch full metadata, and add. Mirrors the regular POST /api/movies flow
// but in bulk and lets the admin set a `notes` value per movie.
router.post('/movies/import-titles/commit', requireAdmin, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items) return res.status(400).json({ error: 'expected { items: [{ tmdb_id, note? }] }' });

    await conn.beginTransaction();
    const results = [];
    for (const it of items) {
      const tmdbId = Number(it.tmdb_id);
      if (!tmdbId) { results.push({ ...it, ok: false, error: 'missing tmdb_id' }); continue; }

      const [existing] = await conn.query('SELECT id FROM movies WHERE tmdb_id = ?', [tmdbId]);
      if (existing.length) {
        // Still update the note if one was provided.
        if (it.note) {
          await conn.query('UPDATE movies SET notes = COALESCE(NULLIF(notes, ""), ?) WHERE id = ?', [it.note, existing[0].id]);
        }
        results.push({ ...it, ok: true, movie_id: existing[0].id, existed: true });
        continue;
      }

      try {
        const meta = await tmdb.details(tmdbId);
        const [imdbRating, bech] = await Promise.all([
          omdb.imdbRating(meta.imdb_id),
          bechdel.lookup(meta.imdb_id),
        ]);
        const [ins] = await conn.query(
          `INSERT INTO movies
             (tmdb_id, imdb_id, title, year, decade, duration_minutes, imdb_rating,
              poster_url, overview, bechdel_rating, bechdel_passes, notes, added_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [meta.tmdb_id, meta.imdb_id, meta.title, meta.year, meta.decade, meta.duration_minutes,
           imdbRating, meta.poster_url, meta.overview, bech.rating, bech.passes, it.note ?? null,
           req.session.userId],
        );
        if (meta.genres?.length) {
          const values = meta.genres.map((g) => [ins.insertId, g]);
          await conn.query('INSERT IGNORE INTO movie_genres (movie_id, genre) VALUES ?', [values]);
        }
        results.push({ ...it, ok: true, movie_id: ins.insertId, existed: false });
      } catch (e) {
        results.push({ ...it, ok: false, error: e.message });
      }
    }
    await conn.commit();
    res.json({ items: results });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    next(err);
  } finally {
    conn.release();
  }
});

// Edit movie metadata (admin only). Currently allows editing the free-text
// notes field and the added_by_user_id pointer. TMDB-derived fields
// (title, year, etc.) intentionally aren't editable here — those come from
// the source of truth.
router.patch('/movies/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const fields = [];
    const values = [];
    if (Object.prototype.hasOwnProperty.call(req.body, 'notes')) {
      fields.push('notes = ?');
      values.push(req.body.notes ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'added_by_user_id')) {
      fields.push('added_by_user_id = ?');
      values.push(req.body.added_by_user_id ?? null);
    }
    if (!fields.length) return res.status(400).json({ error: 'no editable fields supplied' });
    values.push(id);
    const [r] = await pool.query(`UPDATE movies SET ${fields.join(', ')} WHERE id = ?`, values);
    if (!r.affectedRows) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/movies/:id/watch-events', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const watchedAt = String(req.body?.watched_at || '').trim();
    const notes = req.body?.notes ?? null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(watchedAt)) {
      return res.status(400).json({ error: 'watched_at must be YYYY-MM-DD' });
    }
    const [m] = await pool.query('SELECT id FROM movies WHERE id = ?', [id]);
    if (!m.length) return res.status(404).json({ error: 'movie not found' });
    const [ins] = await pool.query(
      'INSERT INTO watch_events (movie_id, watched_at, notes) VALUES (?, ?, ?)',
      [id, watchedAt, notes],
    );
    res.json({ id: ins.insertId, ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/watch-events/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [r] = await pool.query('DELETE FROM watch_events WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

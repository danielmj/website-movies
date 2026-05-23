// Bechdel-test lookups, served from a local MySQL table seeded at server
// boot from server/data/bechdel-movies.json. The bechdeltest.com API got
// retired so we ship the data ourselves — same fields the API used to
// return, sourced from the FiveThirtyEight Bechdel CSV.
//
// On boot, seedFromJson() ensures `bechdel_movies` is populated. Lookup is
// just a primary-key SELECT on imdb_id.

const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function lookup(imdbId) {
  if (!imdbId) return { rating: null, passes: null };
  const stripped = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`;
  try {
    const [rows] = await pool.query(
      'SELECT passes FROM bechdel_movies WHERE imdb_id = ?',
      [stripped],
    );
    if (!rows.length) return { rating: null, passes: null };
    const passes = !!rows[0].passes;
    return { rating: passes ? 3 : 0, passes };
  } catch {
    return { rating: null, passes: null };
  }
}

// Push bechdel results from `bechdel_movies` onto matching `movies` rows.
// `movies.bechdel_passes` / `bechdel_rating` are cached at insert time, so
// any movie that was added before its imdb_id appeared in the bechdel table
// (e.g. admin-imported movies, then bechdel data imported afterwards) ends
// up stuck at NULL. Re-running this query is cheap and self-healing.
async function syncMovies() {
  const [r] = await pool.query(`
    UPDATE movies m
    JOIN bechdel_movies b ON b.imdb_id = m.imdb_id
    SET m.bechdel_passes = b.passes,
        m.bechdel_rating = CASE WHEN b.passes THEN 3 ELSE 0 END
    WHERE m.imdb_id IS NOT NULL
      AND (
        m.bechdel_passes IS NULL
        OR m.bechdel_passes <> b.passes
      )
  `);
  return r.affectedRows || 0;
}

// Full bechdel dataset for the Add page's browse mode. Sorted newest-first
// so the client can render grouped-by-year sections in a sensible order.
// ~10k rows / ~750KB — fine to ship in one shot, gives the search bar full
// reach across the entire dataset.
async function listForBrowse() {
  const [rows] = await pool.query(`
    SELECT imdb_id, title, year, passes
    FROM bechdel_movies
    ORDER BY year DESC, title
  `);
  return rows.map((r) => ({ ...r, passes: !!r.passes }));
}

// Seed `bechdel_movies` from the bundled JSON file. Idempotent and
// additive: we INSERT IGNORE every JSON row, so existing entries are
// untouched (they already match by imdb_id PK) and new entries from
// updated JSON files get picked up. Crucially, this never deletes —
// admin-imported and RSS-added rows survive across restarts.
async function seedFromJson() {
  try {
    const file = path.join(__dirname, '..', '..', 'data', 'bechdel-movies.json');
    if (!fs.existsSync(file)) {
      console.warn('[bechdel] no data file at', file, '— table left empty');
      return;
    }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(data) || !data.length) return;

    // Skip the seed entirely if the table already has at least the
    // bundled file's worth of rows — saves the cost of a 9k-row INSERT
    // IGNORE on every boot once we're past the first run.
    const [count] = await pool.query('SELECT COUNT(*) AS c FROM bechdel_movies');
    if (count[0].c >= data.length) return;

    const chunkSize = 500;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      const values = chunk.map((m) => [m.imdb_id, m.title, m.year, m.passes ? 1 : 0]);
      await pool.query(
        'INSERT IGNORE INTO bechdel_movies (imdb_id, title, year, passes) VALUES ?',
        [values],
      );
    }
    console.log(`[bechdel] ensured bundled dataset (${data.length} rows) is in bechdel_movies`);
  } catch (err) {
    console.error('[bechdel] seed failed:', err.message);
  }
}

module.exports = { lookup, listForBrowse, seedFromJson, syncMovies };

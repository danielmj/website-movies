// bechdeltest.com public API. No key required, no published rate limit.
// rating: 0..3 — 3 means it passes (two named women talk to each other about something other than a man).
const fetch = require('node-fetch');
const usage = require('./usage');

async function lookup(imdbId) {
  if (!imdbId) return { rating: null, passes: null };
  const stripped = imdbId.replace(/^tt/, '');
  try {
    const url = `https://bechdeltest.com/api/v1/getMovieByImdbId?imdbid=${encodeURIComponent(stripped)}`;
    const r = await fetch(url);
    usage.record('bechdel', r.status);
    if (!r.ok) return { rating: null, passes: null };
    const j = await r.json();
    // Bechdeltest returns `status` as a string ("404") when the movie isn't
    // tested yet; loose equality covers both the string and number cases.
    // It also occasionally returns the full row but with `rating` as a
    // string — coerce before checking.
    if (!j) return { rating: null, passes: null };
    if (j.status != null && Number(j.status) === 404) return { rating: null, passes: null };
    if (j.rating === undefined || j.rating === null || j.rating === '') {
      return { rating: null, passes: null };
    }
    const rating = Number(j.rating);
    return {
      rating: Number.isFinite(rating) ? rating : null,
      passes: Number.isFinite(rating) ? rating >= 3 : null,
    };
  } catch {
    usage.record('bechdel', 0);
    return { rating: null, passes: null };
  }
}

// Cached full list of Bechdel-passing movies. The bechdeltest "getAllMovies"
// endpoint returns ~10k entries; we filter to rating=3 (passes all three
// criteria), strip to the fields we actually need, and reuse for an hour
// so the Add page's browse mode is snappy on subsequent loads.
let _passingCache = null;
let _passingCacheAt = 0;
const PASSING_TTL_MS = 60 * 60 * 1000;

async function allPassing() {
  const now = Date.now();
  if (_passingCache && now - _passingCacheAt < PASSING_TTL_MS) return _passingCache;
  const r = await fetch('https://bechdeltest.com/api/v1/getAllMovies');
  usage.record('bechdel', r.status);
  if (!r.ok) throw new Error(`bechdeltest getAllMovies failed: ${r.status}`);
  const j = await r.json();
  const list = Array.isArray(j) ? j : [];
  _passingCache = list
    .filter((m) => Number(m.rating) === 3 && m.imdbid && m.title)
    .map((m) => ({
      imdb_id: 'tt' + String(m.imdbid),
      title: m.title,
      year: m.year ? Number(m.year) : null,
    }))
    // Newest first — most recognizable titles end up at the top of the
    // unfiltered list. The user's search bar still filters the whole set.
    .sort((a, b) => (b.year || 0) - (a.year || 0));
  _passingCacheAt = now;
  return _passingCache;
}

module.exports = { lookup, allPassing };

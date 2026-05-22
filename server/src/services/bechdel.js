// bechdeltest.com public API. No key required.
// rating: 0..3 — 3 means it passes (two named women talk to each other about something other than a man).
const fetch = require('node-fetch');

async function lookup(imdbId) {
  if (!imdbId) return { rating: null, passes: null };
  const stripped = imdbId.replace(/^tt/, '');
  try {
    const url = `https://bechdeltest.com/api/v1/getMovieByImdbId?imdbid=${encodeURIComponent(stripped)}`;
    const r = await fetch(url);
    if (!r.ok) return { rating: null, passes: null };
    const j = await r.json();
    if (!j || j.status === 404 || j.rating === undefined) return { rating: null, passes: null };
    const rating = Number(j.rating);
    return {
      rating: Number.isFinite(rating) ? rating : null,
      passes: Number.isFinite(rating) ? rating >= 3 : null,
    };
  } catch {
    return { rating: null, passes: null };
  }
}

module.exports = { lookup };

// OMDB client - we only use it to fetch the IMDB rating by IMDB id.
// http://www.omdbapi.com — free tier is 1000 requests/day.
const fetch = require('node-fetch');
const usage = require('./usage');

async function imdbRating(imdbId) {
  const k = process.env.OMDB_API_KEY;
  if (!k || !imdbId) return null;
  try {
    const url = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${k}`;
    const r = await fetch(url);
    usage.record('omdb', r.status);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || j.Response === 'False') return null;
    const n = Number(j.imdbRating);
    return Number.isFinite(n) ? n : null;
  } catch {
    usage.record('omdb', 0); // network/parse error — count it but with sentinel status
    return null;
  }
}

module.exports = { imdbRating };

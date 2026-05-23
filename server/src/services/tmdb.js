// TMDB v3 client. Requires TMDB_API_KEY env var.
// https://developer.themoviedb.org/reference/intro/getting-started
const fetch = require('node-fetch');
const usage = require('./usage');

const BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';

function key() {
  const k = process.env.TMDB_API_KEY;
  if (!k) throw new Error('TMDB_API_KEY not configured');
  return k;
}

async function search(query) {
  const url = `${BASE}/search/movie?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1&api_key=${key()}`;
  const r = await fetch(url);
  usage.record('tmdb', r.status);
  if (!r.ok) throw new Error(`TMDB search failed: ${r.status}`);
  const j = await r.json();
  return (j.results || []).map((m) => ({
    tmdb_id: m.id,
    title: m.title,
    year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
    overview: m.overview || null,
    poster_url: m.poster_path ? `${IMG_BASE}${m.poster_path}` : null,
  }));
}

async function details(tmdbId) {
  const url = `${BASE}/movie/${tmdbId}?append_to_response=external_ids&language=en-US&api_key=${key()}`;
  const r = await fetch(url);
  usage.record('tmdb', r.status);
  if (!r.ok) throw new Error(`TMDB details failed: ${r.status}`);
  const m = await r.json();
  const year = m.release_date ? Number(m.release_date.slice(0, 4)) : null;
  return {
    tmdb_id: m.id,
    imdb_id: (m.external_ids && m.external_ids.imdb_id) || m.imdb_id || null,
    title: m.title,
    year,
    decade: year ? Math.floor(year / 10) * 10 : null,
    duration_minutes: m.runtime || null,
    overview: m.overview || null,
    poster_url: m.poster_path ? `${IMG_BASE}${m.poster_path}` : null,
    genres: (m.genres || []).map((g) => g.name),
  };
}

// Reverse-lookup: given an IMDb id (e.g. "tt0123456"), ask TMDB's /find
// endpoint for the corresponding TMDB movie id. Returns null if TMDB
// doesn't have it. Used by the Bechdel-browse flow to get from a
// bechdeltest entry back into the regular preview pipeline.
async function findByImdb(imdbId) {
  if (!imdbId) return null;
  const url = `${BASE}/find/${encodeURIComponent(imdbId)}?external_source=imdb_id&api_key=${key()}`;
  const r = await fetch(url);
  usage.record('tmdb', r.status);
  if (!r.ok) throw new Error(`TMDB find failed: ${r.status}`);
  const j = await r.json();
  const movie = (j.movie_results || [])[0];
  return movie?.id || null;
}

module.exports = { search, details, findByImdb };

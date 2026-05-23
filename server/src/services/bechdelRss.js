// Weekly pull of bechdeltest.com's RSS feed. The site retired its public
// API but still publishes new ratings via RSS, so we read that and upsert
// into our local `bechdel_movies` table. Re-running is safe: INSERT IGNORE
// dedupes by imdb_id (the table's primary key).
//
// Schedule:
//   - On boot: runIfStale() checks api_usage for the last 'bechdel_rss'
//     entry. If older than 7 days (or missing), it runs.
//   - Every 24h thereafter: same check; only does work once a week.
//
// Persistence of the last-run timestamp piggybacks on the existing
// `api_usage` table — we record one row per attempt with service =
// 'bechdel_rss'. Since 'bechdel_rss' isn't in usage.LIMITS, it never shows
// up in the admin meter.
//
// Parsing the feed: bechdeltest.com items embed the IMDb id and the rating
// (0/1/2/3 — only 3 is a full pass). We extract via regex against the
// title + link + description. Items missing an imdb_id are skipped.

const pool = require('../db');
const usage = require('./usage');

const RSS_URL = 'https://bechdeltest.com/rss/';
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function lastRunAt() {
  try {
    const [rows] = await pool.query(
      `SELECT MAX(called_at) AS last FROM api_usage WHERE service = 'bechdel_rss'`,
    );
    return rows[0]?.last ? new Date(rows[0].last).getTime() : 0;
  } catch {
    return 0;
  }
}

async function runIfStale() {
  const last = await lastRunAt();
  if (last && Date.now() - last < ONE_WEEK_MS) return { skipped: true, last };
  return await pull();
}

async function pull() {
  let res, body;
  try {
    res = await fetch(RSS_URL, { headers: { 'User-Agent': 'maybe-movie-mondays/1.0' } });
    body = await res.text();
  } catch (err) {
    await usage.record('bechdel_rss', 0);
    console.error('[bechdel-rss] fetch failed:', err.message);
    return { error: err.message };
  }
  await usage.record('bechdel_rss', res.status);
  if (!res.ok) {
    console.error('[bechdel-rss] HTTP', res.status);
    return { error: `HTTP ${res.status}` };
  }
  const items = parseRss(body);
  let inserted = 0;
  let skipped = 0;
  for (const it of items) {
    if (!it.imdb_id || !it.title) { skipped++; continue; }
    try {
      const [r] = await pool.query(
        `INSERT IGNORE INTO bechdel_movies (imdb_id, title, year, passes)
         VALUES (?, ?, ?, ?)`,
        [it.imdb_id, it.title, it.year ?? 0, it.passes ? 1 : 0],
      );
      if (r.affectedRows) inserted++;
    } catch (e) {
      // Don't let one bad row stop the rest.
      console.warn('[bechdel-rss] insert failed for', it.imdb_id, e.message);
    }
  }
  // After ingesting new bechdel rows, push them onto matching movies so
  // the cached column on the movies table picks up the fresh data.
  let synced = 0;
  try { synced = await require('./bechdel').syncMovies(); } catch {}
  console.log(
    `[bechdel-rss] ${items.length} items in feed, ${inserted} new, ${skipped} skipped, ${synced} movies synced`,
  );
  return { items: items.length, inserted, skipped, synced };
}

function parseRss(xml) {
  const items = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml))) {
    const it = parseItem(m[1]);
    if (it) items.push(it);
  }
  return items;
}

// bechdeltest.com item titles look roughly like "[3] Movie Title (2024)";
// the link is /view/<id>/title_slug/. The IMDb id appears in the description
// (or sometimes the link). We extract whatever we can find.
function parseItem(block) {
  const rawTitle = clean(getText(block, 'title')) || '';
  const link     = clean(getText(block, 'link')) || '';
  const desc     = clean(getText(block, 'description')) || '';

  const haystack = `${rawTitle} ${link} ${desc}`;
  const imdbMatch = haystack.match(/tt\d{7,9}/);
  const imdb_id   = imdbMatch ? imdbMatch[0] : null;

  const yearMatch = rawTitle.match(/\((\d{4})\)/) || desc.match(/\((\d{4})\)/);
  const year      = yearMatch ? Number(yearMatch[1]) : null;

  // Rating cues: "[3]" or similar leading bracket; or "rating: 3" in body.
  const ratingMatch = rawTitle.match(/\[(\d)\]/) || desc.match(/rating[^0-9]{0,5}(\d)/i);
  const rating      = ratingMatch ? Number(ratingMatch[1]) : null;

  // Strip rating prefix and trailing year suffix from the title for storage.
  const title = rawTitle
    .replace(/^\s*\[\d\]\s*/, '')
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .trim();

  return { title, year, imdb_id, passes: rating === 3 };
}

function getText(block, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? m[1] : null;
}

function clean(s) {
  if (s == null) return s;
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

module.exports = { runIfStale, pull };

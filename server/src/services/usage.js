// External-API usage tracking. Each service module calls record() after every
// outbound fetch. The admin panel hits summary() to render daily meters and
// rate-limit headroom against each provider's published quotas.
//
// Limits below reflect the public documentation as of ~2025:
//   TMDB:     no published daily cap; ~50 req/sec rate limit. We surface the
//             per-second rate so the admin can spot spikes.
//   OMDB:     1000 req/day on the free tier — the one most likely to hit.
//   Bechdel:  no published limit. Just show the count for awareness.
//
// Override any field via env (TMDB_DAILY_LIMIT, OMDB_DAILY_LIMIT, etc.)
// without touching this file.

const pool = require('../db');

const LIMITS = {
  tmdb: {
    daily:      Number(process.env.TMDB_DAILY_LIMIT)      || null,
    per_second: Number(process.env.TMDB_PER_SECOND_LIMIT) || 50,
  },
  omdb: {
    daily: Number(process.env.OMDB_DAILY_LIMIT) || 1000,
  },
  bechdel: {
    daily: Number(process.env.BECHDEL_DAILY_LIMIT) || null,
  },
};

async function record(service, statusCode = null) {
  // Never let logging break the calling code. If the table doesn't exist
  // yet (fresh DB before init-db ran), swallow silently.
  try {
    await pool.query(
      'INSERT INTO api_usage (service, status_code) VALUES (?, ?)',
      [service, statusCode],
    );
  } catch {}
}

async function summary() {
  const [rows] = await pool.query(`
    SELECT service,
      SUM(called_at >= CURDATE()) AS today,
      SUM(called_at >= (NOW() - INTERVAL 1 HOUR)) AS last_hour,
      SUM(called_at >= (NOW() - INTERVAL 1 MINUTE)) AS last_minute,
      SUM(status_code IS NOT NULL AND status_code >= 400) AS errors_total,
      MAX(called_at) AS last_call_at,
      COUNT(*) AS total
    FROM api_usage
    GROUP BY service
  `);
  const byService = new Map(rows.map((r) => [r.service, r]));
  return Object.keys(LIMITS).map((service) => {
    const r = byService.get(service) || {};
    return {
      service,
      today:        Number(r.today || 0),
      last_hour:    Number(r.last_hour || 0),
      last_minute:  Number(r.last_minute || 0),
      errors_total: Number(r.errors_total || 0),
      last_call_at: r.last_call_at || null,
      total:        Number(r.total || 0),
      limits:       LIMITS[service],
    };
  });
}

// Best-effort cleanup: keep at most 90 days of events. Cheap because of the
// (service, called_at) index. Called on a long interval from server.js.
async function pruneOlderThan90Days() {
  try {
    await pool.query('DELETE FROM api_usage WHERE called_at < (NOW() - INTERVAL 90 DAY)');
  } catch {}
}

module.exports = { record, summary, pruneOlderThan90Days, LIMITS };

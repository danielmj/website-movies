// "New on the list" badge logic. A movie qualifies as new for the current
// user if it was added in the past 7 days and added by someone other than
// them. The badge then sticks around even after they've opened the detail
// page — but only until end-of-day, after which it drops off entirely.
// Per-user dismissal state lives in localStorage keyed by movie id.

const KEY = 'mmm.newBadgeViewed';
const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readMap() {
  try { return JSON.parse(window.localStorage.getItem(KEY) || '{}'); }
  catch { return {}; }
}

function writeMap(m) {
  try { window.localStorage.setItem(KEY, JSON.stringify(m)); } catch {}
}

// Pure check: was this movie added in the past 7 days by someone other
// than the current user?
export function isFreshlyAdded(movie, user) {
  if (!movie || !user) return false;
  if (!movie.created_at) return false;
  if (movie.added_by_user_id == null) return false;
  if (movie.added_by_user_id === user.id) return false;
  const added = new Date(movie.created_at).getTime();
  if (Number.isNaN(added)) return false;
  return Date.now() - added < NEW_WINDOW_MS;
}

// Should the badge actually render right now? Combines "is freshly added"
// with the dismissal state — once the user has clicked into the detail
// page on a different day, we hide it.
export function shouldShowNewBadge(movie, user) {
  if (!isFreshlyAdded(movie, user)) return false;
  const map = readMap();
  const viewedDay = map[movie.id];
  if (!viewedDay) return true;            // never opened — still new
  return viewedDay === todayStr();        // opened today — keep until tomorrow
}

// Called from MovieDetail when the user lands on a freshly-added movie.
// Records the day so the badge stops showing tomorrow.
export function markBadgeViewed(movieId) {
  const map = readMap();
  if (map[movieId]) return;                // already recorded — leave the original day
  map[movieId] = todayStr();
  // Trim entries older than ~30 days so the map doesn't grow forever.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  for (const k of Object.keys(map)) {
    if (map[k] < cutoff) delete map[k];
  }
  writeMap(map);
}

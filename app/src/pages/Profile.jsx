import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { RATING_LABEL } from '../components/RatingPicker.jsx';

const BUCKETS = [
  { key: 'seen',          label: 'Watched & rated' },
  { key: 'want_to_see',   label: 'Want to see' },
  { key: 'not_interested', label: 'Not interested' },
  { key: 'no_response',   label: "Haven't responded yet" },
];

// Decide which bucket(s) a user_movies row goes into. A movie can be both
// "Watched & rated" and "Want to see" — we want users who've already seen
// something but want to rewatch it to show up in want_to_see too.
export function bucketFor(me) {
  if (!me) return ['no_response'];
  const out = [];
  if (me.status === 'seen') out.push('seen');
  else if (me.interest === 'not_interested') out.push('not_interested');
  if (me.interest === 'want_to_see') out.push('want_to_see');
  return out.length ? out : ['no_response'];
}

// Shared renderer for both /profile (self) and /users/:id (any user).
// `subjectUser` is the user whose lists are being shown; `viewer` is the
// currently-signed-in user (for "(you)" labels). Pass `actions` to render
// extra controls in the header (e.g. Sign out, Edit).
export function ProfileView({ subjectUser, movies, viewer, actions = null, editor = null }) {
  const buckets = { seen: [], want_to_see: [], not_interested: [], no_response: [] };
  for (const m of movies) {
    const um = m.user_movies.find((u) => u.user_id === subjectUser.id);
    for (const b of bucketFor(um)) {
      buckets[b].push({ ...m, _me: um || null });
    }
  }
  const isSelf = viewer && viewer.id === subjectUser.id;

  return (
    <div className="container">
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>{subjectUser.name}{isSelf && <span style={{ color: 'var(--muted)' }}> (you)</span>}</h1>
          <span style={{ color: 'var(--muted)' }}>
            {buckets.seen.length} watched · {movies.length} total
          </span>
        </div>
        {actions}
      </div>

      {editor}

      <ProfileStats subjectUser={subjectUser} movies={movies} />

      {BUCKETS.map(({ key, label }) => {
        const list = buckets[key];
        return (
          <section key={key} className="card" style={{ marginTop: '1rem' }}>
            <div className="spread">
              <h2 style={{ margin: 0 }}>{label}</h2>
              <span style={{ color: 'var(--muted)' }}>{list.length}</span>
            </div>
            {list.length === 0 ? (
              <p style={{ color: 'var(--muted)', marginBottom: 0 }}>None yet.</p>
            ) : (
              <ul className="profile-list">
                {list.map((m) => (
                  <li key={m.id}>
                    <Link to={`/movies/${m.id}`} className="profile-row">
                      <div
                        className="poster"
                        style={m.poster_url ? { backgroundImage: `url(${m.poster_url})` } : {}}
                      />
                      <div className="info">
                        <div className="title">
                          {m.title}
                          {m.year && <span className="muted"> ({m.year})</span>}
                        </div>
                        <div className="muted">
                          {key === 'seen' && m._me?.rating
                            ? `Rating: ${RATING_LABEL[m._me.rating]}`
                            : key === 'want_to_see'
                              ? 'Want to see'
                              : key === 'not_interested'
                                ? 'Not interested'
                                : 'No response yet'}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [movies, setMovies] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get('/api/movies').then(setMovies).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="container error">{err}</div>;
  if (!movies) return <div className="container">Loading…</div>;

  return (
    <ProfileView
      subjectUser={user}
      movies={movies}
      viewer={user}
      actions={(
        <div className="row">
          <Link to="/users" className="header-pill">Users</Link>
          <button
            className="danger"
            onClick={async () => { await logout(); navigate('/'); }}
          >
            Sign out
          </button>
        </div>
      )}
      editor={<ProfileEditor />}
    />
  );
}

function ProfileEditor() {
  const { user, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email || '');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const wantsPwChange = newPw.length > 0;

  async function save(e) {
    e.preventDefault();
    setBusy(true); setErr(null); setMsg(null);
    const body = {};
    if (name !== user.name) body.name = name;
    if (email !== (user.email || '')) body.email = email;
    if (wantsPwChange) {
      body.new_password = newPw;
      if (currentPw) body.current_password = currentPw;
    }
    try {
      await api.patch('/api/auth/me', body);
      await refresh();
      setMsg('Saved.');
      setCurrentPw(''); setNewPw('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ marginTop: '1rem' }}>
      <div className="spread">
        <h2 style={{ margin: 0 }}>Account</h2>
        <button onClick={() => setOpen((v) => !v)}>{open ? 'Close' : 'Edit'}</button>
      </div>
      {!open ? (
        <div style={{ color: 'var(--muted)', marginTop: '0.5rem' }}>
          {user.email || 'no email on file'}
        </div>
      ) : (
        <form onSubmit={save} style={{ marginTop: '0.75rem' }}>
          <div className="field">
            <label>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <hr style={{ borderColor: 'var(--border)', margin: '0.75rem 0' }} />
          <h3 style={{ margin: '0 0 0.4rem 0' }}>Change password</h3>
          <div className="field">
            <label>Current password (leave blank if you don't have one)</label>
            <input type="password" autoComplete="current-password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
          </div>
          <div className="field">
            <label>New password</label>
            <input type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          </div>

          {err && <div className="error">{err}</div>}
          {msg && <div style={{ color: 'var(--good)', marginTop: '0.5rem' }}>{msg}</div>}

          <div className="row" style={{ marginTop: '0.75rem', justifyContent: 'flex-end' }}>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// Aggregate stats over the user's *rated* movies (status='seen' with a
// rating attached). Renders a small donut for the bechdel split, top
// genres, runtime watched, and a couple of fun derived metrics. Hidden
// when the user hasn't rated anything yet — a stats panel of zeros isn't
// interesting.
//
// Also pulls /api/maybe/history so we can show two Maybe-Movie-specific
// stats: how many group nights this user actually watched, and the average
// group rating on movies they personally recommended.
const RATING_VALUE = { high_rec: 5, rec: 4, neutral: 3, dont_like: 2, really_dont_like: 1 };

function ProfileStats({ subjectUser, movies }) {
  const [history, setHistory] = useState(null);
  const [explain, setExplain] = useState(null);
  useEffect(() => {
    api.get('/api/maybe/history').then(setHistory).catch(() => setHistory([]));
  }, []);

  const rated = movies
    .map((m) => ({ m, me: m.user_movies.find((u) => u.user_id === subjectUser.id) }))
    .filter(({ me }) => me && me.status === 'seen' && me.rating);

  if (rated.length === 0) return null;

  const passes = rated.filter(({ m }) => m.bechdel_passes === true || m.bechdel_passes === 1).length;
  const fails  = rated.filter(({ m }) => m.bechdel_passes === false || m.bechdel_passes === 0).length;
  const unknown = rated.length - passes - fails;

  const genreCounts = new Map();
  for (const { m } of rated) {
    for (const g of (m.genres || [])) genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
  }
  const topGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const decadeCounts = new Map();
  for (const { m } of rated) {
    if (m.decade) decadeCounts.set(m.decade, (decadeCounts.get(m.decade) || 0) + 1);
  }
  const topDecade = [...decadeCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  const totalRuntime = rated.reduce((acc, { m }) => acc + (Number(m.duration_minutes) || 0), 0);

  const positives = rated.filter(({ me }) => me.rating === 'rec' || me.rating === 'high_rec').length;
  const positivePct = Math.round((positives / rated.length) * 100);

  const avgImdb = (() => {
    const withRating = rated.filter(({ m }) => Number(m.imdb_rating));
    if (!withRating.length) return null;
    const sum = withRating.reduce((acc, { m }) => acc + Number(m.imdb_rating), 0);
    return (sum / withRating.length).toFixed(1);
  })();

  const longest = rated.reduce((best, cur) => {
    const d = Number(cur.m.duration_minutes) || 0;
    return d > (Number(best?.m.duration_minutes) || 0) ? cur : best;
  }, null);

  // Maybe Movie nights this user actually attended where a movie got
  // watched (cancelled sessions don't count).
  const attendedSessions = (history || []).filter(
    (s) => s.watched_movie_id && s.attendees.some((a) => a.user_id === subjectUser.id),
  );
  const movieNights = attendedSessions.length;
  const movieNightMinutes = attendedSessions.reduce((acc, s) => {
    const movie = movies.find((m) => m.id === s.watched_movie_id);
    return acc + (Number(movie?.duration_minutes) || 0);
  }, 0);

  // Group rating on movies this user recommended (their rec/high_rec) that
  // the group actually watched together. Average the attendees' numeric
  // ratings of each such movie, then average across movies. Null when
  // there are no qualifying picks yet.
  const groupRatingOnPicks = (() => {
    const perMovieAvgs = [];
    for (const session of attendedSessions) {
      const movie = movies.find((m) => m.id === session.watched_movie_id);
      if (!movie) continue;
      const subjectRow = movie.user_movies.find((u) => u.user_id === subjectUser.id);
      if (!subjectRow || !(subjectRow.rating === 'rec' || subjectRow.rating === 'high_rec')) continue;
      const attendeeIds = new Set(session.attendees.map((a) => a.user_id));
      const numericRatings = movie.user_movies
        .filter((u) => attendeeIds.has(u.user_id) && u.rating)
        .map((u) => RATING_VALUE[u.rating])
        .filter((v) => v != null);
      if (!numericRatings.length) continue;
      perMovieAvgs.push(numericRatings.reduce((a, b) => a + b, 0) / numericRatings.length);
    }
    if (!perMovieAvgs.length) return null;
    return {
      avg: (perMovieAvgs.reduce((a, b) => a + b, 0) / perMovieAvgs.length).toFixed(1),
      count: perMovieAvgs.length,
    };
  })();

  // Movies the subject user originally added to the main list that the
  // group then watched during any Maybe Movie session (attendance not
  // required — this credits them for contributing the pick). Distinct
  // movie ids; same movie watched in two sessions only counts once.
  const watchedSessionsAll = (history || []).filter((s) => s.watched_movie_id);
  const addedAndWatchedIds = new Set();
  for (const s of watchedSessionsAll) {
    const movie = movies.find((m) => m.id === s.watched_movie_id);
    if (movie && movie.added_by_user_id === subjectUser.id) {
      addedAndWatchedIds.add(movie.id);
    }
  }
  const addedAndWatchedCount = addedAndWatchedIds.size;

  // Group rating on movies the subject user added that were watched at any
  // maybe session. Per-session avg across that session's attendees, then
  // averaged across qualifying sessions (so a movie watched twice weighs
  // twice — matches the existing "Group rating on your picks" math).
  const groupRatingOnAdditions = (() => {
    const perMovieAvgs = [];
    for (const session of watchedSessionsAll) {
      const movie = movies.find((m) => m.id === session.watched_movie_id);
      if (!movie || movie.added_by_user_id !== subjectUser.id) continue;
      const attendeeIds = new Set(session.attendees.map((a) => a.user_id));
      const numericRatings = movie.user_movies
        .filter((u) => attendeeIds.has(u.user_id) && u.rating)
        .map((u) => RATING_VALUE[u.rating])
        .filter((v) => v != null);
      if (!numericRatings.length) continue;
      perMovieAvgs.push(numericRatings.reduce((a, b) => a + b, 0) / numericRatings.length);
    }
    if (!perMovieAvgs.length) return null;
    return {
      avg: (perMovieAvgs.reduce((a, b) => a + b, 0) / perMovieAvgs.length).toFixed(1),
      count: perMovieAvgs.length,
    };
  })();

  return (
    <section className="card" style={{ marginTop: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>Stats</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0 0 0.75rem 0' }}>
        Tap any tile to see how it's calculated.
      </p>
      <div className="profile-stats">
        <ClickableStat
          className="stat-bechdel"
          onClick={() => setExplain({
            title: 'Bechdel split',
            body: `Across the ${rated.length} movies you've rated, ${passes} pass the Bechdel test, ${fails} fail, and ${unknown} are untested. The donut shows the pass percentage. A movie is counted as "rated" only when status='Seen' with a rating attached.`,
          })}
        >
          <BechdelDonut passes={passes} fails={fails} unknown={unknown} />
          <div className="stat-bechdel-legend">
            <div><span className="dot good" /> Passes <strong>{passes}</strong></div>
            <div><span className="dot bad" /> Fails <strong>{fails}</strong></div>
            <div><span className="dot mute" /> Unknown <strong>{unknown}</strong></div>
          </div>
        </ClickableStat>

        <div className="stat-grid">
          <ClickableStat onClick={() => setExplain({
            title: 'Movies rated',
            body: 'Number of movies you\'ve marked as Seen with a rating (Love / Like / Meh / Eh / Hate). Movies you\'ve set an interest on but haven\'t watched aren\'t counted.',
          })}>
            <div className="stat-label">Movies rated</div>
            <div className="stat-value">{rated.length}</div>
          </ClickableStat>

          <ClickableStat onClick={() => setExplain({
            title: 'Top genres',
            body: 'Genres that appear most often across your rated movies. A movie can have multiple genres and contributes to each. The number is how many of your rated movies fall under that genre.',
          })}>
            <div className="stat-label">Top genres</div>
            <div className="stat-value-list">
              {topGenres.length === 0 ? (
                <span style={{ color: 'var(--muted)' }}>—</span>
              ) : topGenres.map(([g, n], i) => (
                <div key={g}>
                  <span style={{ color: 'var(--muted)', marginRight: '0.4rem' }}>{i + 1}.</span>
                  {g} <span style={{ color: 'var(--muted)' }}>· {n}</span>
                </div>
              ))}
            </div>
          </ClickableStat>

          <ClickableStat onClick={() => setExplain({
            title: 'Hours watched',
            body: `Sum of duration_minutes across all ${rated.length} movies you've rated, converted to hours. Movies missing a runtime contribute zero.`,
          })}>
            <div className="stat-label">Hours watched</div>
            <div className="stat-value">
              {Math.round(totalRuntime / 60).toLocaleString()}
              <span className="stat-unit"> hrs</span>
            </div>
            <div className="stat-sub">{totalRuntime.toLocaleString()} minutes</div>
          </ClickableStat>

          <ClickableStat onClick={() => setExplain({
            title: 'Recommended rate',
            body: `Of your ${rated.length} rated movies, ${positives} got Like or Love. ${positivePct}% is that fraction. Higher means a more enthusiastic palette.`,
          })}>
            <div className="stat-label">Recommended rate</div>
            <div className="stat-value">{positivePct}%</div>
            <div className="stat-sub">{positives} liked or loved</div>
          </ClickableStat>

          {topDecade && (
            <ClickableStat onClick={() => setExplain({
              title: 'Favourite decade',
              body: `The decade with the most rated movies in your list. The ${topDecade[0]}s leads with ${topDecade[1]}. Ties break by whichever decade was hit first.`,
            })}>
              <div className="stat-label">Favourite decade</div>
              <div className="stat-value">{topDecade[0]}s</div>
              <div className="stat-sub">{topDecade[1]} movies</div>
            </ClickableStat>
          )}

          {avgImdb && (
            <ClickableStat onClick={() => setExplain({
              title: 'Avg IMDb of picks',
              body: 'Plain average of imdb_rating across your rated movies that have an IMDb rating. Movies without a rating on IMDb are excluded from the denominator.',
            })}>
              <div className="stat-label">Avg IMDb of picks</div>
              <div className="stat-value">⭐ {avgImdb}</div>
            </ClickableStat>
          )}

          {longest && longest.m.duration_minutes && (
            <ClickableStat onClick={() => setExplain({
              title: 'Longest sit',
              body: 'The movie with the highest duration_minutes among everything you\'ve rated. Endurance trophy, not a recommendation.',
            })}>
              <div className="stat-label">Longest sit</div>
              <div className="stat-value">{longest.m.duration_minutes} min</div>
              <div className="stat-sub">{longest.m.title}</div>
            </ClickableStat>
          )}

          <ClickableStat onClick={() => setExplain({
            title: 'Movie nights',
            body: 'Number of past Maybe Movie sessions where you were on the attendee list and a movie was actually watched. Cancelled sessions don\'t count.',
          })}>
            <div className="stat-label">Movie nights</div>
            <div className="stat-value">{movieNights}</div>
            <div className="stat-sub">attended &amp; watched</div>
          </ClickableStat>

          {movieNightMinutes > 0 && (
            <ClickableStat onClick={() => setExplain({
              title: 'Hours at movie night',
              body: 'Sum of duration_minutes for the movies watched during sessions you attended, converted to hours. Counts time you spent in the room with the group, regardless of how you rated each movie.',
            })}>
              <div className="stat-label">Hours at movie night</div>
              <div className="stat-value">
                {Math.round(movieNightMinutes / 60).toLocaleString()}
                <span className="stat-unit"> hrs</span>
              </div>
              <div className="stat-sub">{movieNightMinutes.toLocaleString()} minutes together</div>
            </ClickableStat>
          )}

          {groupRatingOnPicks && (
            <ClickableStat onClick={() => setExplain({
              title: 'Group rating on your picks',
              body: 'For every movie you rated Like or Love that the group then watched together, we map each attendee\'s rating to a number (Love=5, Like=4, Meh=3, Eh=2, Hate=1) and average them — that\'s the group score for that movie. This tile shows the average across all such movies. Higher means your taste lands well with the group.',
            })}>
              <div className="stat-label">Group rating on your picks</div>
              <div className="stat-value">
                {groupRatingOnPicks.avg}
                <span className="stat-unit"> / 5</span>
              </div>
              <div className="stat-sub">
                across {groupRatingOnPicks.count} pick{groupRatingOnPicks.count === 1 ? '' : 's'}
              </div>
            </ClickableStat>
          )}

          {addedAndWatchedCount > 0 && (
            <ClickableStat onClick={() => setExplain({
              title: 'Your additions watched',
              body: `Distinct movies you originally added to the main list (added_by_user_id) that the group then watched during a Maybe Movie session. Counts every past maybe session — attendance isn't required, since this credits you for contributing the pick. The same movie watched at two sessions only counts once.`,
            })}>
              <div className="stat-label">Your additions watched</div>
              <div className="stat-value">{addedAndWatchedCount}</div>
              <div className="stat-sub">movies you added &amp; the group watched</div>
            </ClickableStat>
          )}

          {groupRatingOnAdditions && (
            <ClickableStat onClick={() => setExplain({
              title: 'Group rating on your additions',
              body: 'For every Maybe Movie session that watched a movie you originally added to the main list, we map each attendee\'s rating to a number (Love=5, Like=4, Meh=3, Eh=2, Hate=1) and average them — that\'s the group score for that session. This tile averages those scores. Differs from "Group rating on your picks" in that it tracks who added the movie, not who rated it.',
            })}>
              <div className="stat-label">Group rating on your additions</div>
              <div className="stat-value">
                {groupRatingOnAdditions.avg}
                <span className="stat-unit"> / 5</span>
              </div>
              <div className="stat-sub">
                across {groupRatingOnAdditions.count} session{groupRatingOnAdditions.count === 1 ? '' : 's'}
              </div>
            </ClickableStat>
          )}
        </div>
      </div>
      {explain && <ExplainPopup title={explain.title} body={explain.body} onClose={() => setExplain(null)} />}
    </section>
  );
}

// Clickable stat shell. Wraps the inner labels/values so the whole tile is
// tappable; the parent passes a description through onClick that pops the
// "how is this calculated" modal.
function ClickableStat({ className = 'stat-tile', onClick, children }) {
  return (
    <div
      className={`${className} clickable`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      {children}
      <span className="stat-info" aria-hidden="true">ⓘ</span>
    </div>
  );
}

// Reused by both ProfileStats and PairingCard. Renders inside the existing
// .modal / .modal-backdrop styling, with a single Close action.
function ExplainPopup({ title, body, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <div style={{ color: 'var(--muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{body}</div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export { ExplainPopup };

function BechdelDonut({ passes, fails, unknown }) {
  const total = passes + fails + unknown;
  if (!total) return null;
  // Three slices on a 360° circle. Conic-gradient handles all the math; no
  // SVG needed. Center hole is just a smaller circle layered over the top.
  const passEnd = (passes / total) * 360;
  const failEnd = passEnd + (fails / total) * 360;
  const css = `conic-gradient(
    var(--good) 0 ${passEnd}deg,
    var(--bad) ${passEnd}deg ${failEnd}deg,
    var(--border) ${failEnd}deg 360deg
  )`;
  return (
    <div className="stat-donut" style={{ background: css }}>
      <div className="stat-donut-hole">
        <div className="stat-donut-pct">{Math.round((passes / total) * 100)}%</div>
        <div className="stat-donut-label">Bechdel</div>
      </div>
    </div>
  );
}
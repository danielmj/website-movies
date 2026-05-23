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
        <button
          className="danger"
          onClick={async () => { await logout(); navigate('/'); }}
        >
          Sign out
        </button>
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
function ProfileStats({ subjectUser, movies }) {
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

  return (
    <section className="card" style={{ marginTop: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>Stats</h2>
      <div className="profile-stats">
        <div className="stat-bechdel">
          <BechdelDonut passes={passes} fails={fails} unknown={unknown} />
          <div className="stat-bechdel-legend">
            <div><span className="dot good" /> Passes <strong>{passes}</strong></div>
            <div><span className="dot bad" /> Fails <strong>{fails}</strong></div>
            <div><span className="dot mute" /> Unknown <strong>{unknown}</strong></div>
          </div>
        </div>

        <div className="stat-grid">
          <div className="stat-tile">
            <div className="stat-label">Movies rated</div>
            <div className="stat-value">{rated.length}</div>
          </div>
          <div className="stat-tile">
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
          </div>
          <div className="stat-tile">
            <div className="stat-label">Hours watched</div>
            <div className="stat-value">
              {Math.round(totalRuntime / 60).toLocaleString()}
              <span className="stat-unit"> hrs</span>
            </div>
            <div className="stat-sub">{totalRuntime.toLocaleString()} minutes</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Recommended rate</div>
            <div className="stat-value">{positivePct}%</div>
            <div className="stat-sub">{positives} liked or loved</div>
          </div>
          {topDecade && (
            <div className="stat-tile">
              <div className="stat-label">Favourite decade</div>
              <div className="stat-value">{topDecade[0]}s</div>
              <div className="stat-sub">{topDecade[1]} movies</div>
            </div>
          )}
          {avgImdb && (
            <div className="stat-tile">
              <div className="stat-label">Avg IMDb of picks</div>
              <div className="stat-value">⭐ {avgImdb}</div>
            </div>
          )}
          {longest && longest.m.duration_minutes && (
            <div className="stat-tile">
              <div className="stat-label">Longest sit</div>
              <div className="stat-value">{longest.m.duration_minutes} min</div>
              <div className="stat-sub">{longest.m.title}</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

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
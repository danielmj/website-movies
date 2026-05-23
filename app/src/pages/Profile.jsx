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

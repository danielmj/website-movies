import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { RATING_LABEL, STATUS_LABEL } from '../components/RatingPicker.jsx';

const STATUS_BUCKETS = [
  { key: 'seen', label: 'Watched & rated' },
  { key: 'want_to_see', label: 'Want to see' },
  { key: 'not_interested', label: 'Not interested' },
  { key: null, label: 'Haven\'t responded yet' },
];

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

  // Bucket every movie by the current user's status (or null for no response).
  const buckets = { seen: [], want_to_see: [], not_interested: [], null: [] };
  for (const m of movies) {
    const me = m.user_movies.find((u) => u.user_id === user.id);
    const status = me ? me.status : null;
    buckets[status ?? 'null'].push({ ...m, _me: me || null });
  }

  return (
    <div className="container">
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>{user.name}</h1>
          <span style={{ color: 'var(--muted)' }}>
            {buckets.seen.length} watched · {movies.length} total
          </span>
        </div>
        <button
          className="danger"
          onClick={async () => { await logout(); navigate('/'); }}
        >
          Sign out
        </button>
      </div>

      {STATUS_BUCKETS.map(({ key, label }) => {
        const list = buckets[key ?? 'null'];
        return (
          <section key={String(key)} className="card" style={{ marginTop: '1rem' }}>
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
                          {m._me?.status === 'seen' && m._me.rating
                            ? `Your rating: ${RATING_LABEL[m._me.rating]}`
                            : key === null
                              ? 'No response yet'
                              : STATUS_LABEL[key]}
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

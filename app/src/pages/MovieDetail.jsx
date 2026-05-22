import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import RatingPicker, { RATING_LABEL, STATUS_LABEL, STATUSES } from '../components/RatingPicker.jsx';
import SegmentedControl from '../components/SegmentedControl.jsx';

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusLabel(status) {
  return status ? STATUS_LABEL[status] : 'No response';
}

export default function MovieDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [movie, setMovie] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setMovie(await api.get(`/api/movies/${id}`));
    } catch (e) {
      setErr(e.message);
    }
  }
  useEffect(() => { load(); }, [id]);

  if (err) return <div className="container error">{err}</div>;
  if (!movie) return <div className="container">Loading…</div>;

  const me = movie.user_movies.find((u) => u.user_id === user.id);

  async function setStatus(status, rating = null) {
    setBusy(true);
    try {
      if (status === 'seen' && !rating) rating = me?.rating || 'rec';
      await api.put(`/api/ratings/${movie.id}`, { status, rating });
      await load();
    } finally {
      setBusy(false);
    }
  }

  // Sort: responders first (seen, want, not_interested), no-response last.
  const orderedUsers = [...movie.user_movies].sort((a, b) => {
    const order = { seen: 0, want_to_see: 1, not_interested: 2 };
    const ar = a.status === null ? 99 : (order[a.status] ?? 50);
    const br = b.status === null ? 99 : (order[b.status] ?? 50);
    if (ar !== br) return ar - br;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="container detail">
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/" style={{ color: 'var(--muted)' }}>← Back to movies</Link>
      </div>

      <div className="detail-head">
        <div
          className="detail-poster"
          style={movie.poster_url ? { backgroundImage: `url(${movie.poster_url})` } : {}}
        />
        <div className="detail-meta">
          <h1 style={{ margin: 0 }}>{movie.title}</h1>
          <div className="meta">
            {movie.year || '—'}
            {movie.duration_minutes ? ` · ${movie.duration_minutes}m` : ''}
            {movie.imdb_rating ? ` · ⭐ ${movie.imdb_rating}` : ''}
          </div>
          <div className="pills">
            {movie.bechdel_passes ? (
              <span className="pill good">Bechdel ✓</span>
            ) : movie.bechdel_passes === 0 || movie.bechdel_passes === false ? (
              <span className="pill bad">Bechdel ✗</span>
            ) : null}
            {(movie.genres || []).map((g) => <span key={g} className="pill">{g}</span>)}
          </div>
          {movie.overview && (
            <p style={{ color: 'var(--muted)', lineHeight: 1.5 }}>{movie.overview}</p>
          )}
        </div>
      </div>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Your rating</h2>
        <SegmentedControl
          value={me?.status || null}
          onChange={(s) => setStatus(s, s === 'seen' ? me?.rating || 'rec' : null)}
          options={STATUSES}
          disabled={busy}
        />
        {me?.status === 'seen' && (
          <div style={{ marginTop: '0.5rem' }}>
            <RatingPicker value={me.rating} onChange={(r) => setStatus('seen', r)} disabled={busy} />
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Who's seen it</h2>
        <table className="user-status-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Status</th>
              <th>Rating</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {orderedUsers.map((u) => (
              <tr key={u.user_id} className={u.status === null ? 'no-response' : ''}>
                <td>{u.name}{u.user_id === user.id ? ' (you)' : ''}</td>
                <td>{statusLabel(u.status)}</td>
                <td>{u.status === 'seen' && u.rating ? RATING_LABEL[u.rating] : '—'}</td>
                <td>{fmtDate(u.updated_at) || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Watch history</h2>
        {movie.watch_history.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Never watched as part of a Maybe Movie session.</p>
        ) : (
          <ul style={{ paddingLeft: '1rem', margin: 0 }}>
            {movie.watch_history.map((w) => (
              <li key={w.id} style={{ marginBottom: '0.4rem' }}>
                <strong>{fmtDate(w.ended_at)}</strong>
                {w.attendees ? <span style={{ color: 'var(--muted)' }}> — with {w.attendees}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
  const navigate = useNavigate();
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

  const me = user && movie.user_movies
    ? movie.user_movies.find((u) => u.user_id === user.id)
    : null;
  const wantsToSee = !!me?.want_to_see;
  const seenState = me?.status === 'seen' ? 'seen' : me?.status ? 'not_seen' : null;

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

  async function setSeenState(next) {
    if (next === 'seen') await setStatus('seen', me?.rating || 'rec');
    else await setStatus('not_interested');
  }

  async function toggleWantToSee() {
    setBusy(true);
    try {
      await api.put(`/api/ratings/${movie.id}`, { want_to_see: !wantsToSee });
      await load();
    } finally {
      setBusy(false);
    }
  }

  // Sort: responders first (seen, want, not_interested), no-response last.
  const orderedUsers = movie.user_movies
    ? [...movie.user_movies].sort((a, b) => {
        const order = { seen: 0, want_to_see: 1, not_interested: 2 };
        const ar = a.status === null ? 99 : (order[a.status] ?? 50);
        const br = b.status === null ? 99 : (order[b.status] ?? 50);
        if (ar !== br) return ar - br;
        return a.name.localeCompare(b.name);
      })
    : [];

  return (
    <div className="container detail">
      <div style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          onClick={() => {
            // Prefer history-back so deep-linked visits (no history) still
            // land on /. Length > 1 means we have something to pop.
            if (window.history.length > 1) navigate(-1);
            else navigate('/');
          }}
          style={{
            color: 'var(--muted)',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            font: 'inherit',
          }}
        >
          ← Back
        </button>
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
          {movie.notes && (
            <div className="notes-block"><strong>Notes:</strong> {movie.notes}</div>
          )}
          {movie.overview && (
            <p style={{ color: 'var(--muted)', lineHeight: 1.5 }}>{movie.overview}</p>
          )}
          <div className="external-links">
            {movie.imdb_id && (
              <a
                href={`https://www.imdb.com/title/${movie.imdb_id}/`}
                target="_blank"
                rel="noopener noreferrer"
              >IMDb ↗</a>
            )}
            <a
              href={`https://www.rottentomatoes.com/search?search=${encodeURIComponent(movie.title + (movie.year ? ' ' + movie.year : ''))}`}
              target="_blank"
              rel="noopener noreferrer"
            >Rotten Tomatoes ↗</a>
          </div>
        </div>
      </div>

      {user ? (
        <>
          <section className={`card${!me ? ' needs-response' : ''}`} style={{ marginTop: '1rem' }}>
            <h2 style={{ marginTop: 0 }}>Your rating</h2>
            {!me && (
              <div className="card-warn" role="note" style={{ marginBottom: '0.5rem' }}>
                ⚠ Please mark whether you've seen this
              </div>
            )}
            <div className="rating-controls">
              <SegmentedControl
                value={seenState}
                onChange={setSeenState}
                options={[['seen', 'Seen it'], ['not_seen', "Haven't seen"]]}
                disabled={busy}
              />
              <button
                type="button"
                className={`want-pill${wantsToSee ? ' active' : ''}`}
                onClick={toggleWantToSee}
                disabled={busy}
                aria-pressed={wantsToSee}
              >
                <span aria-hidden="true">{wantsToSee ? '☑' : '☐'}</span>
                {' '}Want to see
              </button>
              {seenState === 'seen' && (
                <RatingPicker value={me.rating} onChange={(r) => setStatus('seen', r)} disabled={busy} />
              )}
            </div>
          </section>

          <section className="card" style={{ marginTop: '1rem' }}>
            <h2 style={{ marginTop: 0 }}>Who's seen it</h2>
            <div className="table-scroll">
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
            </div>
          </section>

          <section className="card" style={{ marginTop: '1rem' }}>
            <h2 style={{ marginTop: 0 }}>Watch history</h2>
            <WatchHistory movie={movie} />
          </section>

          {user.is_admin && <AdminMovieEditor movie={movie} reload={load} />}
        </>
      ) : (
        <section className="card" style={{ marginTop: '1rem' }}>
          <p style={{ margin: 0 }}>
            <Link to="/login">Sign in</Link> to rate this movie and see what others think.
          </p>
        </section>
      )}
    </div>
  );
}

function WatchHistory({ movie }) {
  const sessionRows = (movie.watch_history || []).map((w) => ({
    key: `s-${w.id}`,
    date: w.ended_at,
    label: w.attendees ? `with ${w.attendees}` : 'Maybe Movie session',
  }));
  const eventRows = (movie.watch_events || []).map((w) => ({
    key: `e-${w.id}`,
    date: w.watched_at,
    label: w.notes || 'Manually logged',
  }));
  const all = [...sessionRows, ...eventRows].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!all.length) return <p style={{ color: 'var(--muted)', margin: 0 }}>No recorded watches yet.</p>;
  return (
    <ul style={{ paddingLeft: '1rem', margin: 0 }}>
      {all.map((w) => (
        <li key={w.key} style={{ marginBottom: '0.4rem' }}>
          <strong>{fmtDate(w.date)}</strong>
          <span style={{ color: 'var(--muted)' }}> — {w.label}</span>
        </li>
      ))}
    </ul>
  );
}

function AdminMovieEditor({ movie, reload }) {
  const [notes, setNotes] = useState(movie.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState(null);

  // If the parent reloads with a different value, sync the textarea.
  useEffect(() => { setNotes(movie.notes || ''); }, [movie.id, movie.notes]);

  async function saveNotes() {
    setSavingNotes(true); setErr(null);
    try {
      await api.patch(`/api/admin/movies/${movie.id}`, { notes });
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSavingNotes(false);
    }
  }

  async function addEvent() {
    if (!newDate) return;
    setAdding(true); setErr(null);
    try {
      await api.post(`/api/admin/movies/${movie.id}/watch-events`, {
        watched_at: newDate,
        notes: newNotes || null,
      });
      setNewDate(''); setNewNotes('');
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setAdding(false);
    }
  }

  async function deleteEvent(eventId) {
    if (!confirm('Delete this watch entry?')) return;
    try {
      await api.del(`/api/admin/watch-events/${eventId}`);
      await reload();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <section className="card admin-edit" style={{ marginTop: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>Admin · edit metadata</h2>

      <div className="field">
        <label>Notes (free text — e.g. "Added by Blair")</label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes about this movie"
        />
        <button
          className="primary"
          onClick={saveNotes}
          disabled={savingNotes || notes === (movie.notes || '')}
          style={{ marginTop: '0.4rem' }}
        >
          {savingNotes ? 'Saving…' : 'Save notes'}
        </button>
      </div>

      <div className="field">
        <label>Manual watch entries</label>
        {(movie.watch_events || []).length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>None yet.</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.25rem' }}>
            {movie.watch_events.map((w) => (
              <li key={w.id} className="row" style={{ gap: '0.5rem', fontSize: '0.9rem' }}>
                <strong style={{ minWidth: 100 }}>{fmtDate(w.watched_at)}</strong>
                <span style={{ flex: 1, color: 'var(--muted)' }}>{w.notes || '—'}</span>
                <button onClick={() => deleteEvent(w.id)}>Delete</button>
              </li>
            ))}
          </ul>
        )}
        <div className="row" style={{ marginTop: '0.5rem', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            style={{ width: 170 }}
          />
          <input
            type="text"
            placeholder="Notes (optional)"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button onClick={addEvent} disabled={adding || !newDate} className="primary">
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      {err && <div className="error">{err}</div>}
    </section>
  );
}

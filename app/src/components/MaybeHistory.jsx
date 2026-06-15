import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

// Past Maybe Movie sessions — both completed (with a watched movie) and
// cancelled. Visible to all signed-in users. Admins get a delete button per
// row to wipe a session from history.
export default function MaybeHistory({ canDelete, title = 'Past Maybe Movies', style }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);

  async function load() {
    try { setRows(await api.get('/api/maybe/history')); }
    catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function remove(id) {
    if (!confirm('Delete this session from history?')) return;
    try {
      await api.del(`/api/maybe/${id}`);
      await load();
    } catch (e) { setErr(e.message); }
  }

  if (err) return <div className="card error" style={style}>{err}</div>;
  if (!rows) return null;

  return (
    <section className="card" style={style}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {rows.length === 0 ? (
        <p style={{ color: 'var(--muted)', margin: 0 }}>No history yet.</p>
      ) : (
        <ul className="maybe-history">
          {rows.map((s) => (
            <li key={s.id}>
              <Link
                to={s.cancelled ? `/maybe/${s.id}` : `/movies/${s.watched_movie_id}`}
                className="maybe-history-poster"
                style={s.watched_movie_poster_url ? { backgroundImage: `url(${s.watched_movie_poster_url})` } : {}}
                aria-hidden="true"
                tabIndex={-1}
              />
              <div className="maybe-history-body">
                <div className="maybe-history-head">
                  <Link to={`/maybe/${s.id}`} className="maybe-history-date">
                    {new Date(s.ended_at).toLocaleDateString(undefined, {
                      year: 'numeric', month: 'short', day: 'numeric',
                    })}
                  </Link>
                  {s.cancelled ? (
                    <Link to={`/maybe/${s.id}`} className="pill bad" style={{ textDecoration: 'none' }}>Cancelled</Link>
                  ) : (
                    <Link to={`/movies/${s.watched_movie_id}`} className="maybe-history-movie">
                      {s.watched_movie_title || 'Untitled movie'}
                    </Link>
                  )}
                  {canDelete && (
                    <button className="maybe-history-delete" onClick={() => remove(s.id)} aria-label="Delete">×</button>
                  )}
                </div>
                <div className="maybe-history-meta">
                  {s.attendees.length === 0 ? 'No attendees' : (
                    <>
                      with {s.attendees.map((a, i) => (
                        <span key={a.user_id}>
                          {i > 0 ? ', ' : ''}
                          <Link to={`/users/${a.user_id}`}>{a.name}</Link>
                        </span>
                      ))}
                    </>
                  )}
                  {s.started_by_name && ` · started by ${s.started_by_name}`}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function PastMaybeMovie() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(false);

  async function load() {
    try { setSession(await api.get(`/api/maybe/${id}`)); }
    catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, [id]);

  if (err) return <div className="container"><div className="card error">{err}</div></div>;
  if (!session) return <div className="container">Loading…</div>;
  // Active sessions belong on the live picker page — redirect there so the
  // /maybe/:id URL works as a permalink for both active and past sessions.
  if (session.active) return <Navigate to="/maybe" replace />;

  const cancelled = !session.watched_movie_id;

  return (
    <div className="container">
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="spread" style={{ marginBottom: '0.75rem' }}>
          <h1 style={{ margin: 0 }}>{cancelled ? 'Cancelled Maybe Movie' : 'Past Maybe Movie'}</h1>
          {user?.is_admin && (
            <button onClick={() => setEditing(true)}>Edit</button>
          )}
        </div>

        <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
          {fmtDate(session.ended_at || session.started_at)}
          {' · started by '}
          <Link to={`/users/${session.started_by_user_id}`}>{session.started_by_name}</Link>
        </div>

        {cancelled ? (
          <div style={{ marginBottom: '1rem' }}>
            <span className="pill bad">Cancelled</span>
            {session.cancelled_by_name && (
              <span style={{ color: 'var(--muted)', marginLeft: '0.5rem' }}>
                by <Link to={`/users/${session.cancelled_by_user_id}`}>{session.cancelled_by_name}</Link>
              </span>
            )}
          </div>
        ) : (
          <Link to={`/movies/${session.watched_movie_id}`} className="movie-row" style={{ textDecoration: 'none' }}>
            <div
              className="poster"
              style={session.watched_movie_poster_url ? { backgroundImage: `url(${session.watched_movie_poster_url})` } : {}}
            />
            <div className="info">
              <h3>
                {session.watched_movie_title}
                {session.watched_movie_year && (
                  <span style={{ color: 'var(--muted)', fontWeight: 400 }}> ({session.watched_movie_year})</span>
                )}
              </h3>
              <div className="stats">Watched as a group</div>
            </div>
          </Link>
        )}

        <div style={{ marginTop: '1rem' }}>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Attendees</div>
          <div className="attendees-list" style={{ marginTop: '0.4rem' }}>
            {session.attendees.length === 0 && <span style={{ color: 'var(--muted)' }}>No one</span>}
            {session.attendees.map((a) => (
              <Link key={a.user_id} to={`/users/${a.user_id}`} className="pill pill-link">{a.name}</Link>
            ))}
          </div>
        </div>
      </div>

      {!cancelled && (
        <SessionComments movieId={session.watched_movie_id} comments={session.comments || []} reload={load} />
      )}

      {editing && (
        <EditSessionModal
          session={session}
          onClose={() => setEditing(false)}
          onSaved={async () => { await load(); setEditing(false); }}
        />
      )}
    </div>
  );
}

// Movie-comment thread for the watched movie. Posts/edits/deletes hit the
// same /api/movies/:id/comments endpoints used on the movie detail page,
// so a comment posted here shows up there too — they're the same data.
function SessionComments({ movieId, comments, reload }) {
  const { user } = useAuth();
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  async function post(e) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setPosting(true); setErr(null);
    try {
      await api.post(`/api/movies/${movieId}/comments`, { body: trimmed });
      setBody('');
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setPosting(false);
    }
  }

  function startEdit(c) { setEditingId(c.id); setEditBody(c.body); setErr(null); }
  function cancelEdit() { setEditingId(null); setEditBody(''); }

  async function saveEdit(c) {
    const trimmed = editBody.trim();
    if (!trimmed) return;
    setSavingEdit(true); setErr(null);
    try {
      await api.patch(`/api/movies/${movieId}/comments/${c.id}`, { body: trimmed });
      cancelEdit();
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function remove(c) {
    if (!confirm('Delete this comment?')) return;
    setErr(null);
    try {
      await api.del(`/api/movies/${movieId}/comments/${c.id}`);
      await reload();
    } catch (e) { setErr(e.message); }
  }

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Comments</h2>
      {comments.length === 0 ? (
        <p style={{ color: 'var(--muted)', margin: '0 0 0.75rem 0' }}>
          No comments yet.{user ? ' Be the first.' : ''}
        </p>
      ) : (
        <ul className="comment-list">
          {comments.map((c) => {
            const mine = user && c.user_id === user.id;
            const canDelete = mine || user?.is_admin;
            const edited = c.updated_at && c.created_at
              && new Date(c.updated_at).getTime() - new Date(c.created_at).getTime() > 1500;
            return (
              <li key={c.id} className="comment">
                <div className="comment-head">
                  <Link to={`/users/${c.user_id}`} className="comment-author">
                    {c.name}{mine ? ' (you)' : ''}
                  </Link>
                  <span className="comment-date">
                    {fmtDate(c.created_at)}{edited ? ' · edited' : ''}
                  </span>
                </div>
                {editingId === c.id ? (
                  <>
                    <textarea
                      rows={3}
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      style={{ width: '100%' }}
                    />
                    <div className="row" style={{ gap: '0.5rem', marginTop: '0.4rem', justifyContent: 'flex-end' }}>
                      <button onClick={cancelEdit} disabled={savingEdit}>Cancel</button>
                      <button className="primary" onClick={() => saveEdit(c)} disabled={savingEdit || !editBody.trim()}>
                        {savingEdit ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="comment-body">{c.body}</div>
                    {(mine || canDelete) && (
                      <div className="comment-actions">
                        {mine && <button onClick={() => startEdit(c)}>Edit</button>}
                        {canDelete && <button onClick={() => remove(c)}>Delete</button>}
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {user ? (
        <form onSubmit={post} style={{ marginTop: '0.5rem' }}>
          <textarea
            rows={3}
            placeholder="Share what you thought…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{ width: '100%' }}
          />
          <div className="row" style={{ marginTop: '0.4rem', justifyContent: 'flex-end' }}>
            <button className="primary" type="submit" disabled={posting || !body.trim()}>
              {posting ? 'Posting…' : 'Post comment'}
            </button>
          </div>
        </form>
      ) : (
        <p style={{ color: 'var(--muted)', margin: 0 }}>
          <Link to="/login">Sign in</Link> to leave a comment.
        </p>
      )}

      {err && <div className="error" style={{ marginTop: '0.5rem' }}>{err}</div>}
    </section>
  );
}

function EditSessionModal({ session, onClose, onSaved }) {
  const [cancelled, setCancelled] = useState(!session.watched_movie_id);
  const [watchedMovieId, setWatchedMovieId] = useState(session.watched_movie_id || '');
  const [startedBy, setStartedBy] = useState(session.started_by_user_id);
  const [cancelledBy, setCancelledBy] = useState(session.cancelled_by_user_id || '');
  const [attendees, setAttendees] = useState(() => new Set(session.attendees.map((a) => a.user_id)));
  const [users, setUsers] = useState([]);
  const [movies, setMovies] = useState([]);
  const [movieQ, setMovieQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get('/api/auth/users').then(setUsers).catch(() => {});
    api.get('/api/movies').then(setMovies).catch(() => {});
  }, []);

  const filteredMovies = useMemo(() => {
    const q = movieQ.trim().toLowerCase();
    if (!q) return movies.slice(0, 50);
    return movies.filter((m) => m.title.toLowerCase().includes(q)).slice(0, 50);
  }, [movies, movieQ]);

  function toggleAttendee(uid) {
    const next = new Set(attendees);
    next.has(uid) ? next.delete(uid) : next.add(uid);
    setAttendees(next);
  }

  async function save() {
    setBusy(true); setErr(null);
    try {
      const body = {
        cancelled,
        started_by_user_id: Number(startedBy),
        attendee_ids: [...attendees],
      };
      if (cancelled) {
        if (!cancelledBy) throw new Error('Pick who cancelled the session');
        body.cancelled_by_user_id = Number(cancelledBy);
      } else {
        if (!watchedMovieId) throw new Error('Pick the watched movie');
        body.watched_movie_id = Number(watchedMovieId);
      }
      await api.patch(`/api/maybe/${session.id}`, body);
      await onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <h2 style={{ marginTop: 0 }}>Edit Maybe Movie</h2>

        <div className="field" style={{ marginBottom: '0.75rem' }}>
          <label>Outcome</label>
          <div className="row" style={{ gap: '0.5rem' }}>
            <button
              type="button"
              className={`rating-pill${!cancelled ? ' active' : ''}`}
              aria-pressed={!cancelled}
              onClick={() => setCancelled(false)}
            >Watched</button>
            <button
              type="button"
              className={`rating-pill${cancelled ? ' active' : ''}`}
              aria-pressed={cancelled}
              onClick={() => setCancelled(true)}
            >Cancelled</button>
          </div>
        </div>

        {cancelled ? (
          <div className="field" style={{ marginBottom: '0.75rem' }}>
            <label>Cancelled by</label>
            <select value={cancelledBy} onChange={(e) => setCancelledBy(e.target.value)}>
              <option value="">— Select user —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="field" style={{ marginBottom: '0.75rem' }}>
            <label>Watched movie</label>
            <input
              type="text"
              placeholder="Filter movies…"
              value={movieQ}
              onChange={(e) => setMovieQ(e.target.value)}
              style={{ marginBottom: '0.4rem' }}
            />
            <select
              value={watchedMovieId}
              onChange={(e) => setWatchedMovieId(e.target.value)}
              size={Math.min(8, Math.max(3, filteredMovies.length))}
              style={{ width: '100%' }}
            >
              {filteredMovies.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}{m.year ? ` (${m.year})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field" style={{ marginBottom: '0.75rem' }}>
          <label>Started by</label>
          <select value={startedBy} onChange={(e) => setStartedBy(e.target.value)}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        <div className="field" style={{ marginBottom: '0.75rem' }}>
          <label>Attendees</label>
          <div className="row">
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                className={`user-toggle ${attendees.has(u.id) ? 'checked' : ''}`}
                onClick={() => toggleAttendee(u.id)}
              >
                {attendees.has(u.id) ? '✓' : '+'} {u.name}
              </button>
            ))}
          </div>
        </div>

        {err && <div className="error" style={{ margin: '0.5rem 0' }}>{err}</div>}

        <div className="row" style={{ justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

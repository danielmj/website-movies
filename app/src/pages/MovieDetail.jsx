import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import RatingPicker, {
  RATING_LABEL,
  RATING_EMOJI,
  INTEREST_LABEL,
  SEEN_OPTIONS,
  INTEREST_OPTIONS,
} from '../components/RatingPicker.jsx';
import SegmentedControl from '../components/SegmentedControl.jsx';
import { pickPairing, typeLabel, typeEmoji, DESCRIPTOR_GLOSS } from '../pairing.js';
import { ExplainPopup } from './Profile.jsx';

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Oxford-comma list join for free-form copy: "a", "a and b", "a, b, and c".
function joinList(items) {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function statusLabel(status) {
  if (status === 'seen') return 'Seen it';
  if (status) return "Haven't seen";
  return 'No response';
}

export default function MovieDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [movie, setMovie] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);

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
  const interest = me?.interest || 'indifferent';
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

  async function setInterest(next) {
    setBusy(true);
    try {
      await api.put(`/api/ratings/${movie.id}`, { interest: next });
      await load();
    } finally {
      setBusy(false);
    }
  }

  // Sort: people who responded first (seen, then haven't-seen), no-response last.
  // Within responders, "want to see" bubbles up by interest.
  const orderedUsers = movie.user_movies
    ? [...movie.user_movies].sort((a, b) => {
        const seenOrder = (s) => (s === 'seen' ? 0 : s ? 1 : 99);
        const ar = seenOrder(a.status);
        const br = seenOrder(b.status);
        if (ar !== br) return ar - br;
        const interestOrder = { want_to_see: 0, indifferent: 1, not_interested: 2 };
        const ai = interestOrder[a.interest] ?? 1;
        const bi = interestOrder[b.interest] ?? 1;
        if (ai !== bi) return ai - bi;
        return a.name.localeCompare(b.name);
      })
    : [];

  return (
    <div className="container detail">
      <div className="spread" style={{ marginBottom: '1rem' }}>
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
        {user?.is_admin && (
          <button type="button" onClick={() => setShowAdminModal(true)}>
            Edit
          </button>
        )}
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
          {(movie.added_by_name || movie.created_at) && (
            <div className="meta" style={{ marginTop: '0.4rem' }}>
              {movie.added_by_name ? `added by ${movie.added_by_name}` : 'added'}
              {movie.created_at ? ` on ${fmtDate(movie.created_at)}` : ''}
            </div>
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

      <PairingCard movie={movie} />

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
                options={SEEN_OPTIONS}
                disabled={busy}
              />
              <SegmentedControl
                value={interest}
                onChange={setInterest}
                options={INTEREST_OPTIONS}
                disabled={busy}
              />
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
                    <th>Seen?</th>
                    <th>Interest</th>
                    <th>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedUsers.map((u) => (
                    <tr key={u.user_id} className={u.status === null ? 'no-response' : ''}>
                      <td>
                        <Link to={`/users/${u.user_id}`}>
                          {u.name}{u.user_id === user.id ? ' (you)' : ''}
                        </Link>
                      </td>
                      <td>{statusLabel(u.status)}</td>
                      <td>{INTEREST_LABEL[u.interest] || '—'}</td>
                      <td>
                        {u.status === 'seen' && u.rating ? (
                          <span className="rating-emoji" aria-label={RATING_LABEL[u.rating]} title={RATING_LABEL[u.rating]}>
                            {RATING_EMOJI[u.rating]}
                          </span>
                        ) : '—'}
                      </td>
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

          {user.is_admin && showAdminModal && (
            <div className="modal-backdrop" onClick={() => setShowAdminModal(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
                <div className="spread" style={{ marginBottom: '0.5rem' }}>
                  <h2 style={{ margin: 0 }}>Edit movie</h2>
                  <button onClick={() => setShowAdminModal(false)}>Close</button>
                </div>
                <AdminMovieEditor movie={movie} reload={load} />
              </div>
            </div>
          )}
        </>
      ) : (
        <section className="card" style={{ marginTop: '1rem' }}>
          <p style={{ margin: 0 }}>
            <Link to="/login">Sign in</Link> to rate this movie and see what others think.
          </p>
        </section>
      )}

      {user && <Comments movie={movie} reload={load} />}
    </div>
  );
}

function PairingCard({ movie }) {
  const p = pickPairing(movie);
  const [open, setOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const reason = (() => {
    if (p.source === 'algorithm') {
      const matches = p.matches || [];
      const allGenres = movie.genres || [];
      if (!matches.length) return `${p.name} — no notes lined up cleanly with this one.`;
      return (
        <>
          <div style={{ marginBottom: '0.4rem' }}>
            All {allGenres.length} {allGenres.length === 1 ? 'genre' : 'genres'} on this movie ({joinList(allGenres)}) were folded into the vibe profile.
          </div>
          <div style={{ marginBottom: '0.6rem' }}>
            <strong style={{ color: 'var(--text)' }}>{p.name}</strong> reads as {joinList(matches)}. Here's how each note matches the movie:
          </div>
          <ul className="pairing-detail-list">
            {matches.map((tag) => {
              const gloss = DESCRIPTOR_GLOSS[tag];
              const genres = (p.tagToGenres && p.tagToGenres[tag]) || [];
              return (
                <li key={tag}>
                  <strong style={{ color: 'var(--text)' }}>{tag}</strong>
                  {gloss && <> — {gloss}</>}
                  {genres.length > 0 && <>. Carried by {joinList(genres)}.</>}
                </li>
              );
            })}
          </ul>
        </>
      );
    }
    return 'No genre data on this movie, so we couldn\'t surface a reasoned pour. Add genres to the metadata and a real pairing will appear.';
  })();

  // Full algorithm explainer, hidden behind the "Learn more" toggle so the
  // primary popup stays scannable. Steps mirror what `pickPairing` actually
  // does, top to bottom.
  const algorithmDetails = (
    <div className="pairing-algo-detail">
      <h4 style={{ margin: '0 0 0.4rem 0' }}>The full algorithm</h4>
      <ol className="pairing-algo-list">
        <li>
          <strong>Build a vibe profile.</strong> Each genre carries a small
          set of descriptors (e.g. Action → <em>intense, bold, punchy, strong, fast, fiery</em>).
          We loop over every genre on the movie and tally a frequency map.
          A descriptor mentioned by multiple genres weighs more — that's how
          cross-genre overlap gets rewarded.
        </li>
        <li>
          <strong>Score every drink.</strong> Every drink in the library is
          also tagged with descriptors. Its score is the sum of frequency
          weights for descriptors it shares with the movie's profile.
          Zero-overlap drinks drop out entirely.
        </li>
        <li>
          <strong>Sort.</strong> Highest total score first; then prefer
          tighter-fit drinks (a higher fraction of their tags actually
          landed); then alphabetical as a deterministic baseline.
        </li>
        <li>
          <strong>Per-movie tiebreak.</strong> When multiple drinks tie at
          the top score, we pick deterministically using the movie's id:{' '}
          <code>topGroup[movieId % topGroup.length]</code>. Same movie always
          lands on the same drink across reloads, but two different movies
          with identical genres can land on different drinks. That's why
          Gladiator and Gladiator II don't pour the same thing.
        </li>
        <li>
          <strong>Surface.</strong> The matched descriptors and which of the
          movie's genres carry each one are what's listed above.
        </li>
      </ol>
      <p style={{ marginTop: '0.6rem', marginBottom: 0 }}>
        Decade is intentionally skipped — the data we have is the
        <em> release</em> decade, not the era the movie depicts, which would
        be the only useful signal for pairing.
      </p>
      <p style={{ marginTop: '0.4rem', marginBottom: 0 }}>
        Tuning points: descriptors per genre and per drink live in{' '}
        <code>app/src/pairing.js</code>; the tiebreak rule is the last
        block of <code>pickPairing</code>.
      </p>
    </div>
  );

  const body = (
    <>
      {reason}
      {showDetails && algorithmDetails}
      {p.source !== 'fallback' && (
        <button
          type="button"
          className="pairing-learn-more"
          onClick={() => setShowDetails((v) => !v)}
        >
          {showDetails ? 'Hide details' : 'Learn more →'}
        </button>
      )}
    </>
  );

  return (
    <>
      <section
        className="card pairing-card clickable"
        style={{ marginTop: '1rem' }}
        role="button"
        tabIndex={0}
        onClick={() => { setOpen(true); setShowDetails(false); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); setShowDetails(false); } }}
      >
        <div className="pairing-emoji" aria-hidden="true">{typeEmoji(p.type)}</div>
        <div className="pairing-text">
          <div className="pairing-eyebrow">Tonight's pairing — {typeLabel(p.type)}</div>
          <div className="pairing-name">{p.name}</div>
          <div className="pairing-why">{p.why}</div>
        </div>
        <span className="stat-info" aria-hidden="true">ⓘ</span>
      </section>
      {open && (
        <ExplainPopup
          title="How this pairing is chosen"
          body={body}
          onClose={() => { setOpen(false); setShowDetails(false); }}
        />
      )}
    </>
  );
}

function Comments({ movie, reload }) {
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
      await api.post(`/api/movies/${movie.id}/comments`, { body: trimmed });
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
      await api.patch(`/api/movies/${movie.id}/comments/${c.id}`, { body: trimmed });
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
      await api.del(`/api/movies/${movie.id}/comments/${c.id}`);
      await reload();
    } catch (e) {
      setErr(e.message);
    }
  }

  const comments = movie.comments || [];

  return (
    <section className="card" style={{ marginTop: '1rem' }}>
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
            placeholder="Share what you thought of this movie…"
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
  const [users, setUsers] = useState([]);
  const [addedBy, setAddedBy] = useState(movie.added_by_user_id ?? '');
  const [savingAddedBy, setSavingAddedBy] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState(null);

  // If the parent reloads with a different value, sync the controls.
  useEffect(() => { setNotes(movie.notes || ''); }, [movie.id, movie.notes]);
  useEffect(() => { setAddedBy(movie.added_by_user_id ?? ''); }, [movie.id, movie.added_by_user_id]);
  useEffect(() => {
    api.get('/api/auth/users').then(setUsers).catch(() => setUsers([]));
  }, []);

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

  async function saveAddedBy() {
    setSavingAddedBy(true); setErr(null);
    try {
      await api.patch(`/api/admin/movies/${movie.id}`, {
        added_by_user_id: addedBy === '' ? null : Number(addedBy),
      });
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSavingAddedBy(false);
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
    <section style={{ marginTop: '0.25rem' }}>

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
        <label>Added by</label>
        <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <select
            value={addedBy}
            onChange={(e) => setAddedBy(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          >
            <option value="">— unset —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <button
            className="primary"
            onClick={saveAddedBy}
            disabled={savingAddedBy || String(addedBy) === String(movie.added_by_user_id ?? '')}
          >
            {savingAddedBy ? 'Saving…' : 'Save'}
          </button>
        </div>
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

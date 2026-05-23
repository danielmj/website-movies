import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useMaybe } from '../maybe.jsx';
import { POSITIVE_RATINGS } from '../components/RatingPicker.jsx';

const SORTS = {
  haventSeen: 'Most attendees haven\'t seen it',
  recPct: 'Highest rec % (of those who saw it)',
  wantPct: 'Most attendees want to see',
  noResponse: 'Most attendees haven\'t responded',
  bechdel: 'Bechdel passes first',
  netVotes: 'Up votes (net)',
};

export default function MaybeMovie() {
  const { active, setAttendees, vote, watched, cancel } = useMaybe();
  const { user } = useAuth();
  const [movies, setMovies] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [editingAttendees, setEditingAttendees] = useState(false);
  const [showExitPopup, setShowExitPopup] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const [filters, setFilters] = useState({
    hideHated: true,
    hideNotInterested: false,
    hideGroupWatched: true,
    onlyUnseen: false,
    genre: '',
    maxMinutes: '',
    decade: '',
    bechdelOnly: false,
  });
  const [sort, setSort] = useState('haventSeen');
  const [quickQ, setQuickQ] = useState('');
  const [groupWatchedIds, setGroupWatchedIds] = useState(() => new Set());
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    api.get('/api/movies').then(setMovies);
    api.get('/api/auth/users').then(setAllUsers);
    // Pull past maybe-session history so we know which movies the group
    // has already watched together. Used by the "Have not watched as
    // group" filter pill below.
    api.get('/api/maybe/history').then((h) => {
      const ids = new Set();
      for (const s of (h || [])) {
        if (s.watched_movie_id) ids.add(s.watched_movie_id);
      }
      setGroupWatchedIds(ids);
    }).catch(() => {});
  }, []);

  if (!active) {
    return (
      <div className="container">
        <div className="card">
          <h2>No active maybe movie</h2>
          <p style={{ color: 'var(--muted)' }}>Click "Maybe movie?" up top to start one.</p>
          <Link to="/">Back to movies</Link>
        </div>
        <MaybeHistory canDelete={!!user?.is_admin} />
      </div>
    );
  }
  if (!movies) return <div className="container">Loading…</div>;

  const attendeeIds = new Set(active.attendees.map((a) => a.user_id));
  const allGenres = [...new Set(movies.flatMap((m) => m.genres || []))].sort();
  const allDecades = [...new Set(movies.map((m) => m.decade).filter(Boolean))].sort();

  const annotated = movies.map((m) => {
    const attendeeUm = m.user_movies.filter((u) => attendeeIds.has(u.user_id));
    const seen = attendeeUm.filter((u) => u.status === 'seen');
    const want = attendeeUm.filter((u) => u.interest === 'want_to_see');
    const haventSeenResponses = attendeeUm.filter(
      (u) => u.status !== 'seen',
    );
    const noResponseCount = attendeeIds.size - attendeeUm.length;
    const recPositive = seen.filter((u) => POSITIVE_RATINGS.has(u.rating));
    const myVote = active.votes.find((v) => v.user_id === user.id && v.movie_id === m.id);
    const ups = active.votes.filter((v) => v.movie_id === m.id && v.vote === 'up').length;
    const downs = active.votes.filter((v) => v.movie_id === m.id && v.vote === 'down').length;
    return {
      ...m,
      _attendeeUm: attendeeUm,
      _seenCount: seen.length,
      _haventSeen: haventSeenResponses.length,
      _noResponse: noResponseCount,
      _recPct: seen.length ? recPositive.length / seen.length : null,
      _wantPct: attendeeIds.size ? want.length / attendeeIds.size : 0,
      _anyHated: attendeeUm.some((u) => u.rating === 'really_dont_like'),
      _anyNotInterested: attendeeUm.some((u) => u.interest === 'not_interested'),
      _myVote: myVote ? myVote.vote : null,
      _netVotes: ups - downs,
      _ups: ups,
      _downs: downs,
    };
  });

  const filtered = annotated.filter((m) => {
    if (filters.hideHated && m._anyHated) return false;
    if (filters.hideNotInterested && m._anyNotInterested) return false;
    if (filters.hideGroupWatched && groupWatchedIds.has(m.id)) return false;
    if (filters.onlyUnseen && m._seenCount > 0) return false;
    if (filters.genre && !(m.genres || []).includes(filters.genre)) return false;
    if (filters.maxMinutes && (m.duration_minutes || 0) > Number(filters.maxMinutes)) return false;
    if (filters.decade && Number(m.decade) !== Number(filters.decade)) return false;
    if (filters.bechdelOnly && !m.bechdel_passes) return false;
    if (quickQ.trim() && !m.title.toLowerCase().includes(quickQ.trim().toLowerCase())) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case 'haventSeen': return b._haventSeen - a._haventSeen;
      case 'recPct': return (b._recPct ?? -1) - (a._recPct ?? -1);
      case 'wantPct': return b._wantPct - a._wantPct;
      case 'noResponse': return b._noResponse - a._noResponse;
      case 'bechdel': return Number(!!b.bechdel_passes) - Number(!!a.bechdel_passes);
      case 'netVotes': return b._netVotes - a._netVotes;
      default: return 0;
    }
  });

  return (
    <div className="container">
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Maybe movie?</h1>
        <button
          className="danger"
          onClick={() => {
            if (!confirm('End this maybe movie without watching anything?')) return;
            setShowExitPopup(true);
          }}
        >
          Perhaps not
        </button>
      </div>

      {showExitPopup && (
        <PerhapsNotPopup
          onClose={() => setShowExitPopup(false)}
          onSubmit={async () => {
            setShowExitPopup(false);
            await cancel(active.id);
            navigate('/');
          }}
        />
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="spread">
          <div>
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Attendees</div>
            <div className="attendees-list" style={{ marginTop: '0.4rem' }}>
              {active.attendees.length === 0 && <span style={{ color: 'var(--muted)' }}>No one yet</span>}
              {active.attendees.map((a) => (
                <Link key={a.user_id} to={`/users/${a.user_id}`} className="pill pill-link">{a.name}</Link>
              ))}
            </div>
          </div>
          <button onClick={() => setEditingAttendees(true)}>Edit attendees</button>
        </div>
      </div>

      <form
        className="row quick-add"
        onSubmit={(e) => e.preventDefault()}
      >
        <input
          type="text"
          placeholder="Filter movies in this list…"
          value={quickQ}
          onChange={(e) => setQuickQ(e.target.value)}
          style={{ flex: 1 }}
        />
      </form>

      <div className="toolbar">
        <div className="field">
          <label>Sort by</label>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.entries(SORTS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Genre</label>
          <select value={filters.genre} onChange={(e) => setFilters({ ...filters, genre: e.target.value })}>
            <option value="">Any</option>
            {allGenres.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Decade</label>
          <select value={filters.decade} onChange={(e) => setFilters({ ...filters, decade: e.target.value })}>
            <option value="">Any</option>
            {allDecades.map((d) => <option key={d} value={d}>{d}s</option>)}
          </select>
        </div>
        <div className="field">
          <label>Max minutes</label>
          <input
            type="number"
            placeholder="e.g. 120"
            value={filters.maxMinutes}
            onChange={(e) => setFilters({ ...filters, maxMinutes: e.target.value })}
          />
        </div>
        <div className="toolbar-checks">
          <button
            type="button"
            className={`want-pill${filters.hideGroupWatched ? ' active' : ''}`}
            aria-pressed={filters.hideGroupWatched}
            onClick={() => setFilters({ ...filters, hideGroupWatched: !filters.hideGroupWatched })}
          >
            <span aria-hidden="true">{filters.hideGroupWatched ? '☑' : '☐'}</span>
            {' '}Not watched as group
          </button>
          <button
            type="button"
            className={`want-pill${filters.hideHated ? ' active' : ''}`}
            aria-pressed={filters.hideHated}
            onClick={() => setFilters({ ...filters, hideHated: !filters.hideHated })}
          >
            <span aria-hidden="true">{filters.hideHated ? '☑' : '☐'}</span>
            {' '}Hide if anyone hates
          </button>
          <button
            type="button"
            className={`want-pill${filters.bechdelOnly ? ' active' : ''}`}
            aria-pressed={filters.bechdelOnly}
            onClick={() => setFilters({ ...filters, bechdelOnly: !filters.bechdelOnly })}
          >
            <span aria-hidden="true">{filters.bechdelOnly ? '☑' : '☐'}</span>
            {' '}Bechdel passes
          </button>
          <button
            type="button"
            className={`want-pill${filters.onlyUnseen ? ' active' : ''}`}
            aria-pressed={filters.onlyUnseen}
            onClick={() => setFilters({ ...filters, onlyUnseen: !filters.onlyUnseen })}
          >
            <span aria-hidden="true">{filters.onlyUnseen ? '☑' : '☐'}</span>
            {' '}No attendee has seen
          </button>
          <button
            type="button"
            className={`want-pill${filters.hideNotInterested ? ' active' : ''}`}
            aria-pressed={filters.hideNotInterested}
            onClick={() => setFilters({ ...filters, hideNotInterested: !filters.hideNotInterested })}
          >
            <span aria-hidden="true">{filters.hideNotInterested ? '☑' : '☐'}</span>
            {' '}Hide if not interested
          </button>
        </div>
        <div className="toolbar-random">
          <button
            type="button"
            className="random-btn"
            disabled={sorted.length === 0}
            onClick={() => {
              if (!sorted.length) return;
              const pick = sorted[Math.floor(Math.random() * sorted.length)];
              setHighlightId(pick.id);
              const el = document.getElementById(`maybe-movie-${pick.id}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(() => setHighlightId((cur) => cur === pick.id ? null : cur), 2200);
            }}
          >🎲 Random</button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {sorted.length === 0 && <div className="card">No movies match these filters.</div>}
        {sorted.map((m) => (
          <div
            id={`maybe-movie-${m.id}`}
            className={`movie-row${highlightId === m.id ? ' highlighted' : ''}`}
            key={m.id}
          >
            <div className="vote">
              <button
                className={`up ${m._myVote === 'up' ? 'active' : ''}`}
                title="Thumbs up"
                onClick={() => vote(active.id, m.id, m._myVote === 'up' ? null : 'up')}
              >▲</button>
              <span className="net">{m._netVotes >= 0 ? `+${m._netVotes}` : m._netVotes}</span>
              <button
                className={`down ${m._myVote === 'down' ? 'active' : ''}`}
                title="Thumbs down"
                onClick={() => vote(active.id, m.id, m._myVote === 'down' ? null : 'down')}
              >▼</button>
            </div>
            <Link
              to={`/movies/${m.id}`}
              className="poster"
              aria-label={`Open ${m.title} details`}
              style={m.poster_url ? { backgroundImage: `url(${m.poster_url})` } : {}}
            />
            <Link to={`/movies/${m.id}`} className="info-link">
              <div className="info">
                <h3>{m.title} {m.year && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({m.year})</span>}</h3>
                <div className="stats">
                  {m.duration_minutes ? `${m.duration_minutes}m` : '—'}
                  {m.imdb_rating ? ` · ⭐ ${m.imdb_rating}` : ''}
                  {m.bechdel_passes ? (
                    <> · <span style={{ color: 'var(--good)' }}>Bechdel&nbsp;✓</span></>
                  ) : m.bechdel_passes === 0 ? (
                    <> · <span style={{ color: 'var(--bad)' }}>Bechdel&nbsp;✗</span></>
                  ) : null}
                  {m.genres?.length ? ` · ${m.genres.join(', ')}` : ''}
                </div>
                <div className="stats">
                  {m._seenCount}/{attendeeIds.size} seen ·
                  {' '}{m._haventSeen} haven't seen
                  <span className="stats-break"> · </span>
                  {m._noResponse > 0 ? `${m._noResponse} no response · ` : ''}
                  {m._recPct === null ? 'no ratings yet' : `${Math.round(m._recPct * 100)}% rec`} ·
                  {' '}{Math.round(m._wantPct * 100)}% want to see
                </div>
              </div>
            </Link>
            <div className="right">
              <button
                className="primary"
                onClick={async () => {
                  if (!confirm(`Mark "${m.title}" as watched and end this maybe movie?`)) return;
                  await watched(active.id, m.id);
                  navigate('/');
                }}
              >
                Watched
              </button>
            </div>
          </div>
        ))}
      </div>

      {editingAttendees && (
        <EditAttendeesModal
          allUsers={allUsers}
          attendees={active.attendees}
          onClose={() => setEditingAttendees(false)}
          onSave={async (ids) => { await setAttendees(active.id, ids); setEditingAttendees(false); }}
        />
      )}

      <MaybeHistory canDelete={!!user?.is_admin} />
    </div>
  );
}

function EditAttendeesModal({ allUsers, attendees, onClose, onSave }) {
  const [selected, setSelected] = useState(new Set(attendees.map((a) => a.user_id)));
  const [busy, setBusy] = useState(false);
  function toggle(id) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit attendees</h2>
        <div className="row">
          {allUsers.map((u) => (
            <button
              key={u.id}
              type="button"
              className={`user-toggle ${selected.has(u.id) ? 'checked' : ''}`}
              onClick={() => toggle(u.id)}
            >
              {selected.has(u.id) ? '✓' : '+'} {u.name}
            </button>
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy} onClick={async () => { setBusy(true); await onSave([...selected]); }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// Past Maybe Movie sessions — both completed (with a watched movie) and
// cancelled. Visible to all signed-in users. Admins get a delete button per
// row to wipe a session from history.
function MaybeHistory({ canDelete }) {
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

  if (err) return <div className="card error" style={{ marginTop: '1.5rem' }}>{err}</div>;
  if (!rows) return null;

  return (
    <section className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Past Maybe Movies</h2>
      {rows.length === 0 ? (
        <p style={{ color: 'var(--muted)', margin: 0 }}>No history yet.</p>
      ) : (
        <ul className="maybe-history">
          {rows.map((s) => (
            <li key={s.id}>
              <div className="maybe-history-head">
                <span className="maybe-history-date">
                  {new Date(s.ended_at).toLocaleDateString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })}
                </span>
                {s.cancelled ? (
                  <span className="pill bad">Cancelled</span>
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// "Mental stability" exit interview shown after the user confirms the
// "Perhaps not" cancel. Answers are intentionally not persisted — the popup
// is a wink, not data collection.
const MOOD_OPTIONS = [
  ['great',     '😄'],
  ['fine',      '🙂'],
  ['meh',       '😐'],
  ['low',       '😔'],
  ['anxious',   '😰'],
  ['angry',     '😠'],
  ['hopeless',  '😞'],
  ['euphoric',  '🤩'],
  ['numb',      '😶'],
];

function PerhapsNotPopup({ onClose, onSubmit }) {
  const [withdrawing, setWithdrawing] = useState(null);
  const [moods, setMoods] = useState(new Set());
  const [racing, setRacing] = useState(null);
  const [impulsive, setImpulsive] = useState(null);
  const [period, setPeriod] = useState('');

  function toggleMood(key) {
    setMoods((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal exit-interview" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Quick check-in</h2>
        <p style={{ color: 'var(--muted)' }}>
          We would like to ask a few questions to understand why you chose to
          not watch a movie on maybe movie mondays. Please answer to the best
          of your ability.
        </p>

        <YesNoQuestion
          label="Have you found yourself withdrawing from friends, family, or activities you used to enjoy?"
          value={withdrawing}
          onChange={setWithdrawing}
        />

        <div className="exit-question">
          <div className="exit-question-label">
            How would you describe your general mood over the past two hours?{' '}
            <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(select multiple)</span>
          </div>
          <div className="exit-mood">
            {MOOD_OPTIONS.map(([key, emoji]) => (
              <button
                key={key}
                type="button"
                aria-pressed={moods.has(key)}
                className={`rating-pill${moods.has(key) ? ' active' : ''}`}
                onClick={() => toggleMood(key)}
              >{emoji}</button>
            ))}
          </div>
        </div>

        <YesNoQuestion
          label="Have you been having trouble concentrating on tasks you used to find easy?"
          value={racing}
          onChange={setRacing}
        />

        <YesNoQuestion
          label="Do you ever feel a sudden, uncontrollable urge to act impulsively or recklessly?"
          value={impulsive}
          onChange={setImpulsive}
        />

        <div className="exit-question">
          <label className="exit-question-label" htmlFor="exit-period">
            When was your last period?
          </label>
          <input
            id="exit-period"
            type="date"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            style={{ width: 180 }}
          />
        </div>

        <div className="row" style={{ marginTop: '1rem', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={onSubmit}>Submit</button>
        </div>
      </div>
    </div>
  );
}

function YesNoQuestion({ label, value, onChange }) {
  return (
    <div className="exit-question">
      <div className="exit-question-label">{label}</div>
      <div className="row" style={{ gap: '0.5rem' }}>
        <button
          type="button"
          aria-pressed={value === 'yes'}
          className={`rating-pill${value === 'yes' ? ' active' : ''}`}
          onClick={() => onChange('yes')}
        >Yes</button>
        <button
          type="button"
          aria-pressed={value === 'no'}
          className={`rating-pill${value === 'no' ? ' active' : ''}`}
          onClick={() => onChange('no')}
        >No</button>
      </div>
    </div>
  );
}

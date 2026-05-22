import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useMaybe } from '../maybe.jsx';
import { POSITIVE_RATINGS } from '../components/RatingPicker.jsx';

const SORTS = {
  haventSeen: 'Most attendees haven\'t seen it',
  recPct: 'Highest rec % (of those who saw it)',
  wantPct: 'Most attendees want to see',
  bechdel: 'Bechdel passes first',
  netVotes: 'Up votes (net)',
};

export default function MaybeMovie() {
  const { active, setAttendees, vote, watched, cancel } = useMaybe();
  const { user } = useAuth();
  const [movies, setMovies] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [editingAttendees, setEditingAttendees] = useState(false);
  const [filters, setFilters] = useState({
    hideHated: true,
    onlyUnseen: false,
    genre: '',
    maxMinutes: '',
    decade: '',
    bechdelOnly: false,
  });
  const [sort, setSort] = useState('haventSeen');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/api/movies').then(setMovies);
    api.get('/api/auth/users').then(setAllUsers);
  }, []);

  if (!active) {
    return (
      <div className="container">
        <div className="card">
          <h2>No active maybe movie</h2>
          <p style={{ color: 'var(--muted)' }}>Click "Maybe movie?" up top to start one.</p>
          <Link to="/">Back to movies</Link>
        </div>
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
    const want = attendeeUm.filter((u) => u.status === 'want_to_see');
    const recPositive = seen.filter((u) => POSITIVE_RATINGS.has(u.rating));
    const haventSeenCount = attendeeIds.size - seen.length;
    const myVote = active.votes.find((v) => v.user_id === user.id && v.movie_id === m.id);
    const ups = active.votes.filter((v) => v.movie_id === m.id && v.vote === 'up').length;
    const downs = active.votes.filter((v) => v.movie_id === m.id && v.vote === 'down').length;
    return {
      ...m,
      _attendeeUm: attendeeUm,
      _haventSeen: haventSeenCount,
      _recPct: seen.length ? recPositive.length / seen.length : null,
      _wantPct: attendeeIds.size ? want.length / attendeeIds.size : 0,
      _anyHated: attendeeUm.some((u) => u.rating === 'really_dont_like'),
      _myVote: myVote ? myVote.vote : null,
      _netVotes: ups - downs,
      _ups: ups,
      _downs: downs,
    };
  });

  const filtered = annotated.filter((m) => {
    if (filters.hideHated && m._anyHated) return false;
    if (filters.onlyUnseen && m._haventSeen !== attendeeIds.size) return false;
    if (filters.genre && !(m.genres || []).includes(filters.genre)) return false;
    if (filters.maxMinutes && (m.duration_minutes || 0) > Number(filters.maxMinutes)) return false;
    if (filters.decade && Number(m.decade) !== Number(filters.decade)) return false;
    if (filters.bechdelOnly && !m.bechdel_passes) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case 'haventSeen': return b._haventSeen - a._haventSeen;
      case 'recPct': return (b._recPct ?? -1) - (a._recPct ?? -1);
      case 'wantPct': return b._wantPct - a._wantPct;
      case 'bechdel': return Number(!!b.bechdel_passes) - Number(!!a.bechdel_passes);
      case 'netVotes': return b._netVotes - a._netVotes;
      default: return 0;
    }
  });

  return (
    <div className="container">
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Maybe movie</h1>
        <button className="danger" onClick={async () => { if (confirm('End this maybe movie?')) { await cancel(active.id); navigate('/'); } }}>
          End session
        </button>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="spread">
          <div>
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Attendees</div>
            <div className="attendees-list" style={{ marginTop: '0.4rem' }}>
              {active.attendees.length === 0 && <span style={{ color: 'var(--muted)' }}>No one yet</span>}
              {active.attendees.map((a) => <span key={a.user_id} className="pill">{a.name}</span>)}
            </div>
          </div>
          <button onClick={() => setEditingAttendees(true)}>Edit attendees</button>
        </div>
      </div>

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
        <div className="field" style={{ display: 'flex', alignItems: 'center' }}>
          <label className="row" style={{ gap: '0.35rem' }}>
            <input type="checkbox" checked={filters.bechdelOnly} onChange={(e) => setFilters({ ...filters, bechdelOnly: e.target.checked })} />
            Bechdel passes
          </label>
        </div>
        <div className="field" style={{ display: 'flex', alignItems: 'center' }}>
          <label className="row" style={{ gap: '0.35rem' }}>
            <input type="checkbox" checked={filters.onlyUnseen} onChange={(e) => setFilters({ ...filters, onlyUnseen: e.target.checked })} />
            No attendee has seen
          </label>
        </div>
        <div className="field" style={{ display: 'flex', alignItems: 'center' }}>
          <label className="row" style={{ gap: '0.35rem' }}>
            <input type="checkbox" checked={filters.hideHated} onChange={(e) => setFilters({ ...filters, hideHated: e.target.checked })} />
            Hide if anyone really hates
          </label>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {sorted.length === 0 && <div className="card">No movies match these filters.</div>}
        {sorted.map((m) => (
          <div className="movie-row" key={m.id}>
            <div className="poster" style={m.poster_url ? { backgroundImage: `url(${m.poster_url})` } : {}} />
            <div className="info">
              <h3>{m.title} {m.year && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({m.year})</span>}</h3>
              <div className="stats">
                {m.duration_minutes ? `${m.duration_minutes}m` : '—'}
                {m.imdb_rating ? ` · ⭐ ${m.imdb_rating}` : ''}
                {m.bechdel_passes ? ' · Bechdel ✓' : m.bechdel_passes === 0 ? ' · Bechdel ✗' : ''}
                {m.genres?.length ? ` · ${m.genres.join(', ')}` : ''}
              </div>
              <div className="stats">
                {m._haventSeen}/{attendeeIds.size} haven't seen ·
                {' '}{m._recPct === null ? 'no ratings yet' : `${Math.round(m._recPct * 100)}% rec`} ·
                {' '}{Math.round(m._wantPct * 100)}% want to see
              </div>
            </div>
            <div className="right">
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

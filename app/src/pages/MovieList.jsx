import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import MovieCard from '../components/MovieCard.jsx';
import RatingControls from '../components/RatingControls.jsx';

const VIEW_KEY = 'mmm.movieListView';

export default function MovieList() {
  const { user } = useAuth();
  const [movies, setMovies] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  // Default to list on phone-width, grid otherwise. localStorage overrides.
  const [view, setView] = useState(() => {
    if (typeof window === 'undefined') return 'grid';
    const saved = window.localStorage.getItem(VIEW_KEY);
    if (saved === 'grid' || saved === 'list') return saved;
    return window.matchMedia('(max-width: 520px)').matches ? 'list' : 'grid';
  });
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    try { window.localStorage.setItem(VIEW_KEY, view); } catch {}
  }, [view]);

  async function load() {
    try {
      setMovies(await api.get('/api/movies'));
    } catch (e) {
      setErr(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  function startAdd(e) {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    navigate(`/add?q=${encodeURIComponent(trimmed)}`, { state: { from: location.pathname } });
  }

  if (err) return <div className="container error">{err}</div>;
  if (!movies) return <div className="container">Loading…</div>;

  return (
    <div className="container">
      <div className="spread" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>Movies</h1>
        <div className="row" style={{ gap: '0.6rem', alignItems: 'center' }}>
          <span style={{ color: 'var(--muted)' }}>{movies.length} in the list</span>
          <div className="view-toggle" role="tablist" aria-label="View mode">
            <button
              type="button"
              className={view === 'grid' ? 'active' : ''}
              onClick={() => setView('grid')}
              aria-pressed={view === 'grid'}
              title="Grid view"
            >▦</button>
            <button
              type="button"
              className={view === 'list' ? 'active' : ''}
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              title="List view"
            >☰</button>
          </div>
        </div>
      </div>
      {user ? (
        <form onSubmit={startAdd} className="row quick-add">
          <input
            type="text"
            placeholder="Add a movie — search by title…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="primary" disabled={!q.trim()}>Search</button>
        </form>
      ) : (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <Link to="/login">Sign in</Link> to rate these movies, add new ones,
          or start a Maybe Movie session.
        </div>
      )}
      {movies.length === 0 ? (
        <div className="card">No movies yet.{user ? ' Use the search above to add one.' : ''}</div>
      ) : view === 'grid' ? (
        <div className="movie-grid">
          {movies.map((m) => (
            <MovieCard key={m.id} movie={m} onChange={load} />
          ))}
        </div>
      ) : (
        <div className="movie-list">
          {movies.map((m) => <MovieListItem key={m.id} movie={m} onChange={load} />)}
        </div>
      )}
    </div>
  );
}

// Compact horizontal layout. Poster + title link to the detail page; rating
// controls are inline so common operations (mark seen, rate, want-to-see)
// don't need a navigation hop. Controls stop click-propagation so tapping
// them doesn't trigger the surrounding link.
function MovieListItem({ movie, onChange }) {
  const { user } = useAuth();
  const me = user ? movie.user_movies.find((u) => u.user_id === user.id) : null;
  const needsResponse = user && !me;
  const [busy, setBusy] = useState(false);

  async function removeMovie(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Remove "${movie.title}" from the list?`)) return;
    setBusy(true);
    try {
      await api.del(`/api/movies/${movie.id}`);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`movie-list-item${needsResponse ? ' needs-response' : ''}`}>
      <Link
        to={`/movies/${movie.id}`}
        className="poster"
        aria-label={`Open ${movie.title} details`}
        style={movie.poster_url ? { backgroundImage: `url(${movie.poster_url})` } : {}}
      />
      <div className="info">
        <Link to={`/movies/${movie.id}`} className="info-link">
          <div className="title">
            {movie.title}
            {movie.year && <span className="muted"> ({movie.year})</span>}
          </div>
          <div className="muted">
            {movie.duration_minutes ? `${movie.duration_minutes}m` : '—'}
            {movie.imdb_rating ? ` · ⭐ ${movie.imdb_rating}` : ''}
            {movie.bechdel_passes ? ' · Bechdel ✓' : ''}
            {movie.genres?.length ? ` · ${movie.genres.slice(0, 2).join(', ')}` : ''}
          </div>
        </Link>
        {user && <RatingControls movie={movie} me={me} onChange={onChange} compact />}
      </div>
      {user && (
        <button
          type="button"
          className="card-remove list-remove"
          aria-label={`Remove ${movie.title}`}
          onClick={removeMovie}
          disabled={busy}
          title="Remove from list"
        >×</button>
      )}
    </div>
  );
}

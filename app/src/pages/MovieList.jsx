import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import MovieCard from '../components/MovieCard.jsx';

export default function MovieList() {
  const { user } = useAuth();
  const [movies, setMovies] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

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
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Movies</h1>
        <span style={{ color: 'var(--muted)' }}>{movies.length} in the list</span>
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
      ) : (
        <div className="movie-grid">
          {movies.map((m) => (
            <MovieCard key={m.id} movie={m} onChange={load} />
          ))}
        </div>
      )}
    </div>
  );
}

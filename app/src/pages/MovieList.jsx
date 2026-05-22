import { useEffect, useState } from 'react';
import { api } from '../api.js';
import MovieCard from '../components/MovieCard.jsx';

export default function MovieList() {
  const [movies, setMovies] = useState(null);
  const [err, setErr] = useState(null);

  async function load() {
    try {
      setMovies(await api.get('/api/movies'));
    } catch (e) {
      setErr(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  if (err) return <div className="container error">{err}</div>;
  if (!movies) return <div className="container">Loading…</div>;

  return (
    <div className="container">
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Movies</h1>
        <span style={{ color: 'var(--muted)' }}>{movies.length} in the list</span>
      </div>
      {movies.length === 0 ? (
        <div className="card">No movies yet. Click <strong>Add</strong> to add one.</div>
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

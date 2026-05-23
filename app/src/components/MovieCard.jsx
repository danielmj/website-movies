import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { RATING_EMOJI } from './RatingPicker.jsx';
import RatingControls from './RatingControls.jsx';
import { useAuth } from '../auth.jsx';

export default function MovieCard({ movie, onChange }) {
  const { user } = useAuth();
  const me = user ? movie.user_movies.find((u) => u.user_id === user.id) : null;
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

  const others = user ? movie.user_movies.filter((u) => u.user_id !== user.id) : [];
  const needsResponse = user && !me;

  return (
    <div className={`movie-card${needsResponse ? ' needs-response' : ''}`}>
      <Link
        to={`/movies/${movie.id}`}
        className="poster"
        aria-label={`Open ${movie.title} details`}
        style={movie.poster_url ? { backgroundImage: `url(${movie.poster_url})` } : {}}
      />
      <div className="body">
        <div className="spread" style={{ gap: '0.5rem' }}>
          <h3 style={{ flex: 1 }}>
            <Link to={`/movies/${movie.id}`} className="card-title">{movie.title}</Link>
          </h3>
          {user && (
            <button
              type="button"
              className="card-remove"
              aria-label={`Remove ${movie.title}`}
              onClick={removeMovie}
              disabled={busy}
              title="Remove from list"
            >×</button>
          )}
        </div>
        <div className="meta">
          {movie.year || '—'}
          {movie.duration_minutes ? ` · ${movie.duration_minutes}m` : ''}
          {movie.imdb_rating ? ` · ⭐ ${movie.imdb_rating}` : ''}
        </div>
        <div className="pills">
          {movie.bechdel_passes ? (
            <span className="pill good">Bechdel&nbsp;✓</span>
          ) : movie.bechdel_passes === 0 || movie.bechdel_passes === false ? (
            <span className="pill bad">Bechdel&nbsp;✗</span>
          ) : null}
          {(movie.genres || []).slice(0, 2).map((g) => (
            <span key={g} className="pill">{g}</span>
          ))}
        </div>

        {user ? (
          <>
            {needsResponse && (
              <div className="card-warn" role="note">
                ⚠ Please mark whether you've seen this
              </div>
            )}
            <RatingControls movie={movie} me={me} onChange={onChange} />
            {others.length > 0 && (
              <ul className="others-list">
                {others.map((u) => (
                  <li key={u.user_id}>
                    <Link to={`/users/${u.user_id}`}>{u.name}</Link>
                    {': '}
                    {u.status === 'seen' && u.rating
                      ? <span className="rating-emoji" aria-label={`Rated ${u.rating}`}>{RATING_EMOJI[u.rating]}</span>
                      : u.status === 'seen'
                        ? 'Seen it'
                        : u.status
                          ? "Haven't seen"
                          : 'No response'}
                    {u.interest === 'want_to_see' ? <span className="want-mark" title="Wants to see">{' ☑'}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="meta" style={{ marginTop: '0.5rem' }}>
            <Link to="/login">Sign in</Link> to rate this movie
          </div>
        )}
      </div>
    </div>
  );
}

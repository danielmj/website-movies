import { useState } from 'react';
import { api } from '../api.js';
import RatingPicker, { RATING_LABEL, STATUS_LABEL, STATUSES } from './RatingPicker.jsx';
import SegmentedControl from './SegmentedControl.jsx';
import { useAuth } from '../auth.jsx';

export default function MovieCard({ movie, onChange }) {
  const { user } = useAuth();
  const me = movie.user_movies.find((u) => u.user_id === user.id);
  const [busy, setBusy] = useState(false);

  async function setStatus(status, rating = null) {
    setBusy(true);
    try {
      if (status === 'seen' && !rating) {
        rating = me && me.rating ? me.rating : 'rec';
      }
      await api.put(`/api/ratings/${movie.id}`, { status, rating });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  const others = movie.user_movies.filter((u) => u.user_id !== user.id);

  return (
    <div className="movie-card">
      <div
        className="poster"
        style={movie.poster_url ? { backgroundImage: `url(${movie.poster_url})` } : {}}
      />
      <div className="body">
        <h3>{movie.title}</h3>
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
          {(movie.genres || []).slice(0, 2).map((g) => (
            <span key={g} className="pill">{g}</span>
          ))}
        </div>

        <div style={{ marginTop: '0.5rem' }}>
          <SegmentedControl
            value={me?.status || null}
            onChange={(s) => setStatus(s, s === 'seen' ? me?.rating || 'rec' : null)}
            options={STATUSES}
            disabled={busy}
          />
          {me?.status === 'seen' && (
            <div style={{ marginTop: '0.5rem' }}>
              <RatingPicker value={me.rating} onChange={(r) => setStatus('seen', r)} disabled={busy} />
            </div>
          )}
        </div>

        {others.length > 0 && (
          <div className="meta" style={{ marginTop: '0.5rem' }}>
            {others
              .map((u) => `${u.name}: ${STATUS_LABEL[u.status]}${u.status === 'seen' && u.rating ? ` (${RATING_LABEL[u.rating]})` : ''}`)
              .join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
}

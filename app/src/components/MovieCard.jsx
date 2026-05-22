import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import RatingPicker, { RATING_LABEL, STATUS_LABEL } from './RatingPicker.jsx';
import SegmentedControl from './SegmentedControl.jsx';
import { useAuth } from '../auth.jsx';

// Status enum on the server is still seen / want_to_see / not_interested,
// but the card's UI splits the three into two orthogonal controls:
//   - a "Seen it / Haven't seen" toggle
//   - a "Want to see" pill, shown only when the user hasn't seen the movie
// The mapping, computed below, keeps the server-side schema unchanged.
const SEEN_OPTIONS = [
  ['seen', 'Seen it'],
  ['not_seen', "Haven't seen"],
];

export default function MovieCard({ movie, onChange }) {
  const { user } = useAuth();
  const me = user ? movie.user_movies.find((u) => u.user_id === user.id) : null;
  const [busy, setBusy] = useState(false);

  // Derive UI state from the canonical status.
  const seenState = me?.status === 'seen' ? 'seen' : me?.status ? 'not_seen' : null;
  const wantsToSee = me?.status === 'want_to_see';

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

  // "Seen it" → status=seen with rating preserved.
  // "Haven't seen" → keep want_to_see if already set, otherwise default to
  //                  not_interested (still a response — distinguishes from null).
  async function setSeenState(next) {
    if (next === 'seen') {
      await setStatus('seen', me?.rating || 'rec');
    } else {
      await setStatus(me?.status === 'want_to_see' ? 'want_to_see' : 'not_interested');
    }
  }

  async function toggleWantToSee() {
    await setStatus(wantsToSee ? 'not_interested' : 'want_to_see');
  }

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
            <span className="pill good">Bechdel ✓</span>
          ) : movie.bechdel_passes === 0 || movie.bechdel_passes === false ? (
            <span className="pill bad">Bechdel ✗</span>
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

            <div style={{ marginTop: '0.5rem' }}>
              <SegmentedControl
                value={seenState}
                onChange={setSeenState}
                options={SEEN_OPTIONS}
                disabled={busy}
              />
              {seenState === 'seen' ? (
                <div style={{ marginTop: '0.5rem' }}>
                  <RatingPicker value={me.rating} onChange={(r) => setStatus('seen', r)} disabled={busy} />
                </div>
              ) : (
                <button
                  type="button"
                  className={`want-pill${wantsToSee ? ' active' : ''}`}
                  onClick={toggleWantToSee}
                  disabled={busy}
                  aria-pressed={wantsToSee}
                  style={{ marginTop: '0.5rem' }}
                >
                  {wantsToSee ? '✓ Want to see' : 'Want to see?'}
                </button>
              )}
            </div>

            {others.length > 0 && (
              <div className="meta" style={{ marginTop: '0.5rem' }}>
                {others
                  .map((u) => `${u.name}: ${STATUS_LABEL[u.status]}${u.status === 'seen' && u.rating ? ` (${RATING_LABEL[u.rating]})` : ''}`)
                  .join(' · ')}
              </div>
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

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { RATING_LABEL } from './RatingPicker.jsx';
import RatingControls from './RatingControls.jsx';
import { useAuth } from '../auth.jsx';
import { shouldShowNewBadge } from '../newBadge.js';

// Buckets render the per-user breakdown as a row of clickable emoji+count
// pills instead of one line per name. Order matches the rating gradient,
// then catch-all states, then the side want-to-see flag.
const OTHER_BUCKETS = [
  { key: 'high_rec',         emoji: '😍', label: RATING_LABEL.high_rec,         match: (u) => u.status === 'seen' && u.rating === 'high_rec' },
  { key: 'rec',              emoji: '🙂', label: RATING_LABEL.rec,              match: (u) => u.status === 'seen' && u.rating === 'rec' },
  { key: 'neutral',          emoji: '😐', label: RATING_LABEL.neutral,          match: (u) => u.status === 'seen' && u.rating === 'neutral' },
  { key: 'dont_like',        emoji: '🙁', label: RATING_LABEL.dont_like,        match: (u) => u.status === 'seen' && u.rating === 'dont_like' },
  { key: 'really_dont_like', emoji: '🤮', label: RATING_LABEL.really_dont_like, match: (u) => u.status === 'seen' && u.rating === 'really_dont_like' },
  { key: 'seen_no_rating',   emoji: '👁', label: 'Seen, no rating',             match: (u) => u.status === 'seen' && !u.rating },
  { key: 'not_seen',         emoji: '🚫', label: "Haven't seen",                match: (u) => u.status && u.status !== 'seen' },
  { key: 'no_response',      emoji: '❔', label: 'No response',                 match: (u) => !u.status },
  { key: 'want_to_see',      emoji: '☑', label: 'Wants to see',                match: (u) => u.interest === 'want_to_see' },
];

export default function MovieCard({ movie, onChange }) {
  const { user } = useAuth();
  const me = user ? movie.user_movies.find((u) => u.user_id === user.id) : null;
  const [busy, setBusy] = useState(false);
  const [expandedBucket, setExpandedBucket] = useState(null);

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
  const buckets = OTHER_BUCKETS
    .map((b) => ({ ...b, users: others.filter(b.match) }))
    .filter((b) => b.users.length > 0);
  const expanded = buckets.find((b) => b.key === expandedBucket) || null;

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
            {shouldShowNewBadge(movie, user) && <span className="new-badge">NEW</span>}
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
            {buckets.length > 0 && (
              <div className="others-summary">
                <div className="others-buckets">
                  {buckets.map((b) => {
                    const isOpen = expandedBucket === b.key;
                    return (
                      <button
                        key={b.key}
                        type="button"
                        className={`others-bucket${isOpen ? ' active' : ''}`}
                        onClick={() => setExpandedBucket(isOpen ? null : b.key)}
                        title={b.label}
                        aria-label={`${b.label}: ${b.users.length}`}
                        aria-expanded={isOpen}
                      >
                        <span className="others-bucket-emoji">{b.emoji}</span>
                        <span className="others-bucket-count">{b.users.length}</span>
                      </button>
                    );
                  })}
                </div>
                {expanded && (
                  <div className="others-bucket-names">
                    {expanded.users.map((u, i) => (
                      <span key={u.user_id}>
                        {i > 0 ? ', ' : ''}
                        <Link to={`/users/${u.user_id}`}>{u.name}</Link>
                      </span>
                    ))}
                  </div>
                )}
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

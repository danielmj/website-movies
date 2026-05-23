import { useState } from 'react';
import { api } from '../api.js';
import RatingPicker from './RatingPicker.jsx';
import SegmentedControl from './SegmentedControl.jsx';
import { useAuth } from '../auth.jsx';

const SEEN_OPTIONS = [
  ['seen', 'Seen it'],
  ['not_seen', "Haven't seen"],
];

// Shared block for setting the current user's status / rating / want_to_see
// on a movie. Used both inside MovieCard (vertical card body) and
// MovieListItem (horizontal list row). Callers pass a `compact` flag to
// toggle a tighter layout for narrow contexts.
//
// `me` is the current user's user_movies row (or null/undefined). `onChange`
// is called after every successful update so the parent can re-fetch.
export default function RatingControls({ movie, me, onChange, compact = false }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const seenState = me?.status === 'seen' ? 'seen' : me?.status ? 'not_seen' : null;
  const wantsToSee = !!me?.want_to_see;

  async function setStatus(status, rating = null) {
    setBusy(true);
    try {
      if (status === 'seen' && !rating) rating = me?.rating || 'rec';
      await api.put(`/api/ratings/${movie.id}`, { status, rating });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function setSeenState(next) {
    if (next === 'seen') await setStatus('seen', me?.rating || 'rec');
    else await setStatus('not_interested');
  }

  async function toggleWantToSee() {
    setBusy(true);
    try {
      await api.put(`/api/ratings/${movie.id}`, { want_to_see: !wantsToSee });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  // Don't bubble taps to the surrounding link/card.
  function stop(e) { e.stopPropagation(); e.preventDefault(); }

  return (
    <div
      className={`rating-controls${compact ? ' compact' : ''}`}
      onClick={stop}
      onMouseDown={stop}
    >
      <SegmentedControl
        value={seenState}
        onChange={setSeenState}
        options={SEEN_OPTIONS}
        disabled={busy}
      />
      <button
        type="button"
        className={`want-pill${wantsToSee ? ' active' : ''}`}
        onClick={toggleWantToSee}
        disabled={busy}
        aria-pressed={wantsToSee}
      >
        <span aria-hidden="true">{wantsToSee ? '☑' : '☐'}</span>
        {' '}Want to see
      </button>
      {seenState === 'seen' && (
        <RatingPicker value={me.rating} onChange={(r) => setStatus('seen', r)} disabled={busy} />
      )}
    </div>
  );
}

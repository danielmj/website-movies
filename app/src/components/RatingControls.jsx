import { useState } from 'react';
import { api } from '../api.js';
import RatingPicker, { SEEN_OPTIONS, INTEREST_OPTIONS } from './RatingPicker.jsx';
import SegmentedControl from './SegmentedControl.jsx';
import { useAuth } from '../auth.jsx';

// Shared block for setting the current user's seen / interest / rating on a
// movie. Used both inside MovieCard (vertical card body) and MovieListItem
// (horizontal list row). Callers pass a `compact` flag to toggle a tighter
// layout for narrow contexts.
//
// `me` is the current user's user_movies row (or null/undefined). `onChange`
// is called after every successful update so the parent can re-fetch.
export default function RatingControls({ movie, me, onChange, compact = false }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const seenState = me?.status === 'seen' ? 'seen' : me?.status ? 'not_seen' : null;
  // Server defaults missing rows to 'indifferent', but we render that
  // explicitly so the segmented control always has a selected segment.
  const interest = me?.interest || 'indifferent';

  async function setSeen(next) {
    setBusy(true);
    try {
      const status = next === 'seen' ? 'seen' : 'not_interested';
      const rating = next === 'seen' ? (me?.rating || 'rec') : null;
      await api.put(`/api/ratings/${movie.id}`, { status, rating });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function setRating(rating) {
    setBusy(true);
    try {
      await api.put(`/api/ratings/${movie.id}`, { status: 'seen', rating });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function setInterest(next) {
    setBusy(true);
    try {
      await api.put(`/api/ratings/${movie.id}`, { interest: next });
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
        onChange={setSeen}
        options={SEEN_OPTIONS}
        disabled={busy}
      />
      <SegmentedControl
        value={interest}
        onChange={setInterest}
        options={INTEREST_OPTIONS}
        disabled={busy}
      />
      {seenState === 'seen' && (
        <RatingPicker value={me.rating} onChange={setRating} disabled={busy} />
      )}
    </div>
  );
}

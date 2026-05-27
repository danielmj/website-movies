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
  // True after the user picks "Seen it" with no saved rating. We hold off
  // persisting anything until they pick an emoji so the user_movies row
  // (and the parent's "needs response" border) stays in its un-rated state.
  const [pendingSeen, setPendingSeen] = useState(false);
  if (!user) return null;

  const persistedSeen = me?.status === 'seen' ? 'seen' : me?.status ? 'not_seen' : null;
  const seenState = pendingSeen ? 'seen' : persistedSeen;
  // Server defaults missing rows to 'indifferent', but we render that
  // explicitly so the segmented control always has a selected segment.
  const interest = me?.interest || 'indifferent';

  async function setSeen(next) {
    if (next === 'seen') {
      // Re-affirming "seen" with an existing rating: just persist.
      // Otherwise enter pending mode and wait for the rating click.
      if (me?.rating) {
        setBusy(true);
        try {
          await api.put(`/api/ratings/${movie.id}`, { status: 'seen', rating: me.rating });
          onChange();
        } finally {
          setBusy(false);
        }
      } else {
        setPendingSeen(true);
      }
      return;
    }
    setBusy(true);
    try {
      await api.put(`/api/ratings/${movie.id}`, { status: 'not_interested', rating: null });
      setPendingSeen(false);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function setRating(rating) {
    setBusy(true);
    try {
      await api.put(`/api/ratings/${movie.id}`, { status: 'seen', rating });
      setPendingSeen(false);
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
        <RatingPicker value={pendingSeen ? null : me?.rating} onChange={setRating} disabled={busy} />
      )}
    </div>
  );
}

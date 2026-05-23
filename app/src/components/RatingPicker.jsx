// Full names are kept for places with room (detail page, profile, "others'
// status" line). The picker itself uses emoji pills below.
const RATINGS_FULL = [
  ['high_rec', 'Highly recommend'],
  ['rec', 'Recommend'],
  ['neutral', 'Neutral'],
  ['dont_like', "Don't recommend"],
  ['really_dont_like', 'Despise'],
];

// Each rating renders as its own standalone emoji pill — five separate
// buttons so the layout stays a single row even on narrow cards. Order
// matches the gradient love → hate.
const RATING_EMOJIS = [
  ['high_rec', '😍'],
  ['rec', '🙂'],
  ['neutral', '😐'],
  ['dont_like', '🙁'],
  ['really_dont_like', '🤮'],
];

// Map { rating-key → emoji } for callers that just want to render the
// emoji next to a rating string elsewhere in the UI (e.g. the per-user
// breakdown on cards).
export const RATING_EMOJI = Object.fromEntries(RATING_EMOJIS);

// RATINGS is still exported (key/label tuple list) for any caller that
// wants the canonical short labels — "Love", "Like", etc.
export const RATINGS = [
  ['high_rec', 'Love'],
  ['rec', 'Like'],
  ['neutral', 'Meh'],
  ['dont_like', 'Eh'],
  ['really_dont_like', 'Hate'],
];

// Seen / haven't-seen and interest are now two separate segmented controls.
// SEEN_OPTIONS drives the binary "have you watched it" prompt; INTEREST_OPTIONS
// drives "do you want to watch it (again) with the group". They're decoupled
// so a user who has seen a film can still flag "want to see again".
export const SEEN_OPTIONS = [
  ['seen', 'Seen it'],
  ['not_seen', "Haven't seen"],
];

export const INTEREST_OPTIONS = [
  ['want_to_see',    'Want to see'],
  ['indifferent',    'Indifferent'],
  ['not_interested', 'Not interested'],
];

export const INTEREST_LABEL = Object.fromEntries(INTEREST_OPTIONS);

export const RATING_LABEL = Object.fromEntries(RATINGS_FULL);
export const POSITIVE_RATINGS = new Set(['high_rec', 'rec']);

export default function RatingPicker({ value, onChange, disabled }) {
  return (
    <div className="rating-pills" role="radiogroup" aria-label="Rating">
      {RATING_EMOJIS.map(([key, emoji]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          aria-label={RATING_LABEL[key]}
          title={RATING_LABEL[key]}
          className={`rating-pill${value === key ? ' active' : ''}`}
          disabled={disabled}
          onClick={() => onChange(key)}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

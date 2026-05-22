import SegmentedControl from './SegmentedControl.jsx';

// Short labels are what fits inside a narrow movie card. Full labels are
// kept around for places with more room (detail page, "others' status" line,
// session summaries) so the meaning isn't lost.
const RATINGS_FULL = [
  ['high_rec', 'Highly recommend'],
  ['rec', 'Recommend'],
  ['neutral', 'Neutral'],
  ['dont_like', "Don't recommend"],
  ['really_dont_like', 'Despise'],
];

export const RATINGS = [
  ['high_rec', 'Love'],
  ['rec', 'Like'],
  ['neutral', 'Meh'],
  ['dont_like', 'Eh'],
  ['really_dont_like', 'Hate'],
];

export const STATUSES = [
  ['want_to_see', 'Want to see'],
  ['seen', 'Seen it'],
  ['not_interested', 'Not interested'],
];

export const RATING_LABEL = Object.fromEntries(RATINGS_FULL);
export const STATUS_LABEL = Object.fromEntries(STATUSES);
export const POSITIVE_RATINGS = new Set(['high_rec', 'rec']);

export default function RatingPicker({ value, onChange, disabled }) {
  return <SegmentedControl value={value} onChange={onChange} options={RATINGS} disabled={disabled} />;
}

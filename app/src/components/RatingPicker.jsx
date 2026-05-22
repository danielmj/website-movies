import SegmentedControl from './SegmentedControl.jsx';

export const RATINGS = [
  ['high_rec', 'Highly recommend'],
  ['rec', 'Recommend'],
  ['neutral', 'Neutral'],
  ['dont_like', "Don't recommend"],
  ['really_dont_like', 'Despise'],
];

export const STATUSES = [
  ['want_to_see', 'Want to see'],
  ['seen', 'Seen it'],
  ['not_interested', 'Not interested'],
];

export const RATING_LABEL = Object.fromEntries(RATINGS);
export const STATUS_LABEL = Object.fromEntries(STATUSES);
export const POSITIVE_RATINGS = new Set(['high_rec', 'rec']);

export default function RatingPicker({ value, onChange, disabled }) {
  return <SegmentedControl value={value} onChange={onChange} options={RATINGS} disabled={disabled} />;
}

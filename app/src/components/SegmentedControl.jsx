// Pill-style segmented control. Wraps cleanly on narrow screens.
// Use for small mutually-exclusive option sets (status, rating, etc).
export default function SegmentedControl({ value, onChange, options, disabled }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          className={value === key ? 'active' : ''}
          disabled={disabled}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

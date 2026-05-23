// Changelog-ish "what's new" page. Newest entries on top. Each entry is a
// dated header with bullets describing the changes.
const ENTRIES = [
  {
    date: '2026-05-23',
    title: 'A whole evening of changes',
    bullets: [
      'New: drink pairing on every movie detail page — pick your cocktail, beer, wine, or shot based on the movie\'s genre and decade.',
      'New: profile stats panel — Bechdel donut, top three genres, hours watched, recommended-rate, favourite decade, and a few other metrics.',
      'New: Maybe Movie history view, with admin delete. See past sessions whether they were watched or cancelled, plus who attended.',
      'New: home-page banner that nudges attendees to update their rating after a Maybe Movie session ends. Auto-supersedes when a newer session ends.',
      'New: comments on movies — anyone can read, signed-in users can post, edit, and delete their own.',
      'New: weekly background job that pulls bechdeltest.com\'s RSS feed and adds any newly-rated movies to our local database.',
      'New: footer with Careers, FAQ, and (this) What\'s New page.',
      'New: 🎲 Random button on the Maybe Movie page — picks a filtered movie and scrolls/highlights it.',
      'New: "Perhaps not" button replaces "End session" with a fun mental-health check-in modal. Answers are not stored — just a wink.',
      'New: "Hide if not interested" filter pill on Maybe Movie.',
      'Changed: filter checkbox pills now sit side by side and only wrap when they have to.',
      'Changed: rating segmented controls and emoji pills shrink-to-fit on narrow screens instead of wrapping.',
      'Changed: rating model split into seen/not-seen and a separate Want-to-see / Indifferent / Not-interested axis.',
      'Changed: admin user table column "Movies" renamed to "Movies rated" and now counts only entries with a rating attached.',
      'Changed: Add Movie page got a back button that mirrors "Pick a different one".',
      'Changed: movie list now restores scroll position when you back out of a movie detail page.',
      'Changed: "added by" moved out of the meta line and below the notes block on movie details.',
      'Removed: Bechdel API usage meter from the admin panel — bechdel data is fully internal now.',
      'Fixed: bechdel sync — admins can now backfill cached bechdel results onto movies imported before bechdel data became available.',
    ],
  },
  {
    date: '2026-05-22',
    title: 'Seen / Interest split + filter UX',
    bullets: [
      'Refactored the rating UI into a Seen/Haven\'t-seen segmented control plus a separate Want to see / Indifferent / Not interested axis.',
      'Maybe Movie filters reorganized into a single wrapping row of pills.',
      'Bechdel browse now searches across the entire dataset (passes and fails) instead of just the latest 3 years.',
    ],
  },
];

export default function WhatsNew() {
  return (
    <div className="container">
      <h1 style={{ marginTop: 0 }}>What's new</h1>
      <p style={{ color: 'var(--muted)' }}>
        A roughly-chronological log of changes. Newest at the top.
      </p>
      {ENTRIES.map((entry) => (
        <section key={entry.date} className="card whatsnew-entry">
          <div className="whatsnew-head">
            <h2 style={{ margin: 0 }}>{entry.title}</h2>
            <span className="whatsnew-date">{entry.date}</span>
          </div>
          <ul className="whatsnew-list">
            {entry.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}

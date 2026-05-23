// Tongue-in-cheek careers page. None of these are real openings — the
// page exists because it's funny, and because every "real" website has a
// careers page tucked in the footer.
const POSITIONS = [
  {
    title: 'Senior Vibes Curator',
    type: 'Full-time, on couch',
    body: `You will determine, on a per-Monday basis, whether the vibe is
    "comedy night" or "we deserve to feel something". Strong candidates can
    distinguish between "fun crying" and "regular crying". Equity available
    in the form of dibs on the corner spot.`,
  },
  {
    title: 'VP of Pausing For Snack Breaks',
    type: 'Part-time, salaried in pretzels',
    body: `Owns the strategic question of when to pause the movie. Reports
    directly to whoever is closest to the remote. Must be able to identify a
    natural narrative beat with 80% accuracy and never, under any
    circumstances, pause during dialogue.`,
  },
  {
    title: 'Chief Bechdel Officer',
    type: 'Advisory role, lifetime tenure',
    body: `Tracks the Bechdel performance of the watched-list quarter over
    quarter. Must be comfortable saying "actually, that scene didn't count"
    in a kind but firm tone. Bonus points if you've ever drafted a
    Letterboxd review longer than the movie's runtime.`,
  },
  {
    title: 'Director of Maybe-but-Probably-Not',
    type: 'Contract',
    body: `Eight weeks per year. Owns the "I'd watch it but..." pipeline —
    the long tail of movies everyone has tagged "want to see" but no one
    will ever actually agree to put on. Performance reviews tied to
    measurable conversion of indifference into watched movies.`,
  },
  {
    title: 'Head of Snacks (Hot Bar)',
    type: 'Internship → full-time',
    body: `Owns warm snacks (popcorn, mozzarella sticks, anything that
    requires reheating). Coordinates with Head of Snacks (Cold Bar). Must
    not microwave fish under any circumstances.`,
  },
  {
    title: 'Chief Subtitles Strategist',
    type: 'Tactical',
    body: `Decides whether subtitles go on at the start of every movie. The
    answer is yes. The role is mostly about being firm about it.`,
  },
  {
    title: 'Trailer Triage Coordinator',
    type: 'On-call',
    body: `Handles the awkward moment where someone has already seen the
    trailer and is now telegraphing every plot beat. Diplomatic, swift,
    occasionally requires a hand-on-shoulder intervention.`,
  },
  {
    title: 'Designated Quiet One',
    type: 'Volunteer',
    body: `Will be approached during the slow second act to be asked
    "are you okay?" Must respond with a calm, knowing nod and continue
    watching as if nothing happened. We need exactly one of these per
    Monday — overhiring is fatal.`,
  },
];

export default function Careers() {
  return (
    <div className="container">
      <h1 style={{ marginTop: 0 }}>Careers</h1>
      <p style={{ color: 'var(--muted)' }}>
        Maybe Movie Mondays is hiring for several non-existent positions.
        All compensation is non-monetary and non-negotiable. Email your
        resume to whoever is hosting this week.
      </p>
      <div className="careers-grid">
        {POSITIONS.map((p) => (
          <section key={p.title} className="card careers-card">
            <h3 style={{ marginTop: 0 }}>{p.title}</h3>
            <div className="careers-meta">{p.type}</div>
            <p style={{ marginBottom: 0 }}>{p.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

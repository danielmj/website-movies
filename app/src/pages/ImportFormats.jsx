import { Link } from 'react-router-dom';

// Reference doc for the various JSON shapes the admin import endpoints
// accept. Linked from each import section on the admin page so future-you
// (or anyone borrowing the code) can find the format without spelunking
// the server source.
export default function ImportFormats() {
  return (
    <div className="container">
      <Link to="/admin" style={{ color: 'var(--muted)' }}>← Admin</Link>
      <h1 style={{ marginTop: '0.75rem' }}>Admin import formats</h1>
      <p style={{ color: 'var(--muted)' }}>
        Each section lists the JSON shape the corresponding admin import
        section expects, plus where it ends up in the database.
      </p>

      <Section title="1. Movie titles → /api/admin/movies/import-titles">
        <p>
          For seeding the <code>movies</code> table from a list of titles.
          Each title is searched on TMDB; ambiguous matches are resolved in
          the UI before commit, then the regular full-metadata fetch
          (TMDB + OMDb + Bechdel) runs to populate every column.
        </p>
        <Code>{`[
  { "title": "Inglourious Basterds" },
  { "title": "Bullet Train", "added_by": "Blair" },
  { "title": "Firefly", "added_by": ["Jay", "Dan"] }
]`}</Code>
        <Field name="title" required>The movie title to search for. Required.</Field>
        <Field name="added_by">
          String or array of strings. Stored verbatim in
          <code> movies.notes </code>(prefixed with "Added by:") for
          downstream filtering / display.
        </Field>
      </Section>

      <Section title="2. Full movie dump → /api/admin/movies/import">
        <p>
          For round-tripping a previous export back into a fresh database.
          Use the dump produced by <strong>Export movies (JSON)</strong> —
          import is idempotent (matches by <code>tmdb_id</code> /
          <code>imdb_id</code>, updates existing rows, dedupes watch
          events).
        </p>
        <Code>{`{
  "version": 1,
  "exported_at": "2026-...",
  "movies": [
    {
      "tmdb_id": 693134,
      "imdb_id": "tt15239678",
      "title": "Dune: Part Two",
      "year": 2024,
      ...
      "genres": ["Science Fiction", "Adventure"],
      "user_movies": [
        { "user_email": "x@y.com", "status": "seen", "rating": "rec" }
      ],
      "watch_events": [
        { "watched_at": "2024-03-15", "notes": "" }
      ]
    }
  ]
}`}</Code>
      </Section>

      <Section title="3. Bechdel data → /api/admin/bechdel/import-titles">
        <p>
          For adding rows to the local <code>bechdel_movies</code> table.
          Each entry is matched to a TMDB title to recover its IMDb id, then
          upserted (existing rows are overwritten). If you already have the
          IMDb id, drop it in the entry and the TMDB step is skipped.
        </p>
        <Code>{`[
  { "title": "Dune: Part Two", "year": 2024, "passes": true },
  { "title": "Wicked: For Good", "year": 2025, "passes": true },
  { "title": "Snow White",       "year": 2025, "passes": false }
]

// or, with imdb_id directly (skips TMDB lookup):

[
  { "imdb_id": "tt15239678", "title": "Dune: Part Two", "year": 2024, "passes": true }
]`}</Code>
        <Field name="title" required>Title — used for the TMDB search. Required.</Field>
        <Field name="year">
          Year — used as a tie-breaker on TMDB candidates.
          Strongly recommended for sequels and remakes.
        </Field>
        <Field name="passes" required>
          Boolean — does the movie pass the Bechdel test (at least
          two named women have a conversation about something other
          than a man). Editable per-row in the admin UI before commit.
        </Field>
        <Field name="imdb_id">
          Optional. If present, TMDB is skipped entirely and the entry
          goes straight to <code>auto</code> status.
        </Field>
      </Section>

      <Section title="4. Useful notes">
        <ul>
          <li><strong>Idempotency:</strong> bechdel + dump imports use
            upsert semantics. Re-running the same JSON is a safe no-op (or
            an update if values changed). The titles import skips
            already-added movies.</li>
          <li><strong>Year hints help.</strong> TMDB has many "Snow White"s.
            Including <code>year</code> drops most rows from
            <code> needs_confirm </code>to <code>auto</code>.</li>
          <li><strong>UTF-8 only</strong> for titles. Smart quotes, accented
            characters, etc. are fine — JSON.parse and the upstream APIs
            handle them.</li>
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="card" style={{ marginTop: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

function Code({ children }) {
  return (
    <pre style={{
      background: 'var(--panel-2)',
      padding: '0.75rem',
      borderRadius: 6,
      fontSize: '0.8rem',
      overflowX: 'auto',
    }}>{children}</pre>
  );
}

function Field({ name, required, children }) {
  return (
    <div style={{ marginTop: '0.4rem', fontSize: '0.9rem' }}>
      <code><strong>{name}</strong></code>
      {required && <span style={{ color: 'var(--accent-2)', fontSize: '0.75rem' }}> required</span>}
      <span style={{ color: 'var(--muted)' }}> — {children}</span>
    </div>
  );
}

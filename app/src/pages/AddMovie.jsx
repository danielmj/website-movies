import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import RatingPicker, { SEEN_OPTIONS, INTEREST_OPTIONS } from '../components/RatingPicker.jsx';
import SegmentedControl from '../components/SegmentedControl.jsx';

// Two browse modes: TMDB search-as-you-type (default) and a locally-loaded
// list of every Bechdel-passing movie. The same search bar drives both:
// in TMDB mode it submits to /search, in Bechdel mode it filters the list
// client-side as you type.
const MODES = [
  { key: 'search',  label: 'Search all movies' },
  { key: 'bechdel', label: 'Browse Bechdel passers' },
];

export default function AddMovie() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const initialQ = searchParams.get('q') || '';
  const returnTo = location.state?.from || '/';

  const [mode, setMode] = useState('search');
  const [q, setQ] = useState(initialQ);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Bechdel mode: we fetch the full dataset once and filter client-side.
  // ~10k entries — totally fine in memory, and keeps typing responsive
  // without round-trips. Searches span pass + fail.
  const [bechdelList, setBechdelList] = useState(null);
  const [bechdelLoading, setBechdelLoading] = useState(false);

  // Once a result is picked we fetch full metadata WITHOUT saving. The movie
  // and the user's rating are only persisted when "Add to list" is clicked.
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [seenState, setSeenState] = useState('not_seen');
  const [interest, setInterest] = useState('want_to_see');
  const [rating, setRating] = useState('rec');
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState(null);

  // If we arrived with ?q=... pre-filled (from MovieList / MaybeMovie quick-add),
  // run the search immediately so the user sees results without an extra tap.
  useEffect(() => {
    if (initialQ.trim()) doSearch(initialQ.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doSearch(query) {
    setSearching(true);
    setErr(null);
    try {
      setResults(await api.get(`/api/movies/search?q=${encodeURIComponent(query)}`));
    } catch (e) {
      setErr(e.message);
    } finally {
      setSearching(false);
    }
  }

  async function search(e) {
    e.preventDefault();
    if (mode === 'search') await doSearch(q);
    // In bechdel mode the filter is reactive — no submit needed.
  }

  async function loadBechdel() {
    if (bechdelList || bechdelLoading) return;
    setBechdelLoading(true);
    setErr(null);
    try {
      // Server returns the full bechdel_movies table (both passes and
      // fails). We filter by title client-side as the user types.
      setBechdelList(await api.get('/api/movies/bechdel-list'));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBechdelLoading(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setErr(null);
    if (next === 'bechdel') loadBechdel();
  }

  // Default view (no query): just the latest 3 years available so the page
  // doesn't render 10k rows on first paint. As soon as the user types, we
  // search across the entire dataset — passes and fails alike.
  const filteredBechdel = useMemo(() => {
    if (!bechdelList) return [];
    const needle = q.trim().toLowerCase();
    if (needle) {
      return bechdelList.filter((m) => m.title.toLowerCase().includes(needle));
    }
    if (!bechdelList.length) return [];
    const maxYear = bechdelList[0].year;
    return bechdelList.filter((m) => m.year >= maxYear - 2);
  }, [bechdelList, q]);

  async function pickByTmdb(r) {
    setPreviewLoading(true);
    setErr(null);
    try {
      setPreview(await api.get(`/api/movies/preview/${r.tmdb_id}`));
    } catch (e) {
      setErr(e.message);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function pickByImdb(r) {
    setPreviewLoading(true);
    setErr(null);
    try {
      setPreview(await api.get(`/api/movies/preview-by-imdb/${r.imdb_id}`));
    } catch (e) {
      setErr(`${e.message}${e.status === 404 ? ' (TMDB doesn\'t have this title — pick a different one)' : ''}`);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function addToList() {
    setAdding(true);
    setErr(null);
    try {
      const { id } = await api.post('/api/movies', { tmdb_id: preview.tmdb_id });
      // Map UI-side seen/not_seen back to the persisted status enum
      // (UI's "Haven't seen" → 'not_interested' on the wire).
      const status = seenState === 'seen' ? 'seen' : 'not_interested';
      await api.put(`/api/ratings/${id}`, {
        status,
        rating: status === 'seen' ? rating : null,
        interest,
      });
      navigate(returnTo);
    } catch (e) {
      setErr(e.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="container">
      <h1 style={{ marginTop: 0, marginBottom: '1rem' }}>Add a movie</h1>

      {!preview && !previewLoading && (
        <>
          <div className="auth-methods" role="tablist" aria-label="Add mode" style={{ marginBottom: '1rem' }}>
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={mode === m.key}
                className={mode === m.key ? 'active' : ''}
                onClick={() => switchMode(m.key)}
              >{m.label}</button>
            ))}
          </div>

          <form onSubmit={search} className="row">
            <input
              type="text"
              placeholder={mode === 'search' ? 'Search by title…' : 'Filter Bechdel-passing movies…'}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
              style={{ flex: 1 }}
            />
            {mode === 'search' && (
              <button className="primary" disabled={!q.trim() || searching}>Search</button>
            )}
          </form>
          {err && <div className="error">{err}</div>}

          {mode === 'search' && (
            <div className="search-results">
              {results.map((r) => (
                <div key={r.tmdb_id} className="search-result" onClick={() => pickByTmdb(r)}>
                  <div
                    className="poster"
                    style={r.poster_url ? { backgroundImage: `url(${r.poster_url})` } : {}}
                  />
                  <div className="body">
                    <h4>{r.title}</h4>
                    <div className="meta">{r.year || '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {mode === 'bechdel' && (
            <BechdelList
              loading={bechdelLoading}
              total={bechdelList?.length || 0}
              shown={filteredBechdel.length}
              filter={q}
              items={filteredBechdel}
              onPick={pickByImdb}
            />
          )}
        </>
      )}

      {previewLoading && <div className="card">Loading details…</div>}

      {preview && (
        <div className="preview-card">
          <div className="preview-grid">
            <div
              className="preview-poster"
              style={preview.poster_url ? { backgroundImage: `url(${preview.poster_url})` } : {}}
            />
            <div className="preview-info">
              <h2>
                {preview.title}{' '}
                {preview.year && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({preview.year})</span>}
              </h2>
              <div className="meta-row">
                {preview.duration_minutes && <span>{preview.duration_minutes} min</span>}
                {preview.imdb_rating && <span>⭐ {preview.imdb_rating} IMDb</span>}
                {preview.decade && <span>{preview.decade}s</span>}
              </div>
              <div className="pills" style={{ marginTop: '0.5rem' }}>
                {preview.bechdel_passes === true && <span className="pill good">Bechdel ✓</span>}
                {preview.bechdel_passes === false && <span className="pill bad">Bechdel ✗</span>}
                {preview.bechdel_passes === null && <span className="pill">Bechdel: unknown</span>}
                {(preview.genres || []).map((g) => (
                  <span key={g} className="pill">{g}</span>
                ))}
              </div>
              {preview.overview && <p className="overview">{preview.overview}</p>}
            </div>
          </div>

          <div className="preview-actions">
            <div className="field">
              <label>Seen it?</label>
              <SegmentedControl value={seenState} onChange={setSeenState} options={SEEN_OPTIONS} />
            </div>

            <div className="field">
              <label>Interest</label>
              <SegmentedControl value={interest} onChange={setInterest} options={INTEREST_OPTIONS} />
            </div>

            {seenState === 'seen' && (
              <div className="field">
                <label>Your rating</label>
                <RatingPicker value={rating} onChange={setRating} />
              </div>
            )}

            {err && <div className="error">{err}</div>}

            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button onClick={() => { setPreview(null); setErr(null); }} disabled={adding}>
                Pick a different one
              </button>
              <button className="primary" onClick={addToList} disabled={adding}>
                {adding ? 'Adding…' : 'Add to list'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Tall grouped-by-year list of movies in the bechdel dataset. Default view
// shows the latest 3 years; typing in the search bar filters across the
// whole table (passes and fails). Click → re-fetch via /preview-by-imdb to
// surface poster + runtime + IMDb rating before the user commits.
function BechdelList({ loading, total, shown, filter, items, onPick }) {
  if (loading) return <div className="card" style={{ marginTop: '1rem' }}>Loading the Bechdel list…</div>;
  if (!total) return null;
  const filtering = filter.trim() !== '';

  // Group by year, preserving the server's newest-first order.
  const byYear = [];
  let lastYear = null;
  for (const m of items) {
    if (m.year !== lastYear) {
      byYear.push({ year: m.year, movies: [] });
      lastYear = m.year;
    }
    byYear[byYear.length - 1].movies.push(m);
  }

  return (
    <>
      <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
        {filtering
          ? `${shown.toLocaleString()} match${shown === 1 ? '' : 'es'} for "${filter.trim()}"`
          : `Showing the latest 3 years (${shown.toLocaleString()} movies) — type to search the full ${total.toLocaleString()}-title dataset`}
      </div>
      {byYear.map((group) => (
        <div key={group.year} className="bechdel-year-group">
          <h3 className="bechdel-year-heading">{group.year}</h3>
          <ul className="bechdel-list">
            {group.movies.map((m) => (
              <li key={m.imdb_id}>
                <button type="button" className="bechdel-row" onClick={() => onPick(m)}>
                  <span className={`pill ${m.passes ? 'good' : 'bad'} bechdel-status`}>
                    {m.passes ? 'Pass' : 'Fail'}
                  </span>
                  <span className="title">{m.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

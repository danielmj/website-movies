import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import RatingPicker, { STATUSES } from '../components/RatingPicker.jsx';
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

  // Bechdel mode: we fetch the full passing list once (cached on the server
  // for an hour) and filter client-side. ~10k entries — totally fine in
  // memory, and keeps typing responsive without round-trips.
  const [bechdelList, setBechdelList] = useState(null);
  const [bechdelLoading, setBechdelLoading] = useState(false);

  // Once a result is picked we fetch full metadata WITHOUT saving. The movie
  // and the user's rating are only persisted when "Add to list" is clicked.
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [status, setStatus] = useState('want_to_see');
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
      setBechdelList(await fetchBechdelDirect());
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

  // Fetch the Bechdel-passing list directly from bechdeltest.com (their API
  // serves CORS, so the browser can call it with no proxy). Try the bulk
  // getAllMovies endpoint first; on failure (it sometimes returns 410),
  // fall back to per-year fetches for the last 30 years in parallel batches.
  async function fetchBechdelDirect() {
    const norm = (raw) => raw
      .filter((m) => Number(m.rating) === 3 && m.imdbid && m.title)
      .map((m) => ({
        imdb_id: 'tt' + String(m.imdbid),
        title: m.title,
        year: m.year ? Number(m.year) : null,
      }))
      .sort((a, b) => (b.year || 0) - (a.year || 0));

    try {
      const r = await fetch('https://bechdeltest.com/api/v1/getAllMovies');
      if (r.ok) {
        const all = await r.json();
        if (Array.isArray(all) && all.length) return norm(all);
      }
    } catch { /* fall through to per-year */ }

    const thisYear = new Date().getFullYear();
    const years = [];
    for (let y = thisYear; y > thisYear - 30; y--) years.push(y);
    const collected = [];
    const batchSize = 6;
    for (let i = 0; i < years.length; i += batchSize) {
      const arrays = await Promise.all(years.slice(i, i + batchSize).map(async (y) => {
        try {
          const r = await fetch(`https://bechdeltest.com/api/v1/getMoviesByYear?year=${y}`);
          if (!r.ok) return [];
          return await r.json();
        } catch { return []; }
      }));
      for (const a of arrays) if (Array.isArray(a)) collected.push(...a);
    }
    return norm(collected);
  }

  // Filter happens here, not on the server, so typing is instant. Limit
  // the rendered list to a reasonable number — DOM gets unhappy past
  // ~1000 items and there's no point scrolling 10k titles.
  const filteredBechdel = useMemo(() => {
    if (!bechdelList) return [];
    const needle = q.trim().toLowerCase();
    const list = needle
      ? bechdelList.filter((m) => m.title.toLowerCase().includes(needle))
      : bechdelList;
    return list.slice(0, 500);
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
      await api.put(`/api/ratings/${id}`, {
        status,
        rating: status === 'seen' ? rating : null,
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
              <label>Status</label>
              <SegmentedControl value={status} onChange={setStatus} options={STATUSES} />
            </div>

            {status === 'seen' && (
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

// Tall scrollable list, one row per Bechdel-passer. Bechdeltest doesn't
// publish poster URLs so rows are text-only — we re-fetch full metadata
// (poster, runtime, genres, IMDb rating) on click via /preview-by-imdb.
function BechdelList({ loading, total, shown, filter, items, onPick }) {
  if (loading) return <div className="card" style={{ marginTop: '1rem' }}>Loading the Bechdel list…</div>;
  if (!total) return null;
  return (
    <>
      <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
        {filter.trim()
          ? `${shown.toLocaleString()} of ${total.toLocaleString()} match "${filter.trim()}"${shown >= 500 ? ' (showing first 500)' : ''}`
          : `${total.toLocaleString()} Bechdel-passing movies (showing newest 500 — type to filter)`}
      </div>
      <ul className="bechdel-list">
        {items.map((m) => (
          <li key={m.imdb_id}>
            <button type="button" className="bechdel-row" onClick={() => onPick(m)}>
              <span className="title">{m.title}</span>
              <span className="muted">{m.year || ''}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

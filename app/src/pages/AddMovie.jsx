import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import RatingPicker, { STATUSES } from '../components/RatingPicker.jsx';
import SegmentedControl from '../components/SegmentedControl.jsx';

export default function AddMovie() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Once a result is picked we fetch full metadata WITHOUT saving. The movie
  // and the user's rating are only persisted when "Add to list" is clicked.
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [status, setStatus] = useState('want_to_see');
  const [rating, setRating] = useState('rec');
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState(null);

  const navigate = useNavigate();

  async function search(e) {
    e.preventDefault();
    setSearching(true);
    setErr(null);
    try {
      setResults(await api.get(`/api/movies/search?q=${encodeURIComponent(q)}`));
    } catch (e) {
      setErr(e.message);
    } finally {
      setSearching(false);
    }
  }

  async function pick(r) {
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

  async function addToList() {
    setAdding(true);
    setErr(null);
    try {
      const { id } = await api.post('/api/movies', { tmdb_id: preview.tmdb_id });
      await api.put(`/api/ratings/${id}`, {
        status,
        rating: status === 'seen' ? rating : null,
      });
      navigate('/');
    } catch (e) {
      setErr(e.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="container">
      <h1 style={{ marginTop: 0 }}>Add a movie</h1>

      {!preview && !previewLoading && (
        <>
          <form onSubmit={search} className="row">
            <input
              type="text"
              placeholder="Search by title…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
              style={{ flex: 1 }}
            />
            <button className="primary" disabled={!q.trim() || searching}>Search</button>
          </form>
          {err && <div className="error">{err}</div>}
          <div className="search-results">
            {results.map((r) => (
              <div key={r.tmdb_id} className="search-result" onClick={() => pick(r)}>
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

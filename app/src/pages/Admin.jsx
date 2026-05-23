import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const STATUS_BADGE = {
  auto:           { label: 'auto-match',     cls: 'good' },
  needs_confirm:  { label: 'pick a match',   cls: 'warn' },
  no_results:     { label: 'no results',     cls: 'bad' },
  already_in_db:  { label: 'already added',  cls: '' },
  search_failed:  { label: 'search failed',  cls: 'bad' },
  empty:          { label: 'empty title',    cls: 'bad' },
};

export default function Admin() {
  const { user, refresh } = useAuth();
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [resetPw, setResetPw] = useState(null);
  const navigate = useNavigate();

  async function load() {
    try {
      setUsers(await api.get('/api/admin/users'));
    } catch (e) {
      setErr(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function impersonate(u) {
    if (!confirm(`Impersonate ${u.name}? You'll see the site as them until you click "Stop impersonating".`)) return;
    setBusyId(u.id);
    try {
      await api.post(`/api/admin/users/${u.id}/impersonate`);
      await refresh();
      navigate('/');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function reset(u) {
    if (!confirm(`Reset password for ${u.name}? This will sign them out everywhere.`)) return;
    setBusyId(u.id);
    try {
      const { password } = await api.post(`/api/admin/users/${u.id}/reset-password`);
      setResetPw({ user: u, password });
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function del(u) {
    if (!confirm(`Delete ${u.name}? This is permanent and cascades to their movies/ratings/votes.`)) return;
    setBusyId(u.id);
    try {
      await api.del(`/api/admin/users/${u.id}`);
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleAdmin(u) {
    setBusyId(u.id);
    try {
      await api.post(`/api/admin/users/${u.id}/toggle-admin`);
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleHidden(u) {
    setBusyId(u.id);
    try {
      await api.post(`/api/admin/users/${u.id}/toggle-hidden`);
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (err) return <div className="container error">{err}</div>;
  if (!users) return <div className="container">Loading…</div>;

  return (
    <div className="container">
      <h1 style={{ marginTop: 0 }}>Admin</h1>

      <ApiUsageMeters />

      <MovieDataTools />

      <h2 style={{ marginTop: '2rem' }}>Users</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Movies rated</th>
              <th>Last seen</th>
              <th>Joined</th>
              <th>Admin</th>
              <th>Hidden</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === user.id;
              const busy = busyId === u.id;
              return (
                <tr key={u.id} className={u.hidden ? 'admin-row-hidden' : ''}>
                  <td>{u.name}{isMe && <span style={{ color: 'var(--muted)' }}> (you)</span>}</td>
                  <td>{u.email}</td>
                  <td>{u.movies_rated}</td>
                  <td>{formatDate(u.last_seen_at)}</td>
                  <td>{formatDate(u.created_at)}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!u.is_admin}
                      disabled={isMe || busy}
                      onChange={() => toggleAdmin(u)}
                    />
                  </td>
                  <td title="Hidden users don't appear in the Maybe Movie attendee picker.">
                    <input
                      type="checkbox"
                      checked={!!u.hidden}
                      disabled={isMe || busy}
                      onChange={() => toggleHidden(u)}
                    />
                  </td>
                  <td>
                    <button onClick={() => impersonate(u)} disabled={isMe || busy}>Impersonate</button>
                    <button onClick={() => reset(u)} disabled={busy}>Reset PW</button>
                    <button className="danger" onClick={() => del(u)} disabled={isMe || busy}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {resetPw && (
        <div className="modal-backdrop" onClick={() => setResetPw(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New password for {resetPw.user.name}</h2>
            <p style={{ color: 'var(--muted)' }}>Share this once — it won't be shown again.</p>
            <code style={{
              background: 'var(--panel-2)',
              padding: '0.6rem 0.8rem',
              display: 'block',
              borderRadius: 6,
              fontSize: '1.1rem',
              wordBreak: 'break-all',
            }}>{resetPw.password}</code>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="primary" onClick={() => setResetPw(null)}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ApiUsageMeters() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  async function load() {
    try {
      setData(await api.get('/api/admin/api-usage'));
    } catch (e) {
      setErr(e.message);
    }
  }
  useEffect(() => {
    load();
    // Refresh in the background so the meter feels live without spamming.
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  if (err) return <section className="card error" style={{ marginTop: '1rem' }}>API usage: {err}</section>;
  if (!data) return null;

  return (
    <section className="card" style={{ marginTop: '1rem' }}>
      <div className="spread">
        <h2 style={{ margin: 0 }}>API usage</h2>
        <button onClick={load} style={{ fontSize: '0.85rem' }}>Refresh</button>
      </div>
      <div className="api-meters">
        {data.services.map((s) => <ApiMeter key={s.service} stats={s} />)}
      </div>
    </section>
  );
}

function ApiMeter({ stats }) {
  const {
    service, today, last_hour, last_minute, errors_total, last_call_at, total, limits,
    cost_today, cost_month_to_date, cost_month_projected, this_month,
  } = stats;
  const dailyCap = limits?.daily ?? null;
  const dailyPct = dailyCap ? Math.min(100, Math.round((today / dailyCap) * 100)) : null;
  const dailyClass = dailyPct === null ? '' : dailyPct >= 90 ? 'danger' : dailyPct >= 70 ? 'warn' : '';

  const perSecCap = limits?.per_second ?? null;
  // last_minute / 60 ≈ recent calls/sec average. Useful as an early warning
  // even though the server-side rate limiter would catch a real spike first.
  const recentRate = last_minute / 60;
  const ratePct = perSecCap ? Math.min(100, Math.round((recentRate / perSecCap) * 100)) : null;

  const hasCost = (limits?.cost_per_call || 0) > 0;

  return (
    <div className="api-meter">
      <div className="spread" style={{ alignItems: 'baseline' }}>
        <strong>{service.toUpperCase()}</strong>
        <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
          {last_call_at ? `last call ${fmtRelative(last_call_at)}` : 'no calls yet'}
        </span>
      </div>

      {dailyCap !== null ? (
        <div style={{ marginTop: '0.5rem' }}>
          <div className="meter-row">
            <span>Today</span>
            <span>{today.toLocaleString()} / {dailyCap.toLocaleString()} ({dailyPct}%)</span>
          </div>
          <div className={`meter-bar ${dailyClass}`}>
            <span style={{ width: `${dailyPct}%` }} />
          </div>
        </div>
      ) : (
        <div className="meter-row" style={{ marginTop: '0.5rem' }}>
          <span>Today</span>
          <span>{today.toLocaleString()} <span style={{ color: 'var(--muted)' }}>(no daily cap)</span></span>
        </div>
      )}

      {perSecCap !== null && (
        <div style={{ marginTop: '0.5rem' }}>
          <div className="meter-row">
            <span>Recent rate</span>
            <span>~{recentRate.toFixed(2)} / {perSecCap}/sec ({ratePct}%)</span>
          </div>
          <div className={`meter-bar ${ratePct >= 80 ? 'danger' : ratePct >= 50 ? 'warn' : ''}`}>
            <span style={{ width: `${ratePct}%` }} />
          </div>
        </div>
      )}

      {hasCost && (
        <div className="meter-row" style={{ marginTop: '0.5rem' }}>
          <span>Cost</span>
          <span>
            ${cost_today.toFixed(2)} today · ${cost_month_to_date.toFixed(2)} MTD
            {' '}<span style={{ color: 'var(--muted)' }}>
              (proj. ${cost_month_projected.toFixed(2)})
            </span>
          </span>
        </div>
      )}

      <div className="meter-row" style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.4rem' }}>
        <span>
          Last hour: {last_hour.toLocaleString()}
          {hasCost ? ` · ${this_month.toLocaleString()} this month` : ''}
          {' · 90-day total: '}{total.toLocaleString()}
        </span>
        <span>{errors_total > 0 ? `${errors_total} errors` : ''}</span>
      </div>
    </div>
  );
}

function fmtRelative(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const ms = Date.now() - d.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleString();
}

function MovieDataTools() {
  return (
    <section style={{ marginTop: '1rem' }}>
      <div className="spread" style={{ alignItems: 'baseline' }}>
        <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Movie data</h2>
        <Link to="/admin/import-formats" style={{ fontSize: '0.85rem' }}>JSON formats →</Link>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <ExportButton />
        <ImportDumpButton />
      </div>
      <ImportTitles />
      <ImportBechdel />
    </section>
  );
}

function ExportButton() {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      // The endpoint sends a Content-Disposition header; trigger a download
      // by hitting it through a hidden anchor instead of fetch+blob.
      const a = document.createElement('a');
      a.href = '/api/admin/movies/export';
      a.click();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button className="primary" onClick={go} disabled={busy}>
      {busy ? 'Exporting…' : 'Export movies (JSON)'}
    </button>
  );
}

function ImportDumpButton() {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  async function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!confirm(`Import ${f.name}? Existing movies (matched by tmdb_id/imdb_id) will be updated; new ones added.`)) {
      e.target.value = '';
      return;
    }
    setBusy(true); setErr(null);
    try {
      const text = await f.text();
      const data = JSON.parse(text);
      const r = await api.post('/api/admin/movies/import', data);
      setResult(r);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  return (
    <>
      <button onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? 'Importing…' : 'Import dump (JSON)'}
      </button>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onFile} />
      {err && <div className="error">{err}</div>}
      {result && (
        <span style={{ color: 'var(--muted)' }}>
          inserted {result.inserted} · updated {result.updated} · statuses {result.statuses_applied} · watch events {result.watch_events_added}
        </span>
      )}
    </>
  );
}

// Title-list import flow:
//   1. Paste a JSON array of { title, added_by? } objects.
//   2. Click "Search" — server hits TMDB for each title and returns candidates.
//   3. For ambiguous titles, the admin picks the right candidate.
//   4. Click "Add selected" — server commits the chosen tmdb_ids.
function ImportTitles() {
  const [text, setText] = useState(`[
  {"title": "10 Things I Hate About You", "added_by": null},
  {"title": "Inglourious Basterds", "added_by": null}
]`);
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [committed, setCommitted] = useState(null);

  async function search() {
    setErr(null);
    setCommitted(null);
    let parsed;
    try {
      parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('expected an array');
    } catch (e) {
      setErr(`couldn't parse JSON: ${e.message}`);
      return;
    }
    setBusy(true);
    try {
      const r = await api.post('/api/admin/movies/import-titles/search', { items: parsed });
      // Normalize each row into a state-bearing shape: include the chosen
      // tmdb_id (preselected for auto-matches) and a per-row "include" bool.
      const next = r.items.map((it) => ({
        ...it,
        chosen_tmdb_id: it.chosen_tmdb_id ?? null,
        include: it.status === 'auto' || it.status === 'needs_confirm',
      }));
      setItems(next);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function setChoice(idx, tmdbId) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, chosen_tmdb_id: tmdbId } : it));
  }
  function setInclude(idx, on) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, include: on } : it));
  }

  async function commit() {
    const payload = items
      .filter((it) => it.include && it.chosen_tmdb_id)
      .map((it) => ({ tmdb_id: it.chosen_tmdb_id, note: it.note }));
    if (!payload.length) {
      setErr('nothing selected with a chosen match');
      return;
    }
    setBusy(true); setErr(null);
    try {
      const r = await api.post('/api/admin/movies/import-titles/commit', { items: payload });
      setCommitted(r.items);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Import titles (with TMDB lookup)</h3>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Paste a JSON array of <code>{'{ "title": "...", "added_by": "..." }'}</code> entries.
        Each title is searched on TMDB; you'll resolve any ambiguities before committing.
      </p>
      <textarea
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }}
      />
      <div className="row" style={{ marginTop: '0.5rem', gap: '0.5rem' }}>
        <button className="primary" onClick={search} disabled={busy}>
          {busy && !items ? 'Searching…' : 'Search'}
        </button>
        {items && (
          <button onClick={commit} disabled={busy}>
            {busy ? 'Adding…' : `Add selected (${items.filter((it) => it.include && it.chosen_tmdb_id).length})`}
          </button>
        )}
      </div>
      {err && <div className="error">{err}</div>}

      {items && (
        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem' }}>
          {items.map((it, idx) => (
            <ImportRow
              key={idx}
              item={it}
              onChoice={(tmdbId) => setChoice(idx, tmdbId)}
              onInclude={(on) => setInclude(idx, on)}
            />
          ))}
        </div>
      )}

      {committed && (
        <div className="card" style={{ marginTop: '1rem', background: 'var(--panel-2)' }}>
          <strong>Done.</strong>{' '}
          {committed.filter((c) => c.ok && !c.existed).length} added,{' '}
          {committed.filter((c) => c.ok && c.existed).length} already in DB,{' '}
          {committed.filter((c) => !c.ok).length} failed.
        </div>
      )}
    </div>
  );
}

function ImportRow({ item, onChoice, onInclude }) {
  const badge = STATUS_BADGE[item.status] || { label: item.status, cls: '' };
  const showCandidates = item.candidates.length > 0 && item.status !== 'already_in_db';
  return (
    <div className="card" style={{ padding: '0.75rem' }}>
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{item.input.title || <em>(empty)</em>}</div>
          {item.note && <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{item.note}</div>}
        </div>
        <span className={`pill ${badge.cls}`} style={{ flexShrink: 0 }}>{badge.label}</span>
        <label style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}>
          <input
            type="checkbox"
            checked={item.include}
            onChange={(e) => onInclude(e.target.checked)}
            disabled={item.status === 'no_results' || item.status === 'empty' || item.status === 'already_in_db'}
          />
          include
        </label>
      </div>
      {showCandidates && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem', marginTop: '0.5rem' }}>
          {item.candidates.map((c) => (
            <label key={c.tmdb_id} className={`candidate ${item.chosen_tmdb_id === c.tmdb_id ? 'chosen' : ''}`}>
              <input
                type="radio"
                name={`row-${item.input.title}`}
                checked={item.chosen_tmdb_id === c.tmdb_id}
                onChange={() => onChoice(c.tmdb_id)}
                style={{ display: 'none' }}
              />
              <div
                className="poster"
                style={c.poster_url ? { backgroundImage: `url(${c.poster_url})` } : {}}
              />
              <div className="info">
                <div className="title">{c.title}</div>
                <div className="muted">{c.year || '—'}</div>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Bechdel-data import: paste an array of `{title, year, passes}` (or with
// `imdb_id` to skip TMDB lookup), the server fuzz-matches each to TMDB,
// admin resolves any ambiguities, the commit step upserts to the local
// `bechdel_movies` table.
function ImportBechdel() {
  const [text, setText] = useState(`[
  {"title": "Dune: Part Two", "year": 2024, "passes": true},
  {"title": "Wicked: For Good", "year": 2025, "passes": true}
]`);
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [committed, setCommitted] = useState(null);

  async function search() {
    setErr(null);
    setCommitted(null);
    let parsed;
    try {
      parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('expected an array');
    } catch (e) {
      setErr(`couldn't parse JSON: ${e.message}`);
      return;
    }
    setBusy(true);
    try {
      const r = await api.post('/api/admin/bechdel/import-titles/search', { items: parsed });
      const next = r.items.map((it) => ({
        ...it,
        chosen_tmdb_id: it.chosen_tmdb_id ?? null,
        chosen_imdb_id: it.chosen_imdb_id ?? null,
        include: it.status === 'auto' || it.status === 'needs_confirm',
      }));
      setItems(next);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function setChoice(idx, tmdbId) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, chosen_tmdb_id: tmdbId } : it));
  }
  function setInclude(idx, on) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, include: on } : it));
  }
  function setPasses(idx, on) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, passes: on } : it));
  }

  async function commit() {
    const payload = items
      .filter((it) => it.include && (it.chosen_imdb_id || it.chosen_tmdb_id))
      .map((it) => ({
        title: it.input.title,
        year: it.input.year,
        passes: !!it.passes,
        imdb_id: it.chosen_imdb_id || undefined,
        tmdb_id: it.chosen_tmdb_id || undefined,
      }));
    if (!payload.length) {
      setErr('nothing selected with a chosen match');
      return;
    }
    setBusy(true); setErr(null);
    try {
      const r = await api.post('/api/admin/bechdel/import-titles/commit', { items: payload });
      setCommitted(r.items);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>Import Bechdel data</h3>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Paste an array of <code>{'{ "title", "year", "passes" }'}</code>. Each
        entry is matched to a TMDB title (using year as a hint when given) so
        we can grab its IMDb id, then upserted into our <code>bechdel_movies</code>
        table. <Link to="/admin/import-formats">Format reference →</Link>
      </p>
      <textarea
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }}
      />
      <div className="row" style={{ marginTop: '0.5rem', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button className="primary" onClick={search} disabled={busy}>
          {busy && !items ? 'Searching…' : 'Search'}
        </button>
        {items && (
          <button onClick={commit} disabled={busy}>
            {busy ? 'Saving…' : `Save ${items.filter((it) => it.include && (it.chosen_imdb_id || it.chosen_tmdb_id)).length} entries`}
          </button>
        )}
        <SyncBechdelButton />
      </div>
      {err && <div className="error">{err}</div>}

      {items && (
        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem' }}>
          {items.map((it, idx) => (
            <BechdelImportRow
              key={idx}
              item={it}
              onChoice={(t) => setChoice(idx, t)}
              onInclude={(on) => setInclude(idx, on)}
              onPasses={(on) => setPasses(idx, on)}
            />
          ))}
        </div>
      )}

      {committed && (
        <div className="card" style={{ marginTop: '1rem', background: 'var(--panel-2)' }}>
          <strong>Done.</strong>{' '}
          {committed.filter((c) => c.ok).length} saved,{' '}
          {committed.filter((c) => !c.ok).length} failed.
        </div>
      )}
    </div>
  );
}

// One-shot button: tells the server to push every cached bechdel result
// from `bechdel_movies` onto the matching `movies` rows. Useful when
// movies were imported before their bechdel data became available.
function SyncBechdelButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function run() {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post('/api/admin/bechdel/sync-movies', {});
      setMsg(`${r.movies_synced} movie${r.movies_synced === 1 ? '' : 's'} updated.`);
    } catch (e) {
      setMsg(`error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button onClick={run} disabled={busy}>
        {busy ? 'Syncing…' : 'Sync to movies'}
      </button>
      {msg && <span style={{ alignSelf: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>{msg}</span>}
    </>
  );
}

function BechdelImportRow({ item, onChoice, onInclude, onPasses }) {
  const badge = STATUS_BADGE[item.status] || { label: item.status, cls: '' };
  const showCandidates = item.candidates.length > 0 && !item.chosen_imdb_id;
  return (
    <div className="card" style={{ padding: '0.75rem' }}>
      <div className="spread" style={{ alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>
            {item.input.title || <em>(empty)</em>}
            {item.input.year ? <span style={{ color: 'var(--muted)' }}> ({item.input.year})</span> : null}
          </div>
          {item.chosen_imdb_id && (
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              imdb_id provided: {item.chosen_imdb_id}
            </div>
          )}
        </div>
        <span className={`pill ${badge.cls}`} style={{ flexShrink: 0 }}>{badge.label}</span>
        <label style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}>
          <input
            type="checkbox"
            checked={!!item.passes}
            onChange={(e) => onPasses(e.target.checked)}
          />
          passes
        </label>
        <label style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}>
          <input
            type="checkbox"
            checked={item.include}
            onChange={(e) => onInclude(e.target.checked)}
            disabled={item.status === 'no_results' || item.status === 'empty'}
          />
          include
        </label>
      </div>
      {showCandidates && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem', marginTop: '0.5rem' }}>
          {item.candidates.map((c) => (
            <label key={c.tmdb_id} className={`candidate ${item.chosen_tmdb_id === c.tmdb_id ? 'chosen' : ''}`}>
              <input
                type="radio"
                name={`bechdel-row-${item.input.title}`}
                checked={item.chosen_tmdb_id === c.tmdb_id}
                onChange={() => onChoice(c.tmdb_id)}
                style={{ display: 'none' }}
              />
              <div
                className="poster"
                style={c.poster_url ? { backgroundImage: `url(${c.poster_url})` } : {}}
              />
              <div className="info">
                <div className="title">{c.title}</div>
                <div className="muted">{c.year || '—'}</div>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

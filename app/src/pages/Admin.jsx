import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

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

  if (err) return <div className="container error">{err}</div>;
  if (!users) return <div className="container">Loading…</div>;

  return (
    <div className="container">
      <h1 style={{ marginTop: 0 }}>Admin</h1>
      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Movies</th>
              <th>Last seen</th>
              <th>Joined</th>
              <th>Admin</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === user.id;
              const busy = busyId === u.id;
              return (
                <tr key={u.id}>
                  <td>{u.name}{isMe && <span style={{ color: 'var(--muted)' }}> (you)</span>}</td>
                  <td>{u.email}</td>
                  <td>{u.movie_count}</td>
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

function formatDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

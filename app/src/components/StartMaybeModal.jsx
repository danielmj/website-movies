import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useMaybe } from '../maybe.jsx';
import { useAuth } from '../auth.jsx';

export default function StartMaybeModal({ onClose }) {
  const { user } = useAuth();
  const { start } = useMaybe();
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/api/auth/users').then((all) => {
      setUsers(all);
      setSelected(new Set([user.id]));
    });
  }, [user.id]);

  function toggle(id) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await start([...selected]);
      onClose();
      navigate('/maybe');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Who's here for movie night?</h2>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          Pick everyone watching. You can edit attendees afterwards.
        </p>
        <div className="row" style={{ marginBottom: '1rem' }}>
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              className={`user-toggle ${selected.has(u.id) ? 'checked' : ''}`}
              onClick={() => toggle(u.id)}
            >
              {selected.has(u.id) ? '✓' : '+'} {u.name}
            </button>
          ))}
        </div>
        {error && <div className="error">{error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || selected.size === 0} onClick={go}>
            Start maybe movie
          </button>
        </div>
      </div>
    </div>
  );
}

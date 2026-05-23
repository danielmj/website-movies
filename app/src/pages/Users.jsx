import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

// Plain alphabetical list of everyone in the group. Each row links to that
// user's profile. Used as a hub for jumping between user pages.
export default function Users() {
  const { user } = useAuth();
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get('/api/auth/users').then(setUsers).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="container error">{err}</div>;
  if (!users) return <div className="container">Loading…</div>;

  return (
    <div className="container">
      <h1 style={{ marginTop: 0 }}>Users</h1>
      <ul className="users-list">
        {users.map((u) => (
          <li key={u.id}>
            <Link to={`/users/${u.id}`} className="users-list-row">
              <span className="users-list-name">
                {u.name}
                {user && u.id === user.id && (
                  <span style={{ color: 'var(--muted)' }}> (you)</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

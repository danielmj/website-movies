import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ProfileView } from './Profile.jsx';

// Public-by-name profile of any user. Reuses ProfileView so the layout +
// bucketing logic match /profile exactly. Login required (the underlying
// /api/movies endpoint only returns user_movies for authed callers).
export default function UserProfile() {
  const { id } = useParams();
  const { user: viewer } = useAuth();
  const [subject, setSubject] = useState(null);
  const [movies, setMovies] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get('/api/auth/users'),
      api.get('/api/movies'),
    ]).then(([users, ms]) => {
      if (cancelled) return;
      const u = users.find((x) => String(x.id) === String(id));
      if (!u) { setErr('User not found.'); return; }
      setSubject(u);
      setMovies(ms);
    }).catch((e) => { if (!cancelled) setErr(e.message); });
    return () => { cancelled = true; };
  }, [id]);

  if (err) return <div className="container error">{err}</div>;
  if (!subject || !movies) return <div className="container">Loading…</div>;

  return (
    <ProfileView
      subjectUser={subject}
      movies={movies}
      viewer={viewer}
      actions={(
        <div className="row">
          <Link to="/users" className="header-pill">Users</Link>
          <Link to="/profile" className="header-pill">Your profile →</Link>
        </div>
      )}
    />
  );
}

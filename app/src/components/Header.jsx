import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useMaybe } from '../maybe.jsx';
import StartMaybeModal from './StartMaybeModal.jsx';

export default function Header() {
  const { user, logout } = useAuth();
  const { active } = useMaybe();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <header className="header">
        <div className="brand"><Link to="/">Maybe Movie Mondays</Link></div>
        <nav className="nav">
          <NavLink to="/" end>Movies</NavLink>
          {user && <NavLink to="/add">Add</NavLink>}
          {user && active && <NavLink to="/maybe">Maybe Movie</NavLink>}
          {user && <NavLink to="/profile">Profile</NavLink>}
        </nav>
        {user && !active && (
          <button className="primary header-cta" onClick={() => setOpen(true)}>Maybe movie?</button>
        )}
        {user ? (
          <>
            <span className="user-chip">{user.name}</span>
            {user.is_admin && <NavLink to="/admin" className="header-admin">Admin</NavLink>}
            <button onClick={async () => { await logout(); navigate('/'); }}>Sign out</button>
          </>
        ) : (
          <>
            <Link to="/login" className="header-admin">Sign in</Link>
            <Link to="/signup" className="primary" style={{ textDecoration: 'none', padding: '0.5rem 0.85rem', borderRadius: 6 }}>
              Sign up
            </Link>
          </>
        )}
      </header>
      {open && <StartMaybeModal onClose={() => setOpen(false)} />}
    </>
  );
}

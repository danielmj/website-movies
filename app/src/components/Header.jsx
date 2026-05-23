import { Link, NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useMaybe } from '../maybe.jsx';
import StartMaybeModal from './StartMaybeModal.jsx';

export default function Header() {
  const { user } = useAuth();
  const { active } = useMaybe();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const onMaybePage = location.pathname === '/maybe';

  return (
    <>
      <header className="header">
        <div className="brand"><Link to="/">Maybe Movie Mondays</Link></div>
        <nav className="nav">
          <NavLink to="/" end>Movies</NavLink>
          {user && <NavLink to="/add">Add</NavLink>}
          {user && active && !onMaybePage && (
            <NavLink to="/maybe" className="nav-maybe">Maybe Movie</NavLink>
          )}
          {user && !active && (
            <button
              type="button"
              className="primary nav-maybe-cta"
              onClick={() => setOpen(true)}
            >
              Maybe movie?
            </button>
          )}
        </nav>
        {user ? (
          <div className="header-auth">
            <NavLink to="/profile" className="header-pill" title="Your profile">{user.name}</NavLink>
            {user.is_admin && <NavLink to="/admin" className="header-pill">Admin</NavLink>}
          </div>
        ) : (
          <div className="header-auth">
            <Link to="/login" className="header-pill">Sign in</Link>
            <Link to="/signup" className="primary header-signup">Sign up</Link>
          </div>
        )}
      </header>
      {open && <StartMaybeModal onClose={() => setOpen(false)} />}
    </>
  );
}

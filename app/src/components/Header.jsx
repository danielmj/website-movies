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
          <NavLink to="/add">Add</NavLink>
          {active && <NavLink to="/maybe">Maybe Movie</NavLink>}
          {user.is_admin && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        {!active && (
          <button className="primary" onClick={() => setOpen(true)}>Maybe movie?</button>
        )}
        <span className="user-chip">{user.name}</span>
        <button onClick={async () => { await logout(); navigate('/login'); }}>Sign out</button>
      </header>
      {open && <StartMaybeModal onClose={() => setOpen(false)} />}
    </>
  );
}

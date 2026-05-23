import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function Login() {
  return (
    <div className="container auth-page">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Sign in</h1>
        <GoogleButton />
        <Divider />
        <PasswordForm />
        <p style={{ color: 'var(--muted)', marginTop: '1rem' }}>
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </div>
    </div>
  );
}

// Google Identity Services (GIS) is loaded from a <script> in index.html.
// Once `window.google.accounts.id` is available we initialize and render
// their official button into a div — that gives us styling + branding
// compliance for free. The credential callback fires when the user picks
// an account; we forward the id_token to /api/auth/google.
function GoogleButton() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const buttonRef = useRef(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !buttonRef.current) return;
    let cancelled = false;
    function init() {
      if (cancelled) return;
      const g = window.google && window.google.accounts && window.google.accounts.id;
      if (!g) { setTimeout(init, 200); return; }
      g.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          setErr(null);
          try {
            await api.post('/api/auth/google', { id_token: credential });
            await refresh();
            navigate('/');
          } catch (e) {
            setErr(e.message);
          }
        },
        auto_select: false,
      });
      g.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: 320,
      });
    }
    init();
    return () => { cancelled = true; };
  }, [refresh, navigate]);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
        Sign in with Google isn't configured yet — set VITE_GOOGLE_CLIENT_ID.
      </div>
    );
  }
  return (
    <>
      <div ref={buttonRef} style={{ display: 'flex', justifyContent: 'center' }} />
      {err && <div className="error">{err}</div>}
    </>
  );
}

function Divider() {
  return (
    <div className="auth-divider" aria-hidden="true">
      <span>or</span>
    </div>
  );
}

function PasswordForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await login(email, password);
      navigate('/');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label>Email</label>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="field">
        <label>Password</label>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {err && <div className="error">{err}</div>}
      <button className="primary" type="submit" disabled={busy} style={{ width: '100%', marginTop: '0.5rem' }}>
        {busy ? '…' : 'Sign in'}
      </button>
    </form>
  );
}

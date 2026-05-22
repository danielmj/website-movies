import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { MaybeProvider } from './maybe.jsx';
import Header from './components/Header.jsx';
import MaybeBanner from './components/MaybeBanner.jsx';
import ImpersonationBanner from './components/ImpersonationBanner.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import MovieList from './pages/MovieList.jsx';
import MovieDetail from './pages/MovieDetail.jsx';
import AddMovie from './pages/AddMovie.jsx';
import MaybeMovie from './pages/MaybeMovie.jsx';
import Admin from './pages/Admin.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="container">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="container">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_admin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="container">Loading…</div>;

  if (!user) {
    return (
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <MaybeProvider>
      <Header />
      <ImpersonationBanner />
      <MaybeBanner />
      <Routes>
        <Route path="/" element={<Protected><MovieList /></Protected>} />
        <Route path="/movies/:id" element={<Protected><MovieDetail /></Protected>} />
        <Route path="/add" element={<Protected><AddMovie /></Protected>} />
        <Route path="/maybe" element={<Protected><MaybeMovie /></Protected>} />
        <Route path="/admin" element={<AdminOnly><Admin /></AdminOnly>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MaybeProvider>
  );
}

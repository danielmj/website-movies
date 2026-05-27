import { useAuth } from '../auth.jsx';
import MaybeHistory from '../components/MaybeHistory.jsx';

export default function History() {
  const { user } = useAuth();
  return (
    <div className="container">
      <MaybeHistory canDelete={!!user?.is_admin} />
    </div>
  );
}

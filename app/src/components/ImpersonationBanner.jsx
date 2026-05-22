import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function ImpersonationBanner() {
  const { user, refresh } = useAuth();
  if (!user || !user.impersonating_admin_id) return null;
  return (
    <div className="banner-impersonate">
      <span>
        Impersonating <strong>{user.name}</strong>
        {user.admin_name ? ` (you are ${user.admin_name})` : ''}
      </span>
      <button
        onClick={async () => {
          await api.post('/api/admin/stop-impersonating');
          await refresh();
        }}
      >
        Stop impersonating
      </button>
    </div>
  );
}

import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';

const Ctx = createContext(null);

export function MaybeProvider({ children }) {
  const { user } = useAuth();
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    try {
      const data = await api.get('/api/maybe/active');
      setActive(data);
    } catch {
      setActive(null);
    }
  }

  useEffect(() => {
    if (!user) { setActive(null); return; }
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [user && user.id]);

  const value = {
    active,
    loading,
    refresh,
    async start(attendeeIds) {
      setLoading(true);
      try {
        const s = await api.post('/api/maybe', { attendee_ids: attendeeIds });
        setActive(s);
        return s;
      } finally {
        setLoading(false);
      }
    },
    async setAttendees(sessionId, attendeeIds) {
      const s = await api.put(`/api/maybe/${sessionId}/attendees`, { attendee_ids: attendeeIds });
      setActive(s);
      return s;
    },
    async vote(sessionId, movieId, vote) {
      const s = await api.post(`/api/maybe/${sessionId}/vote`, { movie_id: movieId, vote });
      setActive(s);
      return s;
    },
    async watched(sessionId, movieId) {
      await api.post(`/api/maybe/${sessionId}/watched`, { movie_id: movieId });
      await refresh();
    },
    async cancel(sessionId) {
      await api.post(`/api/maybe/${sessionId}/cancel`);
      await refresh();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMaybe() {
  return useContext(Ctx);
}

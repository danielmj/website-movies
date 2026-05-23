import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

// Home-page nag for attendees of a just-finished Maybe Movie session: now
// that you've watched it, go (re)rate it. Persists across reloads until the
// user dismisses it (X), updates their rating (Update — also implicitly
// dismisses), or attends a newer ended session that supersedes it.
export default function RatingPromptBanner() {
  const [prompt, setPrompt] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/api/maybe/rating-prompt').then(setPrompt).catch(() => setPrompt(null));
  }, []);

  if (!prompt) return null;

  async function dismiss() {
    setPrompt(null);  // optimistic — banner disappears immediately
    try { await api.post(`/api/maybe/${prompt.session_id}/dismiss-prompt`, {}); } catch {}
  }

  async function update() {
    await dismiss();
    navigate(`/movies/${prompt.movie_id}`);
  }

  return (
    <div className="rating-prompt" role="status">
      <span className="rating-prompt-icon" aria-hidden="true">⚠</span>
      <div className="rating-prompt-text">
        You watched <strong>{prompt.movie_title}</strong> at the last Maybe Movie —
        update your rating?
      </div>
      <div className="rating-prompt-actions">
        <button type="button" className="primary" onClick={update}>Update rating</button>
        <button type="button" className="rating-prompt-close" onClick={dismiss} aria-label="Dismiss">×</button>
      </div>
    </div>
  );
}

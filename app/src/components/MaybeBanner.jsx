import { Link } from 'react-router-dom';
import { useMaybe } from '../maybe.jsx';

export default function MaybeBanner() {
  const { active } = useMaybe();
  if (!active) return null;
  const names = active.attendees.map((a) => a.name).join(', ');
  return (
    <Link to="/maybe" className="banner">
      <span className="banner-text">Maybe movie! {names ? `with ${names}` : ''}</span>
      <span className="banner-cta">Open →</span>
    </Link>
  );
}

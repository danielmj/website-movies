import { Link, useLocation } from 'react-router-dom';
import { useMaybe } from '../maybe.jsx';

export default function MaybeBanner() {
  const { active } = useMaybe();
  const location = useLocation();
  // No need to nag the user with a banner when they're already on the page
  // it links to.
  if (!active || location.pathname === '/maybe') return null;
  return (
    <Link to="/maybe" className="banner">
      <span className="banner-text">Maybe movie has started!</span>
      <span className="banner-cta">Open →</span>
    </Link>
  );
}

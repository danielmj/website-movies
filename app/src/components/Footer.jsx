import { Link } from 'react-router-dom';

// Site-wide footer. Tiny on purpose — three links + a small credit line.
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container site-footer-inner">
        <div className="site-footer-links">
          <Link to="/careers">Careers</Link>
          <Link to="/faq">FAQ</Link>
          <Link to="/whats-new">What's new</Link>
        </div>
      </div>
    </footer>
  );
}

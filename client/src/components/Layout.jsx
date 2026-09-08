import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export function Brand({ light }) {
  return <Link to="/" className="brand"><i aria-hidden="true" />Concord</Link>;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <>
      <header className="topbar">
        <Brand />
        <div className="row">
          <span className="who">{user.name}</span>
          <button className="btn quiet sm" onClick={async () => { await logout(); nav('/login'); }}>Sign out</button>
        </div>
      </header>
      <Outlet />
    </>
  );
}

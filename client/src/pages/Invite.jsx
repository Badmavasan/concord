import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Login, { AuthFrame } from './Login.jsx';

export default function Invite() {
  const { token } = useParams();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('register');

  useEffect(() => { api(`/auth/invite/${token}`).then(d => setInv(d.invite)).catch(e => setErr(e.message)); }, [token]);
  useEffect(() => {
    if (user && inv) api(`/auth/invite/${token}/accept`, { method: 'POST' }).then(d => nav(`/campaigns/${d.campaign_id}`, { replace: true })).catch(e => setErr(e.message));
  }, [user, inv]);

  if (err) return <AuthFrame><div className="note red">This invite link is not valid. Ask the campaign owner for a new one.</div></AuthFrame>;
  if (loading || !inv) return <AuthFrame><div className="muted">Checking your invite</div></AuthFrame>;
  if (user) return <AuthFrame><div className="muted">Adding you to {inv.campaign_name}</div></AuthFrame>;

  return (
    <AuthFrame>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div className="invite-card">
          <div className="muted small">{inv.inviter_name} invited you to review</div>
          <div className="serif" style={{ fontSize: 24 }}>{inv.campaign_name}</div>
          <div className="seg" style={{ marginTop: 12 }}>
            <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>I'm new</button>
            <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>I have an account</button>
          </div>
        </div>
        <Login key={mode} bare register={mode === 'register'} inviteToken={token} inviteEmail={inv.email} />
      </div>
    </AuthFrame>
  );
}

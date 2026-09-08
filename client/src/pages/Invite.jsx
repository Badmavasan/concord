import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Login, { AuthFrame } from './Login.jsx';

export default function Invite() {
  const { token } = useParams();
  const { user, loading, register } = useAuth();
  const nav = useNavigate();
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ name: '', password: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => { api(`/auth/invite/${token}`).then(d => setInv(d.invite)).catch(e => setErr(e.message)); }, [token]);
  // Someone already signed in with the invited address: join straight away.
  useEffect(() => {
    if (user && inv && !inv.expired) api(`/auth/invite/${token}/accept`, { method: 'POST' }).then(d => nav(`/campaigns/${d.campaign_id}`, { replace: true })).catch(e => setErr(e.message));
  }, [user, inv]);

  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const d = await api(`/auth/invite/${token}/register`, { method: 'POST', body: form }); await register.refresh?.(); window.location.assign(`/campaigns/${d.campaign_id}`); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  const card = inv && (
    <div className="invite-card">
      <div className="muted small">{inv.inviter_name} invited you to review</div>
      <div className="serif" style={{ fontSize: 24 }}>{inv.campaign_name}</div>
      <div className="muted small" style={{ marginTop: 4 }}>Sent to {inv.email}</div>
    </div>
  );

  if (loading || (!inv && !err)) return <AuthFrame><div className="muted">Checking your invitation</div></AuthFrame>;
  if (err && !inv) return <AuthFrame><div style={{ maxWidth: 360 }}><div className="note red">{err}</div></div></AuthFrame>;
  if (inv.expired) return <AuthFrame><div style={{ maxWidth: 360 }}>{card}<div className="note red">This invitation has expired. Links work for a limited time; ask {inv.inviter_name} to send a new one from the campaign's Team page.</div></div></AuthFrame>;
  if (user) return <AuthFrame><div style={{ maxWidth: 360 }}>{card}{err ? <div className="note red">{err}</div> : <div className="muted">Adding you to {inv.campaign_name}</div>}</div></AuthFrame>;
  if (inv.existingUser) return (
    <AuthFrame><div style={{ width: '100%', maxWidth: 360 }}>{card}<div className="muted small" style={{ marginBottom: 12 }}>You already have a Concord account with this address. Sign in to join.</div><Login bare inviteEmail={inv.email} afterLogin={() => api(`/auth/invite/${token}/accept`, { method: 'POST' }).then(d => `/campaigns/${d.campaign_id}`)} /></div></AuthFrame>
  );
  return (
    <AuthFrame>
      <div style={{ width: '100%', maxWidth: 360 }}>
        {card}
        <form className="stack" onSubmit={submit}>
          <h2>Choose your password</h2>
          <label className="field">Your name<input type="text" autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required autoComplete="name" /></label>
          <label className="field">Password<span className="help">At least 8 characters</span><input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={8} autoComplete="new-password" /></label>
          {err && <div className="error">{err}</div>}
          <button className="btn primary" disabled={busy} style={{ justifyContent: 'center', padding: 10 }}>{busy ? 'One moment' : 'Join the campaign'}</button>
          <div className="muted small" style={{ textAlign: 'center' }}>Already have an account? <Link to="/login">Sign in</Link></div>
        </form>
      </div>
    </AuthFrame>
  );
}

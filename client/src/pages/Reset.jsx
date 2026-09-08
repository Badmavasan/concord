import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { AuthFrame } from './Login.jsx';

export default function Reset() {
  const { token } = useParams();
  const [state, setState] = useState('checking'); // checking | ok | invalid | done
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api(`/auth/reset/${token}`).then(() => setState('ok')).catch(e => { setErr(e.message); setState('invalid'); }); }, [token]);

  const submit = async e => {
    e.preventDefault(); setErr('');
    if (password !== confirm) return setErr('The two passwords do not match');
    setBusy(true);
    try { await api(`/auth/reset/${token}`, { method: 'POST', body: { password } }); setState('done'); setTimeout(() => window.location.assign('/'), 1200); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <AuthFrame>
      <form className="stack" onSubmit={submit}>
        <h2>Choose a new password</h2>
        {state === 'checking' && <div className="muted">Checking your link</div>}
        {state === 'invalid' && <><div className="note red">{err}</div><div className="muted small"><Link to="/forgot">Request a new link</Link></div></>}
        {state === 'done' && <div className="note">Password changed. Signing you in.</div>}
        {state === 'ok' && <>
          <label className="field">New password<span className="help">At least 8 characters</span><input type="password" autoFocus value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" /></label>
          <label className="field">Repeat it<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" /></label>
          {err && <div className="error">{err}</div>}
          <button className="btn primary" disabled={busy} style={{ justifyContent: 'center', padding: 10 }}>{busy ? 'One moment' : 'Save password'}</button>
        </>}
      </form>
    </AuthFrame>
  );
}

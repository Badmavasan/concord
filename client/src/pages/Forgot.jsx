import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { AuthFrame } from './Login.jsx';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const d = await api('/auth/forgot', { method: 'POST', body: { email } }); setSent(d.message); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <AuthFrame>
      <form className="stack" onSubmit={submit}>
        <h2>Forgot your password?</h2>
        {sent ? <div className="note">{sent}</div> : <>
          <div className="muted small">Enter the address you signed up with. We will email you a link to choose a new password.</div>
          <label className="field">Email<input type="email" autoFocus value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
          {err && <div className="error">{err}</div>}
          <button className="btn primary" disabled={busy} style={{ justifyContent: 'center', padding: 10 }}>{busy ? 'One moment' : 'Send me a link'}</button>
        </>}
        <div className="muted small" style={{ textAlign: 'center' }}><Link to="/login">Back to sign in</Link></div>
      </form>
    </AuthFrame>
  );
}

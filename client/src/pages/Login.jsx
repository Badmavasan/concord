import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Brand } from '../components/Layout.jsx';

export function AuthFrame({ children }) {
  return (
    <div className="auth">
      <aside className="auth-art">
        <Brand />
        <div>
          <h1>Read every paper. <mark>Agree on what it says.</mark></h1>
          <p>Concord is a workbench for systematic reviews: screen literature against your own criteria, split the work across a team, and watch inter-rater agreement as the review takes shape.</p>
        </div>
        <span className="small" style={{ color: '#7f8b85' }}>Campaigns, custom fields, BibTeX import, Kanban follow-up, Cohen's and Fleiss' kappa.</span>
      </aside>
      <main className="auth-form">{children}</main>
    </div>
  );
}

export default function Login({ register = false, inviteEmail, bare, afterLogin }) {
  const { login, register: doRegister } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ email: inviteEmail || '', name: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [openReg, setOpenReg] = useState(true);
  useEffect(() => { if (!bare) api('/auth/config').then(d => setOpenReg(d.openRegistration)).catch(() => {}); }, [bare]);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      register ? await doRegister(form) : await login(form);
      const to = afterLogin ? await afterLogin() : (loc.state?.from || '/');
      nav(to, { replace: true });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const form_ = (
    <form className="stack" onSubmit={submit}>
      {!bare && <h2>{register ? 'Create your account' : 'Welcome back'}</h2>}
      {register && <label className="field">Name<input type="text" value={form.name} onChange={set('name')} required autoComplete="name" /></label>}
      <label className="field">Email<input type="email" value={form.email} onChange={set('email')} required readOnly={!!inviteEmail} autoComplete="email" /></label>
      <label className="field">Password{register && <span className="help">At least 8 characters</span>}<input type="password" value={form.password} onChange={set('password')} required minLength={register ? 8 : undefined} autoComplete={register ? 'new-password' : 'current-password'} /></label>
      {err && <div className="error">{err}</div>}
      <button className="btn primary" disabled={busy} style={{ justifyContent: 'center', padding: 10 }}>{busy ? 'One moment' : register ? 'Create account' : 'Sign in'}</button>
      {!bare && <div className="muted small" style={{ textAlign: 'center' }}>
        {register ? <>Already have an account? <Link to="/login">Sign in</Link></> : <>
          <Link to="/forgot">Forgot your password?</Link>
          <div style={{ marginTop: 6 }}>{openReg ? <>New here? <Link to="/register">Create an account</Link></> : <>Accounts are created through invitation links from a campaign owner.</>}</div>
        </>}
      </div>}
    </form>
  );
  return bare ? form_ : <AuthFrame>{form_}</AuthFrame>;
}

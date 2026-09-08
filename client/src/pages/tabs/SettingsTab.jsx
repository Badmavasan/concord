import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';

export default function SettingsTab({ campaign, reload }) {
  const nav = useNavigate();
  const [form, setForm] = useState({ name: campaign.name, description: campaign.description || '' });
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState('');
  const [delErr, setDelErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async e => {
    e.preventDefault(); setErr(''); setSaved(false);
    try { await api(`/campaigns/${campaign.id}`, { method: 'PATCH', body: form }); setSaved(true); reload(); } catch (e) { setErr(e.message); }
  };
  const remove = async () => {
    setDelErr(''); setBusy(true);
    try { await api(`/campaigns/${campaign.id}`, { method: 'DELETE', body: { confirm } }); nav('/', { replace: true }); }
    catch (e) { setDelErr(e.message); setBusy(false); }
  };

  return (
    <div className="stack" style={{ gap: 18, maxWidth: 640 }}>
      <div className="content-head"><div><h2>Settings</h2><p className="hint">Name and description are visible to everyone on the team.</p></div></div>
      <form className="panel stack" onSubmit={save}>
        <label className="field">Name<input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label>
        <label className="field">Description<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
        {err && <div className="error">{err}</div>}
        <div className="row spread"><span className="success">{saved ? 'Saved' : ''}</span><button className="btn primary">Save changes</button></div>
      </form>
      <div className="panel stack" style={{ borderColor: 'var(--red)' }}>
        <h3 style={{ color: 'var(--red)' }}>Delete this campaign</h3>
        <div className="small">This removes every paper, PDF, criterion, assignment and annotation in <strong>{campaign.name}</strong>, for everyone on the team. It cannot be undone. Export the annotations from the Agreement page first if you need them.</div>
        <label className="field">Type the campaign name to confirm<input type="text" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={campaign.name} autoComplete="off" /></label>
        {delErr && <div className="error">{delErr}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn danger" disabled={confirm !== campaign.name || busy} onClick={remove}>{busy ? 'Deleting' : 'Delete campaign'}</button></div>
      </div>
    </div>
  );
}

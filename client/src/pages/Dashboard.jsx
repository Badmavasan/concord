import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [err, setErr] = useState('');
  const nav = useNavigate();
  useEffect(() => { api('/campaigns').then(d => setCampaigns(d.campaigns)); }, []);

  const create = async e => {
    e.preventDefault(); setErr('');
    try { const d = await api('/campaigns', { method: 'POST', body: form }); nav(`/campaigns/${d.campaign.id}/fields`); } catch (e) { setErr(e.message); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1 className="serif">Your reviews</h1><p>Each campaign has its own criteria, papers and team.</p></div>
        <button className="btn primary" onClick={() => setCreating(true)}>New campaign</button>
      </div>
      {!campaigns ? <div className="muted">Loading</div> : campaigns.length === 0 ? (
        <div className="empty"><strong>Nothing to review yet</strong>Start a campaign, or wait for an invitation to land in your inbox.</div>
      ) : (
        <div className="ledger">
          {campaigns.map(c => (
            <div key={c.id} className="ledger-row" onClick={() => nav(`/campaigns/${c.id}`)} role="link" tabIndex={0} onKeyDown={e => e.key === 'Enter' && nav(`/campaigns/${c.id}`)}>
              <div>
                <h2>{c.name}</h2>
                <div className="meta">{c.role === 'owner' ? 'You run this review' : `Run by ${c.owner_name}`}, {c.paper_count} {c.paper_count === 1 ? 'paper' : 'papers'}, {c.member_count} {c.member_count === 1 ? 'person' : 'people'}</div>
                {c.description && <div className="muted small" style={{ marginTop: 6, maxWidth: '64ch' }}>{c.description}</div>}
              </div>
              <div className="right">
                {c.my_pending > 0 ? <span className="tag mark">{c.my_pending} waiting for you</span> : c.role !== 'owner' ? <span className="tag ok">All yours are done</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}
      {creating && (
        <Modal title="New campaign" onClose={() => setCreating(false)}>
          <form className="stack" onSubmit={create}>
            <label className="field">Name<input type="text" autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="e.g. LLMs in clinical triage, 2020 to 2026" /></label>
            <label className="field">Description<span className="help">Optional. Research question, scope, anything the team should keep in mind.</span><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
            {err && <div className="error">{err}</div>}
            <div className="actions"><button type="button" className="btn" onClick={() => setCreating(false)}>Cancel</button><button className="btn primary">Create campaign</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

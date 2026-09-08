import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import Avatar from '../../components/Avatar.jsx';

export default function MembersTab({ campaign, members, owner, reload }) {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [invites, setInvites] = useState([]);
  const [copied, setCopied] = useState('');
  const base = `/campaigns/${campaign.id}`;
  const loadInvites = () => owner && api(`${base}/invites`).then(d => setInvites(d.invites.filter(i => !i.accepted_at)));
  useEffect(() => { loadInvites(); }, [campaign.id]);

  const invite = async e => { e.preventDefault(); setErr(''); setResult(null); try { const d = await api(`${base}/invites`, { method: 'POST', body: { email } }); setResult({ ...d, email }); setEmail(''); loadInvites(); } catch (e) { setErr(e.message); } };
  const remove = async m => { if (!confirm(`Remove ${m.name}? Their assignments are cleared; submitted answers are kept.`)) return; await api(`${base}/members/${m.id}`, { method: 'DELETE' }); reload(); };
  const revoke = async i => { await api(`${base}/invites/${i.id}`, { method: 'DELETE' }); loadInvites(); };
  const copy = async t => { try { await navigator.clipboard.writeText(t); setCopied(t); setTimeout(() => setCopied(''), 1500); } catch {} };

  return (
    <div className="stack" style={{ gap: 18, maxWidth: 820 }}>
      <div className="content-head"><div><h2>Team</h2><p className="hint">Everyone here can be assigned papers. Only the owner edits criteria, papers and stages.</p></div></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Person</th><th>Email</th><th>Role</th>{owner && <th></th>}</tr></thead>
        <tbody>{members.map(m => (
          <tr key={m.id}>
            <td><span className="person"><Avatar name={m.name} /> {m.name}</span></td><td className="muted">{m.email}</td>
            <td><span className={'tag' + (m.role === 'owner' ? ' ink' : '')}>{m.role === 'owner' ? 'Owner' : 'Annotator'}</span></td>
            {owner && <td style={{ textAlign: 'right' }}>{m.role !== 'owner' && <button className="btn quiet sm danger" onClick={() => remove(m)}>Remove</button>}</td>}
          </tr>
        ))}</tbody>
      </table></div>
      {owner && (
        <div className="panel stack">
          <h3>Invite someone</h3>
          <form className="row" onSubmit={invite}>
            <input type="email" placeholder="colleague@university.edu" value={email} onChange={e => setEmail(e.target.value)} required style={{ flex: 1, minWidth: 220 }} />
            <button className="btn primary">Send invite</button>
          </form>
          {err && <div className="error">{err}</div>}
          {result && (
            <div className="note">
              {result.emailed ? <div>Invitation sent to {result.email}.</div> : <div>Email isn't set up on this server. Share this link with {result.email} instead:</div>}
              <div className="row" style={{ marginTop: 6 }}><code style={{ wordBreak: 'break-all' }}>{result.link}</code><button className="btn sm" onClick={() => copy(result.link)}>{copied === result.link ? 'Copied' : 'Copy link'}</button></div>
              <div className="muted small" style={{ marginTop: 4 }}>They will {result.existingUser ? 'sign in' : 'set a password'} and join automatically.</div>
            </div>
          )}
          {invites.length > 0 && (
            <div>
              <div className="muted small" style={{ marginBottom: 4 }}>Waiting to be accepted</div>
              {invites.map(i => (
                <div key={i.id} className="row spread small" style={{ padding: '6px 0', borderTop: '1px solid var(--rule)' }}>
                  <span>{i.email}</span>
                  <span className="row"><button className="btn quiet sm" onClick={() => copy(i.link)}>{copied === i.link ? 'Copied' : 'Copy link'}</button><button className="btn quiet sm danger" onClick={() => revoke(i)}>Revoke</button></span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

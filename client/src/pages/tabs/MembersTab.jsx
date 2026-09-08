import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import Avatar from '../../components/Avatar.jsx';

const hoursLeft = ms => Math.max(0, Math.round((ms - Date.now()) / 3600000));

export default function MembersTab({ campaign, members, owner, reload }) {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [invites, setInvites] = useState([]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const base = `/campaigns/${campaign.id}`;
  const loadInvites = () => owner && api(`${base}/invites`).then(d => setInvites(d.invites));
  useEffect(() => { loadInvites(); }, [campaign.id]);

  const handle = async (promise) => {
    setErr(''); setResult(null); setCopied(false); setBusy(true);
    try { const d = await promise; setResult(d); setEmail(''); loadInvites(); if (d.added) reload(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const invite = e => { e.preventDefault(); handle(api(`${base}/invites`, { method: 'POST', body: { email } })); };
  const resend = i => handle(api(`${base}/invites/${i.id}/resend`, { method: 'POST' }));
  const remove = async m => { if (!confirm(`Remove ${m.name}? Their assignments are cleared; submitted answers are kept.`)) return; await api(`${base}/members/${m.id}`, { method: 'DELETE' }); reload(); };
  const revoke = async i => { await api(`${base}/invites/${i.id}`, { method: 'DELETE' }); loadInvites(); };
  const transfer = async m => {
    if (!confirm(`Make ${m.name} the owner of "${campaign.name}"?\n\nThey will control criteria, papers, assignments and statistics. You stay on the team as an annotator and cannot undo this yourself.`)) return;
    try { await api(`${base}/transfer`, { method: 'POST', body: { user_id: m.id } }); window.location.assign(`${base.replace('/campaigns', '/campaigns')}/members`); } catch (e) { setErr(e.message); }
  };
  const copy = async t => { try { await navigator.clipboard.writeText(t); setCopied(true); } catch {} };

  return (
    <div className="stack" style={{ gap: 18, maxWidth: 820 }}>
      <div className="content-head"><div><h2>Team</h2><p className="hint">Everyone here can be assigned papers. Only the owner edits criteria, papers and stages.{owner && ' Use "Make owner" to hand the campaign to someone else.'}</p></div></div>
      {err && !result && <div className="note red">{err}</div>}
      <div className="table-wrap"><table>
        <thead><tr><th>Person</th><th>Email</th><th>Role</th>{owner && <th></th>}</tr></thead>
        <tbody>{members.map(m => (
          <tr key={m.id}>
            <td><span className="person"><Avatar name={m.name} /> {m.name}</span></td><td className="muted">{m.email}</td>
            <td><span className={'tag' + (m.role === 'owner' ? ' ink' : '')}>{m.role === 'owner' ? 'Owner' : 'Annotator'}</span></td>
            {owner && <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{m.role !== 'owner' && <><button className="btn quiet sm" onClick={() => transfer(m)}>Make owner</button> <button className="btn quiet sm danger" onClick={() => remove(m)}>Remove</button></>}</td>}
          </tr>
        ))}</tbody>
      </table></div>
      {owner && (
        <div className="panel stack">
          <h3>Invite someone</h3>
          <div className="muted small">They receive an email with a link to choose a password and join. The link works once and expires after a day; you can resend it from the list below.</div>
          <form className="row" onSubmit={invite}>
            <input type="email" placeholder="colleague@university.edu" value={email} onChange={e => setEmail(e.target.value)} required style={{ flex: 1, minWidth: 220 }} />
            <button className="btn primary" disabled={busy}>{busy ? 'Sending' : 'Send invitation'}</button>
          </form>
          {err && <div className="error">{err}</div>}
          {result && (
            <div className={'note' + (!result.emailed && result.mailEnabled ? ' red' : '')}>
              {result.added
                ? <div>{result.email} already has an account and is now a member{result.emailed ? '. They have been told by email.' : '.'}</div>
                : result.emailed
                  ? <div>Invitation sent to {result.email}. It expires in {hoursLeft(result.expires_at)} hours.</div>
                  : result.mailEnabled
                    ? <div>The email to {result.email} could not be sent. Share this link with them directly (valid {hoursLeft(result.expires_at)} hours):</div>
                    : <div>Email is not configured on this server, so share this link with {result.email} directly (valid {hoursLeft(result.expires_at)} hours):</div>}
              {result.link && <div className="row" style={{ marginTop: 6 }}><code style={{ wordBreak: 'break-all' }}>{result.link}</code><button className="btn sm" onClick={() => copy(result.link)}>{copied ? 'Copied' : 'Copy link'}</button></div>}
            </div>
          )}
          {invites.length > 0 && (
            <div>
              <div className="muted small" style={{ marginBottom: 4 }}>Waiting to be accepted</div>
              {invites.map(i => (
                <div key={i.id} className="row spread small" style={{ padding: '6px 0', borderTop: '1px solid var(--rule)' }}>
                  <span>{i.email} <span className={'tag ' + (i.expired ? 'danger' : '')}>{i.expired ? 'Link expired' : `Expires in ${hoursLeft(i.expires_at)} h`}</span></span>
                  <span className="row"><button className="btn sm" onClick={() => resend(i)} disabled={busy}>Resend</button><button className="btn quiet sm danger" onClick={() => revoke(i)}>Revoke</button></span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

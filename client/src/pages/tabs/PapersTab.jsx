import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import Modal from '../../components/Modal.jsx';
import Avatar, { Assignees } from '../../components/Avatar.jsx';

const cite = p => [p.authors?.split(';')[0]?.trim(), p.year, p.venue].filter(Boolean).join(', ');

export default function PapersTab({ campaign, members, owner, fields }) {
  const [papers, setPapers] = useState(null);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [filter, setFilter] = useState('all');
  const base = `/campaigns/${campaign.id}/papers`;
  const load = () => api(base).then(d => setPapers(d.papers));
  useEffect(() => { load(); }, [campaign.id]);
  if (!papers) return <div className="muted">Loading</div>;

  const counts = { all: papers.length, mine: papers.filter(p => p.assigned_to_me).length, unassigned: papers.filter(p => !p.assignees.length).length, nopdf: papers.filter(p => !p.has_pdf).length };
  const shown = papers.filter(p => filter === 'all' || (filter === 'mine' && p.assigned_to_me) || (filter === 'nopdf' && !p.has_pdf) || (filter === 'unassigned' && !p.assignees.length));
  const toggle = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const remove = async p => { if (!confirm(`Delete "${p.title}" and every annotation on it?`)) return; await api(`${base}/${p.id}`, { method: 'DELETE' }); load(); };
  const filters = [['all', 'All'], ['mine', 'Mine'], ...(owner ? [['unassigned', 'Unassigned'], ['nopdf', 'Missing PDF']] : [])];

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="content-head">
        <div><h2>Papers</h2><p className="hint">{owner ? 'Add papers by hand or import a BibTeX file. Every paper needs its PDF before anyone can annotate it.' : 'Open a paper to read it and record your answers.'}</p></div>
        {owner && <div className="row"><button className="btn sm" onClick={() => setModal('bib')}>Import BibTeX</button><button className="btn primary sm" onClick={() => setModal('manual')}>Add paper</button></div>}
      </div>
      {owner && fields.length === 0 && papers.length > 0 && <div className="note">No criteria defined yet, so annotators have nothing to answer. <Link to="../fields">Add criteria</Link>.</div>}
      <div className="row spread">
        <div className="seg">{filters.map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l} {counts[k] > 0 && <span style={{ opacity: .6 }}>{counts[k]}</span>}</button>)}</div>
        {owner && selected.size > 0 && <div className="row"><span className="small muted">{selected.size} selected</span><button className="btn mark sm" onClick={() => setModal({ bulk: [...selected] })}>Assign annotators</button><button className="btn quiet sm" onClick={() => setSelected(new Set())}>Clear</button></div>}
      </div>
      {shown.length === 0 ? (
        <div className="empty"><strong>{papers.length ? 'Nothing matches this filter' : 'No papers yet'}</strong>{papers.length ? '' : owner ? 'Import a .bib export from your reference manager, or add papers one at a time.' : 'The owner has not added papers yet.'}</div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr>
            {owner && <th style={{ width: 36 }}><input type="checkbox" aria-label="Select all" checked={selected.size === shown.length && shown.length > 0} onChange={e => setSelected(e.target.checked ? new Set(shown.map(p => p.id)) : new Set())} /></th>}
            <th>Paper</th><th>Annotators</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>{shown.map(p => (
            <tr key={p.id} className={selected.has(p.id) ? 'selected' : ''}>
              {owner && <td><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} /></td>}
              <td>
                <Link className="title" to={`${p.id}`}>{p.title}</Link>
                <div className="sub">{cite(p)}{p.bib_key ? <> <code>{p.bib_key}</code></> : null}</div>
                {!p.has_pdf && <div style={{ marginTop: 6 }}>{owner ? <button className="btn sm danger" onClick={() => setModal({ pdf: p })}>Upload the PDF</button> : <span className="tag danger">PDF missing</span>}</div>}
              </td>
              <td><span className="row"><Assignees paper={p} />{owner && <button className="btn quiet sm" onClick={() => setModal({ assign: p })}>{p.assignees.length ? 'Change' : 'Assign'}</button>}</span></td>
              <td>
                {p.assignees.length > 0 && <div><span className={'tag ' + (p.submitted_count === p.assignees.length ? 'ok' : p.submitted_count ? 'warn' : '')}>{p.submitted_count} of {p.assignees.length} submitted</span></div>}
                {p.assigned_to_me && <div style={{ marginTop: 4 }}><span className={'tag ' + (p.my_status === 'submitted' ? 'ok' : 'mark')}>{p.my_status === 'submitted' ? 'You submitted' : p.my_status === 'draft' ? 'Your draft' : 'Waiting for you'}</span></div>}
              </td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <Link className={'btn sm' + (p.assigned_to_me && p.my_status !== 'submitted' ? ' primary' : '')} to={`${p.id}`}>{p.assigned_to_me && p.my_status !== 'submitted' ? 'Annotate' : 'Open'}</Link>
                {owner && <button className="btn quiet sm danger" style={{ marginLeft: 4 }} onClick={() => remove(p)} aria-label="Delete">Delete</button>}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {modal === 'manual' && <ManualPaperModal base={base} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal === 'bib' && <BibImportModal base={base} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal?.pdf && <PdfUploadModal base={base} paper={modal.pdf} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal?.assign && <AssignModal base={base} members={members} papers={[modal.assign]} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal?.bulk && <AssignModal base={base} members={members} papers={papers.filter(p => modal.bulk.includes(p.id))} bulk onClose={() => setModal(null)} onDone={() => { setModal(null); setSelected(new Set()); load(); }} />}
    </div>
  );
}

function ManualPaperModal({ base, onClose, onDone }) {
  const [f, setF] = useState({ title: '', authors: '', year: '', venue: '', doi: '', abstract: '', bib_key: '' });
  const [pdf, setPdf] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault(); setErr(''); if (!pdf) return setErr('Attach the PDF first.');
    const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.append(k, v)); fd.append('pdf', pdf); setBusy(true);
    try { await api(base, { method: 'POST', form: fd }); onDone(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Add a paper" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">Title<input type="text" autoFocus value={f.title} onChange={set('title')} required /></label>
        <label className="field">Authors<span className="help">Separate with semicolons</span><input type="text" value={f.authors} onChange={set('authors')} placeholder="Smith, J.; Doe, A." /></label>
        <div className="row"><label className="field" style={{ flex: 1 }}>Year<input type="text" value={f.year} onChange={set('year')} /></label><label className="field" style={{ flex: 2 }}>Venue<input type="text" value={f.venue} onChange={set('venue')} /></label></div>
        <div className="row"><label className="field" style={{ flex: 1 }}>DOI<input type="text" value={f.doi} onChange={set('doi')} /></label><label className="field" style={{ flex: 1 }}>Citation key<input type="text" value={f.bib_key} onChange={set('bib_key')} /></label></div>
        <label className="field">Abstract<textarea value={f.abstract} onChange={set('abstract')} /></label>
        <label className="field">PDF<input type="file" accept="application/pdf" onChange={e => setPdf(e.target.files[0])} required /></label>
        {err && <div className="error">{err}</div>}
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Uploading' : 'Add paper'}</button></div>
      </form>
    </Modal>
  );
}

function BibImportModal({ base, onClose, onDone }) {
  const [text, setText] = useState(''); const [file, setFile] = useState(null); const [err, setErr] = useState(''); const [res, setRes] = useState(null);
  const submit = async e => { e.preventDefault(); setErr(''); const fd = new FormData(); file ? fd.append('file', file) : fd.append('text', text); try { setRes(await api(`${base}/import-bib`, { method: 'POST', form: fd })); } catch (e) { setErr(e.message); } };
  if (res) return <Modal title="Imported" onClose={onDone}>
    <p style={{ marginTop: 0 }}>{res.created} {res.created === 1 ? 'paper' : 'papers'} added{res.skipped ? `, ${res.skipped} skipped because the citation key already exists` : ''}.</p>
    <div className="note">Imported papers have no PDF yet. Use the Missing PDF filter to attach one to each; annotation stays locked until then.</div>
    <div className="actions"><button className="btn primary" onClick={onDone}>Done</button></div>
  </Modal>;
  return (
    <Modal title="Import BibTeX" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">Choose a .bib file<input type="file" accept=".bib,.txt" onChange={e => setFile(e.target.files[0])} /></label>
        <div className="muted small" style={{ textAlign: 'center' }}>or paste entries</div>
        <textarea rows={8} value={text} onChange={e => setText(e.target.value)} placeholder={'@article{smith2020,\n  title = {…},\n  author = {…},\n  year = {2020}\n}'} disabled={!!file} style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5 }} />
        {err && <div className="error">{err}</div>}
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!file && !text.trim()}>Import</button></div>
      </form>
    </Modal>
  );
}

export function PdfUploadModal({ base, paper, onClose, onDone }) {
  const [pdf, setPdf] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async e => { e.preventDefault(); const fd = new FormData(); fd.append('pdf', pdf); setBusy(true); try { await api(`${base}/${paper.id}/pdf`, { method: 'POST', form: fd }); onDone(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <Modal title={paper.has_pdf ? 'Replace the PDF' : 'Upload the PDF'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="serif" style={{ fontSize: 18 }}>{paper.title}</div>
        <input type="file" accept="application/pdf" onChange={e => setPdf(e.target.files[0])} required />
        {err && <div className="error">{err}</div>}
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!pdf || busy}>{busy ? 'Uploading' : 'Upload'}</button></div>
      </form>
    </Modal>
  );
}

export function AssignModal({ base, members, papers, bulk, onClose, onDone }) {
  const [ids, setIds] = useState(new Set(bulk ? [] : papers[0].assignees.map(a => a.id)));
  const [mode, setMode] = useState('add'); const [err, setErr] = useState('');
  const toggle = id => setIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const save = async () => { try { bulk ? await api(`${base}/bulk-assign`, { method: 'POST', body: { paper_ids: papers.map(p => p.id), user_ids: [...ids], mode } }) : await api(`${base}/${papers[0].id}/assignees`, { method: 'PUT', body: { user_ids: [...ids] } }); onDone(); } catch (e) { setErr(e.message); } };
  return (
    <Modal title={bulk ? `Assign ${papers.length} papers` : 'Who annotates this paper?'} onClose={onClose}>
      <div className="stack">
        {!bulk && <div className="serif" style={{ fontSize: 18 }}>{papers[0].title}</div>}
        <div className="muted small">Pick as many people as you like. Two or more on the same paper is what makes agreement statistics possible.</div>
        <div className="choices">{members.map(m => <label key={m.id} className="opt"><input type="checkbox" checked={ids.has(m.id)} onChange={() => toggle(m.id)} /><Avatar name={m.name} /> {m.name}{m.role === 'owner' && <span className="muted small">(owner)</span>}</label>)}</div>
        {bulk && <div className="seg"><button className={mode === 'add' ? 'on' : ''} onClick={() => setMode('add')}>Add to current annotators</button><button className={mode === 'replace' ? 'on' : ''} onClick={() => setMode('replace')}>Replace them</button></div>}
        {err && <div className="error">{err}</div>}
        <div className="actions"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save assignment</button></div>
      </div>
    </Modal>
  );
}

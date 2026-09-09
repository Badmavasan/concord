import { Fragment, useEffect, useRef, useState } from 'react';

const MIN_W = 320, DEFAULT_W = 440;
const readWidth = () => { try { const v = Number(localStorage.getItem('concord.readerWidth')); return v >= MIN_W ? v : DEFAULT_W; } catch { return DEFAULT_W; } };
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PdfUploadModal, AssignModal, EditPaperModal } from './tabs/PapersTab.jsx';
import Avatar, { Assignees } from '../components/Avatar.jsx';

export default function PaperView() {
  const { id, paperId } = useParams();
  const { user } = useAuth();
  const [camp, setCamp] = useState(null);
  const [data, setData] = useState(null);
  const [values, setValues] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [modal, setModal] = useState(null);
  const [showOthers, setShowOthers] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState(null); // null | 'saving' | 'saved' | 'error'
  const [editing, setEditing] = useState(false); // editing a done annotation
  const saveTimer = useRef(null);
  const latest = useRef({ values: {}, dirty: false, submitted: false, editing: false });
  const [guide, setGuide] = useState(true);
  const [width, setWidth] = useState(readWidth);
  const [dragging, setDragging] = useState(false);
  const readerRef = useRef(null);

  // Divider drag: the pointer is captured on the handle so the iframe never swallows the move events.
  const startDrag = e => {
    e.preventDefault(); setDragging(true); e.currentTarget.setPointerCapture(e.pointerId);
    const onMove = ev => { const rect = readerRef.current.getBoundingClientRect(); const w = Math.round(rect.right - ev.clientX); setWidth(Math.min(Math.max(w, MIN_W), Math.round(rect.width * 0.75))); };
    const onUp = () => { setDragging(false); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); setWidth(w => { try { localStorage.setItem('concord.readerWidth', String(w)); } catch {} return w; }); };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };
  const nudge = e => { const d = e.key === 'ArrowLeft' ? 24 : e.key === 'ArrowRight' ? -24 : 0; if (!d) return; e.preventDefault(); setWidth(w => { const n = Math.max(MIN_W, w + d); try { localStorage.setItem('concord.readerWidth', String(n)); } catch {} return n; }); };
  const resetWidth = () => { setWidth(DEFAULT_W); try { localStorage.removeItem('concord.readerWidth'); } catch {} };
  const base = `/campaigns/${id}`;
  const load = () => Promise.all([api(base), api(`${base}/papers/${paperId}`)]).then(([c, p]) => { setCamp(c); setData(p); setValues(p.my_annotation?.values || {}); setDirty(false); setEditing(false); setSaveState(null); });
  useEffect(() => { load(); }, [id, paperId]);

  const paper = data?.paper, my_annotation = data?.my_annotation, all_annotations = data?.all_annotations || [];
  const owner = camp?.campaign.role === 'owner';
  const canAnnotate = !!paper && (paper.assigned_to_me || owner);
  const submitted = my_annotation?.status === 'submitted';
  const others = all_annotations.filter(a => a.user_id !== user.id);
  latest.current = { values, dirty, submitted, editing };

  // Autosave: while an annotation is not yet done, every change is written to the database shortly after it is made.
  useEffect(() => {
    if (!data || !dirty || submitted || !canAnnotate || !paper.has_pdf) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save('draft', { quiet: true }), 700);
    return () => clearTimeout(saveTimer.current);
  }, [values]);
  // Leaving the page: flush unsaved draft answers with a keepalive request; warn when a post-validation edit is pending.
  useEffect(() => {
    const flush = () => {
      const l = latest.current;
      if (l.dirty && !l.submitted) { clearTimeout(saveTimer.current); fetch(`/api${base}/papers/${paperId}/annotation`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: l.values, status: 'draft' }), keepalive: true, credentials: 'same-origin' }).catch(() => {}); }
    };
    const warn = e => { if (latest.current.editing && latest.current.dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); window.addEventListener('pagehide', flush);
    return () => { flush(); window.removeEventListener('beforeunload', warn); window.removeEventListener('pagehide', flush); };
  }, [paperId]);

  if (!camp || !data) return <div className="page muted">Loading</div>;
  const save = async (status, { quiet } = {}) => {
    if (!quiet) { setMsg(null); setFieldErrors({}); }
    setSaveState('saving');
    try {
      const d = await api(`${base}/papers/${paperId}/annotation`, { method: 'PUT', body: { values: latest.current.values, status } });
      setData(x => ({ ...x, my_annotation: d.annotation, paper: d.paper })); setDirty(false); setSaveState('saved');
      if (status === 'submitted') { setEditing(false); setMsg({ ok: true, text: editing ? 'Changes saved' : 'Marked as done' }); }
    } catch (e) { setSaveState('error'); if (!quiet) { setMsg({ ok: false, text: e.message }); setFieldErrors(e.data?.field_errors || {}); } }
  };
  const cancelEdit = () => { setValues(my_annotation?.values || {}); setDirty(false); setEditing(false); setMsg(null); setFieldErrors({}); };
  const setVal = (fid, v) => { setValues(vs => ({ ...vs, [fid]: v })); setDirty(true); };

  return (
    <div className={'reader' + (dragging ? ' dragging' : '')} ref={readerRef} style={{ '--margin-w': width + 'px' }}>
      <div className="pdf-pane">
        {paper.has_pdf ? <iframe title="Paper PDF" src={`/api${base}/papers/${paperId}/pdf`} /> : (
          <div className="pdf-empty"><div>This paper has no PDF yet.</div>{owner && <button className="btn mark" onClick={() => setModal('pdf')}>Upload the PDF</button>}</div>
        )}
      </div>
      <div className="divider" role="separator" aria-orientation="vertical" aria-label="Resize the annotation panel (drag, arrow keys, double-click to reset)" tabIndex={0} onPointerDown={startDrag} onKeyDown={nudge} onDoubleClick={resetWidth}><span /></div>
      <aside className="margin">
        <div className="margin-scroll">
          <div className="margin-head">
            <Link className="small" to={`${base}/papers`}>← {camp.campaign.name}</Link>
            <h2>{paper.title}</h2>
            <div className="meta">{[paper.authors, paper.year, paper.venue].filter(Boolean).join('. ')}{paper.doi && <> <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer">doi:{paper.doi}</a></>}</div>
            {paper.abstract && <details><summary>Abstract</summary><p>{paper.abstract}</p></details>}
            <div className="row" style={{ marginTop: 12 }}>
              <Assignees paper={paper} />
              {owner && <button className="btn quiet sm" onClick={() => setModal('assign')}>Assign</button>}
              {owner && <button className="btn quiet sm" onClick={() => setModal('edit')}>Edit</button>}
              {owner && paper.has_pdf && <button className="btn quiet sm" onClick={() => setModal('pdf')}>Replace PDF</button>}
            </div>
          </div>
          <hr className="rule" style={{ margin: '16px 0 4px' }} />
          {!canAnnotate ? <div className="muted" style={{ padding: '12px 0' }}>You're not assigned to this paper, so there is nothing to answer.</div>
            : !paper.has_pdf ? <div className="note red" style={{ marginTop: 12 }}>Answers are locked until the PDF is attached.</div>
            : camp.fields.length === 0 ? <div className="muted" style={{ padding: '12px 0' }}>No criteria have been defined for this campaign yet.</div>
            : (
              <form id="annotation" className={submitted && !editing ? 'readonly' : ''} onSubmit={e => { e.preventDefault(); save('submitted'); }}>
                {submitted && !editing && <div className="note" style={{ marginTop: 12 }}>Marked as done{my_annotation?.updated_at ? ` on ${new Date(my_annotation.updated_at + 'Z').toLocaleString()}` : ''}. Use Edit to change your answers.</div>}
                {camp.fields.some(f => f.option_help && Object.keys(f.option_help).length) && <label className="opt small muted" style={{ padding: '10px 0 0' }}><input type="checkbox" checked={guide} onChange={e => setGuide(e.target.checked)} /> Show coding rules under each option</label>}
                {camp.fields.map((f, i) => <Fragment key={f.id}>
                  {f.group_name && (i === 0 || camp.fields[i - 1].group_name !== f.group_name) && <h3 className="section-head">{f.group_name}</h3>}
                  <Question f={f} n={i + 1} value={values[f.id]} error={fieldErrors[f.id]} guide={guide} disabled={submitted && !editing} onChange={v => setVal(f.id, v)} />
                </Fragment>)}
              </form>
            )}
          {owner && others.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <button className="btn sm" onClick={() => setShowOthers(s => !s)}>{showOthers ? 'Hide' : 'Show'} other people's answers ({others.length})</button>
              {showOthers && others.map(a => (
                <div key={a.id} className="panel" style={{ marginTop: 10, padding: 14 }}>
                  <div className="person" style={{ marginBottom: 6 }}><Avatar name={a.user_name} status={a.status} /> <strong>{a.user_name}</strong> <span className={'tag ' + (a.status === 'submitted' ? 'ok' : 'warn')}>{a.status}</span></div>
                  <table className="small"><tbody>{camp.fields.map(f => <tr key={f.id}><td className="muted" style={{ width: 150, padding: '4px 0', border: 0 }}>{f.name}</td><td style={{ padding: '4px 0', border: 0 }}>{fmtVal(a.values[f.id])}</td></tr>)}</tbody></table>
                </div>
              ))}
            </div>
          )}
        </div>
        {canAnnotate && paper.has_pdf && camp.fields.length > 0 && (
          <div className="margin-foot">
            <span className="state">
              {msg ? <span className={msg.ok ? 'success' : 'error'}>{msg.text}</span>
                : submitted && !editing ? <span className="tag ok">Done</span>
                : editing ? (dirty ? 'Editing, not saved yet' : 'Editing')
                : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? <span className="error">Could not save, check your connection</span>
                : dirty ? 'Unsaved' : my_annotation ? 'All answers saved' : 'Answers save automatically'}
            </span>
            <span className="row">
              {submitted && !editing && <button type="button" className="btn" onClick={() => { setEditing(true); setMsg(null); }}>Edit answers</button>}
              {editing && <button type="button" className="btn" onClick={cancelEdit}>Cancel</button>}
              {editing && <button form="annotation" className="btn mark" disabled={!dirty}>Save changes</button>}
              {!submitted && <button form="annotation" className="btn mark">Mark as done</button>}
            </span>
          </div>
        )}
      </aside>
      {modal === 'edit' && <EditPaperModal base={`${base}/papers`} paper={paper} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal === 'pdf' && <PdfUploadModal base={`${base}/papers`} paper={paper} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal === 'assign' && <AssignModal base={`${base}/papers`} members={camp.members} papers={[paper]} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
    </div>
  );
}

const fmtVal = v => v == null || v === '' ? '—' : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);

function Question({ f, n, value, error, guide, disabled, onChange }) {
  const name = 'f' + f.id;
  const help = o => guide && f.option_help?.[o] ? <span className="opt-help">{f.option_help[o]}</span> : null;
  let input;
  if (f.type === 'text') input = <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={3} disabled={disabled} />;
  else if (f.type === 'number') input = <input type="number" step="any" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} style={{ width: 160 }} disabled={disabled} />;
  else if (f.type === 'boolean') input = <div className="yn">{[[true, 'Yes'], [false, 'No']].map(([v, l]) => <label key={l}><input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} disabled={disabled} />{l}</label>)}</div>;
  else if (f.type === 'single') input = <div className="choices">{f.options.map(o => <label key={o} className={'opt' + (help(o) ? ' with-help' : '')}><input type="radio" name={name} checked={value === o} onChange={() => onChange(o)} disabled={disabled} /><span>{o}{help(o)}</span></label>)}</div>;
  else if (f.type === 'multi') input = <div className="choices">{f.options.map(o => <label key={o} className={'opt' + (help(o) ? ' with-help' : '')}><input type="checkbox" checked={(value || []).includes(o)} onChange={e => onChange(e.target.checked ? [...(value || []), o] : (value || []).filter(x => x !== o))} disabled={disabled} /><span>{o}{help(o)}</span></label>)}</div>;
  else if (f.type === 'scale') { const pts = []; for (let i = f.options.min; i <= f.options.max; i++) pts.push(i); input = <div className="scale">{pts.map(i => <label key={i}><input type="radio" name={name} checked={Number(value) === i} onChange={() => onChange(i)} disabled={disabled} />{i}</label>)}</div>; }
  return (
    <div className={'question' + (error ? ' invalid' : '')}>
      <div className="q"><span className="muted" style={{ fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>{n}.</span><span>{f.name}{f.required && <span className="req"> *</span>}</span></div>
      {f.description && <div className="help" style={{ whiteSpace: 'pre-line' }}>{f.description}</div>}
      <div className="answer">{input}</div>
      {error && <div className="error small" style={{ marginTop: 4 }}>{error}</div>}
    </div>
  );
}

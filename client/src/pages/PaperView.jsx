import { Fragment, useEffect, useRef, useState } from 'react';

const MIN_W = 320, DEFAULT_W = 440;
// An "other" option opens a text box: "Autre", "Other", "autre : ..." but not "Autre(s) LLM(s)". Keep in sync with server/codebook.js.
export const isOtherOption = v => /^(autres?|others?)\s*(:.*)?$/i.test(String(v).trim());
export const otherKey = id => `${id}:other`;
export const checkKey = id => `${id}:checks`;
export const noteKey = id => `${id}:note`;
// A criterion counts as answered when it has a value or a ticked checkbox.
const answered = (f, values) => { const v = values[f.id]; const ck = values[checkKey(f.id)]; return (Array.isArray(ck) && ck.length > 0) || !(v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)); };
const readWidth = () => { try { const v = Number(localStorage.getItem('concord.readerWidth')); return v >= MIN_W ? v : DEFAULT_W; } catch { return DEFAULT_W; } };
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PdfUploadModal, AssignModal, EditPaperModal } from './tabs/PapersTab.jsx';
import Avatar, { Assignees } from '../components/Avatar.jsx';
import Modal from '../components/Modal.jsx';

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
  const [confirm, setConfirm] = useState(null); // null | { unanswered: [...] } | { errors: [...] } shown before/after Mark as done
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
      if (status === 'submitted') { setEditing(false); setMsg({ ok: true, text: editing ? 'Changes saved' : 'Marked as done' }); api(`${base}/papers/${paperId}`).then(p => setData(x => ({ ...x, all_annotations: p.all_annotations }))).catch(() => {}); }
    } catch (e) {
      setSaveState('error');
      if (!quiet) {
        const fe = e.data?.field_errors || {}; setFieldErrors(fe);
        if (Object.keys(fe).length) { setMsg(null); return camp.fields.map((f, i) => ({ f, n: i + 1, msg: fe[f.id] })).filter(x => x.msg); }
        setMsg({ ok: false, text: e.message });
      }
      return false;
    }
    return true;
  };
  // Mark as done: warn first about unanswered criteria (answers are already saved), and explain any validation problem in a popup.
  const requestDone = (force = false) => {
    const unanswered = camp.fields.map((f, i) => ({ f, n: i + 1 })).filter(({ f }) => !answered(f, values));
    if (unanswered.length && !force) return setConfirm({ unanswered });
    setConfirm(null); save('submitted').then(r => { if (Array.isArray(r) && r.length) setConfirm({ errors: r }); });
  };
  const goTo = id => { setConfirm(null); setTimeout(() => document.getElementById('q-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); };
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
              <form id="annotation" className={submitted && !editing ? 'readonly' : ''} onSubmit={e => { e.preventDefault(); requestDone(); }}>
                {submitted && !editing && <div className="note" style={{ marginTop: 12 }}>Marked as done{my_annotation?.updated_at ? ` on ${new Date(my_annotation.updated_at + 'Z').toLocaleString()}` : ''}. Use Edit to change your answers.</div>}
                {camp.campaign.guidelines && <details className="guidelines" open={!my_annotation}><summary>Annotation guidelines</summary><div>{camp.campaign.guidelines}</div></details>}
                {camp.fields.some(f => f.option_help && Object.keys(f.option_help).length) && <label className="opt small muted" style={{ padding: '10px 0 0' }}><input type="checkbox" checked={guide} onChange={e => setGuide(e.target.checked)} /> Show coding rules under each option</label>}
                {camp.fields.map((f, i) => <Fragment key={f.id}>
                  {f.group_name && (i === 0 || camp.fields[i - 1].group_name !== f.group_name) && <><h3 className="section-head">{f.group_name}</h3>{camp.campaign.group_help?.[f.group_name] && <p className="section-help">{camp.campaign.group_help[f.group_name]}</p>}</>}
                  <Question f={f} n={i + 1} value={values[f.id]} other={values[otherKey(f.id)]} note={values[noteKey(f.id)]} onNote={t => setVal(noteKey(f.id), t)} ticked={values[checkKey(f.id)]} onTick={l => setVal(checkKey(f.id), l)} error={fieldErrors[f.id]} guide={guide} disabled={submitted && !editing} onChange={v => setVal(f.id, v)} onOther={t => setVal(otherKey(f.id), t)} />
                </Fragment>)}
              </form>
            )}
          {others.length > 0 && ( /* owner: always; annotator: only after marking their own as done, decided by the server */
            <div style={{ marginTop: 16 }}>
              <button className="btn sm" onClick={() => setShowOthers(s => !s)}>{showOthers ? 'Hide' : 'Show'} other people's answers ({others.length})</button>
              {showOthers && others.map(a => (
                <div key={a.id} className="panel" style={{ marginTop: 10, padding: 14 }}>
                  <div className="person" style={{ marginBottom: 6 }}><Avatar name={a.user_name} status={a.status} /> <strong>{a.user_name}</strong> <span className={'tag ' + (a.status === 'submitted' ? 'ok' : 'warn')}>{a.status}</span></div>
                  <table className="small"><tbody>{camp.fields.map(f => <tr key={f.id}><td className="muted" style={{ width: 150, padding: '4px 0', border: 0 }}>{f.name}</td><td style={{ padding: '4px 0', border: 0 }}>{(a.values[checkKey(f.id)] || []).length ? `[${a.values[checkKey(f.id)].join(', ')}] ${a.values[f.id] || ''}` : fmtVal(a.values[f.id])}{a.values[noteKey(f.id)] ? <div className="muted" style={{ fontStyle: 'italic' }}>{a.values[noteKey(f.id)]}</div> : null}{a.values[otherKey(f.id)] ? ` (${a.values[otherKey(f.id)]})` : ''}</td></tr>)}</tbody></table>
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
      {confirm?.unanswered && (
        <Modal title="Some criteria are not answered" onClose={() => setConfirm(null)}>
          <div className="stack">
            <div className="small">Your answers are saved. {confirm.unanswered.length === 1 ? 'One criterion has' : `${confirm.unanswered.length} criteria have`} no answer yet. Conditional questions that do not apply can stay empty.</div>
            <div className="picker-list" style={{ maxHeight: '40vh' }}>{confirm.unanswered.map(({ f, n }) => <button key={f.id} type="button" className="missing-row" onClick={() => goTo(f.id)}><span className="muted">{n}.</span> {f.name}</button>)}</div>
            <div className="actions"><button className="btn" onClick={() => setConfirm(null)}>Keep annotating</button><button className="btn mark" onClick={() => requestDone(true)}>Mark as done anyway</button></div>
          </div>
        </Modal>
      )}
      {confirm?.errors && (
        <Modal title="This annotation cannot be marked as done yet" onClose={() => setConfirm(null)}>
          <div className="stack">
            <div className="small">Your answers are saved and the paper stays in progress. Fix {confirm.errors.length === 1 ? 'this point' : 'these points'}, then mark it as done again.</div>
            <div className="picker-list" style={{ maxHeight: '40vh' }}>{confirm.errors.map(({ f, n, msg }) => <button key={f.id} type="button" className="missing-row" onClick={() => goTo(f.id)}><span className="muted">{n}.</span> {f.name}<span className="error small" style={{ display: 'block' }}>{msg}</span></button>)}</div>
            <div className="actions"><button className="btn primary" onClick={() => goTo(confirm.errors[0].f.id)}>Go to the first one</button></div>
          </div>
        </Modal>
      )}
      {modal === 'edit' && <EditPaperModal base={`${base}/papers`} paper={paper} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal === 'pdf' && <PdfUploadModal base={`${base}/papers`} paper={paper} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal === 'assign' && <AssignModal base={`${base}/papers`} members={camp.members} papers={[paper]} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
    </div>
  );
}

const fmtVal = v => v == null || v === '' ? '—' : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);

function Question({ f, n, value, other, note, onNote, ticked, onTick, error, guide, disabled, onChange, onOther }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const hasNote = !!String(note || '').trim();
  const name = 'f' + f.id;
  const takesText = o => isOtherOption(o) || (f.text_options || []).includes(o);
  const firstText = (Array.isArray(value) ? f.options.filter(o => value.includes(o)) : [value]).find(takesText); // one text box per question
  const otherBox = o => takesText(o) && o === firstText ? <input type="text" className="other-text" value={other || ''} onChange={e => onOther(e.target.value)} placeholder="Précisez" aria-label={`${o}: précisez`} disabled={disabled} maxLength={500} /> : null;
  const help = o => guide && f.option_help?.[o] ? <span className="opt-help">{f.option_help[o]}</span> : null;
  let input;
  const checks = f.checks || []; const on = Array.isArray(ticked) ? ticked : [];
  const na = checks.some(c => c.exclusive && on.includes(c.label)); // an exclusive box replaces the text
  const toggle = (c, b) => { const next = b ? (c.exclusive ? [c.label] : [...on.filter(l => !checks.find(x => x.label === l)?.exclusive), c.label]) : on.filter(l => l !== c.label); onTick(next); if (b && c.exclusive && value) onChange(''); };
  const naBox = checks.length ? <div className="choices" style={{ marginTop: 6 }}>{checks.map(c => <label key={c.label} className={'opt' + (guide && c.description ? ' with-help' : '')}><input type="checkbox" checked={on.includes(c.label)} onChange={e => toggle(c, e.target.checked)} disabled={disabled} /><span>{c.label}{guide && c.description ? <span className="opt-help">{c.description}</span> : null}</span></label>)}</div> : null;
  if (f.type === 'text') input = <><textarea value={na ? '' : (value || '')} onChange={e => onChange(e.target.value)} rows={3} disabled={disabled || na} />{naBox}</>;
  else if (f.type === 'number') input = <><input type="number" step="any" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} style={{ width: 160 }} disabled={disabled || na} />{naBox}</>;
  else if (f.type === 'boolean') input = <div className="yn">{[[true, 'Yes'], [false, 'No']].map(([v, l]) => <label key={l}><input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} disabled={disabled} />{l}</label>)}</div>;
  else if (f.type === 'single') input = <div className="choices">{f.options.map(o => <label key={o} className={'opt' + (help(o) ? ' with-help' : '')}><input type="radio" name={name} checked={value === o} onChange={() => onChange(o)} disabled={disabled} /><span>{o}{help(o)}{otherBox(o)}</span></label>)}</div>;
  else if (f.type === 'multi') input = <div className="choices">{f.options.map(o => <label key={o} className={'opt' + (help(o) ? ' with-help' : '')}><input type="checkbox" checked={(value || []).includes(o)} onChange={e => onChange(e.target.checked ? [...(value || []), o] : (value || []).filter(x => x !== o))} disabled={disabled} /><span>{o}{help(o)}{otherBox(o)}</span></label>)}</div>;
  else if (f.type === 'scale') { const pts = []; for (let i = f.options.min; i <= f.options.max; i++) pts.push(i); input = <div className="scale">{pts.map(i => <label key={i}><input type="radio" name={name} checked={Number(value) === i} onChange={() => onChange(i)} disabled={disabled} />{i}</label>)}</div>; }
  return (
    <div className={'question' + (error ? ' invalid' : '')} id={'q-' + f.id}>
      <div className="q"><span className="muted" style={{ fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>{n}.</span><span>{f.name}{f.required && <span className="req"> *</span>}</span></div>
      {f.description && <div className="help" style={{ whiteSpace: 'pre-line' }}>{f.description}</div>}
      <div className="answer">{input}</div>
      {error && <div className="error small" style={{ marginTop: 4 }}>{error}</div>}
      {disabled
        ? (hasNote && <div className="note-read"><span className="muted">Comment</span> {note}</div>)
        : (noteOpen || hasNote)
          ? <textarea className="note-box" rows={2} maxLength={2000} value={note || ''} onChange={e => onNote(e.target.value)} placeholder="Comment or justification, optional: why this answer, what was ambiguous, where in the paper" aria-label={`Comment on ${f.name}`} autoFocus={noteOpen && !hasNote} />
          : <button type="button" className="btn quiet sm note-toggle" onClick={() => setNoteOpen(true)}>Add a comment</button>}
    </div>
  );
}

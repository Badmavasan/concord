import { Fragment, useState } from 'react';
import { api } from '../../api.js';
import Modal from '../../components/Modal.jsx';

const TYPES = [
  ['single', 'Single choice', 'Pick exactly one option'], ['multi', 'Multiple choice', 'Pick any number of options'],
  ['boolean', 'Yes or no', ''], ['scale', 'Scale', 'A number between a minimum and a maximum'],
  ['number', 'Number', 'Any numeric value'], ['text', 'Free text', 'A written answer, not scored for agreement'],
];
const blank = { name: '', description: '', type: 'single', options: '', min: 1, max: 5, required: true, group_name: '' };
const optionsToText = f => (Array.isArray(f.options) ? f.options : []).map(o => f.option_help?.[o] ? `${o} :: ${f.option_help[o]}` : o).join('\n');
const textToOptions = t => { const options = [], option_help = {}; for (const line of t.split('\n')) { const [label, ...rest] = line.split('::'); const l = label.trim(); if (!l) continue; options.push(l); if (rest.length) option_help[l] = rest.join('::').trim(); } return { options, option_help }; };

export default function FieldsTab({ campaign, fields, reload }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [err, setErr] = useState('');
  const [importResult, setImportResult] = useState(null);
  const base = `/campaigns/${campaign.id}/fields`;

  const open = f => {
    setErr('');
    setForm(f ? { name: f.name, description: f.description || '', type: f.type, options: optionsToText(f), min: f.options?.min ?? 1, max: f.options?.max ?? 5, required: f.required, group_name: f.group_name || '' } : blank);
    setEditing(f || 'new');
  };
  const save = async e => {
    e.preventDefault(); setErr('');
    const parsed = textToOptions(form.options);
    const body = { name: form.name, description: form.description, type: form.type, required: form.required, group_name: form.group_name, options: form.type === 'scale' ? { min: Number(form.min), max: Number(form.max) } : parsed.options, option_help: parsed.option_help };
    try { editing === 'new' ? await api(base, { method: 'POST', body }) : await api(`${base}/${editing.id}`, { method: 'PATCH', body }); setEditing(null); reload(); } catch (e) { setErr(e.message); }
  };
  const remove = async f => { if (!confirm(`Delete "${f.name}"? Answers already given for it will be hidden.`)) return; await api(`${base}/${f.id}`, { method: 'DELETE' }); reload(); };
  const move = async (i, dir) => { const order = fields.map(f => f.id); const j = i + dir; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; await api(`${base}/order`, { method: 'PUT', body: { order } }); reload(); };
  const importXlsx = async e => {
    const file = e.target.files[0]; if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try { setImportResult(await api(`${base}/import`, { method: 'POST', form: fd })); reload(); } catch (e) { setImportResult({ created: [], errors: [e.message] }); }
    e.target.value = '';
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="content-head">
        <div><h2>Criteria</h2><p className="hint">The questions every annotator answers per paper. Choice fields are what agreement statistics are computed on.</p></div>
        <div className="row">
          <a className="btn sm" href={`/api${base}/template.xlsx`}>Excel template</a>
          <label className="btn sm">Import Excel<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={importXlsx} /></label>
          <button className="btn primary sm" onClick={() => open(null)}>Add criterion</button>
        </div>
      </div>
      {importResult && (
        <div className={'note' + (importResult.errors.length && !importResult.created.length ? ' red' : '')}>
          <div className="row spread"><span>Imported {importResult.created.length} {importResult.created.length === 1 ? 'criterion' : 'criteria'}.</span><button className="btn quiet sm" onClick={() => setImportResult(null)}>Dismiss</button></div>
          {importResult.errors.map((e, i) => <div key={i} className="error">{e}</div>)}
        </div>
      )}
      {fields.length === 0 ? (
        <div className="empty"><strong>No criteria yet</strong>Add them one at a time, or import a spreadsheet: either the simple template, or a codebook with one row per option (Groupe, Question, Type de réponse, Option, Logique d'annotation).</div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th style={{ width: 84 }}>Order</th><th>Criterion</th><th>Type</th><th>Options</th><th>Required</th><th></th></tr></thead>
          <tbody>{fields.map((f, i) => (
            <Fragment key={f.id}>
              {f.group_name && (i === 0 || fields[i - 1].group_name !== f.group_name) && <tr className="section"><td colSpan={6}>{f.group_name}</td></tr>}
              <tr>
                <td><span className="row" style={{ gap: 2, flexWrap: 'nowrap' }}><button className="btn quiet icon sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button><button className="btn quiet icon sm" onClick={() => move(i, 1)} disabled={i === fields.length - 1} aria-label="Move down">↓</button></span></td>
                <td><strong>{f.name}</strong>{f.description && <div className="sub" style={{ whiteSpace: 'pre-line' }}>{f.description}</div>}</td>
                <td><span className="tag">{TYPES.find(t => t[0] === f.type)?.[1] || f.type}</span></td>
                <td className="small muted">{Array.isArray(f.options) ? f.options.join(', ') : f.type === 'scale' ? `${f.options.min} to ${f.options.max}` : ''}{Object.keys(f.option_help || {}).length > 0 && <div className="tag" style={{ marginTop: 4 }}>coding rules</div>}</td>
                <td>{f.required ? 'Yes' : 'No'}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}><button className="btn quiet sm" onClick={() => open(f)}>Edit</button> <button className="btn quiet sm danger" onClick={() => remove(f)}>Delete</button></td>
              </tr>
            </Fragment>
          ))}</tbody>
        </table></div>
      )}
      {editing && (
        <Modal title={editing === 'new' ? 'Add criterion' : 'Edit criterion'} onClose={() => setEditing(null)}>
          <form className="stack" onSubmit={save}>
            <label className="field">Question<input type="text" autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Does the study report a control group?" /></label>
            <label className="field">Section<span className="help">Optional. Criteria with the same section are shown together, e.g. "A : Architecture".</span><input type="text" value={form.group_name} onChange={e => setForm({ ...form, group_name: e.target.value })} list="groups" /><datalist id="groups">{[...new Set(fields.map(f => f.group_name).filter(Boolean))].map(g => <option key={g} value={g} />)}</datalist></label>
            <label className="field">Guidance for annotators<span className="help">Optional. Shown under the question.</span><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
            <label className="field">Answer type<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><span className="help">{TYPES.find(t => t[0] === form.type)?.[2]}</span></label>
            {(form.type === 'single' || form.type === 'multi') && <label className="field">Options<span className="help">One per line. Add a coding rule after two colons, e.g. "Cohort study :: participants followed over time".</span><textarea value={form.options} onChange={e => setForm({ ...form, options: e.target.value })} placeholder={'Randomised trial :: participants allocated at random\nCohort study\nCase report'} required rows={6} /></label>}
            {form.type === 'scale' && <div className="row"><label className="field" style={{ flex: 1 }}>From<input type="number" value={form.min} onChange={e => setForm({ ...form, min: e.target.value })} /></label><label className="field" style={{ flex: 1 }}>To<input type="number" value={form.max} onChange={e => setForm({ ...form, max: e.target.value })} /></label></div>}
            <label className="opt"><input type="checkbox" checked={form.required} onChange={e => setForm({ ...form, required: e.target.checked })} /> Required before an annotation can be submitted</label>
            {err && <div className="error">{err}</div>}
            <div className="actions"><button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button><button className="btn primary">{editing === 'new' ? 'Add criterion' : 'Save changes'}</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

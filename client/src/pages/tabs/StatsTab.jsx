import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import Modal from '../../components/Modal.jsx';

// The paper selection is remembered per campaign in this browser, and shared with the Papers tab.
export const selKey = id => `concord.results.${id}`;
export const readSel = id => { try { const v = JSON.parse(localStorage.getItem(selKey(id)) || 'null'); return v && Array.isArray(v.ids) ? v : { mode: 'all', ids: [] }; } catch { return { mode: 'all', ids: [] }; } };
const writeSel = (id, v) => { try { localStorage.setItem(selKey(id), JSON.stringify(v)); } catch {} };

const papersN = n => `${n} paper${n === 1 ? '' : 's'}`;
const fmt = (x, d = 2) => (x == null || Number.isNaN(x)) ? '—' : Number(x).toFixed(d);
const pct = x => x == null ? '—' : Math.round(x * 100) + '%';
const kColor = k => k == null ? 'var(--muted)' : k < 0.4 ? 'var(--red)' : k < 0.6 ? 'var(--amber)' : 'var(--green)';

export default function StatsTab({ campaign, owner }) {
  const [data, setData] = useState(null); const [err, setErr] = useState('');
  const [sel, setSel] = useState(() => readSel(campaign.id));
  const [picking, setPicking] = useState(false);
  const filtered = sel.mode === 'selected';
  const query = filtered && sel.ids.length ? `?papers=${sel.ids.join(',')}` : '';
  useEffect(() => {
    if (filtered && !sel.ids.length) return; // nothing chosen yet: keep the previous data, show the prompt
    setErr(''); api(`/campaigns/${campaign.id}/stats${query}`).then(setData).catch(e => setErr(e.message));
  }, [campaign.id, query]);
  const choose = v => { setSel(v); writeSel(campaign.id, v); };
  if (err) return <div className="note red">{err}</div>;
  if (!data) return <div className="muted">Loading</div>;
  const { summary, fields, conflicts, scope, paper_list } = data;
  const known = new Set(paper_list.map(p => p.id));
  const chosen = sel.ids.filter(id => known.has(id));
  const empty = filtered && !chosen.length;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="content-head">
        <div><h2>Results</h2><p className="hint">{owner
          ? 'Computed from annotations marked as done, across every paper or only the ones you choose. Kappa above 0.6 is substantial agreement, above 0.8 almost perfect; below 0.4 means the criterion needs clearer guidance.'
          : `You see results for the ${scope.visible} paper${scope.visible === 1 ? '' : 's'} you have marked as done, so colleagues' answers never come before your own. Kappa above 0.6 is substantial agreement, above 0.8 almost perfect.`}</p></div>
        {!empty && <a className="btn sm" href={`/api/campaigns/${campaign.id}/stats/export.xlsx${query}`}>Export {filtered ? 'these papers' : 'to Excel'}</a>}
      </div>
      <div className="row spread result-scope">
        <div className="seg">
          <button className={!filtered ? 'on' : ''} onClick={() => choose({ ...sel, mode: 'all' })}>All papers <span style={{ opacity: .6 }}>{scope.visible}</span></button>
          <button className={filtered ? 'on' : ''} onClick={() => chosen.length ? choose({ ...sel, mode: 'selected' }) : setPicking(true)}>Selected papers <span style={{ opacity: .6 }}>{chosen.length}</span></button>
        </div>
        <span className="row">
          {filtered && chosen.length > 0 && <span className="small muted">Showing {summary.papers} of {scope.visible}</span>}
          <button className="btn sm" onClick={() => setPicking(true)}>Choose papers</button>
        </span>
      </div>
      {empty && <div className="empty"><strong>No papers chosen</strong>Use Choose papers to pick the ones to compare.</div>}
      {picking && <PaperPicker papers={paper_list} initial={chosen} onClose={() => setPicking(false)} onApply={ids => { choose({ mode: ids.length ? 'selected' : 'all', ids }); setPicking(false); }} />}
      {!empty && <>
      <div className="summary">
        <div><div className="v">{summary.papers}</div><div className="l">papers</div></div>
        <div><div className="v">{summary.assignments}</div><div className="l">assignments</div></div>
        <div><div className="v">{summary.submitted}</div><div className="l">submitted annotations</div></div>
        <div><div className="v">{summary.papers_with_2plus}</div><div className="l">papers with a submission</div></div>
        <div><div className="v">{summary.raters}</div><div className="l">active annotators</div></div>
      </div>
      {summary.submitted === 0 && <div className="empty"><strong>Nothing marked as done{filtered ? ' among these papers' : ' yet'}</strong>Results appear once annotators mark papers as done.</div>}
      {summary.submitted > 0 && fields.map((f, i) => <Fragment key={f.field_id}>{f.group_name && (i === 0 || fields[i - 1].group_name !== f.group_name) && <h3 className="section-head">{f.group_name}</h3>}<FieldCard f={f} /></Fragment>)}
      {conflicts.length > 0 && (
        <div className="panel stack">
          <h2 className="serif">Where annotators disagree</h2>
          <div className="table-wrap"><table>
            <thead><tr><th>Paper</th><th>Criterion</th><th>Answers</th></tr></thead>
            <tbody>{conflicts.flatMap(c => c.diffs.map((d, i) => (
              <tr key={c.paper_id + '-' + i}>
                <td>{i === 0 && <Link className="title" to={`../papers/${c.paper_id}`}>{c.title}</Link>}</td>
                <td>{d.field}</td>
                <td className="small">{d.values.map((v, j) => <div key={j}><span className="muted">{v.user}</span> {Array.isArray(v.value) ? v.value.join(', ') : String(v.value ?? '—')}{v.other ? ` (${v.other})` : ''}{v.note ? <span className="muted" style={{ fontStyle: 'italic' }}> — {v.note}</span> : null}</div>)}</td>
              </tr>
            )))}</tbody>
          </table></div>
        </div>
      )}
      </>}
    </div>
  );
}

function FieldCard({ f }) {
  const label = { text: 'Free text', single: 'Single choice', multi: 'Multiple choice', boolean: 'Yes or no', number: 'Number', scale: 'Scale' }[f.type];
  const headline = f.fleiss ? { k: f.fleiss.kappa, l: `Fleiss' κ across ${f.fleiss.raters} annotators on ${papersN(f.fleiss.n)}`, i: f.fleiss.interpretation } : 'mean_pairwise_kappa' in f ? { k: f.mean_pairwise_kappa, l: "mean pairwise Cohen's κ", i: f.interpretation } : null;
  return (
    <div className="field-stat">
      <div><h2>{f.name}</h2><div className="muted small">{label}, rated on {papersN(f.n_papers_rated)}, {f.n_papers_multi} of them by two or more people</div></div>
      {headline && <div className="kappa-box"><span className={'k' + (headline.k != null && headline.k >= 0.6 ? ' hi' : '')} style={{ color: kColor(headline.k) }}>{fmt(headline.k)}</span><div className="l">{headline.l}, {headline.i.toLowerCase()}</div></div>}
      <div className="body">
        {f.distribution && <Distribution dist={f.distribution} />}
        {f.type === 'scale' && f.mean != null && <div className="stat-inline"><span>Mean rating <b>{fmt(f.mean)}</b></span></div>}
        {f.pairwise?.length > 0 && f.type !== 'number' && (
          <div className="table-wrap"><table>
            <thead><tr><th>Pair</th><th>Papers in common</th><th>Raw agreement</th><th>Cohen's κ</th></tr></thead>
            <tbody>{f.pairwise.map((p, i) => <tr key={i}><td>{p.a} and {p.b}</td><td className="num">{p.n}</td><td className="num">{pct(p.agreement)}</td><td className="kappa" style={{ color: kColor(p.kappa) }}>{fmt(p.kappa)}</td></tr>)}</tbody>
          </table></div>
        )}
        {f.type === 'multi' && (<>
          <div className="table-wrap"><table>
            <thead><tr><th>Option</th><th>Times chosen</th><th>κ treating the option as yes/no</th><th></th></tr></thead>
            <tbody>{f.per_option.map(o => <tr key={o.option}><td>{o.option}</td><td className="num">{o.count}</td><td className="kappa" style={{ color: kColor(o.mean_pairwise_kappa) }}>{fmt(o.mean_pairwise_kappa)}</td><td className="muted small">{o.interpretation}</td></tr>)}</tbody>
          </table></div>
          {f.pairwise_jaccard.length > 0 && <div className="stat-inline">{f.pairwise_jaccard.map(p => <span key={p.a + p.b}>{p.a} and {p.b} overlap <b>{fmt(p.jaccard)}</b> on {p.n} papers</span>)}</div>}
        </>)}
        {f.type === 'number' && (<>
          <div className="stat-inline"><span>Mean <b>{fmt(f.mean)}</b></span><span>SD <b>{fmt(f.sd)}</b></span><span>Min <b>{fmt(f.min, 0)}</b></span><span>Max <b>{fmt(f.max, 0)}</b></span></div>
          {f.pairwise.length > 0 && <div className="table-wrap"><table>
            <thead><tr><th>Pair</th><th>n</th><th>Identical values</th><th>Mean absolute difference</th><th>Pearson r</th></tr></thead>
            <tbody>{f.pairwise.map((p, i) => <tr key={i}><td>{p.a} and {p.b}</td><td className="num">{p.n}</td><td className="num">{pct(p.exact_agreement)}</td><td className="num">{fmt(p.mean_abs_diff)}</td><td className="num">{fmt(p.pearson)}</td></tr>)}</tbody>
          </table></div>}
        </>)}
        {f.other_texts?.length > 0 && <div className="small"><span className="muted">Texts entered with "Autre": </span>{f.other_texts.map(t => `${t.text} (${t.count})`).join(', ')}</div>}
        {f.checks?.some(c => c.count > 0) && <div className="small muted">{f.checks.filter(c => c.count > 0).map(c => `${c.label}: ${c.count}`).join(', ')}</div>}
        {f.type === 'text' && <div className="stat-inline"><span><b>{f.filled}</b> answers written</span><span>average length <b>{f.avg_length}</b> characters</span></div>}
      </div>
    </div>
  );
}

function Distribution({ dist }) {
  const total = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  return <div className="dist">{entries.map(([k, v]) => <div key={k} className="r"><span title={k}>{k === 'true' ? 'Yes' : k === 'false' ? 'No' : k}</span><div className="bar"><i style={{ width: (v / total * 100) + '%' }} /></div><span>{v} ({Math.round(v / total * 100)}%)</span></div>)}</div>;
}

// Multi-select of papers with search and quick filters. Selection applies to everything on the Results page and the export.
function PaperPicker({ papers, initial, onClose, onApply }) {
  const [ids, setIds] = useState(new Set(initial));
  const [text, setText] = useState('');
  const [only, setOnly] = useState('all'); // all | multi | mine | selected
  const [stage, setStage] = useState('');
  const stages = useMemo(() => [...new Set(papers.map(p => p.stage).filter(Boolean))], [papers]);
  const shown = papers.filter(p => {
    const t = text.trim().toLowerCase();
    if (t && !`${p.title} ${p.bib_key || ''} ${p.venue || ''} ${p.year || ''}`.toLowerCase().includes(t)) return false;
    if (only === 'multi' && p.submitted < 2) return false;
    if (only === 'mine' && !p.mine) return false;
    if (only === 'selected' && !ids.has(p.id)) return false;
    if (stage && p.stage !== stage) return false;
    return true;
  });
  const toggle = id => setIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const all = (on) => setIds(s => { const n = new Set(s); shown.forEach(p => on ? n.add(p.id) : n.delete(p.id)); return n; });
  return (
    <Modal title="Choose papers" onClose={onClose} width="min(760px, 100%)">
      <div className="stack">
        <input type="text" autoFocus placeholder="Search title, citation key, venue, year" value={text} onChange={e => setText(e.target.value)} />
        <div className="row spread">
          <div className="seg">
            {[['all', 'All'], ['multi', '2+ annotators'], ['mine', 'Done by me'], ['selected', 'Selected']].map(([k, l]) => <button key={k} className={only === k ? 'on' : ''} onClick={() => setOnly(k)}>{l}</button>)}
          </div>
          {stages.length > 1 && <select className="select-inline" value={stage} onChange={e => setStage(e.target.value)}><option value="">Every stage</option>{stages.map(s => <option key={s}>{s}</option>)}</select>}
        </div>
        <div className="row spread small">
          <span className="muted">{shown.length} shown, {ids.size} selected</span>
          <span className="row"><button className="btn quiet sm" onClick={() => all(true)} disabled={!shown.length}>Select shown</button><button className="btn quiet sm" onClick={() => all(false)} disabled={!shown.length}>Clear shown</button></span>
        </div>
        <div className="picker-list">
          {shown.length === 0 ? <div className="muted small" style={{ padding: 12 }}>No paper matches.</div> : shown.map(p => (
            <label key={p.id} className={'picker-row' + (ids.has(p.id) ? ' on' : '')}>
              <input type="checkbox" checked={ids.has(p.id)} onChange={() => toggle(p.id)} />
              <span><span className="title">{p.title}</span><span className="sub">{[p.bib_key, p.venue, p.stage].filter(Boolean).join(', ')}</span></span>
              <span className={'tag' + (p.submitted >= 2 ? ' ok' : '')}>{p.submitted} done</span>
            </label>
          ))}
        </div>
        <div className="actions">
          <button className="btn quiet" onClick={() => setIds(new Set())}>Clear selection</button>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onApply([...ids])}>{ids.size ? `Show results for ${ids.size} paper${ids.size === 1 ? '' : 's'}` : 'Show all papers'}</button>
        </div>
      </div>
    </Modal>
  );
}

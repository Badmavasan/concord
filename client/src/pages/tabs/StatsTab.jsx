import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';

const fmt = (x, d = 2) => (x == null || Number.isNaN(x)) ? '—' : Number(x).toFixed(d);
const pct = x => x == null ? '—' : Math.round(x * 100) + '%';
const kColor = k => k == null ? 'var(--muted)' : k < 0.4 ? 'var(--red)' : k < 0.6 ? 'var(--amber)' : 'var(--green)';

export default function StatsTab({ campaign }) {
  const [data, setData] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { api(`/campaigns/${campaign.id}/stats`).then(setData).catch(e => setErr(e.message)); }, [campaign.id]);
  if (err) return <div className="note red">{err}</div>;
  if (!data) return <div className="muted">Loading</div>;
  const { summary, fields, conflicts } = data;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="content-head">
        <div><h2>Agreement</h2><p className="hint">Computed from submitted annotations only. Kappa above 0.6 is substantial agreement, above 0.8 almost perfect; below 0.4 means the criterion needs clearer guidance.</p></div>
        <a className="btn sm" href={`/api/campaigns/${campaign.id}/stats/export.xlsx`}>Export to Excel</a>
      </div>
      <div className="summary">
        <div><div className="v">{summary.papers}</div><div className="l">papers</div></div>
        <div><div className="v">{summary.assignments}</div><div className="l">assignments</div></div>
        <div><div className="v">{summary.submitted}</div><div className="l">submitted annotations</div></div>
        <div><div className="v">{summary.papers_with_2plus}</div><div className="l">papers with a submission</div></div>
        <div><div className="v">{summary.raters}</div><div className="l">active annotators</div></div>
      </div>
      {summary.submitted === 0 && <div className="empty"><strong>Nothing submitted yet</strong>Statistics appear once annotators submit their answers.</div>}
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
                <td className="small">{d.values.map((v, j) => <div key={j}><span className="muted">{v.user}</span> {Array.isArray(v.value) ? v.value.join(', ') : String(v.value ?? '—')}</div>)}</td>
              </tr>
            )))}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

function FieldCard({ f }) {
  const label = { text: 'Free text', single: 'Single choice', multi: 'Multiple choice', boolean: 'Yes or no', number: 'Number', scale: 'Scale' }[f.type];
  const headline = f.fleiss ? { k: f.fleiss.kappa, l: `Fleiss' κ across ${f.fleiss.raters} annotators on ${f.fleiss.n} papers`, i: f.fleiss.interpretation } : 'mean_pairwise_kappa' in f ? { k: f.mean_pairwise_kappa, l: "mean pairwise Cohen's κ", i: f.interpretation } : null;
  return (
    <div className="field-stat">
      <div><h2>{f.name}</h2><div className="muted small">{label}, rated on {f.n_papers_rated} papers, {f.n_papers_multi} of them by two or more people</div></div>
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

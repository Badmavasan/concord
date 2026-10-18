import { Router } from 'express';
import XLSX from 'xlsx';
import { q } from '../db.js';
import { requireMember } from '../auth.js';
import { fieldStats } from '../stats.js';
import { isOtherOption, otherKey, checkKey } from '../codebook.js';

const r = Router({ mergeParams: true });

// Who sees which papers' results. The owner sees every paper. An annotator sees only the papers they have
// marked as done, so nobody can read colleagues' answers on a paper before giving their own (which would
// bias them and make the agreement figures meaningless).
function visiblePapers(req) {
  if (req.role === 'owner') return q.all('SELECT id, title, bib_key, venue, year, stage_id FROM papers WHERE campaign_id = ? ORDER BY id', req.campaign.id);
  return q.all(`SELECT p.id, p.title, p.bib_key, p.venue, p.year, p.stage_id FROM papers p JOIN annotations a ON a.paper_id = p.id
    WHERE p.campaign_id = ? AND a.user_id = ? AND a.status = 'submitted' ORDER BY p.id`, req.campaign.id, req.user.id);
}

// ?papers=1,2,3 restricts results to those papers, within what the caller may see. No parameter = all visible papers.
function selectedPapers(req, visible) {
  const raw = String(req.query.papers || '').trim();
  if (!raw) return visible;
  const want = new Set(raw.split(',').map(Number).filter(Number.isInteger));
  return visible.filter(p => want.has(p.id));
}

function collect(campaignId, papers) {
  const fields = q.all('SELECT * FROM fields WHERE campaign_id = ? ORDER BY position, id', campaignId);
  const users = q.all('SELECT u.id, u.name FROM campaign_members m JOIN users u ON u.id = m.user_id WHERE m.campaign_id = ? ORDER BY u.name', campaignId);
  const ids = new Set(papers.map(p => p.id));
  const anns = q.all(`SELECT a.paper_id, a.user_id, a.values_json FROM annotations a JOIN papers p ON p.id = a.paper_id WHERE p.campaign_id = ? AND a.status = 'submitted'`, campaignId)
    .filter(a => ids.has(a.paper_id)).map(a => ({ ...a, values: JSON.parse(a.values_json || '{}') }));
  return { fields, users, papers, anns };
}

function guard(req, res) {
  const visible = visiblePapers(req);
  if (req.role !== 'owner' && !visible.length) { res.status(403).json({ error: 'Results open once you have marked at least one paper as done.' }); return null; }
  return { visible, selected: selectedPapers(req, visible) };
}

r.get('/', requireMember, (req, res) => {
  const g = guard(req, res); if (!g) return;
  const { fields, users, papers, anns } = collect(req.campaign.id, g.selected);
  const raters = users.filter(u => anns.some(a => a.user_id === u.id));
  const perField = fields.map(f => {
    const ratings = anns.filter(a => a.values[f.id] !== undefined && a.values[f.id] !== null && a.values[f.id] !== '')
      .map(a => ({ paper_id: a.paper_id, user_id: a.user_id, value: a.values[f.id] }));
    const st = fieldStats(f, ratings, raters);
    const cks = JSON.parse(f.checks || '[]'); if (cks.length) st.checks = cks.map(c => ({ label: c.label, count: anns.filter(a => (a.values[checkKey(f.id)] || []).includes?.(c.label)).length }));
    // Texts entered with an "other" option, most frequent first, so recurring values can be promoted to options.
    const tx = JSON.parse(f.text_options || '[]'); const takesText = o => isOtherOption(o) || tx.includes(o);
    if ((f.type === 'single' || f.type === 'multi') && JSON.parse(f.options || '[]').some(takesText)) {
      const counts = {};
      for (const a of anns) { const t = String(a.values[otherKey(f.id)] || '').trim(); const v = a.values[f.id]; if (t && (Array.isArray(v) ? v : [v]).some(takesText)) counts[t] = (counts[t] || 0) + 1; }
      st.other_texts = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([text, count]) => ({ text, count }));
    }
    return st;
  });
  // Disagreements per paper on categorical fields
  const conflicts = [];
  for (const p of papers) {
    const pa = anns.filter(a => a.paper_id === p.id);
    if (pa.length < 2) continue;
    const diffs = [];
    for (const f of fields) {
      if (!['single', 'boolean', 'scale', 'multi'].includes(f.type)) continue;
      const vals = pa.map(a => JSON.stringify(f.type === 'multi' ? [...(a.values[f.id] || [])].sort() : a.values[f.id] ?? null));
      if (new Set(vals).size > 1) diffs.push({ field: f.name, values: pa.map(a => ({ user: users.find(u => u.id === a.user_id)?.name, value: a.values[f.id] ?? null, other: a.values[otherKey(f.id)] || undefined, note: a.values[`${f.id}:note`] || undefined })) });
    }
    if (diffs.length) conflicts.push({ paper_id: p.id, title: p.title, diffs });
  }
  const selIds = new Set(papers.map(p => p.id));
  const assigned = q.all('SELECT a.paper_id FROM paper_assignments a JOIN papers p ON p.id = a.paper_id WHERE p.campaign_id = ?', req.campaign.id).filter(a => selIds.has(a.paper_id)).length;
  // The list the paper picker offers: everything the caller may see, with enough to filter on.
  const stages = Object.fromEntries(q.all('SELECT id, name FROM stages WHERE campaign_id = ?', req.campaign.id).map(s => [s.id, s.name]));
  const allSubmitted = q.all(`SELECT a.paper_id, a.user_id FROM annotations a JOIN papers p ON p.id = a.paper_id WHERE p.campaign_id = ? AND a.status = 'submitted'`, req.campaign.id);
  const paper_list = g.visible.map(p => {
    const subs = allSubmitted.filter(a => a.paper_id === p.id);
    return { id: p.id, title: p.title, bib_key: p.bib_key, venue: p.venue, year: p.year, stage: stages[p.stage_id] || '', submitted: subs.length, mine: subs.some(a => a.user_id === req.user.id) };
  });
  res.json({
    scope: { role: req.role, visible: g.visible.length, selected: papers.length, filtered: !!String(req.query.papers || '').trim() },
    summary: { papers: papers.length, assignments: assigned, submitted: anns.length, raters: raters.length, papers_with_2plus: new Set(anns.map(a => a.paper_id)).size },
    fields: perField, conflicts, paper_list,
  });
});

// Export all submitted annotations as xlsx
r.get('/export.xlsx', requireMember, (req, res) => {
  const g = guard(req, res); if (!g) return;
  const { fields, users, papers, anns } = collect(req.campaign.id, g.selected);
  const header = ['paper_id', 'bib_key', 'title', 'annotator', ...fields.map(f => f.name), 'comments'];
  const rows = anns.map(a => {
    const p = papers.find(x => x.id === a.paper_id);
    return [a.paper_id, p?.bib_key || '', p?.title || '', users.find(u => u.id === a.user_id)?.name || a.user_id,
      ...fields.map(f => { const ck = Array.isArray(a.values[checkKey(f.id)]) ? a.values[checkKey(f.id)] : []; if (ck.length) return [...ck.map(l => `[${l}]`), ...(a.values[f.id] ? [a.values[f.id]] : [])].join(' '); const v = a.values[f.id]; const t = String(a.values[otherKey(f.id)] || '').trim(); const tx = JSON.parse(f.text_options || '[]'); const withText = x => (t && (isOtherOption(x) || tx.includes(x))) ? `${x}: ${t}` : x; return Array.isArray(v) ? v.map(withText).join('; ') : (v == null ? '' : withText(v)); }),
      fields.filter(f => String(a.values[`${f.id}:note`] || '').trim()).map(f => `${f.name}: ${a.values[`${f.id}:note`].trim()}`).join('\n')];
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), 'annotations');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const suffix = String(req.query.papers || '').trim() ? `-${papers.length}-papers` : '';
  res.setHeader('Content-Disposition', `attachment; filename="campaign-${req.campaign.id}-annotations${suffix}.xlsx"`);
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buf);
});

export default r;

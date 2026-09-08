import { Router } from 'express';
import XLSX from 'xlsx';
import { q } from '../db.js';
import { requireMember, requireOwner } from '../auth.js';
import { fieldStats } from '../stats.js';

const r = Router({ mergeParams: true });

function collect(campaignId) {
  const fields = q.all('SELECT * FROM fields WHERE campaign_id = ? ORDER BY position, id', campaignId);
  const users = q.all('SELECT u.id, u.name FROM campaign_members m JOIN users u ON u.id = m.user_id WHERE m.campaign_id = ? ORDER BY u.name', campaignId);
  const papers = q.all('SELECT id, title, bib_key FROM papers WHERE campaign_id = ?', campaignId);
  const anns = q.all(`SELECT a.paper_id, a.user_id, a.values_json FROM annotations a JOIN papers p ON p.id = a.paper_id WHERE p.campaign_id = ? AND a.status = 'submitted'`, campaignId)
    .map(a => ({ ...a, values: JSON.parse(a.values_json || '{}') }));
  return { fields, users, papers, anns };
}

r.get('/', requireMember, requireOwner, (req, res) => {
  const { fields, users, papers, anns } = collect(req.campaign.id);
  const raters = users.filter(u => anns.some(a => a.user_id === u.id));
  const perField = fields.map(f => {
    const ratings = anns.filter(a => a.values[f.id] !== undefined && a.values[f.id] !== null && a.values[f.id] !== '')
      .map(a => ({ paper_id: a.paper_id, user_id: a.user_id, value: a.values[f.id] }));
    return fieldStats(f, ratings, raters);
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
      if (new Set(vals).size > 1) diffs.push({ field: f.name, values: pa.map(a => ({ user: users.find(u => u.id === a.user_id)?.name, value: a.values[f.id] ?? null })) });
    }
    if (diffs.length) conflicts.push({ paper_id: p.id, title: p.title, diffs });
  }
  const assigned = q.get('SELECT COUNT(*) AS n FROM paper_assignments a JOIN papers p ON p.id = a.paper_id WHERE p.campaign_id = ?', req.campaign.id).n;
  res.json({
    summary: { papers: papers.length, assignments: assigned, submitted: anns.length, raters: raters.length, papers_with_2plus: new Set(anns.map(a => a.paper_id)).size },
    fields: perField, conflicts,
  });
});

// Export all submitted annotations as xlsx
r.get('/export.xlsx', requireMember, requireOwner, (req, res) => {
  const { fields, users, papers, anns } = collect(req.campaign.id);
  const header = ['paper_id', 'bib_key', 'title', 'annotator', ...fields.map(f => f.name)];
  const rows = anns.map(a => {
    const p = papers.find(x => x.id === a.paper_id);
    return [a.paper_id, p?.bib_key || '', p?.title || '', users.find(u => u.id === a.user_id)?.name || a.user_id,
      ...fields.map(f => { const v = a.values[f.id]; return Array.isArray(v) ? v.join('; ') : (v ?? ''); })];
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), 'annotations');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="campaign-${req.campaign.id}-annotations.xlsx"`);
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buf);
});

export default r;

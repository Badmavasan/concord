import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { q, db, UPLOAD_DIR } from '../db.js';
import { requireMember, requireOwner } from '../auth.js';
import { parseBibtex, bibToPaper } from '../bibtex.js';
import { str } from '../security.js';

const r = Router({ mergeParams: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const pdfStorage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`),
});
const uploadPdf = multer({
  storage: pdfStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) ? cb(null, true) : cb(new Error('Only PDF files are accepted')),
});
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Reject files that are not really PDFs (extension/mimetype are client-controlled).
function verifyPdf(file) {
  if (!file) return 'No PDF uploaded';
  const fd = fs.openSync(file.path, 'r'); const buf = Buffer.alloc(5); fs.readSync(fd, buf, 0, 5, 0); fs.closeSync(fd);
  if (buf.toString('latin1') !== '%PDF-') { fs.rmSync(file.path, { force: true }); return 'The uploaded file is not a PDF'; }
  return null;
}
const safeName = n => String(n || 'paper.pdf').replace(/[^\w.\- ()]/g, '_').slice(0, 150);

function firstStage(cid) { return q.get('SELECT id FROM stages WHERE campaign_id = ? ORDER BY position LIMIT 1', cid)?.id ?? null; }
function nextPos(stageId) { return q.get('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM papers WHERE stage_id IS ?', stageId).p; }

function decorate(p, userId) {
  const assignees = q.all('SELECT u.id, u.name, u.email FROM paper_assignments a JOIN users u ON u.id = a.user_id WHERE a.paper_id = ? ORDER BY u.name', p.id);
  const annotations = q.all('SELECT user_id, status, updated_at FROM annotations WHERE paper_id = ?', p.id);
  const mine = annotations.find(a => a.user_id === userId);
  return {
    ...p,
    has_pdf: !!p.pdf_path,
    assignees,
    annotations,
    submitted_count: annotations.filter(a => a.status === 'submitted').length,
    my_status: mine?.status || (assignees.some(a => a.id === userId) ? 'pending' : null),
    assigned_to_me: assignees.some(a => a.id === userId),
  };
}

r.get('/', requireMember, (req, res) => {
  const rows = q.all('SELECT * FROM papers WHERE campaign_id = ? ORDER BY stage_id, position, id', req.campaign.id);
  res.json({ papers: rows.map(p => decorate(p, req.user.id)) });
});

// Manual creation: multipart with fields + pdf (required)
r.post('/', requireMember, requireOwner, uploadPdf.single('pdf'), (req, res) => {
  const title = str(req.body.title, 500), authors = str(req.body.authors, 2000), year = str(req.body.year, 10), venue = str(req.body.venue, 300), doi = str(req.body.doi, 200), abstract = str(req.body.abstract, 10000), bib_key = str(req.body.bib_key, 100);
  if (!title) { if (req.file) fs.rmSync(req.file.path, { force: true }); return res.status(400).json({ error: 'Title is required' }); }
  if (!req.file) return res.status(400).json({ error: 'A PDF is required for every paper' });
  const bad = verifyPdf(req.file); if (bad) return res.status(400).json({ error: bad });
  const stage = firstStage(req.campaign.id);
  const info = q.run(`INSERT INTO papers (campaign_id, bib_key, title, authors, year, venue, doi, abstract, pdf_path, pdf_name, stage_id, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, req.campaign.id, bib_key || null, title, authors, year, venue, doi, abstract,
    req.file.filename, safeName(req.file.originalname), stage, nextPos(stage));
  res.json({ paper: decorate(q.get('SELECT * FROM papers WHERE id = ?', info.lastInsertRowid), req.user.id) });
});

// Bib import: creates papers without PDFs (flagged); PDFs attached afterwards.
r.post('/import-bib', requireMember, requireOwner, uploadMem.single('file'), (req, res) => {
  const text = req.file ? req.file.buffer.toString('utf8') : (req.body.text || '');
  if (!text.trim()) return res.status(400).json({ error: 'No BibTeX content' });
  const entries = parseBibtex(text);
  if (!entries.length) return res.status(400).json({ error: 'No entries found in BibTeX' });
  const stage = firstStage(req.campaign.id);
  const created = [];
  db.prepare('BEGIN').run();
  try {
    for (const e of entries) {
      const p = bibToPaper(e);
      if (p.bib_key && q.get('SELECT id FROM papers WHERE campaign_id = ? AND bib_key = ?', req.campaign.id, p.bib_key)) continue;
      const info = q.run(`INSERT INTO papers (campaign_id, bib_key, title, authors, year, venue, doi, abstract, stage_id, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        req.campaign.id, p.bib_key, p.title, p.authors, p.year, p.venue, p.doi, p.abstract, stage, nextPos(stage));
      created.push(info.lastInsertRowid);
    }
    db.prepare('COMMIT').run();
  } catch (e) { db.prepare('ROLLBACK').run(); throw e; }
  res.json({ created: created.length, skipped: entries.length - created.length });
});

r.get('/:paperId', requireMember, (req, res) => {
  const p = q.get('SELECT * FROM papers WHERE id = ? AND campaign_id = ?', req.params.paperId, req.campaign.id);
  if (!p) return res.status(404).json({ error: 'Paper not found' });
  const annotations = q.all('SELECT a.*, u.name AS user_name FROM annotations a JOIN users u ON u.id = a.user_id WHERE paper_id = ?', p.id)
    .map(a => ({ ...a, values: JSON.parse(a.values_json || '{}') }));
  const mine = annotations.find(a => a.user_id === req.user.id);
  res.json({ paper: decorate(p, req.user.id), my_annotation: mine || null, all_annotations: req.role === 'owner' ? annotations : annotations.filter(a => a.user_id === req.user.id) });
});

r.patch('/:paperId', requireMember, requireOwner, (req, res) => {
  const p = q.get('SELECT * FROM papers WHERE id = ? AND campaign_id = ?', req.params.paperId, req.campaign.id);
  if (!p) return res.status(404).json({ error: 'Paper not found' });
  const f = (k, max) => req.body[k] === undefined ? null : str(req.body[k], max);
  const title = f('title', 500);
  if (title === '') return res.status(400).json({ error: 'Title is required' });
  q.run('UPDATE papers SET title = COALESCE(?, title), authors = COALESCE(?, authors), year = COALESCE(?, year), venue = COALESCE(?, venue), doi = COALESCE(?, doi), abstract = COALESCE(?, abstract) WHERE id = ?',
    title, f('authors', 2000), f('year', 10), f('venue', 300), f('doi', 200), f('abstract', 10000), p.id);
  res.json({ paper: decorate(q.get('SELECT * FROM papers WHERE id = ?', p.id), req.user.id) });
});

r.delete('/:paperId', requireMember, requireOwner, (req, res) => {
  const p = q.get('SELECT * FROM papers WHERE id = ? AND campaign_id = ?', req.params.paperId, req.campaign.id);
  if (!p) return res.status(404).json({ error: 'Paper not found' });
  if (p.pdf_path) fs.rmSync(path.join(UPLOAD_DIR, p.pdf_path), { force: true });
  q.run('DELETE FROM papers WHERE id = ?', p.id);
  res.json({ ok: true });
});

// PDF upload / replace
r.post('/:paperId/pdf', requireMember, requireOwner, uploadPdf.single('pdf'), (req, res) => {
  const p = q.get('SELECT * FROM papers WHERE id = ? AND campaign_id = ?', req.params.paperId, req.campaign.id);
  if (!p) { if (req.file) fs.rmSync(req.file.path, { force: true }); return res.status(404).json({ error: 'Paper not found' }); }
  const bad = verifyPdf(req.file); if (bad) return res.status(400).json({ error: bad });
  if (p.pdf_path) fs.rmSync(path.join(UPLOAD_DIR, p.pdf_path), { force: true });
  q.run('UPDATE papers SET pdf_path = ?, pdf_name = ? WHERE id = ?', req.file.filename, safeName(req.file.originalname), p.id);
  res.json({ paper: decorate(q.get('SELECT * FROM papers WHERE id = ?', p.id), req.user.id) });
});

r.get('/:paperId/pdf', requireMember, (req, res) => {
  const p = q.get('SELECT * FROM papers WHERE id = ? AND campaign_id = ?', req.params.paperId, req.campaign.id);
  if (!p?.pdf_path) return res.status(404).json({ error: 'No PDF' });
  res.setHeader('Content-Disposition', `inline; filename="${safeName(p.pdf_name)}"`);
  res.type('application/pdf').sendFile(path.join(UPLOAD_DIR, path.basename(p.pdf_path)));
});

// Assignments (multiple users per paper)
r.put('/:paperId/assignees', requireMember, requireOwner, (req, res) => {
  const p = q.get('SELECT id FROM papers WHERE id = ? AND campaign_id = ?', req.params.paperId, req.campaign.id);
  if (!p) return res.status(404).json({ error: 'Paper not found' });
  const ids = [...new Set((req.body.user_ids || []).map(Number))];
  const members = new Set(q.all('SELECT user_id FROM campaign_members WHERE campaign_id = ?', req.campaign.id).map(m => m.user_id));
  db.prepare('BEGIN').run();
  q.run('DELETE FROM paper_assignments WHERE paper_id = ?', p.id);
  for (const uid of ids) if (members.has(uid)) q.run('INSERT INTO paper_assignments (paper_id, user_id) VALUES (?, ?)', p.id, uid);
  db.prepare('COMMIT').run();
  res.json({ paper: decorate(q.get('SELECT * FROM papers WHERE id = ?', p.id), req.user.id) });
});

// Bulk assign: { paper_ids, user_ids, mode: 'add'|'replace' }
r.post('/bulk-assign', requireMember, requireOwner, (req, res) => {
  const { paper_ids = [], user_ids = [], mode = 'add' } = req.body;
  const members = new Set(q.all('SELECT user_id FROM campaign_members WHERE campaign_id = ?', req.campaign.id).map(m => m.user_id));
  db.prepare('BEGIN').run();
  for (const pid of paper_ids) {
    const p = q.get('SELECT id FROM papers WHERE id = ? AND campaign_id = ?', pid, req.campaign.id);
    if (!p) continue;
    if (mode === 'replace') q.run('DELETE FROM paper_assignments WHERE paper_id = ?', p.id);
    for (const uid of user_ids) if (members.has(Number(uid))) q.run('INSERT OR IGNORE INTO paper_assignments (paper_id, user_id) VALUES (?, ?)', p.id, uid);
  }
  db.prepare('COMMIT').run();
  res.json({ ok: true });
});

// Bulk PDF attach: files named <bibkey>.pdf, else a filename containing the paper title. Unmatched files are discarded.
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
r.post('/attach-pdfs', requireMember, requireOwner, uploadPdf.array('pdfs', 200), (req, res) => {
  const papers = q.all('SELECT id, title, bib_key, pdf_path FROM papers WHERE campaign_id = ?', req.campaign.id);
  const attached = [], unmatched = [], rejected = [];
  for (const f of req.files || []) {
    const bad = verifyPdf(f); if (bad) { rejected.push(f.originalname); continue; }
    const base = f.originalname.replace(/\.pdf$/i, '');
    let p = papers.find(x => x.bib_key && x.bib_key.toLowerCase() === base.toLowerCase());
    if (!p) { const s = slug(base); p = papers.find(x => { const t = slug(x.title).slice(0, 40); return t.length > 10 && s.includes(t); }); }
    if (!p) { unmatched.push(f.originalname); fs.rmSync(f.path, { force: true }); continue; }
    if (p.pdf_path) fs.rmSync(path.join(UPLOAD_DIR, p.pdf_path), { force: true });
    q.run('UPDATE papers SET pdf_path = ?, pdf_name = ? WHERE id = ?', f.filename, safeName(f.originalname), p.id);
    p.pdf_path = f.filename; attached.push({ file: f.originalname, paper_id: p.id, title: p.title });
  }
  res.json({ attached, unmatched, rejected });
});

// Kanban move: { stage_id, position }
r.post('/:paperId/move', requireMember, (req, res) => {
  const p = q.get('SELECT * FROM papers WHERE id = ? AND campaign_id = ?', req.params.paperId, req.campaign.id);
  if (!p) return res.status(404).json({ error: 'Paper not found' });
  const stage = q.get('SELECT id FROM stages WHERE id = ? AND campaign_id = ?', req.body.stage_id, req.campaign.id);
  if (!stage) return res.status(400).json({ error: 'Invalid stage' });
  const position = Number(req.body.position ?? 0);
  db.prepare('BEGIN').run();
  const siblings = q.all('SELECT id FROM papers WHERE stage_id = ? AND id != ? ORDER BY position, id', stage.id, p.id).map(x => x.id);
  siblings.splice(Math.max(0, Math.min(position, siblings.length)), 0, p.id);
  siblings.forEach((id, i) => q.run('UPDATE papers SET stage_id = ?, position = ? WHERE id = ?', stage.id, i, id));
  db.prepare('COMMIT').run();
  res.json({ ok: true });
});

// ---- annotations ----
function validate(fields, values) {
  const errors = {};
  for (const f of fields) {
    const v = values[f.id];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (f.required && empty) { errors[f.id] = 'Required'; continue; }
    if (empty) continue;
    const opts = JSON.parse(f.options || '[]');
    if (f.type === 'single' && !opts.includes(v)) errors[f.id] = 'Invalid option';
    if (f.type === 'multi' && (!Array.isArray(v) || v.some(x => !opts.includes(x)))) errors[f.id] = 'Invalid option';
    if (f.type === 'number' && !Number.isFinite(Number(v))) errors[f.id] = 'Must be a number';
    if (f.type === 'scale' && (!Number.isFinite(Number(v)) || Number(v) < opts.min || Number(v) > opts.max)) errors[f.id] = `Must be between ${opts.min} and ${opts.max}`;
    if (f.type === 'boolean' && typeof v !== 'boolean') errors[f.id] = 'Must be yes/no';
  }
  return errors;
}

r.put('/:paperId/annotation', requireMember, (req, res) => {
  const p = q.get('SELECT * FROM papers WHERE id = ? AND campaign_id = ?', req.params.paperId, req.campaign.id);
  if (!p) return res.status(404).json({ error: 'Paper not found' });
  const assigned = q.get('SELECT 1 FROM paper_assignments WHERE paper_id = ? AND user_id = ?', p.id, req.user.id);
  if (!assigned && req.role !== 'owner') return res.status(403).json({ error: 'You are not assigned to this paper' });
  if (!p.pdf_path) return res.status(400).json({ error: 'This paper has no PDF yet; annotation is blocked until one is uploaded' });
  const values = req.body.values && typeof req.body.values === 'object' && !Array.isArray(req.body.values) ? req.body.values : {};
  if (JSON.stringify(values).length > 200000) return res.status(400).json({ error: 'Annotation is too large' });
  const status = req.body.status === 'submitted' ? 'submitted' : 'draft';
  if (status === 'submitted') {
    const fields = q.all('SELECT * FROM fields WHERE campaign_id = ?', req.campaign.id);
    const errors = validate(fields, values);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', field_errors: errors });
  }
  q.run(`INSERT INTO annotations (paper_id, user_id, values_json, status, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(paper_id, user_id) DO UPDATE SET values_json = excluded.values_json, status = excluded.status, updated_at = datetime('now')`,
    p.id, req.user.id, JSON.stringify(values), status);
  // Auto-advance stage: when every assignee has submitted, move to "Reviewed" if it exists and the paper is still in the first two stages.
  const assignees = q.all('SELECT user_id FROM paper_assignments WHERE paper_id = ?', p.id).map(a => a.user_id);
  const submitted = q.all("SELECT user_id FROM annotations WHERE paper_id = ? AND status = 'submitted'", p.id).map(a => a.user_id);
  const stages = q.all('SELECT * FROM stages WHERE campaign_id = ? ORDER BY position', req.campaign.id);
  const curIdx = stages.findIndex(s => s.id === p.stage_id);
  if (status === 'submitted' && assignees.length && assignees.every(u => submitted.includes(u))) {
    const target = stages.find(s => /reviewed/i.test(s.name));
    if (target && curIdx >= 0 && curIdx < stages.indexOf(target)) q.run('UPDATE papers SET stage_id = ?, position = ? WHERE id = ?', target.id, nextPos(target.id), p.id);
  } else if (status !== 'submitted' && curIdx === 0 && stages[1] && /progress/i.test(stages[1].name)) {
    q.run('UPDATE papers SET stage_id = ?, position = ? WHERE id = ?', stages[1].id, nextPos(stages[1].id), p.id);
  }
  const ann = q.get('SELECT * FROM annotations WHERE paper_id = ? AND user_id = ?', p.id, req.user.id);
  res.json({ annotation: { ...ann, values: JSON.parse(ann.values_json) }, paper: decorate(q.get('SELECT * FROM papers WHERE id = ?', p.id), req.user.id) });
});

export default r;

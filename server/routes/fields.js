import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { q, db } from '../db.js';
import { requireMember, requireOwner } from '../auth.js';
import { parseFieldsWorkbook, FIELD_TYPES as TYPES } from '../codebook.js';

const r = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
export const FIELD_TYPES = TYPES;

function normalizeField(body) {
  const name = String(body.name || '').trim().slice(0, 300);
  const type = (body.type || 'text').trim().toLowerCase();
  if (!name) throw new Error('Field name is required');
  if (!FIELD_TYPES.includes(type)) throw new Error(`Unknown field type "${type}". Use one of: ${FIELD_TYPES.join(', ')}`);
  let options = body.options ?? [];
  if (typeof options === 'string') options = options.split(/[;|,\n]/).map(s => s.trim()).filter(Boolean);
  if (type === 'scale') {
    let min = 1, max = 5;
    if (Array.isArray(options) && options.length >= 2) { min = Number(options[0]); max = Number(options[1]); }
    else if (options && typeof options === 'object' && !Array.isArray(options)) { min = Number(options.min ?? 1); max = Number(options.max ?? 5); }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) throw new Error('Scale needs min < max');
    options = { min, max };
  } else if (type === 'single' || type === 'multi') {
    if (!Array.isArray(options) || options.length < 2) throw new Error(`Field "${name}" needs at least two options`);
  } else options = [];
  if (Array.isArray(options)) { options = options.map(o => String(o).trim().slice(0, 300)).filter(Boolean); if (options.length > 200) throw new Error('Too many options (max 200)'); }
  const required = body.required === undefined ? 1 : (String(body.required).toLowerCase() === 'true' || body.required === 1 || body.required === true || String(body.required).toLowerCase() === 'yes' ? 1 : 0);
  let option_help = body.option_help && typeof body.option_help === 'object' ? body.option_help : {};
  if (Array.isArray(options)) option_help = Object.fromEntries(Object.entries(option_help).filter(([k, v]) => options.includes(k) && v)); else option_help = {};
  return { name, type, options: JSON.stringify(options), required, description: String(body.description || '').trim().slice(0, 5000), group_name: String(body.group_name || '').trim().slice(0, 200), option_help: JSON.stringify(Object.fromEntries(Object.entries(option_help).map(([k, v]) => [k, String(v).slice(0, 2000)]))) };
}

function nextPos(cid) { return q.get('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM fields WHERE campaign_id = ?', cid).p; }
function present(f) { return { ...f, options: JSON.parse(f.options || '[]'), option_help: JSON.parse(f.option_help || '{}'), required: !!f.required }; }
export function insertField(cid, f) {
  const info = q.run('INSERT INTO fields (campaign_id, name, description, type, options, required, position, group_name, option_help) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    cid, f.name, f.description, f.type, f.options, f.required, nextPos(cid), f.group_name, f.option_help);
  return present(q.get('SELECT * FROM fields WHERE id = ?', info.lastInsertRowid));
}
export { normalizeField };

r.post('/', requireMember, requireOwner, (req, res) => {
  try {
    res.json({ field: insertField(req.campaign.id, normalizeField(req.body)) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

r.patch('/:fieldId', requireMember, requireOwner, (req, res) => {
  try {
    const cur = q.get('SELECT * FROM fields WHERE id = ? AND campaign_id = ?', req.params.fieldId, req.campaign.id);
    if (!cur) return res.status(404).json({ error: 'Field not found' });
    const f = normalizeField({ ...present(cur), ...req.body });
    q.run('UPDATE fields SET name = ?, description = ?, type = ?, options = ?, required = ?, group_name = ?, option_help = ? WHERE id = ?', f.name, f.description, f.type, f.options, f.required, f.group_name, f.option_help, cur.id);
    res.json({ field: present(q.get('SELECT * FROM fields WHERE id = ?', cur.id)) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

r.put('/order', requireMember, requireOwner, (req, res) => {
  (req.body.order || []).forEach((fid, i) => q.run('UPDATE fields SET position = ? WHERE id = ? AND campaign_id = ?', i, fid, req.campaign.id));
  res.json({ ok: true });
});

r.delete('/:fieldId', requireMember, requireOwner, (req, res) => {
  q.run('DELETE FROM fields WHERE id = ? AND campaign_id = ?', req.params.fieldId, req.campaign.id);
  res.json({ ok: true });
});

// Spreadsheet import: accepts the simple template or a full codebook (see codebook.js).
r.post('/import', requireMember, requireOwner, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  let parsed;
  try { parsed = parseFieldsWorkbook(req.file.buffer); } catch (e) { return res.status(400).json({ error: e.message }); }
  const errors = [], created = [];
  db.prepare('BEGIN').run();
  try {
    parsed.forEach((p, i) => {
      try { created.push(insertField(req.campaign.id, normalizeField(p))); } catch (e) { errors.push(`${p.name || 'Row ' + (i + 1)}: ${e.message}`); }
    });
    db.prepare('COMMIT').run();
  } catch (e) { db.prepare('ROLLBACK').run(); throw e; }
  res.json({ created, errors });
});

// Template download
r.get('/template.xlsx', requireMember, (req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['name', 'type', 'options', 'required', 'description', 'group'],
    ['Include?', 'boolean', '', 'yes', 'Should this paper be included in the review?', 'Screening'],
    ['Study type', 'single', 'RCT; Cohort; Case-control; Qualitative; Other', 'yes', '', 'Screening'],
    ['Outcomes reported', 'multi', 'Mortality; Quality of life; Cost; Adverse events', 'no', 'Select all that apply', 'Extraction'],
    ['Sample size', 'number', '', 'no', '', 'Extraction'],
    ['Quality (1-5)', 'scale', '1; 5', 'yes', '1 = very low, 5 = very high', 'Extraction'],
    ['Notes', 'text', '', 'no', 'Free-text comments', 'Extraction'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'fields');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="fields-template.xlsx"');
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buf);
});

export default r;

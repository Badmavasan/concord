import { Router } from 'express';
import crypto from 'node:crypto';
import { q, db } from '../db.js';
import { requireMember, requireOwner } from '../auth.js';
import { sendInvite, mailEnabled } from '../mailer.js';
import { str } from '../security.js';

const r = Router();
const DEFAULT_STAGES = ['To review', 'In progress', 'Reviewed', 'Conflict', 'Done'];

r.get('/', (req, res) => {
  const rows = q.all(`SELECT c.*, u.name AS owner_name,
      (SELECT COUNT(*) FROM papers p WHERE p.campaign_id = c.id) AS paper_count,
      (SELECT COUNT(*) FROM campaign_members m WHERE m.campaign_id = c.id) AS member_count,
      (SELECT COUNT(*) FROM papers p JOIN paper_assignments a ON a.paper_id = p.id
         LEFT JOIN annotations an ON an.paper_id = p.id AND an.user_id = a.user_id
         WHERE p.campaign_id = c.id AND a.user_id = ? AND (an.status IS NULL OR an.status != 'submitted')) AS my_pending
    FROM campaigns c JOIN campaign_members m ON m.campaign_id = c.id JOIN users u ON u.id = c.owner_id
    WHERE m.user_id = ? ORDER BY c.created_at DESC`, req.user.id, req.user.id);
  res.json({ campaigns: rows.map(c => ({ ...c, role: c.owner_id === req.user.id ? 'owner' : 'member' })) });
});

r.post('/', (req, res) => {
  const name = str(req.body.name, 200), description = str(req.body.description, 2000);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const tx = db.prepare('BEGIN'); tx.run();
  try {
    const info = q.run('INSERT INTO campaigns (name, description, owner_id) VALUES (?, ?, ?)', name, description, req.user.id);
    const id = info.lastInsertRowid;
    q.run('INSERT INTO campaign_members (campaign_id, user_id, role) VALUES (?, ?, ?)', id, req.user.id, 'owner');
    DEFAULT_STAGES.forEach((s, i) => q.run('INSERT INTO stages (campaign_id, name, position) VALUES (?, ?, ?)', id, s, i));
    db.prepare('COMMIT').run();
    res.json({ campaign: q.get('SELECT * FROM campaigns WHERE id = ?', id) });
  } catch (e) { db.prepare('ROLLBACK').run(); throw e; }
});

r.get('/:id', requireMember, (req, res) => {
  const members = q.all(`SELECT u.id, u.name, u.email, m.role FROM campaign_members m JOIN users u ON u.id = m.user_id WHERE m.campaign_id = ? ORDER BY m.role DESC, u.name`, req.campaign.id);
  const fields = q.all('SELECT * FROM fields WHERE campaign_id = ? ORDER BY position, id', req.campaign.id).map(f => ({ ...f, options: JSON.parse(f.options || '[]'), option_help: JSON.parse(f.option_help || '{}'), required: !!f.required }));
  const stages = q.all('SELECT * FROM stages WHERE campaign_id = ? ORDER BY position, id', req.campaign.id);
  res.json({ campaign: { ...req.campaign, role: req.role }, members, fields, stages });
});

r.patch('/:id', requireMember, requireOwner, (req, res) => {
  const name = req.body.name === undefined ? null : str(req.body.name, 200), description = req.body.description === undefined ? null : str(req.body.description, 2000);
  q.run('UPDATE campaigns SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?', name || null, description, req.campaign.id);
  res.json({ campaign: q.get('SELECT * FROM campaigns WHERE id = ?', req.campaign.id) });
});

r.delete('/:id', requireMember, requireOwner, (req, res) => {
  q.run('DELETE FROM campaigns WHERE id = ?', req.campaign.id);
  res.json({ ok: true });
});

// ---- members & invites ----
r.post('/:id/invites', requireMember, requireOwner, async (req, res) => {
  const email = str(req.body.email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  const existing = q.get('SELECT u.id FROM users u JOIN campaign_members m ON m.user_id = u.id WHERE u.email = ? AND m.campaign_id = ?', email, req.campaign.id);
  if (existing) return res.status(409).json({ error: 'Already a member' });
  // If the user already has an account, add directly.
  const user = q.get('SELECT id FROM users WHERE email = ?', email);
  const token = crypto.randomBytes(24).toString('hex');
  q.run('INSERT INTO invites (campaign_id, email, token) VALUES (?, ?, ?)', req.campaign.id, email, token);
  const base = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const link = `${base}/invite/${token}`;
  let emailed = false;
  try { emailed = await sendInvite({ to: email, inviterName: req.user.name, campaignName: req.campaign.name, link }); } catch (e) { console.error('mail failed', e.message); }
  res.json({ link, emailed, mailEnabled, existingUser: !!user });
});

r.get('/:id/invites', requireMember, requireOwner, (req, res) => {
  const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const rows = q.all('SELECT * FROM invites WHERE campaign_id = ? ORDER BY created_at DESC', req.campaign.id).map(i => ({ ...i, link: `${base}/invite/${i.token}` }));
  res.json({ invites: rows });
});

r.delete('/:id/invites/:inviteId', requireMember, requireOwner, (req, res) => {
  q.run('DELETE FROM invites WHERE id = ? AND campaign_id = ?', req.params.inviteId, req.campaign.id);
  res.json({ ok: true });
});

r.delete('/:id/members/:userId', requireMember, requireOwner, (req, res) => {
  const uid = Number(req.params.userId);
  if (uid === req.campaign.owner_id) return res.status(400).json({ error: 'Cannot remove the owner' });
  q.run('DELETE FROM campaign_members WHERE campaign_id = ? AND user_id = ?', req.campaign.id, uid);
  q.run('DELETE FROM paper_assignments WHERE user_id = ? AND paper_id IN (SELECT id FROM papers WHERE campaign_id = ?)', uid, req.campaign.id);
  res.json({ ok: true });
});

// ---- stages ----
r.post('/:id/stages', requireMember, requireOwner, (req, res) => {
  const name = str(req.body.name, 100);
  if (!name) return res.status(400).json({ error: 'Name required' });
  const pos = q.get('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM stages WHERE campaign_id = ?', req.campaign.id).p;
  const info = q.run('INSERT INTO stages (campaign_id, name, position) VALUES (?, ?, ?)', req.campaign.id, name, pos);
  res.json({ stage: q.get('SELECT * FROM stages WHERE id = ?', info.lastInsertRowid) });
});
r.patch('/:id/stages/:stageId', requireMember, requireOwner, (req, res) => {
  const name = str(req.body.name, 100); if (!name) return res.status(400).json({ error: 'Name required' });
  q.run('UPDATE stages SET name = ? WHERE id = ? AND campaign_id = ?', name, req.params.stageId, req.campaign.id);
  res.json({ ok: true });
});
r.put('/:id/stages/order', requireMember, requireOwner, (req, res) => {
  (req.body.order || []).forEach((sid, i) => q.run('UPDATE stages SET position = ? WHERE id = ? AND campaign_id = ?', i, sid, req.campaign.id));
  res.json({ ok: true });
});
r.delete('/:id/stages/:stageId', requireMember, requireOwner, (req, res) => {
  const first = q.get('SELECT id FROM stages WHERE campaign_id = ? AND id != ? ORDER BY position LIMIT 1', req.campaign.id, req.params.stageId);
  if (!first) return res.status(400).json({ error: 'Cannot delete the last stage' });
  q.run('UPDATE papers SET stage_id = ? WHERE stage_id = ?', first.id, req.params.stageId);
  q.run('DELETE FROM stages WHERE id = ? AND campaign_id = ?', req.params.stageId, req.campaign.id);
  res.json({ ok: true });
});

export default r;

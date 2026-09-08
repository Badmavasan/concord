import jwt from 'jsonwebtoken';
import { q } from './db.js';
import { loadSecret } from './security.js';

export const JWT_SECRET = loadSecret();

export function signToken(user) {
  return jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d', algorithm: 'HS256' });
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.token || (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const user = q.get('SELECT id, email, name, password_changed_at FROM users WHERE id = ?', payload.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.password_changed_at && payload.iat * 1000 < user.password_changed_at - 1000) return res.status(401).json({ error: 'Session expired, sign in again' });
    delete user.password_changed_at;
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid session' });
  }
}

// Loads campaign, checks membership. Sets req.campaign and req.role ('owner'|'member').
export function requireMember(req, res, next) {
  const id = Number(req.params.campaignId || req.params.id);
  const campaign = q.get('SELECT * FROM campaigns WHERE id = ?', id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  const m = q.get('SELECT role FROM campaign_members WHERE campaign_id = ? AND user_id = ?', id, req.user.id);
  if (!m) return res.status(403).json({ error: 'Not a member of this campaign' });
  req.campaign = campaign;
  req.role = campaign.owner_id === req.user.id ? 'owner' : m.role;
  next();
}

export function requireOwner(req, res, next) {
  if (req.role !== 'owner') return res.status(403).json({ error: 'Only the campaign owner can do this' });
  next();
}

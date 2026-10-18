import jwt from 'jsonwebtoken';
import { q } from './db.js';
import { loadSecret } from './security.js';

export const JWT_SECRET = loadSecret();

// Each token carries the account's token_version; bumping the version (on a password change) revokes every older session.
export function signToken(user) {
  const v = q.get('SELECT token_version FROM users WHERE id = ?', user.id)?.token_version || 0;
  return jwt.sign({ id: user.id, v }, JWT_SECRET, { expiresIn: '30d', algorithm: 'HS256' });
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.token || (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const user = q.get('SELECT id, email, name, token_version FROM users WHERE id = ?', payload.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if ((payload.v || 0) !== (user.token_version || 0)) return res.status(401).json({ error: 'Session expired, sign in again' });
    delete user.token_version;
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

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db.js';
import { signToken, requireAuth } from '../auth.js';
import { authLimiter, cookieSecure, str } from '../security.js';

const OPEN_REGISTRATION = process.env.OPEN_REGISTRATION !== 'false';
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 11);
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;

const r = Router();
const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: cookieSecure, path: '/', maxAge: 30 * 24 * 3600 * 1000 };

r.post('/register', authLimiter, (req, res) => {
  const email = str(req.body.email, 254).toLowerCase(), name = str(req.body.name, 120), password = String(req.body.password || ''), inviteToken = str(req.body.inviteToken, 100);
  if (!email || !name || !password) return res.status(400).json({ error: 'Email, name and password are required' });
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (password.length < 8 || password.length > 200) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const invite = inviteToken ? q.get('SELECT id, email FROM invites WHERE token = ?', inviteToken) : null;
  if (inviteToken && !invite) return res.status(400).json({ error: 'This invite link is not valid' });
  if (!OPEN_REGISTRATION && !invite) return res.status(403).json({ error: 'Registration is by invitation only. Ask a campaign owner for an invite link.' });
  const em = email;
  if (q.get('SELECT id FROM users WHERE email = ?', em)) return res.status(409).json({ error: 'Email already registered' });
  const info = q.run('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)', em, name, bcrypt.hashSync(password, 11));
  const user = q.get('SELECT id, email, name FROM users WHERE id = ?', info.lastInsertRowid);
  if (inviteToken) acceptInvite(inviteToken, user);
  res.cookie('token', signToken(user), cookieOpts).json({ user });
});

r.post('/login', authLimiter, (req, res) => {
  const email = str(req.body.email, 254).toLowerCase(), password = String(req.body.password || '').slice(0, 200), inviteToken = str(req.body.inviteToken, 100);
  const user = q.get('SELECT * FROM users WHERE email = ?', email);
  const ok = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH); // same cost whether or not the account exists
  if (!user || !ok) return res.status(401).json({ error: 'Invalid email or password' });
  const safe = { id: user.id, email: user.email, name: user.name };
  if (inviteToken) acceptInvite(inviteToken, safe);
  res.cookie('token', signToken(safe), cookieOpts).json({ user: safe });
});

r.post('/logout', (req, res) => res.clearCookie('token').json({ ok: true }));
r.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
r.get('/config', (req, res) => res.json({ openRegistration: OPEN_REGISTRATION }));

r.get('/invite/:token', authLimiter, (req, res) => {
  const inv = q.get(`SELECT i.*, c.name AS campaign_name, u.name AS inviter_name FROM invites i
    JOIN campaigns c ON c.id = i.campaign_id JOIN users u ON u.id = c.owner_id WHERE i.token = ?`, req.params.token);
  if (!inv) return res.status(404).json({ error: 'Invite not found' });
  res.json({ invite: { email: inv.email, campaign_name: inv.campaign_name, inviter_name: inv.inviter_name, campaign_id: inv.campaign_id, accepted: !!inv.accepted_at } });
});

r.post('/invite/:token/accept', requireAuth, (req, res) => {
  const ok = acceptInvite(req.params.token, req.user);
  if (!ok) return res.status(404).json({ error: 'Invite not found' });
  res.json({ campaign_id: ok });
});

export function acceptInvite(token, user) {
  const inv = q.get('SELECT * FROM invites WHERE token = ?', token);
  if (!inv) return null;
  q.run('INSERT OR IGNORE INTO campaign_members (campaign_id, user_id, role) VALUES (?, ?, ?)', inv.campaign_id, user.id, 'member');
  q.run('UPDATE invites SET accepted_at = datetime(\'now\') WHERE id = ?', inv.id);
  return inv.campaign_id;
}

export default r;

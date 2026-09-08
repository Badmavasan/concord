import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db.js';
import { signToken, requireAuth } from '../auth.js';
import { authLimiter, cookieSecure, str } from '../security.js';
import { sendPasswordReset, mailEnabled } from '../mailer.js';
import { createResetToken, liveReset, spendReset, liveInvite, siteUrl } from '../tokens.js';

const OPEN_REGISTRATION = process.env.OPEN_REGISTRATION !== 'false';
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 11);
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
const r = Router();
const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: cookieSecure, path: '/', maxAge: 30 * 24 * 3600 * 1000 };
const passwordProblem = pw => (!pw || pw.length < 8) ? 'Password must be at least 8 characters' : pw.length > 200 ? 'Password is too long' : null;
const safeUser = u => ({ id: u.id, email: u.email, name: u.name });

r.post('/register', authLimiter, (req, res) => {
  if (!OPEN_REGISTRATION) return res.status(403).json({ error: 'Accounts are created through invitation links from a campaign owner.' });
  const email = str(req.body.email, 254).toLowerCase(), name = str(req.body.name, 120), password = String(req.body.password || '');
  if (!email || !name) return res.status(400).json({ error: 'Email and name are required' });
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  const pp = passwordProblem(password); if (pp) return res.status(400).json({ error: pp });
  if (q.get('SELECT id FROM users WHERE email = ?', email)) return res.status(409).json({ error: 'Email already registered' });
  const info = q.run('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)', email, name, bcrypt.hashSync(password, 11));
  const user = q.get('SELECT id, email, name FROM users WHERE id = ?', info.lastInsertRowid);
  res.cookie('token', signToken(user), cookieOpts).json({ user });
});

r.post('/login', authLimiter, (req, res) => {
  const email = str(req.body.email, 254).toLowerCase(), password = String(req.body.password || '').slice(0, 200);
  const user = q.get('SELECT * FROM users WHERE email = ?', email);
  const ok = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH); // same cost whether or not the account exists
  if (!user || !ok) return res.status(401).json({ error: 'Invalid email or password' });
  res.cookie('token', signToken(user), cookieOpts).json({ user: safeUser(user) });
});

r.post('/logout', (req, res) => res.clearCookie('token', { path: '/' }).json({ ok: true }));
r.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
r.get('/config', (req, res) => res.json({ openRegistration: OPEN_REGISTRATION, mailEnabled }));

// ---- invitations: the link leads to a "choose a password" page for new people ----
r.get('/invite/:token', authLimiter, (req, res) => {
  const inv = liveInvite(req.params.token);
  if (!inv) return res.status(404).json({ error: 'This invitation link is not valid. Ask the campaign owner for a new one.' });
  const c = q.get('SELECT c.name AS campaign_name, u.name AS inviter_name FROM campaigns c JOIN users u ON u.id = COALESCE(?, c.owner_id) WHERE c.id = ?', inv.invited_by, inv.campaign_id);
  const existing = !!q.get('SELECT id FROM users WHERE email = ?', inv.email);
  res.json({ invite: { email: inv.email, campaign_id: inv.campaign_id, campaign_name: c?.campaign_name, inviter_name: c?.inviter_name, expired: !!inv.expired, existingUser: existing } });
});

// New person: set name + password, account is created and joined to the campaign in one step.
r.post('/invite/:token/register', authLimiter, (req, res) => {
  const inv = liveInvite(req.params.token);
  if (!inv) return res.status(404).json({ error: 'This invitation link is not valid.' });
  if (inv.expired) return res.status(410).json({ error: 'This invitation has expired. Ask the campaign owner to send a new one.' });
  const name = str(req.body.name, 120), password = String(req.body.password || '');
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const pp = passwordProblem(password); if (pp) return res.status(400).json({ error: pp });
  if (q.get('SELECT id FROM users WHERE email = ?', inv.email)) return res.status(409).json({ error: 'An account already uses this address. Sign in instead.' });
  const info = q.run('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)', inv.email, name, bcrypt.hashSync(password, 11));
  const user = q.get('SELECT id, email, name FROM users WHERE id = ?', info.lastInsertRowid);
  acceptInvite(inv, user);
  res.cookie('token', signToken(user), cookieOpts).json({ user, campaign_id: inv.campaign_id });
});

// Existing person who is signed in (or signs in first): join the campaign.
r.post('/invite/:token/accept', requireAuth, (req, res) => {
  const inv = liveInvite(req.params.token);
  if (!inv) return res.status(404).json({ error: 'This invitation link is not valid.' });
  if (inv.expired) return res.status(410).json({ error: 'This invitation has expired. Ask the campaign owner to send a new one.' });
  if (inv.email !== req.user.email) return res.status(403).json({ error: `This invitation was sent to ${inv.email}. Sign in with that address.` });
  acceptInvite(inv, req.user);
  res.json({ campaign_id: inv.campaign_id });
});

export function acceptInvite(inv, user) {
  q.run('INSERT OR IGNORE INTO campaign_members (campaign_id, user_id, role) VALUES (?, ?, ?)', inv.campaign_id, user.id, 'member');
  q.run("UPDATE invites SET accepted_at = datetime('now') WHERE id = ?", inv.id);
}

// ---- forgotten passwords ----
const SENT = { ok: true, message: 'If that address has an account, a link is on its way. It works once and expires.' };

r.post('/forgot', authLimiter, async (req, res) => {
  const email = str(req.body.email, 254).toLowerCase();
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  const user = q.get('SELECT id, email, name FROM users WHERE email = ?', email);
  if (!user) return res.json(SENT); // same answer either way: this route must not reveal who has an account
  const token = createResetToken(user.id);
  const link = `${siteUrl(req)}/reset/${token}`;
  await sendPasswordReset({ to: user.email, name: user.name, link });
  res.json(SENT);
});

r.get('/reset/:token', authLimiter, (req, res) => {
  const row = liveReset(req.params.token);
  if (!row) return res.status(404).json({ error: 'This link is not valid or has expired. Request a new one.' });
  res.json({ ok: true });
});

r.post('/reset/:token', authLimiter, (req, res) => {
  const row = liveReset(req.params.token);
  if (!row) return res.status(404).json({ error: 'This link is not valid or has expired. Request a new one.' });
  const password = String(req.body.password || '');
  const pp = passwordProblem(password); if (pp) return res.status(400).json({ error: pp });
  // password_changed_at invalidates every session token issued before now.
  q.run('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?', bcrypt.hashSync(password, 11), Date.now(), row.user_id);
  spendReset(req.params.token);
  const user = q.get('SELECT id, email, name FROM users WHERE id = ?', row.user_id);
  res.cookie('token', signToken(user), cookieOpts).json({ user });
});

export default r;

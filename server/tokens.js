// One-time links: only a SHA-256 hash of each token is stored, so a copy of the database is not a set of working links.
import crypto from 'node:crypto';
import { q } from './db.js';
import { LINK_TTL_MS } from './mailer.js';

export const hashToken = t => crypto.createHash('sha256').update(String(t)).digest('hex');
export const newToken = () => crypto.randomBytes(32).toString('base64url');

export function createResetToken(userId) {
  q.run('DELETE FROM password_resets WHERE expires_at < ? OR user_id = ?', Date.now(), userId);
  const token = newToken();
  q.run('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)', hashToken(token), userId, Date.now() + LINK_TTL_MS);
  return token;
}

export function liveReset(token) {
  const row = q.get('SELECT * FROM password_resets WHERE token_hash = ?', hashToken(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) { q.run('DELETE FROM password_resets WHERE token_hash = ?', row.token_hash); return null; }
  return row;
}

export function spendReset(token) { q.run('DELETE FROM password_resets WHERE token_hash = ?', hashToken(token)); }

export function liveInvite(token) {
  const inv = q.get('SELECT * FROM invites WHERE token = ?', hashToken(token));
  if (!inv || inv.accepted_at) return null;
  if (inv.expires_at && inv.expires_at < Date.now()) return { ...inv, expired: true };
  return inv;
}

// Where links point: APP_URL when set, otherwise the address the request arrived on (nginx fills the forwarded headers).
export function siteUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${req.get('x-forwarded-proto') || req.protocol}://${host}`;
}

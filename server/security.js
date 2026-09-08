// Security middleware: headers, CSRF origin check, rate limiting, secret management.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './db.js';

export const isProd = process.env.NODE_ENV === 'production';

// JWT secret: env var, else a random secret persisted in DATA_DIR so sessions survive restarts.
export function loadSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16) return process.env.JWT_SECRET;
  if (process.env.JWT_SECRET) console.warn('JWT_SECRET is shorter than 16 characters; ignoring it and using a generated secret.');
  const file = path.join(DATA_DIR, '.jwt-secret');
  try { const s = fs.readFileSync(file, 'utf8').trim(); if (s.length >= 32) return s; } catch {}
  const s = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(file, s, { mode: 0o600 });
  console.log(`Generated a JWT secret at ${file} (set JWT_SECRET to override).`);
  return s;
}

export const cookieSecure = process.env.COOKIE_SECURE === 'true' || (process.env.COOKIE_SECURE !== 'false' && /^https:/i.test(process.env.APP_URL || ''));

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'self'", "form-action 'self'",
    "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:", "frame-src 'self'", "connect-src 'self'",
  ].join('; '));
  if (cookieSecure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
}

// CSRF: cookies are SameSite=Lax, and every state-changing request must come from our own origin.
export function sameOriginOnly(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  let origin = req.get('origin');
  if (!origin && req.get('referer')) { try { origin = new URL(req.get('referer')).origin; } catch { return res.status(403).json({ error: 'Cross-site request blocked' }); } }
  if (!origin) return next(); // non-browser clients; they have no ambient cookie session
  let host; try { host = new URL(origin).host; } catch { return res.status(403).json({ error: 'Cross-site request blocked' }); }
  if (host !== (req.get('x-forwarded-host') || req.get('host'))) return res.status(403).json({ error: 'Cross-site request blocked' });
  next();
}

// Fixed-window rate limiter keyed by IP (in-memory; fine for a single-process deployment).
export function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    let h = hits.get(req.ip);
    if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(req.ip, h); }
    if (++h.n > max) { res.setHeader('Retry-After', Math.ceil((h.reset - now) / 1000)); return res.status(429).json({ error: message || 'Too many requests, try again later' }); }
    next();
  };
}

export const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many sign-in attempts. Wait 15 minutes and try again.' });
export const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 600 });

// Trim, strip control characters, cap length.
export const str = (v, max = 500) => String(v ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim().slice(0, max);

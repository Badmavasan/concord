import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { requireAuth } from './auth.js';
import authRoutes from './routes/auth.js';
import campaignRoutes from './routes/campaigns.js';
import fieldRoutes from './routes/fields.js';
import paperRoutes from './routes/papers.js';
import statsRoutes from './routes/stats.js';
import { mailEnabled } from './mailer.js';
import { securityHeaders, sameOriginOnly, apiLimiter, isProd, cookieSecure } from './security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY !== 'false') app.set('trust proxy', 1); // behind Caddy/nginx: honour X-Forwarded-* from the first hop
app.use(securityHeaders);
app.use('/api', apiLimiter, sameOriginOnly);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true, mailEnabled }));
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', requireAuth, campaignRoutes);
app.use('/api/campaigns/:campaignId/fields', requireAuth, fieldRoutes);
app.use('/api/campaigns/:campaignId/papers', requireAuth, paperRoutes);
app.use('/api/campaigns/:campaignId/stats', requireAuth, statsRoutes);

// Serve built client if present
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1y', immutable: true }));
  app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api')) ? res.sendFile(path.join(dist, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }) : next());
}
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || (err.name === 'MulterError' || String(err.type || '').startsWith('entity.') ? 400 : 500);
  if (status >= 500) console.error(err);
  const message = status >= 500 && isProd ? 'Server error' : (err.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message || 'Server error');
  res.status(status).json({ error: message });
});

const port = Number(process.env.PORT || 4321);
if (isProd && !process.env.APP_URL) console.warn('APP_URL is not set: invite links will use the request Host header. Set APP_URL to your public https:// URL.');
if (isProd && !cookieSecure) console.warn('Session cookies are not marked Secure. Set APP_URL to an https:// URL (or COOKIE_SECURE=true) once TLS is in place.');
app.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`Concord on http://localhost:${port} (email invites: ${mailEnabled ? 'enabled' : 'disabled, links shown in UI'})`));

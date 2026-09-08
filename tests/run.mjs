// Starts a throwaway server on a temp data directory, runs the e2e suite against it, then shuts it down.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'concord-test-'));
const log = path.join(dataDir, 'server.log');
const port = 4399 + Math.floor(Math.random() * 100);
const out = fs.openSync(log, 'w');
const server = spawn(process.execPath, ['--no-warnings', 'index.js'], { cwd: path.join(root, 'server'), env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), SMTP_HOST: '', JWT_SECRET: 'test-secret-test-secret' }, stdio: ['ignore', out, out] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let up = false;
for (let i = 0; i < 50 && !up; i++) { await sleep(200); try { up = (await fetch(`http://localhost:${port}/api/health`)).ok; } catch {} }
if (!up) { server.kill(); console.error(fs.readFileSync(log, 'utf8')); process.exit(1); }
const test = spawn(process.execPath, [path.join(root, 'tests', 'e2e.mjs')], { env: { ...process.env, CONCORD_URL: `http://localhost:${port}`, LOG: log }, stdio: 'inherit' });
test.on('exit', code => { server.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); process.exit(code ?? 1); });

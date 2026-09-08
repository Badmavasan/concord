#!/usr/bin/env node
// Command-line data injection. Run from the server/ directory (or via `npm run cli --`).
//   node cli.js user add <email> <name> [--password X]
//   node cli.js user password <email> <newPassword>
//   node cli.js campaign create "<name>" --owner <email> [--description "..."]
//   node cli.js campaign list
//   node cli.js fields import <campaign> <codebook.xlsx>
//   node cli.js members add <campaign> <email> [<email>...]
//   node cli.js papers import-bib <campaign> <refs.bib> [--pdf-dir <dir>]
//   node cli.js papers attach-pdfs <campaign> <dir>
//   node cli.js papers add <campaign> --title "..." --pdf file.pdf [--authors ".."] [--year ..] [--venue ..] [--doi ..]
//   node cli.js assign <campaign> --to a@x.com,b@x.com [--each N] [--unassigned-only]
//   node cli.js status <campaign>
//   node cli.js mail test [address]        check the SMTP settings in .env; with an address, send a real message
// <campaign> is an id or an exact name.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db, q, UPLOAD_DIR } from './db.js';
import { parseFieldsWorkbook } from './codebook.js';
import { parseBibtex, bibToPaper } from './bibtex.js';
import { normalizeField, insertField } from './routes/fields.js';
import { mail, mailEnabled, transporter, sendPasswordReset } from './mailer.js';

const argv = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true; flags[k] = v; }
  else pos.push(argv[i]);
}
const die = m => { console.error('Error:', m); process.exit(1); };
const DEFAULT_STAGES = ['To review', 'In progress', 'Reviewed', 'Conflict', 'Done'];

function findUser(email) { return q.get('SELECT * FROM users WHERE email = ?', String(email).trim().toLowerCase()) || die(`No user with email ${email}. Create one: cli.js user add <email> <name>`); }
function findCampaign(ref) {
  const c = /^\d+$/.test(ref) ? q.get('SELECT * FROM campaigns WHERE id = ?', Number(ref)) : q.get('SELECT * FROM campaigns WHERE name = ?', ref);
  return c || die(`No campaign "${ref}"`);
}
function firstStage(cid) { return q.get('SELECT id FROM stages WHERE campaign_id = ? ORDER BY position LIMIT 1', cid)?.id ?? null; }
function nextPos(stageId) { return q.get('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM papers WHERE stage_id IS ?', stageId).p; }
function storePdf(src) {
  const name = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}.pdf`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.copyFileSync(src, path.join(UPLOAD_DIR, name));
  return name;
}
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const cmds = {
  'mail test': async ([to]) => {
    if (!mailEnabled) die('No mail settings found. SMTP_HOST, SMTP_USER and SMTP_PASSWORD all have to be set in .env.');
    console.log(`Host:    ${mail.host}:${mail.port} (${mail.secure ? 'TLS from the start' : 'STARTTLS'})`);
    console.log(`Mailbox: ${mail.user}`);
    console.log(`From:    ${mail.from}`);
    try { await transporter().verify(); console.log('The server accepted the login.'); }
    catch (e) { die(`The server refused the login: ${e.message}\nUsual causes: SMTP_USER is not the full address, the password is wrong, or the port/secure pair does not match (465+true, 587+false).`); }
    if (to) { const ok = await sendPasswordReset({ to, name: 'there', link: 'https://example.invalid/reset/test-message' }); console.log(ok ? `Sent a test message to ${to}.` : 'Sending failed, see the error above.'); }
  },
  'user add': ([email, name]) => {
    if (!email || !name) die('usage: user add <email> <name> [--password X]');
    const em = email.toLowerCase();
    if (q.get('SELECT id FROM users WHERE email = ?', em)) die('User already exists');
    const password = flags.password || crypto.randomBytes(6).toString('base64url');
    q.run('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)', em, name, bcrypt.hashSync(password, 10));
    console.log(`Created ${em}. Password: ${password}`);
  },
  'user password': ([email, pw]) => {
    if (!email || !pw) die('usage: user password <email> <newPassword>');
    const u = findUser(email);
    q.run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(pw, 10), u.id);
    console.log('Password updated for', u.email);
  },
  'campaign create': ([name]) => {
    if (!name || !flags.owner) die('usage: campaign create "<name>" --owner <email> [--description ".."]');
    const owner = findUser(flags.owner);
    const info = q.run('INSERT INTO campaigns (name, description, owner_id) VALUES (?, ?, ?)', name, flags.description || '', owner.id);
    const id = info.lastInsertRowid;
    q.run('INSERT INTO campaign_members (campaign_id, user_id, role) VALUES (?, ?, ?)', id, owner.id, 'owner');
    DEFAULT_STAGES.forEach((s, i) => q.run('INSERT INTO stages (campaign_id, name, position) VALUES (?, ?, ?)', id, s, i));
    console.log(`Created campaign #${id} "${name}" owned by ${owner.email}`);
  },
  'campaign list': () => {
    for (const c of q.all('SELECT c.id, c.name, u.email, (SELECT COUNT(*) FROM papers p WHERE p.campaign_id = c.id) n FROM campaigns c JOIN users u ON u.id = c.owner_id ORDER BY c.id'))
      console.log(`#${c.id}\t${c.name}\towner ${c.email}\t${c.n} papers`);
  },
  'fields import': ([ref, file]) => {
    if (!ref || !file) die('usage: fields import <campaign> <file.xlsx>');
    const c = findCampaign(ref);
    const parsed = parseFieldsWorkbook(fs.readFileSync(file));
    let n = 0;
    db.prepare('BEGIN').run();
    for (const p of parsed) { try { insertField(c.id, normalizeField(p)); n++; } catch (e) { console.error(`skip "${p.name}": ${e.message}`); } }
    db.prepare('COMMIT').run();
    console.log(`Imported ${n} of ${parsed.length} criteria into "${c.name}"`);
  },
  'members add': ([ref, ...emails]) => {
    if (!ref || !emails.length) die('usage: members add <campaign> <email> [...]');
    const c = findCampaign(ref);
    for (const e of emails) { const u = findUser(e); q.run('INSERT OR IGNORE INTO campaign_members (campaign_id, user_id, role) VALUES (?, ?, ?)', c.id, u.id, 'member'); console.log('added', u.email); }
  },
  'papers import-bib': ([ref, file]) => {
    if (!ref || !file) die('usage: papers import-bib <campaign> <refs.bib> [--pdf-dir <dir>]');
    const c = findCampaign(ref);
    const entries = parseBibtex(fs.readFileSync(file, 'utf8'));
    const bibDir = path.dirname(path.resolve(file));
    const stage = firstStage(c.id);
    let created = 0, skipped = 0, withPdf = 0;
    db.prepare('BEGIN').run();
    for (const e of entries) {
      const p = bibToPaper(e);
      if (p.bib_key && q.get('SELECT id FROM papers WHERE campaign_id = ? AND bib_key = ?', c.id, p.bib_key)) { skipped++; continue; }
      // PDF: --pdf-dir/<key>.pdf, else the BibTeX "file" field (Zotero/JabRef style), resolved relative to the .bib.
      let pdf = null;
      if (flags['pdf-dir'] && p.bib_key && fs.existsSync(path.join(flags['pdf-dir'], p.bib_key + '.pdf'))) pdf = path.join(flags['pdf-dir'], p.bib_key + '.pdf');
      if (!pdf && e.file) {
        for (const part of e.file.split(/[;:]/)) { const cand = path.resolve(bibDir, part.trim()); if (/\.pdf$/i.test(cand) && fs.existsSync(cand)) { pdf = cand; break; } }
      }
      const stored = pdf ? storePdf(pdf) : null;
      q.run(`INSERT INTO papers (campaign_id, bib_key, title, authors, year, venue, doi, abstract, pdf_path, pdf_name, stage_id, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        c.id, p.bib_key, p.title, p.authors, p.year, p.venue, p.doi, p.abstract, stored, pdf ? path.basename(pdf) : null, stage, nextPos(stage));
      created++; if (pdf) withPdf++;
    }
    db.prepare('COMMIT').run();
    console.log(`Imported ${created} papers (${withPdf} with PDF), skipped ${skipped} duplicates`);
    if (created > withPdf) console.log(`${created - withPdf} still need a PDF: use "papers attach-pdfs ${c.id} <dir>" or upload in the UI.`);
  },
  'papers attach-pdfs': ([ref, dir]) => {
    if (!ref || !dir) die('usage: papers attach-pdfs <campaign> <dir>   (matches <bibkey>.pdf, then filenames containing the title)');
    const c = findCampaign(ref);
    const files = fs.readdirSync(dir).filter(f => /\.pdf$/i.test(f));
    const missing = q.all('SELECT * FROM papers WHERE campaign_id = ? AND pdf_path IS NULL', c.id);
    let n = 0;
    for (const p of missing) {
      let f = p.bib_key && files.find(x => x.toLowerCase() === (p.bib_key + '.pdf').toLowerCase());
      if (!f) { const t = slug(p.title).slice(0, 40); f = t.length > 10 && files.find(x => slug(x).includes(t)); }
      if (!f) { console.log(`no match: ${p.title}`); continue; }
      q.run('UPDATE papers SET pdf_path = ?, pdf_name = ? WHERE id = ?', storePdf(path.join(dir, f)), f, p.id); n++;
    }
    console.log(`Attached ${n} PDFs, ${missing.length - n} papers still without one`);
  },
  'papers add': ([ref]) => {
    if (!ref || !flags.title || !flags.pdf) die('usage: papers add <campaign> --title ".." --pdf file.pdf [--authors ..] [--year ..] [--venue ..] [--doi ..] [--key ..]');
    const c = findCampaign(ref); const stage = firstStage(c.id);
    q.run(`INSERT INTO papers (campaign_id, bib_key, title, authors, year, venue, doi, pdf_path, pdf_name, stage_id, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      c.id, flags.key || null, flags.title, flags.authors || '', String(flags.year || ''), flags.venue || '', flags.doi || '', storePdf(flags.pdf), path.basename(flags.pdf), stage, nextPos(stage));
    console.log('Added', flags.title);
  },
  'assign': ([ref]) => {
    if (!ref || !flags.to) die('usage: assign <campaign> --to a@x.com,b@x.com [--each N] [--unassigned-only]');
    const c = findCampaign(ref);
    const users = String(flags.to).split(',').map(e => findUser(e));
    for (const u of users) q.run('INSERT OR IGNORE INTO campaign_members (campaign_id, user_id, role) VALUES (?, ?, ?)', c.id, u.id, 'member');
    const papers = q.all(`SELECT id FROM papers WHERE campaign_id = ?${flags['unassigned-only'] ? ' AND id NOT IN (SELECT paper_id FROM paper_assignments)' : ''} ORDER BY id`, c.id);
    const each = flags.each ? Number(flags.each) : users.length;
    let n = 0;
    papers.forEach((p, i) => { for (let k = 0; k < each; k++) { const u = users[(i * each + k) % users.length]; q.run('INSERT OR IGNORE INTO paper_assignments (paper_id, user_id) VALUES (?, ?)', p.id, u.id); n++; } });
    console.log(`Made ${n} assignments across ${papers.length} papers (${each} per paper, round-robin over ${users.map(u => u.email).join(', ')})`);
  },
  'status': ([ref]) => {
    const c = findCampaign(ref || die('usage: status <campaign>'));
    const s = q.get(`SELECT (SELECT COUNT(*) FROM papers WHERE campaign_id = ?) papers, (SELECT COUNT(*) FROM papers WHERE campaign_id = ? AND pdf_path IS NULL) nopdf,
      (SELECT COUNT(*) FROM fields WHERE campaign_id = ?) fields, (SELECT COUNT(*) FROM campaign_members WHERE campaign_id = ?) members,
      (SELECT COUNT(*) FROM paper_assignments a JOIN papers p ON p.id = a.paper_id WHERE p.campaign_id = ?) assignments,
      (SELECT COUNT(*) FROM annotations a JOIN papers p ON p.id = a.paper_id WHERE p.campaign_id = ? AND a.status = 'submitted') submitted`, c.id, c.id, c.id, c.id, c.id, c.id);
    console.log(`#${c.id} ${c.name}: ${s.papers} papers (${s.nopdf} without PDF), ${s.fields} criteria, ${s.members} members, ${s.assignments} assignments, ${s.submitted} submitted annotations`);
  },
};

const key = [pos[0], pos[1]].filter(Boolean).join(' ');
const cmd = cmds[key] || cmds[pos[0]];
if (!cmd) { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n')); process.exit(1); }
cmd(cmds[key] ? pos.slice(2) : pos.slice(1));

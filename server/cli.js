#!/usr/bin/env node
// Command-line data injection. Run from the server/ directory (or via `npm run cli --`).
//   node cli.js user add <email> <name> [--password X]
//   node cli.js user password <email> <newPassword>
//   node cli.js campaign create "<name>" --owner <email> [--description "..."]
//   node cli.js campaign list
//   node cli.js fields import <campaign> <codebook.xlsx> [--only <name prefix>]   (re-sorts criteria to the file's order)
//   node cli.js fields delete <campaign> "<criterion name>"
//   node cli.js fields sync <campaign> <codebook.json> [--dry-run]   apply a codebook JSON: renames (answers migrated), descriptions, new criteria, order, guidelines
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
import { parseFieldsWorkbook, isOtherOption, otherKey } from './codebook.js';
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
    if (to) { const ok = await sendPasswordReset({ to, name: 'there', link: (process.env.APP_URL || 'http://localhost:4321').replace(/\/$/, '') + '/forgot' }); console.log(ok ? `Sent a test message to ${to}.` : 'Sending failed, see the error above.'); }
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
    const all = parseFieldsWorkbook(fs.readFileSync(file));
    const parsed = flags.only ? all.filter(p => p.name.startsWith(String(flags.only))) : all;
    if (!parsed.length) die(`Nothing in the file starts with "${flags.only}"`);
    let n = 0;
    db.prepare('BEGIN').run();
    for (const p of parsed) {
      if (flags.only && q.get('SELECT id FROM fields WHERE campaign_id = ? AND name = ?', c.id, p.name)) { console.error(`skip "${p.name}": already present`); continue; }
      try { insertField(c.id, normalizeField(p)); n++; } catch (e) { console.error(`skip "${p.name}": ${e.message}`); }
    }
    // Keep the campaign in the file's order; criteria not in the file keep their relative order at the end.
    const order = new Map(all.map((p, i) => [p.name, i]));
    const current = q.all('SELECT id, name, position FROM fields WHERE campaign_id = ? ORDER BY position, id', c.id);
    current.sort((a, b) => (order.has(a.name) ? order.get(a.name) : 1e6 + a.position) - (order.has(b.name) ? order.get(b.name) : 1e6 + b.position));
    current.forEach((f, i) => q.run('UPDATE fields SET position = ? WHERE id = ?', i, f.id));
    db.prepare('COMMIT').run();
    console.log(`Imported ${n} of ${parsed.length} criteria into "${c.name}"`);
  },
  'fields sync': ([ref, file]) => {
    if (!ref || !file) die('usage: fields sync <campaign> <codebook.json> [--dry-run]');
    const c = findCampaign(ref); const cb = JSON.parse(fs.readFileSync(file, 'utf8')); const dry = !!flags['dry-run'];
    const TYPE = { single_choice: 'single', multiple_choice: 'multi', yes_no: 'boolean', number: 'number', free_text: 'text', scale: 'scale' };
    const log = []; let migrated = 0;
    db.prepare('BEGIN').run();
    try {
      let pos = 0;
      for (const g of cb.groups) for (const cr of g.criteria) {
        const type = TYPE[cr.type] || die(`Unknown type ${cr.type} for ${cr.name}`);
        const choice = type === 'single' || type === 'multi';
        const options = choice ? cr.options.map(o => o.value) : [];
        const text_options = JSON.stringify(choice ? cr.options.filter(o => o.allows_text).map(o => o.value) : []);
        const option_help = choice ? Object.fromEntries(cr.options.filter(o => o.description).map(o => [o.value, o.description])) : {};
        let f = q.get('SELECT * FROM fields WHERE campaign_id = ? AND name = ?', c.id, cr.name) || (cr.previous_name && q.get('SELECT * FROM fields WHERE campaign_id = ? AND name = ?', c.id, cr.previous_name));
        if (!f) {
          const nf = normalizeField({ name: cr.name, type, options, option_help, required: !!cr.required, description: cr.description, group_name: g.name, checks: cr.checkboxes, text_options: JSON.parse(text_options) });
          q.run('INSERT INTO fields (campaign_id, name, description, type, options, required, position, group_name, option_help, checks, text_options) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', c.id, nf.name, nf.description, nf.type, nf.options, nf.required, pos++, nf.group_name, nf.option_help, nf.checks, nf.text_options);
          log.push(`+ added    ${cr.id} ${cr.name}`); continue;
        }
        if (f.type !== type && f.type === 'text' && choice && cr.previous_type === 'free_text') {
          // Free text becomes a list: convert earlier answers by keyword; whatever is not recognised is kept under the "other" option with its text.
          const otherOpt = options.find(isOtherOption);
          for (const a of q.all('SELECT a.id, a.values_json FROM annotations a JOIN papers p ON p.id = a.paper_id WHERE p.campaign_id = ?', c.id)) {
            const vals = JSON.parse(a.values_json || '{}'); const t = vals[f.id]; if (typeof t !== 'string') continue;
            if (!t.trim()) { delete vals[f.id]; } else {
              const parts = t.split(/[;,\n]|\bet\b|\band\b/i).map(x => x.trim()).filter(Boolean); const picked = new Set(); const rest = [];
              for (const part of parts) { const hit = cr.options.find(o => (o.match || []).some(k => part.toLowerCase().includes(k.toLowerCase())) || o.value.toLowerCase() === part.toLowerCase()); hit ? picked.add(hit.value) : rest.push(part); }
              if (rest.length && otherOpt) { picked.add(otherOpt); vals[otherKey(f.id)] = rest.join('; '); }
              vals[f.id] = type === 'multi' ? [...picked] : ([...picked][0] ?? null);
            }
            q.run('UPDATE annotations SET values_json = ? WHERE id = ?', JSON.stringify(vals), a.id); migrated++;
          }
          log.push(`~ retyped  ${cr.id} "${f.name}": free text -> ${cr.type} (${options.length} options)`);
          f = { ...f, type };
          q.run('UPDATE fields SET type = ? WHERE id = ?', type, f.id);
        }
        if (f.type !== type) { log.push(`! skipped  ${cr.id} ${cr.name}: type is ${f.type} in the campaign, ${type} in the file (delete it first to replace it)`); q.run('UPDATE fields SET position = ? WHERE id = ?', pos++, f.id); continue; }
        if (f.name !== cr.name) log.push(`~ renamed  ${cr.id} "${f.name}" -> "${cr.name}"`);
        // old option label -> new label(s); a split maps one old label to several new ones
        const map = {}; if (choice) for (const o of cr.options) if (o.previous_value) (map[o.previous_value] ||= []).push(o.value);
        const old = choice ? JSON.parse(f.options || '[]') : [];
        for (const [from, to] of Object.entries(map)) if (old.includes(from)) log.push(`~ option   ${cr.id} "${from}" -> ${to.map(t => `"${t}"`).join(' + ')}`);
        // options that moved to another question: carry existing answers over
        for (const ro of cr.removed_options || []) {
          if (!old.includes(ro.value)) continue;
          const target = ro.moved_to && q.get('SELECT * FROM fields WHERE campaign_id = ? AND name = ?', c.id, ro.moved_to.criterion); let n = 0;
          for (const a of q.all('SELECT a.id, a.values_json FROM annotations a JOIN papers p ON p.id = a.paper_id WHERE p.campaign_id = ?', c.id)) {
            const vals = JSON.parse(a.values_json || '{}'); const v = vals[f.id]; const has = Array.isArray(v) ? v.includes(ro.value) : v === ro.value; if (!has) continue;
            vals[f.id] = Array.isArray(v) ? v.filter(x => x !== ro.value) : null;
            if (target) { const cur = Array.isArray(vals[target.id]) ? vals[target.id] : (vals[target.id] ? [vals[target.id]] : []); vals[target.id] = target.type === 'multi' ? [...new Set([...cur.filter(x => !/^aucun/i.test(x)), ro.moved_to.value])] : ro.moved_to.value; }
            q.run('UPDATE annotations SET values_json = ? WHERE id = ?', JSON.stringify(vals), a.id); n++; migrated++;
          }
          log.push(`- option   ${cr.id} "${ro.value}" removed${target ? `, ${n} answer${n === 1 ? '' : 's'} moved to "${ro.moved_to.value}" in ${ro.moved_to.criterion.split('.')[0]}` : ''}`);
        }
        const dropped = new Set((cr.removed_options || []).map(o => o.value));
        const gone = old.filter(o => !options.includes(o) && !map[o] && !dropped.has(o)); if (gone.length) log.push(`! removed  ${cr.id} options no longer in the file: ${gone.join(', ')} (answers keep the old label)`);
        if (choice && Object.keys(map).length) {
          for (const a of q.all('SELECT a.id, a.values_json FROM annotations a JOIN papers p ON p.id = a.paper_id WHERE p.campaign_id = ?', c.id)) {
            const vals = JSON.parse(a.values_json || '{}'); const v = vals[f.id]; if (v === undefined || v === null) continue;
            let nv = v;
            if (Array.isArray(v)) nv = [...new Set(v.flatMap(x => map[x] || [x]))]; else if (map[v]) nv = map[v][0];
            if (JSON.stringify(nv) !== JSON.stringify(v)) { vals[f.id] = nv; q.run('UPDATE annotations SET values_json = ? WHERE id = ?', JSON.stringify(vals), a.id); migrated++; }
          }
        }
        const checks = JSON.stringify((cr.checkboxes || []).map(x => ({ label: x.label, description: x.description || '', exclusive: !!x.exclusive })));
        if ((f.checks || '[]') !== checks) log.push(`~ checkbox ${cr.id} ${(cr.checkboxes || []).map(x => `"${x.label}"`).join(', ') || 'none'}`);
        q.run('UPDATE fields SET name = ?, description = ?, group_name = ?, options = ?, option_help = ?, checks = ?, text_options = ?, position = ? WHERE id = ?', cr.name, cr.description || '', g.name, JSON.stringify(options), JSON.stringify(option_help), checks, text_options, pos++, f.id);
      }
      // criteria in the campaign but not in the file stay, after the others
      const names = new Set(cb.groups.flatMap(g => g.criteria.map(x => x.name))); const dropped = new Set((cb.removed || []).map(r => r.name));
      for (const f of q.all('SELECT id, name FROM fields WHERE campaign_id = ? ORDER BY position, id', c.id)) if (!names.has(f.name) && !dropped.has(f.name)) { q.run('UPDATE fields SET position = ? WHERE id = ?', pos++, f.id); log.push(`? kept     "${f.name}" is not in the file`); }
      for (const r of cb.removed || []) {
        const f = q.get('SELECT id FROM fields WHERE campaign_id = ? AND name = ?', c.id, r.name); if (!f) continue;
        const used = q.all('SELECT a.values_json FROM annotations a JOIN papers p ON p.id = a.paper_id WHERE p.campaign_id = ?', c.id).filter(a => { const v = JSON.parse(a.values_json || '{}')[f.id]; return v !== undefined && v !== null && v !== ''; }).length;
        q.run('DELETE FROM fields WHERE id = ?', f.id); log.push(`- removed  ${r.id} "${r.name}"${used ? ` (${used} answers no longer shown)` : ''}`);
      }
      const gh = Object.fromEntries(cb.groups.filter(g => g.description).map(g => [g.name, g.description]));
      if (Object.keys(gh).length) { q.run('UPDATE campaigns SET group_help = ? WHERE id = ?', JSON.stringify(gh), c.id); log.push(`~ section descriptions set for ${Object.keys(gh).length} groups`); }
      if (Array.isArray(cb.general_rules) && cb.general_rules.length) { q.run('UPDATE campaigns SET guidelines = ? WHERE id = ?', cb.general_rules.map((r, i) => `${i + 1}. ${r}`).join('\n'), c.id); log.push(`~ guidelines set from ${cb.general_rules.length} general rules`); }
      db.prepare(dry ? 'ROLLBACK' : 'COMMIT').run();
    } catch (e) { db.prepare('ROLLBACK').run(); throw e; }
    console.log(log.join('\n') || 'Nothing to change');
    console.log(`${dry ? 'DRY RUN, nothing written. Would migrate' : 'Done. Migrated'} ${migrated} answer${migrated === 1 ? '' : 's'}; ${q.get('SELECT COUNT(*) n FROM fields WHERE campaign_id = ?', c.id).n} criteria in "${c.name}".`);
  },
  'fields delete': ([ref, name]) => {
    if (!ref || !name) die('usage: fields delete <campaign> "<criterion name>"');
    const c = findCampaign(ref);
    const f = q.get('SELECT id FROM fields WHERE campaign_id = ? AND name = ?', c.id, name) || die(`No criterion named "${name}" in "${c.name}"`);
    const used = q.all("SELECT values_json FROM annotations a JOIN papers p ON p.id = a.paper_id WHERE p.campaign_id = ?", c.id).filter(a => { const v = JSON.parse(a.values_json || '{}')[f.id]; return v !== undefined && v !== null && v !== ''; }).length;
    q.run('DELETE FROM fields WHERE id = ?', f.id);
    console.log(`Deleted "${name}" from "${c.name}"${used ? ` (${used} annotations had an answer for it; those answers are no longer shown)` : ''}`);
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

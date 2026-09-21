// End-to-end API tests. Run with `npm test` (starts a throwaway server) or against a running server:
//   CONCORD_URL=http://localhost:4321 LOG=path/to/server.log node tests/e2e.mjs
const B = (process.env.CONCORD_URL || 'http://localhost:4399') + '/api';
const jars = {};
async function call(who, path, { method = 'GET', body, form } = {}) {
  const h = {}; if (jars[who]) h.cookie = jars[who];
  let b; if (form) b = form; else if (body) { h['content-type'] = 'application/json'; b = JSON.stringify(body); }
  const r = await fetch(B + path, { method, headers: h, body: b });
  const sc = r.headers.get('set-cookie'); if (sc) jars[who] = sc.split(';')[0];
  const ct = r.headers.get('content-type') || '';
  const d = ct.includes('json') ? await r.json() : await r.arrayBuffer();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(d)}`);
  return d;
}
const ok = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('✔', m); };

await call('a', '/auth/register', { method: 'POST', body: { email: 'alice@x.com', name: 'Alice', password: 'secret123' } });
await call('b', '/auth/register', { method: 'POST', body: { email: 'bob@x.com', name: 'Bob', password: 'secret123' } });
const { campaign } = await call('a', '/campaigns', { method: 'POST', body: { name: 'Test SR', description: 'd' } });
const cid = campaign.id;

// Excel template import
const tpl = await call('a', `/campaigns/${cid}/fields/template.xlsx`);
const fd = new FormData(); fd.append('file', new Blob([tpl]), 'f.xlsx');
const imp = await call('a', `/campaigns/${cid}/fields/import`, { method: 'POST', form: fd });
ok(imp.created.length === 6 && imp.errors.length === 0, `excel import created 6 fields (${imp.errors})`);
await call('a', `/campaigns/${cid}/fields`, { method: 'POST', body: { name: 'Manual', type: 'single', options: 'A; B' } });
let err = await call('a', `/campaigns/${cid}/fields`, { method: 'POST', body: { name: 'Bad', type: 'single', options: 'A' } }).catch(e => e.message);
ok(/two options/.test(err), 'rejects single-choice with 1 option');

// Invite Bob (existing user): added immediately
const inv = await call('a', `/campaigns/${cid}/invites`, { method: 'POST', body: { email: 'bob@x.com' } });
ok(inv.added === true && inv.link === undefined, 'existing user added directly, no link exposed');
const c = await call('b', `/campaigns/${cid}`);
ok(c.members.length === 2 && c.campaign.role === 'member', 'bob joined as member');
// Invite a new person: link returned because mail is not configured; link leads to set-password registration
const inv2 = await call('a', `/campaigns/${cid}/invites`, { method: 'POST', body: { email: 'carol@x.com' } });
ok(inv2.added === false && /\/invite\//.test(inv2.link) && inv2.expires_at > Date.now() + 23 * 3600e3, 'new-user invite returns 24h link');
const tok = inv2.link.split('/invite/')[1];
const meta = await call('x', `/auth/invite/${tok}`);
ok(meta.invite.email === 'carol@x.com' && !meta.invite.expired && !meta.invite.existingUser, 'invite lookup ok');
const pending = (await call('a', `/campaigns/${cid}/invites`)).invites; ok(pending.length === 1 && pending[0].email === 'carol@x.com', 'pending invite listed');
const re = await call('a', `/campaigns/${cid}/invites/${pending[0].id}/resend`, { method: 'POST' });
err = await call('x', `/auth/invite/${tok}`).catch(e => e.message); ok(/404/.test(err), 'old link dead after resend');
const tok2 = re.link.split('/invite/')[1];
err = await call('c', `/auth/invite/${tok2}/register`, { method: 'POST', body: { name: 'Carol', password: 'short' } }).catch(e => e.message); ok(/8 characters/.test(err), 'password rule on invite registration');
const reg = await call('c', `/auth/invite/${tok2}/register`, { method: 'POST', body: { name: 'Carol', password: 'carolpass123' } });
ok(reg.user.email === 'carol@x.com' && reg.campaign_id === cid, 'carol registered via invite and joined');
ok((await call('a', `/campaigns/${cid}`)).members.length === 3, 'three members now');
err = await call('x', `/auth/invite/${tok2}/register`, { method: 'POST', body: { name: 'Carol', password: 'carolpass123' } }).catch(e => e.message); ok(/404/.test(err), 'invite link is single-use');
await call('a', `/campaigns/${cid}/members/${reg.user.id}`, { method: 'DELETE' });
// Forgot / reset
const fg = await call('x', '/auth/forgot', { method: 'POST', body: { email: 'nobody@x.com' } });
const fg2 = await call('x', '/auth/forgot', { method: 'POST', body: { email: 'bob@x.com' } });
ok(fg.message === fg2.message, 'forgot gives the same answer for unknown and known addresses');
const fsm = await import('node:fs');
const logLine = fsm.readFileSync(process.env.LOG, 'utf8').split('\n').filter(l => l.includes('/reset/')).pop();
const rtok = logLine.split('/reset/')[1].trim();
await call('x', `/auth/reset/${rtok}`);
err = await call('x', `/auth/reset/${rtok}`, { method: 'POST', body: { password: 'tiny' } }).catch(e => e.message); ok(/8 characters/.test(err), 'reset enforces password rule');
const oldCookie = jars['b'];
await call('b2', `/auth/reset/${rtok}`, { method: 'POST', body: { password: 'bobnewpass123' } });
err = await call('x', `/auth/reset/${rtok}`).catch(e => e.message); ok(/404/.test(err), 'reset link is single-use');
jars['old'] = oldCookie; err = await call('old', '/auth/me').catch(e => e.message); ok(/401/.test(err), 'old session invalidated after password change');
err = await call('b3', '/auth/login', { method: 'POST', body: { email: 'bob@x.com', password: 'secret123' } }).catch(e => e.message); ok(/401/.test(err), 'old password rejected');
await call('b', '/auth/login', { method: 'POST', body: { email: 'bob@x.com', password: 'bobnewpass123' } }); ok(true, 'new password works');
err = await call('b', `/campaigns/${cid}/fields`, { method: 'POST', body: { name: 'x', type: 'text' } }).catch(e => e.message);
ok(/403/.test(err), 'member cannot edit fields');

// Bib import
const bib = `@article{smith2020, title={A {Great} Study}, author={Smith, John and Doe, Jane}, journal={Nature}, year=2020, doi={10.1/abc}}
@inproceedings{lee2021,
  title = "Another one",
  author = "Lee, K",
  booktitle = {Proc. of X},
  year = {2021}
}
@comment{ignored}
`;
const fb = new FormData(); fb.append('text', bib);
const bi = await call('a', `/campaigns/${cid}/papers/import-bib`, { method: 'POST', form: fb });
ok(bi.created === 2, 'bib import created 2 papers');
const fb2 = new FormData(); fb2.append('text', bib);
ok((await call('a', `/campaigns/${cid}/papers/import-bib`, { method: 'POST', form: fb2 })).skipped === 2, 'duplicate keys skipped');
let { papers } = await call('a', `/campaigns/${cid}/papers`);
ok(papers[0].authors === 'Smith, John; Doe, Jane' && papers[0].title === 'A Great Study' && papers[0].has_pdf === false, 'bib fields parsed');

// Manual paper without PDF rejected, with PDF ok
const pdfBytes = new Uint8Array(Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'));
let mf = new FormData(); mf.append('title', 'Manual paper');
err = await call('a', `/campaigns/${cid}/papers`, { method: 'POST', form: mf }).catch(e => e.message);
ok(/PDF is required/.test(err), 'manual paper without PDF rejected');
mf = new FormData(); mf.append('title', 'Manual paper'); mf.append('pdf', new Blob([pdfBytes], { type: 'application/pdf' }), 'p.pdf');
const mp = (await call('a', `/campaigns/${cid}/papers`, { method: 'POST', form: mf })).paper;
ok(mp.has_pdf, 'manual paper with PDF created');

// Assign both to all papers; annotation blocked without pdf
papers = (await call('a', `/campaigns/${cid}/papers`)).papers;
await call('a', `/campaigns/${cid}/papers/bulk-assign`, { method: 'POST', body: { paper_ids: papers.map(p => p.id), user_ids: [1, 2] } });
err = await call('b', `/campaigns/${cid}/papers/${papers[0].id}/annotation`, { method: 'PUT', body: { values: {}, status: 'draft' } }).catch(e => e.message);
ok(/no PDF/.test(err), 'annotation blocked without PDF');
for (const p of papers.filter(p => !p.has_pdf)) { const f = new FormData(); f.append('pdf', new Blob([pdfBytes], { type: 'application/pdf' }), 'p.pdf'); await call('a', `/campaigns/${cid}/papers/${p.id}/pdf`, { method: 'POST', form: f }); }
const pdf = await call('b', `/campaigns/${cid}/papers/${papers[0].id}/pdf`);
ok(pdf.byteLength === pdfBytes.length, 'member can fetch pdf');

// Annotate: fields by name
const fields = (await call('a', `/campaigns/${cid}`)).fields;
const F = Object.fromEntries(fields.map(f => [f.name, f.id]));
const mk = (inc, type, outs, n, qual) => ({ [F['Include?']]: inc, [F['Study type']]: type, ...(type === 'Other' ? { [`${F['Study type']}:other`]: 'Mixed methods' } : {}), [F['Outcomes reported']]: outs, [F['Sample size']]: n, [F['Quality (1-5)']]: qual, [F['Notes']]: 'ok', [F['Manual']]: 'A' });
err = await call('a', `/campaigns/${cid}/papers/${papers[0].id}/annotation`, { method: 'PUT', body: { values: {}, status: 'submitted' } }).catch(e => e.message);
ok(/field_errors/.test(err), 'submit validates required fields');
papers = (await call('a', `/campaigns/${cid}/papers`)).papers;
const A = [mk(true, 'RCT', ['Cost'], 10, 5), mk(false, 'Cohort', ['Cost', 'Mortality'], 20, 2), mk(true, 'RCT', [], 30, 4)];
const Bv = [mk(true, 'RCT', ['Cost'], 10, 5), mk(true, 'Cohort', ['Mortality'], 25, 3), mk(true, 'Other', [], 30, 4)];
for (let i = 0; i < 3; i++) {
  await call('a', `/campaigns/${cid}/papers/${papers[i].id}/annotation`, { method: 'PUT', body: { values: A[i], status: 'submitted' } });
  const r = await call('b', `/campaigns/${cid}/papers/${papers[i].id}/annotation`, { method: 'PUT', body: { values: Bv[i], status: 'submitted' } });
  if (i === 0) ok(r.paper.submitted_count === 2, 'both submissions counted');
}
papers = (await call('a', `/campaigns/${cid}/papers`)).papers;
const stages = (await call('a', `/campaigns/${cid}`)).stages;
ok(papers.every(p => p.stage_id === stages.find(s => s.name === 'Reviewed').id), 'auto-moved to Reviewed');

// Kanban move
await call('b', `/campaigns/${cid}/papers/${papers[0].id}/move`, { method: 'POST', body: { stage_id: stages[4].id, position: 0 } });
ok((await call('a', `/campaigns/${cid}/papers`)).papers.find(p => p.id === papers[0].id).stage_id === stages[4].id, 'kanban move works');

// Stats
const st = await call('a', `/campaigns/${cid}/stats`);
const inc = st.fields.find(f => f.name === 'Include?');
const typ = st.fields.find(f => f.name === 'Study type');
console.log('Include? kappa', inc.pairwise[0].kappa, 'agreement', inc.pairwise[0].agreement, 'fleiss', inc.fleiss?.kappa);
console.log('Study type kappa', typ.pairwise[0].kappa, 'fleiss', typ.fleiss?.kappa);
ok(Math.abs(inc.pairwise[0].agreement - 2 / 3) < 1e-9, 'Include? agreement 2/3');
ok(Math.abs(typ.pairwise[0].kappa - 0.5) < 1e-9, 'Study type cohen kappa = 0.5');
ok(st.conflicts.length === 2, `conflicts on 2 papers (got ${st.conflicts.length})`);
console.log('multi:', JSON.stringify(st.fields.find(f => f.type === 'multi').per_option.map(o => [o.option, o.mean_pairwise_kappa])));
console.log('number:', JSON.stringify(st.fields.find(f => f.type === 'number').pairwise));
err = await call('b', `/campaigns/${cid}/stats`).catch(e => e.message);
ok(/403/.test(err), 'member cannot see stats');
const xl = await call('a', `/campaigns/${cid}/stats/export.xlsx`);
ok(xl.byteLength > 1000, 'xlsx export works');
console.log('ALL PASSED');

// ---- bulk PDF attach + edit + ownership transfer ----
{
  const fb3 = new FormData(); fb3.append('text', '@article{drop2022, title={Dropped paper about kappa}, author={Drop, D}, year=2022}');
  await call('a', `/campaigns/${cid}/papers/import-bib`, { method: 'POST', form: fb3 });
  const fd = new FormData();
  fd.append('pdfs', new Blob([pdfBytes], { type: 'application/pdf' }), 'drop2022.pdf');
  fd.append('pdfs', new Blob([pdfBytes], { type: 'application/pdf' }), 'Dropped paper about kappa (2022).pdf');
  fd.append('pdfs', new Blob([pdfBytes], { type: 'application/pdf' }), 'unrelated.pdf');
  fd.append('pdfs', new Blob([Buffer.from('nope')], { type: 'application/pdf' }), 'fake.pdf');
  const at = await call('a', `/campaigns/${cid}/papers/attach-pdfs`, { method: 'POST', form: fd });
  ok(at.attached.length === 2 && at.unmatched.length === 1 && at.rejected.length === 1, `attach-pdfs matched by key and title (${JSON.stringify({ a: at.attached.length, u: at.unmatched, r: at.rejected })})`);
  const dp = (await call('a', `/campaigns/${cid}/papers`)).papers.find(p => p.bib_key === 'drop2022');
  ok(dp.has_pdf, 'dropped paper has PDF');
  const ed = await call('a', `/campaigns/${cid}/papers/${dp.id}`, { method: 'PATCH', body: { title: 'Edited title', year: '2023' } });
  ok(ed.paper.title === 'Edited title' && ed.paper.year === '2023' && ed.paper.has_pdf, 'owner edited paper metadata, PDF kept');
  err = await call('b', `/campaigns/${cid}/papers/${dp.id}`, { method: 'PATCH', body: { title: 'x' } }).catch(e => e.message); ok(/403/.test(err), 'member cannot edit paper');
  // transfer ownership alice -> bob
  err = await call('b', `/campaigns/${cid}/transfer`, { method: 'POST', body: { user_id: 2 } }).catch(e => e.message); ok(/403/.test(err), 'member cannot transfer');
  err = await call('a', `/campaigns/${cid}/transfer`, { method: 'POST', body: { user_id: 999 } }).catch(e => e.message); ok(/not a member/.test(err), 'transfer rejects non-member');
  await call('a', `/campaigns/${cid}/transfer`, { method: 'POST', body: { user_id: 2 } });
  ok((await call('b', `/campaigns/${cid}`)).campaign.role === 'owner', 'bob is now owner');
  ok((await call('a', `/campaigns/${cid}`)).campaign.role === 'member', 'alice is now a member');
  err = await call('a', `/campaigns/${cid}/stats`).catch(e => e.message); ok(/403/.test(err), 'former owner loses stats access');
  await call('b', `/campaigns/${cid}/stats`); ok(true, 'new owner sees stats');
  console.log('EXTRA PASSED');
}

// ---- campaign deletion (bob owns it now) ----
{
  err = await call('a', `/campaigns/${cid}`, { method: 'DELETE', body: { confirm: 'Test SR' } }).catch(e => e.message); ok(/403/.test(err), 'member cannot delete campaign');
  err = await call('b', `/campaigns/${cid}`, { method: 'DELETE', body: { confirm: 'wrong' } }).catch(e => e.message); ok(/confirm/.test(err), 'deletion requires the campaign name');
  const before = (await call('b', `/campaigns/${cid}/papers`)).papers.filter(p => p.has_pdf).length;
  const d = await call('b', `/campaigns/${cid}`, { method: 'DELETE', body: { confirm: 'Test SR' } });
  ok(d.ok && d.removed_files === before, `campaign deleted with ${d.removed_files} PDF files removed`);
  err = await call('b', `/campaigns/${cid}`).catch(e => e.message); ok(/404/.test(err), 'campaign gone');
  ok((await call('b', '/campaigns')).campaigns.every(c => c.id !== cid), 'not listed any more');
  console.log('DELETE PASSED');
}

// ---- codebook layout: "N binaires", "Choix unique + binaire", "N ..." free text ----
{
  const XLSX = (await import('../server/node_modules/xlsx/xlsx.mjs'));
  const ws = XLSX.utils.aoa_to_sheet([
    ['Groupe', 'Statut', 'Question / Variable', 'Type de réponse', 'Option / Valeur', "Logique d'annotation"],
    ['H : Rigueur', 'Nouveau', 'H6. Validité du juge', '3 binaires', 'Même famille ?', 'Oui if same family'], ['', '', '', '', 'Validé contre humains ?', 'Oui if validated'], ['', '', '', '', 'Accord rapporté ?', 'Oui if reported'],
    ['', 'Nouveau', 'D6. Données transmises', 'Choix unique + binaire', 'PII', 'Identifiable'], ['', '', '', '', 'Aucune', 'None'], ['', '', '', '', '+ RGPD discuté : Oui/Non', 'Oui if GDPR discussed'],
    ['', 'Nouveau', 'F6. Échelle', 'Texte libre', 'N participants', 'Number of humans'], ['', '', '', '', 'N items', 'Number of items'],
  ]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Codebook');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const c2 = (await call('b', '/campaigns', { method: 'POST', body: { name: 'Codebook layout' } })).campaign;
  const fd = new FormData(); fd.append('file', new Blob([buf]), 'cb.xlsx');
  const r = await call('b', `/campaigns/${c2.id}/fields/import`, { method: 'POST', form: fd });
  const t = Object.fromEntries(r.created.map(f => [f.name, f.type]));
  ok(r.errors.length === 0 && r.created.length === 7, `codebook import created 7 criteria (${r.created.length}; ${r.errors})`);
  ok(t['H6. Même famille ?'] === 'boolean' && t['H6. Validé contre humains ?'] === 'boolean' && t['H6. Accord rapporté ?'] === 'boolean', '"3 binaires" becomes three yes/no criteria');
  ok(t['D6. Données transmises'] === 'single' && t['D6. RGPD discuté'] === 'boolean', '"Choix unique + binaire" becomes a choice plus a yes/no');
  ok(t['F6. N participants'] === 'number' && t['F6. N items'] === 'number', 'free text with N sub-values becomes numbers');
  ok(r.created.every(f => f.group_name === 'H : Rigueur'), 'group carries forward');
  console.log('CODEBOOK PASSED');
}

// ---- "other" options carry a text; campaign guidelines ----
{
  const c3 = (await call('b', '/campaigns', { method: 'POST', body: { name: 'Other text' } })).campaign;
  const f1 = (await call('b', `/campaigns/${c3.id}/fields`, { method: 'POST', body: { name: 'Discipline', type: 'single', options: ['Maths', 'Autre'], required: true } })).field;
  const f2 = (await call('b', `/campaigns/${c3.id}/fields`, { method: 'POST', body: { name: 'Baselines', type: 'multi', options: ['Autre(s) LLM(s)', 'Ablation'], required: false } })).field;
  const fdp = new FormData(); fdp.append('title', 'P'); fdp.append('pdf', new Blob([pdfBytes], { type: 'application/pdf' }), 'p.pdf');
  const pp = (await call('b', `/campaigns/${c3.id}/papers`, { method: 'POST', form: fdp })).paper;
  err = await call('b', `/campaigns/${c3.id}/papers/${pp.id}/annotation`, { method: 'PUT', body: { values: { [f1.id]: 'Autre', [f2.id]: ['Autre(s) LLM(s)'] }, status: 'submitted' } }).catch(e => e.message);
  ok(/text box/.test(err), '"Autre" without its text cannot be marked as done');
  await call('b', `/campaigns/${c3.id}/papers/${pp.id}/annotation`, { method: 'PUT', body: { values: { [f1.id]: 'Autre', [`${f1.id}:other`]: 'Musique', [f2.id]: ['Autre(s) LLM(s)'] }, status: 'submitted' } });
  ok(true, '"Autre" with text is accepted, and "Autre(s) LLM(s)" needs none');
  const st3 = await call('b', `/campaigns/${c3.id}/stats`);
  ok(st3.fields[0].other_texts?.[0]?.text === 'Musique' && !st3.fields[1].other_texts, 'statistics list the texts entered with "Autre"');
  await call('b', `/campaigns/${c3.id}`, { method: 'PATCH', body: { guidelines: 'Annotate the key contribution only.' } });
  ok((await call('b', `/campaigns/${c3.id}`)).campaign.guidelines === 'Annotate the key contribution only.', 'campaign guidelines saved');
  console.log('OTHER PASSED');
}

// ---- "not applicable" checkbox on a free-text criterion ----
{
  const c4 = (await call('b', '/campaigns', { method: 'POST', body: { name: 'NA box' } })).campaign;
  const f = (await call('b', `/campaigns/${c4.id}/fields`, { method: 'POST', body: { name: 'Questionnaires', type: 'text', required: true, checks: [{ label: 'Non standardisé', description: 'ad hoc' }, { label: 'Non concerné', exclusive: true }] } })).field;
  ok(f.checks.length === 2 && f.checks[1].exclusive === true, 'criterion keeps its checkboxes');
  const fdp = new FormData(); fdp.append('title', 'P'); fdp.append('pdf', new Blob([pdfBytes], { type: 'application/pdf' }), 'p.pdf');
  const pp = (await call('b', `/campaigns/${c4.id}/papers`, { method: 'POST', form: fdp })).paper;
  err = await call('b', `/campaigns/${c4.id}/papers/${pp.id}/annotation`, { method: 'PUT', body: { values: {}, status: 'submitted' } }).catch(e => e.message);
  ok(/field_errors/.test(err), 'required text still required when the box is not ticked');
  await call('b', `/campaigns/${c4.id}/papers/${pp.id}/annotation`, { method: 'PUT', body: { values: { [`${f.id}:checks`]: ['Non standardisé'] }, status: 'submitted' } });
  ok((await call('b', `/campaigns/${c4.id}/stats`)).fields[0].checks[0].count === 1, 'a ticked checkbox counts as an answer');
  console.log('NA PASSED');
}

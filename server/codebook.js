// Parses annotation codebooks from spreadsheets into field definitions.
// Two layouts are supported:
//  1. Simple: columns name, type, options, required, description (one row per field, options separated by ';').
//  2. Codebook: columns Groupe | Statut | Question / Variable | Type de réponse | Option / Valeur | Logique d'annotation
//     (one row per option; group and question carry forward on blank rows).
import XLSX from 'xlsx';

export const FIELD_TYPES = ['text', 'single', 'multi', 'number', 'boolean', 'scale'];

const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const lower = s => norm(s).toLowerCase();

export function mapType(raw) {
  const t = lower(raw);
  if (!t) return 'text';
  if (['text', 'texte', 'texte libre', 'free text', 'string'].includes(t)) return 'text';
  if (['number', 'nombre', 'numeric', 'numérique', 'integer', 'int'].includes(t)) return 'number';
  if (['boolean', 'bool', 'yes/no', 'oui/non', 'binaire', 'binary'].includes(t)) return 'boolean';
  if (t.startsWith('scale') || t.startsWith('échelle') || t.startsWith('echelle') || t === 'likert') return 'scale';
  if (t.startsWith('choix multiple') || t.startsWith('multi') || t === 'checklist' || t === 'checkbox' || t === 'multiple choice') return 'multi';
  if (t.startsWith('choix unique') || t.startsWith('single') || t === 'radio' || t === 'single choice') return 'single';
  if (FIELD_TYPES.includes(t)) return t;
  throw new Error(`Unknown field type "${raw}"`);
}

export function readSheetRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).map(r => r.map(norm));
}

export function detectLayout(header) {
  const h = header.map(lower);
  if (h.some(x => x.includes('question')) && h.some(x => x.includes('option'))) return 'codebook';
  if (h.includes('name') || h.includes('field')) return 'simple';
  throw new Error('Unrecognised spreadsheet layout. Expected either the simple template (name, type, options, required, description) or a codebook (Groupe, Question, Type de réponse, Option, Logique).');
}

export function parseFieldsWorkbook(buffer) {
  const rows = readSheetRows(buffer).filter(r => r.some(Boolean));
  if (!rows.length) throw new Error('Spreadsheet is empty');
  const layout = detectLayout(rows[0]);
  return layout === 'codebook' ? parseCodebook(rows) : parseSimple(rows);
}

function parseSimple(rows) {
  const h = rows[0].map(lower);
  const col = (...names) => h.findIndex(x => names.includes(x));
  const ci = { name: col('name', 'field'), type: col('type'), options: col('options', 'choices'), required: col('required'), description: col('description', 'help'), group: col('group', 'section') };
  const get = (r, k) => ci[k] >= 0 ? r[ci[k]] : '';
  return rows.slice(1).filter(r => get(r, 'name')).map(r => ({
    name: get(r, 'name'), type: mapType(get(r, 'type')),
    options: get(r, 'options').split(/[;|\n]/).map(norm).filter(Boolean),
    option_help: {}, required: get(r, 'required') === '' ? true : /^(1|true|yes|oui|y)$/i.test(get(r, 'required')),
    description: get(r, 'description'), group_name: get(r, 'group'),
  }));
}

function parseCodebook(rows) {
  const h = rows[0].map(lower);
  const find = pred => h.findIndex(pred);
  const ci = {
    group: find(x => x.startsWith('group')), question: find(x => x.includes('question')), type: find(x => x.startsWith('type')),
    option: find(x => x.startsWith('option')), logic: find(x => x.includes('logique') || x.includes('logic') || x.includes('guidance') || x.includes('when')),
  };
  const get = (r, k) => ci[k] >= 0 ? r[ci[k]] : '';
  const questions = [];
  let group = '', cur = null;
  for (const r of rows.slice(1)) {
    if (get(r, 'group')) group = get(r, 'group');
    if (get(r, 'question')) { cur = { name: get(r, 'question'), rawType: get(r, 'type'), group_name: group, options: [] }; questions.push(cur); }
    if (!cur) continue;
    const opt = get(r, 'option'), logic = get(r, 'logic');
    if (opt || logic) cur.options.push({ label: opt, help: logic });
  }
  const fields = [];
  for (const qn of questions) {
    const rawType = lower(qn.rawType);
    const base = { group_name: qn.group_name, required: false, description: '', option_help: {} };
    const opts = qn.options.filter(o => o.label);
    // "Choix unique + binaire": a single choice followed by a companion yes/no field marked with a leading "+".
    if (rawType.includes('binaire')) {
      const extra = opts.filter(o => o.label.startsWith('+'));
      const main = opts.filter(o => !o.label.startsWith('+'));
      fields.push(choiceField(qn, 'single', main, base));
      for (const e of extra) {
        const label = e.label.replace(/^\+\s*/, '').replace(/\s*:\s*(oui\/non|yes\/no).*$/i, '').trim();
        fields.push({ ...base, name: `${shortCode(qn.name)}${label}`, type: 'boolean', options: [], description: e.help });
      }
      continue;
    }
    const type = mapType(qn.rawType);
    if (type === 'single' || type === 'multi') { fields.push(choiceField(qn, type, opts, base)); continue; }
    if (type === 'text' || type === 'number') {
      const real = opts.filter(o => !/^(texte libre|free text|nous|text)$/i.test(o.label));
      // Several "N ..." sub-values -> one number field each.
      if (real.length > 1 && real.every(o => /^n\b/i.test(o.label))) {
        for (const o of real) fields.push({ ...base, name: `${shortCode(qn.name)}${o.label}`, type: 'number', options: [], description: o.help });
        continue;
      }
      const description = real.length > 1
        ? real.map(o => `${o.label}: ${o.help}`).join('\n')
        : (qn.options[0]?.help || '');
      fields.push({ ...base, name: qn.name, type, options: [], description });
      continue;
    }
    fields.push({ ...base, name: qn.name, type, options: type === 'scale' ? { min: 1, max: 5 } : [] });
  }
  return fields;
}

// "D6. Données apprenant transmises" -> "D6. " so companion fields sort next to their parent.
function shortCode(name) { const m = /^([A-Z]\d+)\.\s/.exec(name); return m ? `${m[1]}. ` : ''; }

function choiceField(qn, type, opts, base) {
  const labels = opts.map(o => o.label.replace(/^"(.*)"$/, '$1'));
  const option_help = {};
  opts.forEach((o, i) => { if (o.help) option_help[labels[i]] = o.help; });
  if (labels.length < 2) throw new Error(`"${qn.name}" needs at least two options`);
  return { ...base, name: qn.name, type, options: labels, option_help };
}

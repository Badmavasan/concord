// Minimal BibTeX parser: handles @type{key, field = {..} | "..", ...} with nested braces.
export function parseBibtex(text) {
  const entries = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const at = text.indexOf('@', i);
    if (at < 0) break;
    i = at + 1;
    let m = /^([a-zA-Z]+)\s*[{(]/.exec(text.slice(i));
    if (!m) continue;
    const type = m[1].toLowerCase();
    i += m[0].length;
    if (['comment', 'preamble', 'string'].includes(type)) { i = skipBlock(text, i); continue; }
    const comma = text.indexOf(',', i);
    const key = text.slice(i, comma).trim();
    i = comma + 1;
    const fields = {};
    while (i < n) {
      while (i < n && /[\s,]/.test(text[i])) i++;
      if (text[i] === '}' || text[i] === ')') { i++; break; }
      const eq = text.indexOf('=', i);
      if (eq < 0) { i = n; break; }
      const name = text.slice(i, eq).trim().toLowerCase();
      i = eq + 1;
      while (i < n && /\s/.test(text[i])) i++;
      let value = '';
      if (text[i] === '{') {
        let depth = 0, start = i;
        do { if (text[i] === '{') depth++; else if (text[i] === '}') depth--; i++; } while (i < n && depth > 0);
        value = text.slice(start + 1, i - 1);
      } else if (text[i] === '"') {
        let start = ++i;
        while (i < n && text[i] !== '"') i++;
        value = text.slice(start, i); i++;
      } else {
        let start = i;
        while (i < n && !/[,}]/.test(text[i])) i++;
        value = text.slice(start, i);
      }
      fields[name] = clean(value);
    }
    entries.push({ type, key, ...fields });
  }
  return entries;
}

function skipBlock(text, i) {
  let depth = 0;
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth <= 0) return i + 1; }
  }
  return i;
}

function clean(s) {
  return s.replace(/[{}]/g, '').replace(/\\["'`^~]/g, '').replace(/\s+/g, ' ').trim();
}

export function bibToPaper(e) {
  return {
    bib_key: e.key || null,
    title: e.title || '(untitled)',
    authors: (e.author || '').replace(/\s+and\s+/g, '; '),
    year: e.year || '',
    venue: e.journal || e.booktitle || e.publisher || '',
    doi: e.doi || '',
    abstract: e.abstract || '',
  };
}

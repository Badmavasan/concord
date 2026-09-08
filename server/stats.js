// Inter-rater agreement statistics per field.
// ratings: array of { paper_id, user_id, value }

function cohenKappa(pairs) {
  // pairs: [[a,b], ...] categorical labels
  const n = pairs.length;
  if (n === 0) return null;
  const cats = [...new Set(pairs.flat())];
  let agree = 0;
  const ma = {}, mb = {};
  for (const [a, b] of pairs) {
    if (a === b) agree++;
    ma[a] = (ma[a] || 0) + 1;
    mb[b] = (mb[b] || 0) + 1;
  }
  const po = agree / n;
  let pe = 0;
  for (const c of cats) pe += ((ma[c] || 0) / n) * ((mb[c] || 0) / n);
  if (cats.length < 2 || pe === 1) return { kappa: null, po, pe, n }; // undefined when only one category ever used
  return { kappa: (po - pe) / (1 - pe), po, pe, n };
}

function fleissKappa(rows) {
  // rows: array of arrays of labels (each row = one paper, each element = one rater's label). All rows must have same rater count.
  const counts = rows.map(r => r.length);
  const m = Math.min(...counts);
  if (!rows.length || m < 2) return null;
  const cats = [...new Set(rows.flat())];
  const N = rows.length;
  let sumPi = 0;
  const pj = Object.fromEntries(cats.map(c => [c, 0]));
  for (const r of rows) {
    const sub = r.slice(0, m);
    let s = 0;
    for (const c of cats) {
      const k = sub.filter(v => v === c).length;
      pj[c] += k;
      s += k * (k - 1);
    }
    sumPi += s / (m * (m - 1));
  }
  const Pbar = sumPi / N;
  let Pe = 0;
  for (const c of cats) Pe += Math.pow(pj[c] / (N * m), 2);
  if (cats.length < 2 || Pe === 1) return { kappa: null, po: Pbar, pe: Pe, n: N, raters: m };
  return { kappa: (Pbar - Pe) / (1 - Pe), po: Pbar, pe: Pe, n: N, raters: m };
}

function interpret(k) {
  if (k == null || Number.isNaN(k)) return '—';
  if (k < 0) return 'Poor';
  if (k < 0.2) return 'Slight';
  if (k < 0.4) return 'Fair';
  if (k < 0.6) return 'Moderate';
  if (k < 0.8) return 'Substantial';
  return 'Almost perfect';
}

function groupByPaper(ratings) {
  const byPaper = new Map();
  for (const r of ratings) {
    if (!byPaper.has(r.paper_id)) byPaper.set(r.paper_id, new Map());
    byPaper.get(r.paper_id).set(r.user_id, r.value);
  }
  return byPaper;
}

function pairwise(byPaper, users, compare) {
  // For each pair of users, collect papers both rated.
  const out = [];
  for (let i = 0; i < users.length; i++) for (let j = i + 1; j < users.length; j++) {
    const a = users[i], b = users[j];
    const pairs = [];
    for (const m of byPaper.values()) if (m.has(a.id) && m.has(b.id)) pairs.push([m.get(a.id), m.get(b.id)]);
    if (pairs.length) out.push({ a: a.name, b: b.name, ...compare(pairs) });
  }
  return out;
}

export function fieldStats(field, ratings, users) {
  const byPaper = groupByPaper(ratings);
  const multi = [...byPaper.values()].filter(m => m.size >= 2);
  const base = { field_id: field.id, name: field.name, type: field.type, group_name: field.group_name || '', n_papers_rated: byPaper.size, n_papers_multi: multi.length };
  const norm = v => (v == null ? null : String(v));

  if (field.type === 'single' || field.type === 'boolean' || field.type === 'scale') {
    const pw = pairwise(byPaper, users, pairs => {
      const k = cohenKappa(pairs.map(([a, b]) => [norm(a), norm(b)]));
      return { kappa: k?.kappa, agreement: k?.po, n: k?.n };
    });
    const rows = multi.map(m => [...m.values()].map(norm));
    const complete = rows.filter(r => r.length === users.length);
    const fleiss = complete.length && users.length >= 2 ? fleissKappa(complete) : null;
    const distribution = {};
    for (const r of ratings) distribution[norm(r.value)] = (distribution[norm(r.value)] || 0) + 1;
    const ks = pw.map(p => p.kappa).filter(k => k != null);
    const meanKappa = ks.length ? ks.reduce((s, k) => s + k, 0) / ks.length : null;
    const res = { ...base, distribution, pairwise: pw, mean_pairwise_kappa: meanKappa, interpretation: interpret(meanKappa), fleiss: fleiss ? { ...fleiss, interpretation: interpret(fleiss.kappa) } : null };
    if (field.type === 'scale') {
      const nums = ratings.map(r => Number(r.value)).filter(Number.isFinite);
      res.mean = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    }
    return res;
  }

  if (field.type === 'multi') {
    // Per-option kappa (each option treated as a binary yes/no) + mean Jaccard.
    const opts = JSON.parse(field.options || '[]');
    const perOption = opts.map(opt => {
      const pw = pairwise(byPaper, users, pairs => {
        const k = cohenKappa(pairs.map(([a, b]) => [String((a || []).includes(opt)), String((b || []).includes(opt))]));
        return { kappa: k?.kappa, agreement: k?.po, n: k?.n };
      });
      const ks = pw.map(p => p.kappa).filter(k => k != null);
      const mean = ks.length ? ks.reduce((s, k) => s + k, 0) / ks.length : null;
      const count = ratings.filter(r => (r.value || []).includes(opt)).length;
      return { option: opt, count, mean_pairwise_kappa: mean, interpretation: interpret(mean), pairwise: pw };
    });
    const jac = pairwise(byPaper, users, pairs => {
      const js = pairs.map(([a, b]) => {
        const A = new Set(a || []), B = new Set(b || []);
        const u = new Set([...A, ...B]);
        if (!u.size) return 1;
        return [...A].filter(x => B.has(x)).length / u.size;
      });
      return { jaccard: js.reduce((s, x) => s + x, 0) / js.length, n: js.length };
    });
    return { ...base, per_option: perOption, pairwise_jaccard: jac };
  }

  if (field.type === 'number') {
    const nums = ratings.map(r => Number(r.value)).filter(Number.isFinite);
    const mean = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    const sd = nums.length > 1 ? Math.sqrt(nums.reduce((s, x) => s + (x - mean) ** 2, 0) / (nums.length - 1)) : null;
    const pw = pairwise(byPaper, users, pairs => {
      const ps = pairs.map(([a, b]) => [Number(a), Number(b)]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
      const mad = ps.length ? ps.reduce((s, [a, b]) => s + Math.abs(a - b), 0) / ps.length : null;
      const exact = ps.length ? ps.filter(([a, b]) => a === b).length / ps.length : null;
      return { mean_abs_diff: mad, exact_agreement: exact, pearson: pearson(ps), n: ps.length };
    });
    return { ...base, mean, sd, min: nums.length ? Math.min(...nums) : null, max: nums.length ? Math.max(...nums) : null, pairwise: pw };
  }

  // text
  const filled = ratings.filter(r => r.value && String(r.value).trim()).length;
  const avgLen = filled ? ratings.reduce((s, r) => s + String(r.value || '').length, 0) / filled : 0;
  return { ...base, filled, avg_length: Math.round(avgLen) };
}

function pearson(ps) {
  const n = ps.length;
  if (n < 2) return null;
  const mx = ps.reduce((s, [a]) => s + a, 0) / n, my = ps.reduce((s, [, b]) => s + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (const [a, b] of ps) { num += (a - mx) * (b - my); dx += (a - mx) ** 2; dy += (b - my) ** 2; }
  if (!dx || !dy) return null;
  return num / Math.sqrt(dx * dy);
}

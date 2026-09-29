/**
 * Code Cosmos · Fuzzy Matching Layer
 * ------------------------------------------------------------------
 * Pure-JS implementations of the token/character similarity measures
 * used alongside semantic embeddings:
 *   · Levenshtein distance (banded, for long strings)
 *   · Jaro / Jaro-Winkler  (typo & transposition tolerant)
 *   · Token-Set ratio      (word order / duplication insensitive)
 *   · Token-Sort ratio     (word order insensitive)
 *   · Character 3-gram Jaccard (partial / truncated words)
 *   · Partial ratio        (substring containment)
 */

export function levenshtein(a, b, maxDistance = Infinity) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDistance) return rowMin;
    const swap = prev; prev = curr; curr = swap;
  }
  return prev[b.length];
}

export function similarityRatio(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

function jaro(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true; bMatches[j] = true; matches++;
      break;
    }
  }
  if (!matches) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;
  return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;
}

export function jaroWinkler(a, b, prefixScale = 0.1) {
  const j = jaro(a, b);
  if (j <= 0.7) return j;
  let prefix = 0;
  const max = Math.min(4, a.length, b.length);
  while (prefix < max && a[prefix] === b[prefix]) prefix++;
  return j + prefix * prefixScale * (1 - j);
}

function toSet(tokens) { return new Set(tokens); }

function intersectSize(a, b) {
  let n = 0;
  const small = a.size < b.size ? a : b;
  const large = small === a ? b : a;
  for (const v of small) if (large.has(v)) n++;
  return n;
}

/** Order-insensitive token set overlap (fuzzywuzzy token_set_ratio style). */
export function tokenSetRatio(aTokens, bTokens) {
  const A = toSet(aTokens); const B = toSet(bTokens);
  if (!A.size && !B.size) return 1;
  if (!A.size || !B.size) return 0;
  const inter = intersectSize(A, B);
  const diffA = A.size - inter;
  const diffB = B.size - inter;
  const denom = inter + diffA + diffB;
  const numerator = inter + Math.max(0, inter);
  const ordered = similarityRatio(aTokens.join(' '), bTokens.join(' '));
  const options = [
    denom === 0 ? 1 : (inter * 2) / (A.size + B.size),
    numerator / Math.max(1, denom),
    ordered
  ];
  return Math.max(...options);
}

export function tokenSortRatio(aTokens, bTokens) {
  const a = [...aTokens].sort().join(' ');
  const b = [...bTokens].sort().join(' ');
  return similarityRatio(a, b);
}

/**
 * Best substring alignment (FuzzyWuzzy partial_ratio). Windows are capped
 * so a pathological pair can never dominate a batch run.
 */
export function partialRatio(a, b) {
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  if (!short.length) return 0;
  if (a === b) return 1;
  const window = short.length;
  const span = long.length - window;
  if (span <= 0) return similarityRatio(short, long);
  const step = Math.max(1, Math.ceil(span / 600));
  let best = 0;
  for (let i = 0; i <= span; i += step) {
    const s = similarityRatio(short, long.slice(i, i + window));
    if (s > best) best = s;
    if (best === 1) break;
  }
  return best;
}

export function ngrams(str, n = 3) {
  const padded = `  ${str}  `.replace(/\s+/g, ' ');
  const out = new Set();
  for (let i = 0; i + n <= padded.length; i++) out.add(padded.slice(i, i + n));
  return out;
}

export function ngramJaccard(a, b, n = 3) {
  const A = ngrams(a, n); const B = ngrams(b, n);
  if (!A.size && !B.size) return 1;
  if (!A.size || !B.size) return 0;
  const inter = intersectSize(A, B);
  return inter / (A.size + B.size - inter);
}

/**
 * Pre-compute the expensive per-record structures once, so a record that
 * participates in 30 candidate pairs is only featurised a single time.
 */
export function prepareFuzzy(text, tokens) {
  const t = String(text || '');
  const toks = tokens || t.split(' ').filter(Boolean);
  return {
    text: t,
    tokens: toks,
    tokenSet: new Set(toks),
    sortedText: [...toks].sort().join(' '),
    grams: ngrams(t, 3)
  };
}

function asPrep(value, fallbackText, fallbackTokens) {
  if (value && value.tokenSet && value.grams) return value;
  return prepareFuzzy(fallbackText || (Array.isArray(value) ? value.join(' ') : String(value || '')), fallbackTokens || value);
}

function tokenSetRatioPrep(a, b) {
  const A = a.tokenSet; const B = b.tokenSet;
  if (!A.size && !B.size) return 1;
  if (!A.size || !B.size) return 0;
  const inter = intersectSize(A, B);
  const diffA = A.size - inter;
  const diffB = B.size - inter;
  const union = inter + diffA + diffB;
  const overlap = union === 0 ? 1 : (inter * 2) / union;      // 2·|A∩B| / |A∪B|
  const dice = (inter * 2) / Math.max(1, A.size + B.size);
  const ordered = similarityRatio(a.text, b.text);
  return Math.max(overlap, dice, ordered);
}

function ngramJaccardPrep(a, b) {
  const A = a.grams; const B = b.grams;
  if (!A.size && !B.size) return 1;
  if (!A.size || !B.size) return 0;
  const inter = intersectSize(A, B);
  return inter / (A.size + B.size - inter);
}

/**
 * Composite fuzzy score with a transparent breakdown for the UI.
 * Accepts either prepared fuzzy records or (tokens, text) pairs.
 * @returns {{score:number, parts:object}}
 */
export function fuzzyScore(aTokens, bTokens, aText, bText) {
  const prepA = asPrep(aTokens, aText, aTokens);
  const prepB = asPrep(bTokens, bText, bTokens);
  const setRatio = tokenSetRatioPrep(prepA, prepB);
  const sortRatio = similarityRatio(prepA.sortedText, prepB.sortedText);
  const jw = jaroWinkler(prepA.text, prepB.text);
  const ng = ngramJaccardPrep(prepA, prepB);
  const pr = partialRatio(prepA.text, prepB.text);
  const score = clamp(
    0.28 * setRatio + 0.18 * sortRatio + 0.22 * jw + 0.22 * ng + 0.10 * pr,
    0, 1
  );
  return {
    score,
    parts: {
      'token-set ratio': round3(setRatio),
      'token-sort ratio': round3(sortRatio),
      'jaro-winkler': round3(jw),
      'char 3-gram jaccard': round3(ng),
      'partial ratio': round3(pr)
    }
  };
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const round3 = (v) => Math.round(v * 1000) / 1000;

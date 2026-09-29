/**
 * Code Cosmos · Text Normalization Layer
 * ------------------------------------------------------------------
 * Stage 1 of the harmonization pipeline. Raw CPSE material
 * descriptions arrive with inconsistent case, punctuation, vendor
 * shorthand, filler words and brand noise. This module produces:
 *
 *   raw        -> the untouched source string
 *   text       -> the normalized, comparable description
 *   tokens     -> normalized token list used for embeddings
 *   segments   -> token-by-token diff used by the UI explainer
 *   brand      -> vendor name removed from the matching signal
 *   rules      -> ids of the rule families that fired
 */

export const ABBREVIATIONS = {
  brg: 'bearing', brgs: 'bearing', 'brg.': 'bearing',
  ss: 'stainless steel', sst: 'stainless steel', 's.s': 'stainless steel', 's.s.': 'stainless steel',
  ms: 'mild steel', 'm.s': 'mild steel',
  ci: 'cast iron', gi: 'galvanized iron', 'g.i': 'galvanized iron',
  dgb: 'deep groove', dgbb: 'deep groove ball bearing',
  dia: 'diameter', 'dia.': 'diameter', od: 'outer diameter', id: 'inner diameter',
  thk: 'thickness', ln: 'length', lg: 'length', l: 'length',
  hex: 'hexagonal', hd: 'head', hdg: 'hot dip galvanized',
  csk: 'countersunk', shcs: 'socket head cap screw', gr: 'grade', 'gr.': 'grade',
  sch: 'schedule', swg: 'swg', 'swg.': 'swg',
  nbr: 'nitrile rubber', epdm: 'epdm rubber', ptfe: 'ptfe', ca: 'carbon',
  mocr: 'material of construction', moc: 'material of construction',
  mfg: 'manufacturer', mfr: 'manufacturer', mfgr: 'manufacturer',
  qty: 'quantity', nos: '', 'nos.': '', no: '', 'no.': '',
  pc: 'piece', pcs: 'piece', set: 'set', assy: 'assembly', aay: 'assembly',
  uom: 'unit', kgs: 'kg', gms: 'g',
  cw: 'complete with', wo: 'without', w: 'with',
  rpm: 'rpm', kw: 'kw', hp: 'hp', kv: 'kv', vac: 'v', vacv: 'v',
  mocrr: 'material of construction',
  wr: 'water resistant', ip: 'ip',
  std: 'standard', spec: 'specification', 'specn': 'specification',
  dwg: 'drawing', drg: 'drawing', ref: 'reference',
  hdpe: 'hdpe', pvc: 'pvc', upvc: 'upvc', cpvc: 'cpvc',
  ss304: 'stainless steel 304', ss316: 'stainless steel 316', ss316l: 'stainless steel 316l',
  'ss-304': 'stainless steel 304', 'ss-316': 'stainless steel 316',
  en8: 'en8', 'en-8': 'en8', en19: 'en19', en24: 'en24',
  is: 'is', din: 'din', iso: 'iso', astm: 'astm', bs: 'bs', jis: 'jis',
  mm: 'mm', cm: 'cm', mtr: 'm', m: 'm', inch: 'inch', diaa: 'diameter',
  al: 'aluminium', alum: 'aluminium', alu: 'aluminium', br: 'brass',
  pu: 'polyurethane', pp: 'polypropylene', hdpe1: 'hdpe',
  ele: 'electrical', mech: 'mechanical', hyd: 'hydraulic', pneu: 'pneumatic',
  temp: 'temperature', pr: 'pressure', cf: 'centrifugal',
  v: 'v', amp: 'a', kgcm2: 'kg/cm2', kw2: 'kw'
};

/** Words that carry no material-identification meaning in a description. */
export const NOISE_WORDS = new Set([
  'as', 'per', 'of', 'the', 'a', 'an', 'for', 'to', 'and', 'or', 'with', 'without',
  'make', 'brand', 'manufacturer', 'mfg', 'item', 'items', 'spare', 'spares',
  'type', 'material', 'uom', 'unit', 'quantity', 'reference', 'specification',
  'standard', 'note', 'notes', 'total', 'approximate', 'approx', 'suitable',
  'equivalent', 'preferred', 'description', 'detail', 'details', 'supply', 'supplied',
  'inclusive', 'including', 'required', 'requirement', 'used', 'use', 'old', 'new',
  'general', 'misc', 'miscellaneous', 'assorted', 'sample', 'testing', 'test'
]);

/** Curated CPSE vendor vocabulary — neutralised before similarity scoring. */
export const BRANDS = [
  'skf', 'fag', 'nsk', 'ntn', 'timken', 'koyo', 'ina', 'zkl', 'nbc', 'arv',
  'kirloskar', 'crompton', 'crompton greaves', 'havells', 'finolex', 'polycab',
  'kei', 'rr kabel', 'rr', 'l&t', 'lnt', 'siemens', 'abb', 'schneider', 'legrand',
  'anchor', 'godrej', 'bhel', 'ksb', 'grundfos', 'wilo', 'flowserve', 'audco',
  'zoloto', 'leader', 'sant', 'hindustan', 'cambridge', 'supreme', 'astral',
  'prince', 'sintex', 'exide', 'amara raja', 'luminous', 'microtek', 'v-guard',
  'vguard', 'wipro', 'philips', 'bajaj', 'bch', 'c&s', 'hager', 'jindal', 'sail',
  'tata', 'essar', 'jsw', 'suraj', 'united', 'welspun', 'ratnamani', 'msp',
  'bmw', 'varuna', 'amtek', 'nirmal', 'shakti', 'precise', 'eppco', 'lubrizol',
  'castrol', 'servo', 'shell', 'mobil', 'bosch', 'makita', 'aspen', 'nelco',
  'orpat', 'texmo', 'crio', 'domestic'
];

const PHRASE_RULES = [
  [/\bmaterial of construction\b/g, 'material'],
  [/\bas per\b/g, ' '],
  [/\bbrand\s*[:\-]/g, ' '],
  [/\bmake\s*[:\-]/g, ' '],
  [/\bpart\s*(?:no|number|#)\s*[:\-]?\s*[a-z0-9\-\/\.]+/gi, ' '],
  [/\bdrawing\s*(?:no|number)\s*[:\-]?\s*[a-z0-9\-\/\.]+/gi, ' '],
  [/\bqty\s*[:\-]?\s*\d+/gi, ' '],
  [/\bnos?\.?\s*$/gi, ' '],
  [/\bcum\b/gi, 'with'],
  [/\bsuitable\s+for\b/gi, ' '],
  [/\bequivalent\s+to\b/gi, ' ']
];

const UNICODE_RULES = [
  [/[×✕⨯╳]/g, ' x '],
  [/[Øø⌀φΦ]/g, ' dia '],
  [/[’‘`´]/g, "'"],
  [/[“”]/g, '"'],
  [/[–—−]/g, '-'],
  [/[½]/g, ' 1/2 '],
  [/[¼]/g, ' 1/4 '],
  [/[¾]/g, ' 3/4 '],
  [/[³]/g, '3'],
  [/[²]/g, '2'],
  [/°/g, ' deg '],
  [/°/g, ' deg '],
  [/\s+/g, ' ']
];

function stripAccents(s) {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

/** Split into raw tokens while keeping meaningful inner punctuation (M10x50, 1/2", A2-70). */
export function rawTokens(input) {
  return String(input)
    .replace(/[(),;:\[\]{}<>|*_+~^`?!/\\]/g, ' ')
    .replace(/\.(?=\s|$)/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[-'"\.]+|[-'"\.]+$/g, ''))
    .filter(Boolean);
}

const CODE_TOKEN = /\b[A-Z]{2,5}-[A-Z0-9]{3,}(?:-[A-Z0-9]{2,})*\b/g;

/**
 * Noise-suppressed copy of a raw description. Keeps original numerals and
 * wording (so designation-style tokens survive) but removes vendor
 * sentences, part/drawing/item codes and inline quantity clauses that would
 * otherwise be mistaken for engineering data.
 */
export function cleanRaw(raw) {
  let s = stripAccents(String(raw));
  for (const [re, rep] of UNICODE_RULES) s = s.replace(re, rep);
  for (const [re, rep] of PHRASE_RULES) s = s.replace(re, rep);
  s = s.replace(/\brefer\s+(?:drg|drawing|doc|ref)\.?\s*[a-z0-9\-\/\.]+/gi, ' ');
  s = s.replace(/\b(?:item|old|new|material|ref(?:erence)?)\s*code\s*[:#]?\s*[a-z0-9\-\/\.]+/gi, ' ');
  s = s.replace(/\b(?:part|drg|drawing|ref)\s*(?:no|number|#)?\.?\s*[:#]?\s*[a-z0-9\-\/\.]+/gi, ' ');
  s = s.replace(/\b(?:make|brand|vendor)\s*[:#]\s*[a-z&\. ]{2,24}/gi, ' ');
  s = s.replace(CODE_TOKEN, ' ');
  s = s.replace(/\b(?:suitable|preferably|preferable|approved)\b[^,;.]{0,40}/gi, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** Pre-normalization pass: extract brand / part-number noise from the raw string. */
export function preScan(raw) {
  const lower = stripAccents(String(raw)).toLowerCase();
  let brand = null;
  const makeMatch = lower.match(/(?:make|brand|mfg|manufacturer|mfr)\s*[:\-]?\s*([a-z&\. ]{2,24})/);
  if (makeMatch) brand = makeMatch[1].trim().replace(/\s+/g, ' ');
  if (!brand) {
    for (const b of BRANDS) {
      const re = new RegExp(`(^|[^a-z])${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i');
      if (re.test(lower)) { brand = b; break; }
    }
  }
  const partMatch = String(raw).match(/(?:part|drg|drawing|ref)\s*(?:no|number|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/\.]{3,})/i);
  return { brand, partNo: partMatch ? partMatch[1] : null };
}

/**
 * Normalize one raw description.
 * @returns {{raw:string, text:string, tokens:string[], segments:object[], brand:string|null, partNo:string|null, rules:string[], droppedTokens:number}}
 */
export function normalize(raw, options = {}) {
  const keepBrand = Boolean(options.keepBrand);
  const scan = preScan(raw);
  let work = stripAccents(String(raw));
  const rules = new Set();

  for (const [re, rep] of UNICODE_RULES) {
    if (re.test(work)) { work = work.replace(re, rep); rules.add('unicode'); }
  }
  for (const [re, rep] of PHRASE_RULES) {
    if (re.test(work)) { work = work.replace(re, rep); rules.add('phrase'); }
  }

  let tokens = rawTokens(work.toLowerCase());
  const segments = [];
  const out = [];

  for (const token of tokens) {
    const original = token;
    if (/^\d+(\.\d+)?$/.test(token)) {
      segments.push({ kind: 'keep', src: original, out: token });
      out.push(token);
      continue;
    }
    // Split glued alpha-numeric spec forms: m10x50 -> m10 x 50
    let t = token;
    if (/^[a-z]+\d+(?:\.\d+)?(?:x|×)\d+/.test(t) && !ABBREVIATIONS[t]) {
      t = t.replace(/[×✕⨯]/g, 'x');
    }
    const expanded = ABBREVIATIONS[t];
    if (expanded !== undefined) {
      if (expanded === '') {
        rules.add('shorthand-drop');
        segments.push({ kind: 'removed', src: original, out: null, rule: 'shorthand' });
        continue;
      }
      if (expanded !== t) {
        rules.add('abbreviation');
        const parts = expanded.split(' ');
        parts.forEach((p, i) => segments.push({ kind: i === 0 ? 'replaced' : 'keep', src: i === 0 ? original : '', out: p, rule: 'abbreviation', from: i === 0 ? t : null }));
        parts.forEach((p) => out.push(p));
        continue;
      }
    }
    if (BRANDS.includes(t) && !keepBrand) {
      rules.add('brand-neutralized');
      segments.push({ kind: 'neutralized', src: original, out: null, rule: 'brand' });
      continue;
    }
    if (NOISE_WORDS.has(t)) {
      rules.add('noise-removed');
      segments.push({ kind: 'removed', src: original, out: null, rule: 'noise' });
      continue;
    }
    segments.push({ kind: 'keep', src: original, out: t });
    out.push(t);
  }

  // Merge trailing single letters left behind by "2 inch" style splits.
  const cleaned = out.filter((t) => t.length > 0);
  const text = cleaned.join(' ').replace(/\s+/g, ' ').trim();

  return {
    raw: String(raw),
    text,
    tokens: cleaned,
    segments,
    brand: scan.brand,
    partNo: scan.partNo,
    rules: [...rules],
    droppedTokens: tokens.length - cleaned.length
  };
}

/**
 * Canonicalise a spec phrase (material / grade / standard / type) so the
 * attribute layer compares meaning, not spelling.
 */
const CANON_MAP = {
  'stainless steel 316l': 'SS 316L',
  'stainless steel 316': 'SS 316',
  'stainless steel 304': 'SS 304',
  'stainless steel': 'SS',
  'mild steel': 'MS',
  'cast iron': 'CI',
  'ductile iron': 'DI',
  'galvanized iron': 'GI',
  'carbon steel': 'CS',
  'forged steel': 'Forged Steel',
  'alloy steel': 'Alloy Steel',
  'aluminium': 'Aluminium',
  'aluminum': 'Aluminium',
  'brass': 'Brass',
  'bronze': 'Bronze',
  'copper': 'Copper',
  'nitrile rubber': 'NBR',
  'epdm rubber': 'EPDM',
  'nitrile': 'NBR',
  'teflon': 'PTFE',
  'polyurethane': 'PU',
  'polypropylene': 'PP',
  'polyethylene': 'PE',
  'upvc': 'uPVC',
  'cpvc': 'CPVC'
};

export function canonicalizePhrase(phrase) {
  if (!phrase) return '';
  const p = stripAccents(String(phrase)).toLowerCase().replace(/\s+/g, ' ').trim();
  if (CANON_MAP[p]) return CANON_MAP[p];
  return p.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/** Equivalence classes for materials — used for graded, not binary, comparison. */
export const MATERIAL_GROUPS = {
  'SS 304': { group: 'stainless', rank: 2 },
  'SS 316': { group: 'stainless', rank: 3 },
  'SS 316L': { group: 'stainless', rank: 3 },
  SS: { group: 'stainless', rank: 1 },
  MS: { group: 'carbon', rank: 4 },
  CS: { group: 'carbon', rank: 4 },
  'Forged Steel': { group: 'carbon', rank: 4 },
  'Alloy Steel': { group: 'carbon', rank: 5 },
  CI: { group: 'iron', rank: 6 },
  DI: { group: 'iron', rank: 6 },
  GI: { group: 'iron', rank: 6 },
  Aluminium: { group: 'nonferrous', rank: 7 },
  Brass: { group: 'nonferrous', rank: 7 },
  Bronze: { group: 'nonferrous', rank: 7 },
  Copper: { group: 'nonferrous', rank: 7 },
  NBR: { group: 'elastomer', rank: 8 },
  EPDM: { group: 'elastomer', rank: 8 },
  PTFE: { group: 'polymer', rank: 9 },
  PU: { group: 'polymer', rank: 9 },
  PP: { group: 'polymer', rank: 9 },
  PE: { group: 'polymer', rank: 9 },
  uPVC: { group: 'polymer', rank: 9 },
  CPVC: { group: 'polymer', rank: 9 }
};

export function materialRelationship(a, b) {
  if (!a || !b) return 'unknown';
  if (a === b) return 'identical';
  const ga = MATERIAL_GROUPS[a]; const gb = MATERIAL_GROUPS[b];
  if (!ga || !gb) return 'unknown';
  if (ga.group === gb.group) return 'same-family';
  return 'different';
}

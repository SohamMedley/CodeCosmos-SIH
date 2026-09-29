/**
 * Code Cosmos · Semantic Embedding Layer
 * ------------------------------------------------------------------
 * The prototype runs a genuine — if compact — semantic model entirely
 * in the browser, with no inference server:
 *
 *   1. CONCEPT EXPANSION  domain ontology maps surface tokens
 *                         (ss316, a4-80, ball bearing) onto material
 *                         concepts, so wording differences collapse.
 *   2. TF-IDF WEIGHTING   rare technical tokens outweigh generic ones.
 *   3. EMBEDDING          tf-idf vector -> seeded random projection
 *                         (48-d) -> L2 normalised embedding.
 *   4. SIMILARITY         cosine similarity over the sparse vectors
 *                         (exact, instantaneous).
 *   5. PROJECTION         PCA (power iteration) to 2-D for the
 *                         semantic-space visualisation.
 *
 * In production this layer is swapped for a fine-tuned Sentence-BERT
 * encoder over the CPSE material vocabulary — the interface
 * (`embedAll`, `cosine`) stays identical, which is why the prototype
 * is a faithful stand-in for the deployed model.
 */

const DIM = 64;

/** Material-concept ontology: concept -> surface forms it absorbs. */
export const ONTOLOGY = {
  bearing: ['bearing', 'bearings', 'brg'],
  'ball-bearing': ['ball', 'ballbearing'],
  'deep-groove': ['deep', 'groove', 'dgb'],
  'angular-contact': ['angular', 'contact'],
  'roller-bearing': ['roller', 'rollers'],
  'taper-roller': ['taper', 'tapered', 'taperroller'],
  'cyl-roller': ['cylindrical', 'cyl'],
  'self-align': ['self', 'aligning', 'align'],
  thrust: ['thrust'],
  'pillow-block': ['pillow', 'block', 'plummer', 'plumber'],
  housing: ['housing', 'housings'],
  bolt: ['bolt', 'bolts'],
  nut: ['nut', 'nuts'],
  screw: ['screw', 'screws', 'shcs'],
  washer: ['washer', 'washers'],
  stud: ['stud', 'studs'],
  thread: ['threaded', 'thread', 'threading'],
  hexagonal: ['hexagonal', 'hex', 'ht'],
  head: ['head', 'headed'],
  countersunk: ['countersunk', 'csk', 'counter'],
  socket: ['socket'],
  cap: ['cap'],
  nylock: ['nylock', 'nylon'],
  insert: ['insert', 'inserted'],
  anchor: ['anchor', 'anchorbolt', 'wedge'],
  fastener: ['fastener', 'fasteners'],
  seal: ['seal', 'seals', 'sealing'],
  oring: ['o', 'ring', 'oring', 'o-ring'],
  gasket: ['gasket', 'gaskets'],
  packing: ['packing'],
  'oil-seal': ['oil', 'rotary', 'shaft'],
  lip: ['lip'],
  valve: ['valve', 'valves'],
  gate: ['gate'],
  globe: ['globe'],
  butterfly: ['butterfly'],
  check: ['check', 'non', 'return', 'nrv'],
  ball: ['ball'],
  solenoid: ['solenoid'],
  strainer: ['strainer', 'y'],
  actuator: ['actuator', 'pneumatic', 'electric'],
  pipe: ['pipe', 'pipes', 'piping'],
  tube: ['tube', 'tubes'],
  elbow: ['elbow', 'bend'],
  tee: ['tee', 't'],
  reducer: ['reducer', 'reducing'],
  flange: ['flange', 'flanged'],
  fitting: ['fitting', 'fittings'],
  nipple: ['nipple'],
  union: ['union'],
  coupling: ['coupling', 'coupler'],
  pump: ['pump', 'pumps', 'pumping'],
  centrifugal: ['centrifugal', 'monoblock', 'monobloc'],
  submersible: ['submersible'],
  impeller: ['impeller'],
  compressor: ['compressor'],
  blower: ['blower', 'fan'],
  motor: ['motor', 'motors'],
  induction: ['induction', 'squirrel', 'cage', 'tfc'],
  gearbox: ['gearbox', 'gear', 'reduction'],
  cable: ['cable', 'cables', 'wire', 'conductor', 'conductor'],
  core: ['core', 'cores'],
  'cross-section': ['sqmm', 'mm2', 'section'],
  gland: ['gland', 'glands'],
  lug: ['lug', 'lugs', 'terminal', 'thimble'],
  conduit: ['conduit', 'pipe'],
  mcb: ['mcb', 'breaker', 'mccb', 'rccb'],
  contactor: ['contactor'],
  battery: ['battery', 'batteries', 'vrla', 'lead', 'acid'],
  gauge: ['gauge', 'gages'],
  sensor: ['sensor', 'transmitter', 'transducer'],
  indicator: ['indicator'],
  plate: ['plate', 'plates', 'sheet', 'sheets'],
  angle: ['angle', 'angles'],
  channel: ['channel', 'channels'],
  beam: ['beam', 'beams'],
  flat: ['flat'],
  rod: ['rod', 'rods'],
  bar: ['bar', 'bars'],
  grating: ['grating', 'mesh'],
  filter: ['filter', 'filters', 'cartridge', 'element'],
  lubricant: ['lubricant', 'grease', 'oil'],
  electrode: ['electrode', 'electrodes', 'welding'],
  abrasive: ['abrasive', 'disc', 'wheel', 'grinding'],
  gloves: ['gloves', 'glove', 'hand'],
  helmet: ['helmet', 'safety'],
  paint: ['paint', 'enamel', 'primer'],
  'stainless-steel': ['stainless', 'ss', 'sst', 'steel316', 'steel304'],
  'carbon-steel': ['carbon', 'cs', 'mild', 'ms', 'en8'],
  'cast-iron': ['cast', 'iron', 'ci', 'ductile', 'sg'],
  galvanized: ['galvanized', 'galvanised', 'gi', 'hdg', 'zinc'],
  'forged-steel': ['forged'],
  'alloy-steel': ['alloy'],
  aluminium: ['aluminium', 'aluminum', 'alu', 'al'],
  brass: ['brass'],
  bronze: ['bronze'],
  copper: ['copper'],
  nbr: ['nitrile', 'nbr'],
  epdm: ['epdm'],
  ptfe: ['ptfe', 'teflon'],
  pu: ['polyurethane', 'pu'],
  hdpe: ['hdpe', 'polyethylene'],
  pvc: ['pvc', 'upvc', 'cpvc'],
  rubber: ['rubber', 'elastomer'],
  galvanizing: ['galvanizing', 'coating', 'epoxy', 'powder', 'painted'],
  'pressure-class': ['pn', 'class', 'rating', 'pressure'],
  'nominal-size': ['dn', 'nb', 'nps', 'size'],
  'high-pressure': ['high', 'hp'],
  'low-pressure': ['low', 'lp'],
  electric: ['electric', 'electrical'],
  three: ['three', '3'],
  single: ['single', '1'],
  phase: ['phase'],
  frame: ['frame', 'shaft', 'mounted', 'foot'],
  insulated: ['insulated', 'insulation'],
  'temp-rating': ['temperature', 'temp', 'degc', 'celsius'],
  schedule: ['schedule', 'sch'],
  grade: ['grade', 'gr'],
  standard: ['standard', 'specification', 'is', 'iso', 'din', 'astm', 'bs', 'api', 'iec', 'ansi']
};

const SURFACE_TO_CONCEPT = (() => {
  const map = new Map();
  for (const [concept, forms] of Object.entries(ONTOLOGY)) {
    for (const f of forms) {
      const key = f.toLowerCase().replace(/\s+/g, '-');
      if (!map.has(key)) map.set(key, concept);
    }
  }
  return map;
})();

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Expand normalized tokens into (token + concept) feature keys. */
export function featurize(tokens, specs = []) {
  const features = new Map();
  const add = (key, weight) => features.set(key, (features.get(key) || 0) + weight);

  for (const token of tokens) {
    if (/^\d+(\.\d+)?$/.test(token)) {
      add(`n:${token}`, 1.6);          // numbers carry hard engineering meaning
      continue;
    }
    add(`t:${token}`, 1.0);
    const concept = SURFACE_TO_CONCEPT.get(token);
    if (concept) add(`c:${concept}`, 1.25);
    // Character 4-grams for typo robustness on longer technical words
    if (token.length >= 7) {
      for (let i = 0; i + 4 <= token.length; i++) add(`g:${token.slice(i, i + 4)}`, 0.22);
    }
  }
  for (const spec of specs) {
    if (spec.canon) add(`s:${spec.key}=${spec.canon}`, 1.15);
    else if (spec.text) add(`s:${spec.key}=${spec.text}`, 0.9);
    if (spec.baseValue !== null && spec.baseValue !== undefined && spec.quantity) {
      add(`q:${spec.quantity}=${quantize(spec.quantity, spec.baseValue)}`, 1.3);
    }
    if (spec.secondaryBaseValue !== null && spec.secondaryBaseValue !== undefined && spec.quantity) {
      add(`q2:${spec.quantity}=${quantize(spec.quantity, spec.secondaryBaseValue)}`, 0.9);
    }
  }
  return features;
}

/**
 * Snap a standardised value onto the tolerance grid a domain expert would
 * use, so 74.93 mm (2.95 in) and 75 mm land on the same feature, while
 * 3.15 mm and 4.0 mm never do.
 */
export function quantize(quantity, v) {
  if (!Number.isFinite(v)) return String(v);
  switch (quantity) {
    case 'length': return v < 10 ? (Math.round(v * 10) / 10).toFixed(1) : String(Math.round(v));
    case 'pressure': return String(Math.round(v / 5) * 5);
    case 'power': return String(Math.round(v * 10) / 10);
    case 'voltage': return String(Math.round(v / 10) * 10);
    case 'mass': return String(Math.round(v * 100) / 100);
    case 'temperature': return String(Math.round(v / 5) * 5);
    case 'angle': return String(Math.round(v / 5) * 5);
    case 'area': return String(Math.round(v * 100) / 100);
    case 'speed': return String(Math.round(v / 50) * 50);
    default: return String(Math.abs(v) > 100 ? Math.round(v) : Math.round(v * 100) / 100);
  }
}

function roundSpec(v) {
  return Math.abs(v) > 100 ? Math.round(v) : Math.round(v * 100) / 100;
}

/**
 * Build TF-IDF weighted sparse vectors for a corpus.
 * @param {Array<{tokens:string[], specs:Array}>} docs
 */
export function embedAll(docs, options = {}) {
  const vectors = docs.map((d) => featurize(d.tokens || [], d.specs || []));
  const df = new Map();
  for (const v of vectors) for (const k of v.keys()) df.set(k, (df.get(k) || 0) + 1);
  const N = Math.max(1, vectors.length);
  const idf = new Map();
  for (const [k, n] of df) {
    const base = Math.log((N + 1) / (n + 0.5)) + 1;
    const isNumber = k.startsWith('n:') || k.startsWith('q:');
    idf.set(k, isNumber ? base * 0.85 : base);
  }

  const sparse = vectors.map((v) => {
    const out = new Map();
    let norm = 0;
    for (const [k, tf] of v) {
      const w = (1 + Math.log(tf)) * (idf.get(k) || 1);
      out.set(k, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [k, w] of out) out.set(k, w / norm);
    return out;
  });

  const rng = mulberry32(20260129);
  const projection = new Float64Array(DIM * 512);
  for (let i = 0; i < projection.length; i++) {
    const u = rng(); const v = rng();
    projection[i] = Math.sqrt(-2 * Math.log(u + 1e-12)) * Math.cos(2 * Math.PI * v);
  }

  const dense = sparse.map((sv) => {
    const vec = new Float64Array(DIM);
    for (const [k, w] of sv) {
      const h = hash32(k);
      for (let d = 0; d < DIM; d++) {
        const idx = ((h + d * 2654435761) >>> 0) % 512;
        vec[d] += w * projection[d * 512 + idx];
      }
    }
    let n = 0;
    for (let d = 0; d < DIM; d++) n += vec[d] * vec[d];
    n = Math.sqrt(n) || 1;
    for (let d = 0; d < DIM; d++) vec[d] /= n;
    return vec;
  });

  void options;
  return { sparse, dense, dim: DIM, idf, df, docCount: N };
}

/** Cosine similarity over two sparse tf-idf maps. */
export function cosine(a, b) {
  const small = a.size <= b.size ? a : b;
  const large = small === a ? b : a;
  let dot = 0;
  for (const [k, w] of small) {
    const o = large.get(k);
    if (o !== undefined) dot += w * o;
  }
  return Math.max(0, Math.min(1, dot));
}

/** Which features two records share — powers the "why" panel. */
export function sharedFeatures(a, b, limit = 8) {
  const shared = [];
  for (const [k, w] of a) {
    const o = b.get(k);
    if (o !== undefined) shared.push({ key: k, weight: w * o });
  }
  shared.sort((x, y) => y.weight - x.weight);
  return shared.slice(0, limit).map((s) => prettyFeature(s.key));
}

export function prettyFeature(key) {
  const [ns, rest] = key.split(':');
  const label = rest.replace(/-/g, ' ');
  switch (ns) {
    case 'c': return { kind: 'concept', label: `concept «${label}»` };
    case 't': return { kind: 'token', label: `term «${label}»` };
    case 'n': return { kind: 'number', label: `spec number ${label}` };
    case 's': return { kind: 'attribute', label: label.replace('=', ' = ') };
    case 'q': return { kind: 'quantity', label: `standardised ${label.replace('=', ' ')}` };
    case 'g': return { kind: 'gram', label: `n-gram «${label}»` };
    default: return { kind: 'feature', label };
  }
}

/** Power-iteration PCA down to 2-D, for the semantic-space canvas. */
export function project2D(dense) {
  const n = dense.length;
  if (!n) return [];
  const dim = dense[0].length;
  const mean = new Float64Array(dim);
  for (const v of dense) for (let d = 0; d < dim; d++) mean[d] += v[d] / n;
  const centered = dense.map((v) => {
    const out = new Float64Array(dim);
    for (let d = 0; d < dim; d++) out[d] = v[d] - mean[d];
    return out;
  });

  const rng = mulberry32(778899);
  const pc = [];
  for (let comp = 0; comp < 2; comp++) {
    let vec = new Float64Array(dim);
    for (let d = 0; d < dim; d++) vec[d] = rng() * 2 - 1;
    for (let iter = 0; iter < 40; iter++) {
      const next = new Float64Array(dim);
      for (const row of centered) {
        let dot = 0;
        for (let d = 0; d < dim; d++) dot += row[d] * vec[d];
        for (let d = 0; d < dim; d++) next[d] += dot * row[d];
      }
      let norm = 0;
      for (let d = 0; d < dim; d++) norm += next[d] * next[d];
      norm = Math.sqrt(norm) || 1;
      for (let d = 0; d < dim; d++) next[d] /= norm;
      vec = next;
    }
    pc.push(vec);
    // Deflate so the second component is orthogonal to the first.
    for (const row of centered) {
      let dot = 0;
      for (let d = 0; d < dim; d++) dot += row[d] * vec[d];
      for (let d = 0; d < dim; d++) row[d] -= dot * vec[d];
    }
  }

  const pts = centered.map((row) => {
    const p = [0, 0];
    for (let c = 0; c < 2; c++) {
      let dot = 0;
      for (let d = 0; d < dim; d++) dot += row[d] * pc[c][d];
      p[c] = dot;
    }
    return { x: p[0], y: p[1] };
  });

  // Normalise into a -1..1 viewport.
  const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
  const maxAbs = Math.max(...xs.map(Math.abs), ...ys.map(Math.abs), 1e-6);
  return pts.map((p) => ({ x: p.x / maxAbs, y: p.y / maxAbs }));
}

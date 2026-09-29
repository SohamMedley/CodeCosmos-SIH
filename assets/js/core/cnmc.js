/**
 * Code Cosmos · CNMC Harmonization Layer
 * ------------------------------------------------------------------
 * The end of the pipeline is not "these two rows are duplicates" but
 * "this material belongs to this CNMC class, and here is the standard
 * master description and code it should map to".
 *
 * Codes are generated deterministically from the validated attribute
 * set, so the same engineering intent always yields the same code —
 * that property is what makes the knowledge base reusable.
 */

import { buildStandardDescription } from './attributes.js';

/** CNMC-style class registry (illustrative mapping for the prototype). */
export const CNMC_CLASSES = [
  { code: '30-01', label: 'Bearings, Gears & Transmission Elements', family: 'bearings' },
  { code: '30-02', label: 'Fasteners, Bolts, Nuts & Washers', family: 'fasteners' },
  { code: '30-03', label: 'Seals, Gaskets, O-Rings & Packing', family: 'seals' },
  { code: '30-04', label: 'Pipes, Tubes, Fittings & Flanges', family: 'pipes' },
  { code: '30-05', label: 'Valves, Cocks & Actuators', family: 'valves' },
  { code: '30-06', label: 'Pumps, Compressors & Blowers', family: 'pumps' },
  { code: '30-07', label: 'Structural Steel & Raw Material', family: 'structurals' },
  { code: '30-08', label: 'Filters, Strainers & Lubricants', family: 'filters' },
  { code: '31-01', label: 'Electric Motors, Drives & Gearboxes', family: 'motors' },
  { code: '31-02', label: 'Cables, Wires, Lugs & Wiring Accessories', family: 'electricals' },
  { code: '31-04', label: 'Measuring Instruments & Control Devices', family: 'instruments' },
  { code: '32-01', label: 'Consumables, Welding & Safety Items', family: 'consumables' },
  { code: '99-99', label: 'Unclassified — requires expert taxonomy mapping', family: 'unclassified' }
];

const TYPE_CODES = {
  'BALL BEARING, DEEP GROOVE': '101', 'BALL BEARING, ANGULAR CONTACT': '102',
  'BALL BEARING, SELF ALIGNING': '103', 'ROLLER BEARING, CYLINDRICAL': '111',
  'ROLLER BEARING, TAPERED': '112', 'ROLLER BEARING, SPHERICAL': '113',
  'BEARING, THRUST': '121', 'PILLOW BLOCK BEARING HOUSING': '131',
  'BOLT, HEXAGONAL HEAD': '201', 'SCREW, SOCKET HEAD CAP': '202',
  'NUT, HEXAGONAL': '203', 'NUT, NYLON INSERT LOCK': '204',
  'WASHER, PLAIN': '205', 'WASHER, SPRING': '206', 'STUD, THREADED': '207',
  'ANCHOR BOLT': '208', 'O-RING': '301', 'OIL SEAL, ROTARY SHAFT': '302',
  'GASKET': '303', 'VALVE, GATE': '401', 'VALVE, GLOBE': '402',
  'VALVE, BALL': '403', 'VALVE, BUTTERFLY': '404', 'VALVE, CHECK': '405',
  'VALVE, SOLENOID': '406', 'STRAINER, Y-TYPE': '408',
  'PUMP, CENTRIFUGAL': '501', 'PUMP, SUBMERSIBLE': '502', 'COMPRESSOR, AIR': '511',
  'MOTOR, INDUCTION': '601', 'ELBOW, PIPE FITTING': '701', 'TEE, PIPE FITTING': '702',
  'REDUCER, PIPE FITTING': '703', 'FLANGE': '704', 'NIPPLE, PIPE': '705',
  'UNION, PIPE FITTING': '706', 'PIPE': '711', 'ANGLE SECTION': '801',
  'CHANNEL SECTION': '802', 'BEAM SECTION': '803', 'PLATE': '804',
  'PLATE, CHEQUERED': '805', 'CABLE': '901', 'CABLE GLAND': '911',
  'TERMINAL LUG': '912', 'PRESSURE GAUGE': '921', 'FILTER ELEMENT': '841',
  'GREASE, LITHIUM BASE': '851', 'WELDING ELECTRODE': '861', 'HAND GLOVES': '862',
  'V-BELT': '132', 'COUPLING, FLEXIBLE': '133', 'WIRE ROPE, STEEL': '134'
};

export function classFor(family) {
  return CNMC_CLASSES.find((c) => c.family === family) || CNMC_CLASSES[CNMC_CLASSES.length - 1];
}

function sizeSegment(record) {
  const s = record.specMap;
  const pick = ['nominalSize', 'thread', 'bore', 'oringSection', 'crossSection', 'size', 'power', 'capacity']
    .map((k) => s.get(k)).find((x) => x && x.baseValue !== null);
  if (!pick) return '00';
  const v = Math.round(pick.baseValue);
  return String(Math.abs(v) % 1000).padStart(3, '0');
}

function materialSegment(record) {
  const m = record.specMap.get('material');
  if (!m) return 'XX';
  const canon = m.canon || m.text;
  const map = { 'SS 304': 'S4', 'SS 316': 'S6', 'SS 316L': 'SL', SS: 'SS', MS: 'MS', CS: 'CS', CI: 'CI', DI: 'DI', GI: 'GI', Aluminium: 'AL', Brass: 'BR', Bronze: 'BZ', Copper: 'CU', NBR: 'NB', EPDM: 'EP', PTFE: 'PT', PU: 'PU', PP: 'PP', PE: 'PE', uPVC: 'UP', CPVC: 'CP' };
  return map[canon] || canon.replace(/[^A-Z]/g, '').slice(0, 2).padEnd(2, 'X');
}

function variantDigit(record) {
  const parts = [];
  for (const key of ['sealType', 'grade', 'pressureClass', 'finish', 'ends', 'standard']) {
    const s = record.specMap.get(key);
    if (s) parts.push(`${key}${s.text}`);
  }
  let h = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 997;
  return String(h % 90 + 10);
}

/**
 * Recommend a CNMC code + standardised master description for a record.
 * @param {object} record enriched record
 * @param {object} [opts] { confidence, masterRecord, autoCode }
 */
export function recommend(record, opts = {}) {
  const cls = classFor(record.family ? record.family.id : 'unclassified');
  const typeCode = TYPE_CODES[record.type] || '900';
  const suffix = variantDigit(record);
  const size = sizeSegment(record);
  const mat = materialSegment(record);
  const code = `CNMC ${cls.code}-${typeCode}-${mat}${size}-${suffix}`;

  const attributes = (record.specs || []).map((s) => ({
    label: s.label,
    value: s.text,
    standardised: s.baseValue !== null && s.baseUnit ? `${round(s.baseValue)} ${s.baseUnit}` : null,
    group: s.group,
    critical: s.critical
  }));

  const missingCritical = [];
  for (const key of ['material', 'grade']) {
    if (!record.specMap || !record.specMap.get(key)) missingCritical.push(key === 'material' ? 'Material' : 'Grade');
  }
  if (!sizeSegment(record) || sizeSegment(record) === '00') missingCritical.push('Nominal size');

  return {
    code,
    classCode: cls.code,
    classLabel: cls.label,
    family: record.family ? record.family.label : 'Unclassified',
    typeCode,
    type: record.type,
    standardDescription: buildStandardDescription(record),
    attributes,
    unit: guessUnit(record),
    keywords: (record.normalized.tokens || []).slice(0, 10),
    completeness: completeness(record),
    missingCritical,
    confidence: opts.confidence !== undefined ? opts.confidence : null,
    autoAccepted: Boolean(opts.autoCode),
    masterRecord: opts.masterRecord || null,
    reasoning: [
      `Family classified as ${record.family ? record.family.label : 'Unclassified'} (CNMC class ${cls.code})`,
      `Engineering type resolved to ${record.type} (type code ${typeCode})`,
      `Material segment derived from ${record.specMap.get('material') ? record.specMap.get('material').canon || record.specMap.get('material').text : 'unspecified material'}`,
      `Size segment from standardised ${sizeSegment(record)} base-unit value`,
      `Variant digit from ${['sealType', 'grade', 'pressureClass', 'finish', 'ends', 'standard'].filter((k) => record.specMap.get(k)).join(', ') || 'no variant attributes'}`
    ]
  };
}

function round(v) {
  return Math.abs(v - Math.round(v)) < 0.005 ? Math.round(v) : Number(v.toFixed(2));
}

function guessUnit(record) {
  const fam = record.family ? record.family.id : '';
  const map = {
    bearings: 'NOS', fasteners: 'NOS', seals: 'NOS', valves: 'NOS',
    pumps: 'NOS', motors: 'NOS', electricals: 'MTR', instruments: 'NOS',
    structurals: 'KG', pipes: 'MTR', filters: 'NOS', consumables: 'NOS'
  };
  return map[fam] || 'NOS';
}

function completeness(record) {
  const required = ['material', 'grade', 'nominalSize', 'thread', 'bore', 'od', 'standard', 'pressureClass', 'power'];
  const present = required.filter((k) => record.specMap && record.specMap.get(k)).length;
  const density = (record.specs || []).length;
  return Math.min(1, present / 4 * 0.6 + Math.min(1, density / 8) * 0.4);
}

/** Group-level harmonization summary: one CNMC code per validated cluster. */
export function harmonizeCluster(cluster, records) {
  const members = records.filter((r) => cluster.memberIds.includes(r.id));
  const master = members.reduce((best, r) => (completeness(r) > completeness(best) ? r : best), members[0]);
  const rec = recommend(master, { autoCode: true });
  return {
    code: rec.code,
    classLabel: rec.classLabel,
    standardDescription: rec.standardDescription,
    unit: rec.unit,
    masterRecord: master,
    members,
    family: master.family,
    completeness: completeness(master)
  };
}

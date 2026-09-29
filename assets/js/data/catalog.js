/**
 * Code Cosmos · Material Knowledge Base (Synthetic CPSE Master Extract)
 * ------------------------------------------------------------------
 * The prototype ships with an offline, reproducible corpus of CPSE
 * material descriptions. Each row carries a hidden `conceptId`, i.e.
 * the engineering item it truly represents. Because ground truth is
 * known, the Benchmark tab can report *real* precision / recall / F1
 * for the matcher instead of a claim.
 *
 * Descriptions are generated from engineering concepts through the
 * same noise transforms seen in real extracts: case variants, word
 * order, vendor prefixes, unit mixtures (mm / cm / inch), shorthand,
 * filler clauses, part numbers and typos.
 */

const CPSES = [
  { name: 'BHEL', unit: 'Bhopal', code: 'BH' },
  { name: 'SAIL', unit: 'Bhilai', code: 'SL' },
  { name: 'NTPC', unit: 'Korba', code: 'NT' },
  { name: 'ONGC', unit: 'Mumbai', code: 'ON' },
  { name: 'GAIL', unit: 'Vijaipur', code: 'GA' },
  { name: 'IOCL', unit: 'Panipat', code: 'IO' },
  { name: 'HPCL', unit: 'Visakh', code: 'HP' },
  { name: 'BPCL', unit: 'Kochi', code: 'BP' },
  { name: 'BEL', unit: 'Bengaluru', code: 'BE' },
  { name: 'HAL', unit: 'Nashik', code: 'HA' },
  { name: 'CIL', unit: 'Dhanbad', code: 'CI' },
  { name: 'NPCIL', unit: 'Tarapur', code: 'NP' },
  { name: 'MDL', unit: 'Mumbai', code: 'MD' },
  { name: 'BEML', unit: 'KGF', code: 'BM' },
  { name: 'GRSE', unit: 'Kolkata', code: 'GR' },
  { name: 'NLCIL', unit: 'Neyveli', code: 'NL' }
];

/** Materials written exactly as they appear in the SIH problem statement. */
export const SHOWCASES = [
  { concept: 'BRG-6205', raw: 'Bearing 6205', cpse: 'BHEL' },
  { concept: 'BRG-6205', raw: '6205 Deep Groove Ball Bearing', cpse: 'SAIL' },
  { concept: 'BRG-6205', raw: 'BALL BEARING, 6205', cpse: 'NTPC' },
  { concept: 'BRG-6205', raw: 'SKF 6205 BEARING', cpse: 'ONGC' },
  { concept: 'BRG-6205', raw: 'BRG. DEEP GROOVE BALL 6205 ZZ (MAKE : SKF / FAG) - NOS', cpse: 'GAIL' },
  { concept: 'FAST-M10-50', raw: 'SS Bolt M10 x 50 mm Grade 8.8', cpse: 'IOCL' },
  { concept: 'FAST-M10-50', raw: 'HEX HEAD BOLT, M10X50, 5 CM LONG, S.S. 304, GR. 8.8', cpse: 'HPCL' },
  { concept: 'VALV-DN50', raw: 'Gate Valve DN50 PN16 Flanged Cast Iron', cpse: 'BPCL' },
  { concept: 'VALV-DN50', raw: '2 INCH GATE VALVE, CI BODY, FLANGED, PN 16, AS PER IS 14846', cpse: 'CIL' }
];

/**
 * Engineering concepts. `canonical` is the fully populated master
 * description; variants are derived from it. Distractors differ by a
 * single decisive specification and must NOT be merged.
 */
export const CONCEPTS = [
  { id: 'BRG-6205', canonical: 'Deep Groove Ball Bearing 6205 ZZ, 25 mm bore x 52 mm OD x 15 mm width, steel cage', family: 'bearings' },
  { id: 'BRG-6206', canonical: 'Deep Groove Ball Bearing 6206 ZZ, 30 mm bore x 62 mm OD x 16 mm width, steel cage', family: 'bearings', distractorOf: 'BRG-6205' },
  { id: 'BRG-6207', canonical: 'Deep Groove Ball Bearing 6207 2RS, 35 mm bore x 72 mm OD x 17 mm width', family: 'bearings' },
  { id: 'BRG-6308', canonical: 'Deep Groove Ball Bearing 6308 C3, 40 mm bore x 90 mm OD x 23 mm width', family: 'bearings' },
  { id: 'BRG-NU310', canonical: 'Cylindrical Roller Bearing NU310, 50 mm bore x 110 mm OD x 27 mm width', family: 'bearings', distractorOf: 'BRG-6207' },
  { id: 'BRG-22215', canonical: 'Spherical Roller Bearing 22215 K, 75 mm bore x 130 mm OD x 31 mm width', family: 'bearings' },
  { id: 'BRG-PB-UCP210', canonical: 'Pillow Block Bearing UCP 210, 50 mm shaft, cast iron housing', family: 'bearings' },
  { id: 'BRG-30210', canonical: 'Tapered Roller Bearing 30210, 50 mm bore x 90 mm OD x 21.75 mm width', family: 'bearings' },
  { id: 'BRG-THR51210', canonical: 'Thrust Ball Bearing 51210, 50 mm bore x 78 mm OD x 22 mm width', family: 'bearings', distractorOf: 'BRG-30210' },

  { id: 'FAST-M10-50', canonical: 'Hexagonal Head Bolt M10 x 50 mm, Stainless Steel 304, Grade 8.8, Zinc Plated, IS 1367', family: 'fasteners' },
  { id: 'FAST-M12-60', canonical: 'Hexagonal Head Bolt M12 x 60 mm, Stainless Steel 304, Grade 8.8, IS 1367', family: 'fasteners', distractorOf: 'FAST-M10-50' },
  { id: 'FAST-M16-80', canonical: 'Hexagonal Head Bolt M16 x 80 mm, Mild Steel, Grade 10.9, Hot Dip Galvanized', family: 'fasteners' },
  { id: 'FAST-SHCS-M8', canonical: 'Socket Head Cap Screw M8 x 25 mm, Alloy Steel, Grade 12.9, Black Oxide', family: 'fasteners' },
  { id: 'FAST-NUT-M10', canonical: 'Hexagonal Nut M10, Stainless Steel 304, Grade 8, IS 1363', family: 'fasteners' },
  { id: 'FAST-NYLOCK-M12', canonical: 'Nylon Insert Lock Nut M12, Stainless Steel 316, DIN 985', family: 'fasteners', distractorOf: 'FAST-NUT-M10' },
  { id: 'FAST-WSH-M10', canonical: 'Plain Washer M10, Stainless Steel 304, IS 2016', family: 'fasteners' },
  { id: 'FAST-SPR-WSH-M10', canonical: 'Spring Washer M10, Spring Steel, Zinc Plated, IS 3063', family: 'fasteners', distractorOf: 'FAST-WSH-M10' },
  { id: 'FAST-STUD-M20', canonical: 'Threaded Stud M20 x 150 mm, Alloy Steel, Grade B7, ASME B16.5', family: 'fasteners' },
  { id: 'FAST-ANCH-M16', canonical: 'Anchor Bolt M16 x 200 mm, Mild Steel, Wedge Type, GI', family: 'fasteners' },

  { id: 'SEAL-OR-70X3', canonical: 'O-Ring 70 mm ID x 3 mm thick, Nitrile Rubber (NBR), 70 Shore A', family: 'seals' },
  { id: 'SEAL-OR-70X4', canonical: 'O-Ring 70 mm ID x 4 mm thick, Nitrile Rubber (NBR), 70 Shore A', family: 'seals', distractorOf: 'SEAL-OR-70X3' },
  { id: 'SEAL-OIL-35X62', canonical: 'Oil Seal 35 x 62 x 10 mm, Rotary Shaft Seal, Nitrile Rubber', family: 'seals' },
  { id: 'SEAL-GKT-3MM', canonical: 'CAF Jointing Gasket Sheet 3 mm thick, 1.5 m x 1.5 m, IS 2712', family: 'seals' },
  { id: 'SEAL-PACK-12', canonical: 'PTFE Packing Rope 12 mm square, gland packing, braided', family: 'seals' },

  { id: 'PIPE-ELB-50', canonical: 'Pipe Elbow 50 mm NB, 90 degree, Screwed, Galvanized Iron, IS 1239', family: 'pipes' },
  { id: 'PIPE-ELB-50-45', canonical: 'Pipe Elbow 50 mm NB, 45 degree, Screwed, Galvanized Iron, IS 1239', family: 'pipes', distractorOf: 'PIPE-ELB-50' },
  { id: 'PIPE-TEE-25', canonical: 'Pipe Tee 25 mm NB, Equal, Screwed, Galvanized Iron, IS 1239', family: 'pipes' },
  { id: 'PIPE-FLG-80', canonical: 'Flange 80 mm NB, Slip On, PN16, WNRF, ASTM A105, ASME B16.5', family: 'pipes' },
  { id: 'PIPE-NIP-15', canonical: 'Pipe Nipple 15 mm NB x 100 mm long, Hexagonal, Galvanized Iron', family: 'pipes' },
  { id: 'PIPE-CS-100', canonical: 'MS Seamless Pipe 100 mm NB, Schedule 40, IS 1239 Part 1', family: 'pipes' },
  { id: 'PIPE-RED-50X25', canonical: 'Pipe Reducer 50 mm NB x 25 mm NB, Concentric, Screwed, GI', family: 'pipes' },

  { id: 'VALV-DN50', canonical: 'Gate Valve DN50 PN16, Cast Iron Body, Flanged Ends, IS 14846', family: 'valves' },
  { id: 'VALV-DN80', canonical: 'Gate Valve DN80 PN16, Cast Iron Body, Flanged Ends, IS 14846', family: 'valves', distractorOf: 'VALV-DN50' },
  { id: 'VALV-BALL-25', canonical: 'Ball Valve 25 mm, Stainless Steel 316 Body, Screwed Ends, 1000 PSI', family: 'valves' },
  { id: 'VALV-GLB-40', canonical: 'Globe Valve 40 mm NB, Bronze Body, Screwed Ends, PN16', family: 'valves', distractorOf: 'VALV-BALL-25' },
  { id: 'VALV-BFLY-150', canonical: 'Butterfly Valve 150 mm, Wafer Type, Ductile Iron Body, EPDM Seat, PN16', family: 'valves' },
  { id: 'VALV-NRV-50', canonical: 'Check Valve 50 mm NB, Dual Plate, Stainless Steel, Wafer Type, PN16', family: 'valves' },
  { id: 'VALV-SOL-15', canonical: 'Solenoid Valve 15 mm, 2/2 Way, Brass Body, 230 V AC, NBR Seat', family: 'valves' },
  { id: 'VALV-STR-25', canonical: 'Y-Type Strainer 25 mm NB, Stainless Steel 316 Mesh, Screwed, PN16', family: 'valves' },

  { id: 'PUMP-CF-10', canonical: 'Centrifugal Monoblock Pump 10 HP, 3 Phase, 415 V, 1500 RPM, 30 m head', family: 'pumps' },
  { id: 'PUMP-CF-5', canonical: 'Centrifugal Monoblock Pump 5 HP, 3 Phase, 415 V, 2900 RPM, 20 m head', family: 'pumps', distractorOf: 'PUMP-CF-10' },
  { id: 'PUMP-SUB-2', canonical: 'Submersible Pump 2 HP, 1 Phase, 230 V, 20 m head, 200 LPM', family: 'pumps' },
  { id: 'PUMP-DOSE-1', canonical: 'Dosing Pump 0.5 HP, 10 LPH, PTFE Head, 7 bar', family: 'pumps' },
  { id: 'COMP-AIR-50', canonical: 'Reciprocating Air Compressor 50 HP, 10 bar, 250 CFM, 3 Phase', family: 'pumps' },

  { id: 'MOT-IE3-5', canonical: 'Induction Motor 5 HP, 1440 RPM, 3 Phase, 415 V, IE3, TEFC, Frame 100L', family: 'motors' },
  { id: 'MOT-IE2-5', canonical: 'Induction Motor 5 HP, 1440 RPM, 3 Phase, 415 V, IE2, TEFC, Frame 100L', family: 'motors', distractorOf: 'MOT-IE3-5' },
  { id: 'MOT-IE3-15', canonical: 'Induction Motor 15 HP, 1440 RPM, 3 Phase, 415 V, IE3, TEFC, Frame 132S', family: 'motors', distractorOf: 'MOT-IE3-5' },
  { id: 'GBX-HEL-20', canonical: 'Helical Gearbox 20:1, 5 HP input, Foot Mounted, Cast Iron Housing', family: 'motors' },
  { id: 'GBX-HEL-10', canonical: 'Helical Gearbox 10:1, 5 HP input, Foot Mounted, Cast Iron Housing', family: 'motors', distractorOf: 'GBX-HEL-20' },

  { id: 'CBL-3C-25', canonical: 'XLPE Armoured Cable 3 Core x 2.5 sq mm, 1.1 kV, Copper Conductor, IS 7098', family: 'electricals' },
  { id: 'CBL-3C-40', canonical: 'XLPE Armoured Cable 3 Core x 4.0 sq mm, 1.1 kV, Copper Conductor, IS 7098', family: 'electricals', distractorOf: 'CBL-3C-25' },
  { id: 'CBL-4C-60', canonical: 'XLPE Armoured Cable 4 Core x 6.0 sq mm, 1.1 kV, Aluminium Conductor, IS 7098', family: 'electricals' },
  { id: 'CBL-GLD-25', canonical: 'Double Compression Cable Gland 25 mm, Brass, IP66, Nickel Plated', family: 'electricals' },
  { id: 'CBL-LUG-25', canonical: 'Copper Tubular Terminal Lug 2.5 sq mm, Insulated, Crimp Type', family: 'electricals' },
  { id: 'ELE-MCB-32', canonical: 'MCB 32 A, Single Pole, 240 V, C Curve, 10 kA, ISI Marked', family: 'electricals' },
  { id: 'ELE-BATT-100', canonical: 'VRLA Battery 12 V, 100 Ah, SMF, Lead Acid', family: 'electricals' },

  { id: 'INS-PG-100', canonical: 'Pressure Gauge 100 mm dial, 0-16 kg/cm2, Glycerine Filled, 1/2 inch BSP bottom entry', family: 'instruments' },
  { id: 'INS-PG-63', canonical: 'Pressure Gauge 63 mm dial, 0-10 kg/cm2, Dry, 1/4 inch BSP bottom entry', family: 'instruments', distractorOf: 'INS-PG-100' },
  { id: 'INS-RTD-PT100', canonical: 'RTD Sensor PT100, 3 wire, 6 mm dia x 300 mm long, SS 316 sheath', family: 'instruments' },

  { id: 'STR-ANGL-50X50', canonical: 'MS Angle 50 x 50 x 6 mm, IS 2062 E250', family: 'structurals' },
  { id: 'STR-ANGL-50X50-8', canonical: 'MS Angle 50 x 50 x 8 mm, IS 2062 E250', family: 'structurals', distractorOf: 'STR-ANGL-50X50' },
  { id: 'STR-CHAN-100', canonical: 'MS Channel 100 x 50 mm, IS 2062 E250 A', family: 'structurals' },
  { id: 'STR-PLATE-6', canonical: 'MS Plate 6 mm thick, 1250 x 2500 mm, IS 2062 E250 BR', family: 'structurals' },
  { id: 'STR-CHEQ-5', canonical: 'MS Chequered Plate 5 mm thick, 1250 x 2500 mm, IS 3502', family: 'structurals' },

  { id: 'FLT-AIR-1', canonical: 'Air Filter Element 1 inch, pleated, 10 micron, for compressor', family: 'filters' },
  { id: 'FLT-OIL-10', canonical: 'Oil Filter Element 10 inch, 5 micron, pleated paper, SS housing', family: 'filters', distractorOf: 'FLT-AIR-1' },
  { id: 'LUB-EP2', canonical: 'Lithium Base Grease EP2, NLGI Grade 2, 1 kg pack', family: 'filters' },
  { id: 'LUB-HYD-68', canonical: 'Hydraulic Oil ISO VG 68, anti-wear type, 20 litre', family: 'filters' },

  { id: 'CON-ELEC-45', canonical: 'Welding Electrode 4.0 mm, E6013, IS 814, 5 kg pack', family: 'consumables' },
  { id: 'CON-ELEC-32', canonical: 'Welding Electrode 3.15 mm, E6013, IS 814, 5 kg pack', family: 'consumables', distractorOf: 'CON-ELEC-45' },
  { id: 'CON-DISC-100', canonical: 'Cutting Disc 100 mm dia x 1 mm thick, for MS, 80 m/s', family: 'consumables' },
  { id: 'CON-GLV-10', canonical: 'Cotton Hand Gloves 10 inch, knitted, ISI marked', family: 'consumables' }
];

/* ------------------------------------------------------------------ *
 * Reproducible noise engine
 * ------------------------------------------------------------------ */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VENDORS = ['SKF', 'NSK', 'FAG', 'ZKL', 'NBC', 'KSB', 'L&T', 'SIEMENS', 'CROMPTON', 'HAVELLS', 'POLYCAB', 'JINDAL', 'AUDCO', 'ZOLOTO', 'SUPREME', 'BOSCH'];

const SHORTHAND = [
  [/\bDeep Groove Ball Bearing\b/gi, 'DGBB'],
  [/\bBall Bearing\b/gi, 'BRG'],
  [/\bBearing\b/gi, 'BRG'],
  [/\bHexagonal Head Bolt\b/gi, 'HEX HEAD BOLT'],
  [/\bHexagonal\b/gi, 'HEX'],
  [/\bStainless Steel 304\b/gi, 'SS 304'],
  [/\bStainless Steel 316\b/gi, 'SS 316'],
  [/\bStainless Steel\b/gi, 'S.S.'],
  [/\bMild Steel\b/gi, 'MS'],
  [/\bGalvanized Iron\b/gi, 'G.I.'],
  [/\bHot Dip Galvanized\b/gi, 'HDG'],
  [/\bScrewed\b/gi, 'SCRD'],
  [/\bFlanged\b/gi, 'FLGD'],
  [/\bDiameter\b/gi, 'DIA'],
  [/\bThickness\b/gi, 'THK'],
  [/\bSchedule 40\b/gi, 'SCH 40'],
  [/\bCast Iron\b/gi, 'C.I.'],
  [/\bDuctile Iron\b/gi, 'D.I.'],
  [/\bNitrogen/gi, 'Nitrogen'],
  [/\bCopper Conductor\b/gi, 'CU COND'],
  [/\bAluminium Conductor\b/gi, 'AL COND'],
  [/\bGrade\b/gi, 'GR.'],
  [/\bSocket Head Cap Screw\b/gi, 'SHCS'],
  [/\bNitrile Rubber\b/gi, 'NBR'],
  [/\bRotary Shaft Seal\b/gi, 'ROT SEAL']
];

const FILLERS = [
  'AS PER APPROVED SPECIFICATION', 'MAKE: {VENDOR}', '{VENDOR} MAKE ONLY', 'ITEM CODE {CODE}',
  'SUITABLE FOR PLANT USE', 'NOS.', 'REFER DRG. {CODE}', 'PART NO. {CODE}',
  'PREFERABLY {VENDOR}', 'QTY: {QTY}', 'AS PER SITE REQUIREMENT', 'OLD CODE {CODE}',
  'SUITABLE FOR PLANT USE', 'TO BE SUPPLIED IN NOS'
];

function asTitleCase(s) {
  return s.replace(/\w[\w'-]*/g, (w) => (w.length > 2 && !/^\d/.test(w) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w));
}

function rotateWords(s, rnd) {
  const parts = s.split(/([,;]|\s(?:x|X)\s)/).filter((p) => p !== undefined);
  if (parts.length < 4) return s;
  const cut = Math.floor(rnd() * (parts.length - 2)) + 1;
  return `${parts.slice(cut).join('')} ${parts.slice(0, cut).join('')}`.replace(/\s+/g, ' ').trim();
}

function unitVariant(s, rnd) {
  return s
    .replace(/(^|[\s,;(])(\d+(?:\.\d+)?)\s*mm\b/g, (m, lead, num) => {
      const v = Number(num);
      const roll = rnd();
      if (roll < 0.34 && v >= 10) return `${lead}${trimNum(v / 10)} cm`;
      if (roll < 0.5 && v >= 25) return `${lead}${trimNum(v / 25.4, 2)} inch`;
      return `${lead}${num} mm`;
    })
    .replace(/\b1\/2 inch\b/g, () => (rnd() < 0.5 ? '15 mm' : '1/2"'))
    .replace(/\b1\/4 inch\b/g, () => (rnd() < 0.5 ? '6 mm' : '1/4"'));
}

function trimNum(v, dp = 1) {
  const r = Number(v.toFixed(dp));
  return String(r).replace(/\.0$/, '');
}

function typo(s, rnd) {
  const words = s.split(' ');
  if (!words.length) return s;
  const i = Math.floor(rnd() * words.length);
  const w = words[i];
  if (w.length < 5) return s;
  const j = Math.floor(rnd() * (w.length - 3)) + 1;
  const mode = rnd();
  if (mode < 0.4) words[i] = `${w.slice(0, j)}${w[j + 1]}${w[j]}${w.slice(j + 2)}`;      // transpose
  else if (mode < 0.7) words[i] = `${w.slice(0, j)}${w[j - 1]}${w.slice(j)}`;            // duplicate
  else words[i] = `${w.slice(0, j)}${w.slice(j + 1)}`;                                    // drop
  return words.join(' ');
}

function glueSpecs(s) {
  return s.replace(/(M\d{1,2})\s*x\s*(\d{1,4})/g, '$1X$2').replace(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*mm/gi, '$1X$2 MM');
}

function splitSpecs(s) {
  return s.replace(/(M\d{1,2})\s*x\s*(\d{1,4})/g, '$1 X $2').replace(/\b(\d{2,3})\s*mm\b/g, '$1 MM');
}

function stripPunct(s) {
  // Drops separators but never breaks a decimal number like 3.15 mm.
  return s.replace(/\.(?=\s|$)/g, '').replace(/,/g, '').replace(/\s+/g, ' ').trim();
}

function legacyCode(cpseCode, conceptId, n) {
  return `${cpseCode}-${conceptId.replace(/[^A-Z0-9]/g, '').slice(0, 6)}-${String(n).padStart(4, '0')}`;
}

const CRITICALITY = ['A (Critical)', 'B (Semi-critical)', 'C (General)'];
const UOM = { bearings: 'NOS', fasteners: 'NOS', seals: 'NOS', pipes: 'MTR', valves: 'NOS', pumps: 'NOS', motors: 'NOS', electricals: 'MTR', instruments: 'NOS', structurals: 'KG', filters: 'NOS', consumables: 'NOS' };

/**
 * Generate one human-looking variant of a canonical description.
 */
export function makeVariant(concept, rnd, index) {
  let s = concept.canonical;
  const noised = [];

  if (rnd() < 0.45) { s = s.toUpperCase(); noised.push('caps'); }
  else if (rnd() < 0.35) { s = asTitleCase(s); noised.push('title-case'); }

  if (rnd() < 0.55) { s = unitVariant(s, rnd); noised.push('unit-variant'); }
  if (rnd() < 0.5) {
    const [re, rep] = SHORTHAND[Math.floor(rnd() * SHORTHAND.length)];
    const before = s;
    s = s.replace(re, rep);
    if (s !== before) noised.push('shorthand');
  }
  if (rnd() < 0.3) { s = glueSpecs(s); noised.push('glued-spec'); }
  else if (rnd() < 0.3) { s = splitSpecs(s); noised.push('split-spec'); }
  if (rnd() < 0.3) { s = rotateWords(s, rnd); noised.push('word-order'); }

  const vendor = VENDORS[Math.floor(rnd() * VENDORS.length)];
  const fillers = [];
  const fillerCount = rnd() < 0.55 ? 1 : 0;
  for (let i = 0; i < fillerCount; i++) {
    const f = FILLERS[Math.floor(rnd() * FILLERS.length)]
      .replace('{VENDOR}', vendor)
      .replace('{CODE}', legacyCode('XX', concept.id, index))
      .replace('{QTY}', String(Math.floor(rnd() * 40) + 1));
    fillers.push(f);
  }
  if (rnd() < 0.35) s = `${vendor} ${s}`;
  if (fillers.length) s = `${s} ${fillers.join(' ')}`;
  if (rnd() < 0.2) s = `${s} ${vendor}`;
  if (rnd() < 0.22) { s = typo(s, rnd); noised.push('typo'); }
  if (rnd() < 0.2) { s = stripPunct(s); noised.push('unpunctuated'); }
  if (rnd() < 0.15) s = `  ${s.replace(/ /g, '  ')}  `;

  return { raw: s.replace(/\s+/g, ' ').trim(), noised, vendor };
}

/**
 * Build the corpus.
 * @param {{size?:number, seed?:number, includeShowcases?:boolean}} opts
 */
export function generateDataset(opts = {}) {
  const size = opts.size || 260;
  const seed = opts.seed || 20260129;
  const rnd = mulberry32(seed);
  const rows = [];
  let counter = 0;

  const push = (conceptId, raw, cpse, extra = {}) => {
    counter += 1;
    rows.push({
      id: `M${String(counter).padStart(5, '0')}`,
      conceptId,
      raw,
      cpse: cpse.name,
      unit: cpse.unit,
      legacyCode: legacyCode(cpse.code, conceptId, counter),
      criticality: CRITICALITY[Math.floor(rnd() * CRITICALITY.length)],
      addedOn: new Date(Date.UTC(2015 + Math.floor(rnd() * 10), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27))).toISOString().slice(0, 10),
      ...extra
    });
  };

  if (opts.includeShowcases !== false) {
    for (const s of SHOWCASES) {
      const cpse = CPSES.find((c) => c.name === s.cpse) || CPSES[0];
      push(s.concept, s.raw, cpse, { source: 'showcase' });
    }
  }

  const perConceptBase = Math.max(2, Math.round((size - counter) / CONCEPTS.length));
  const conceptIds = CONCEPTS.map((c) => c.id);
  const conceptById = new Map(CONCEPTS.map((c) => [c.id, c]));

  let guard = 0;
  while (rows.length < size && guard < size * 6) {
    guard += 1;
    const concept = conceptById.get(conceptIds[Math.floor(rnd() * conceptIds.length)]);
    const cpse = CPSES[Math.floor(rnd() * CPSES.length)];
    const variantCount = Math.max(1, Math.round(perConceptBase * (0.5 + rnd())));
    for (let v = 0; v < variantCount && rows.length < size; v++) {
      const varnt = makeVariant(concept, rnd, v + 1);
      push(concept.id, varnt.raw, cpse);
    }
  }

  const conceptMeta = new Map();
  for (const r of rows) {
    if (!conceptMeta.has(r.conceptId)) conceptMeta.set(r.conceptId, { conceptId: r.conceptId, size: 0, cpse: new Set() });
    const m = conceptMeta.get(r.conceptId);
    m.size += 1;
    m.cpse.add(r.cpse);
  }

  return {
    rows,
    concepts: conceptMeta,
    stats: {
      records: rows.length,
      concepts: conceptMeta.size,
      cpses: new Set(rows.map((r) => r.cpse)).size,
      duplicatesToCollapse: rows.length - conceptMeta.size,
      seed,
      generatedAt: new Date().toISOString()
    }
  };
}

export { CPSES, CONCEPTS as CONCEPT_LIST };

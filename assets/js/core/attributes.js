/**
 * Code Cosmos · Technical Attribute Extraction Layer
 * ------------------------------------------------------------------
 * Turns unstructured CPSE description text into structured engineering
 * attributes ({ key, value, unit, baseValue, baseUnit, group }) so the
 * matcher can reason over specifications instead of words.
 *
 * Every numeric attribute is stored twice: exactly as written and
 * converted into the SI base unit of its quantity, which is what makes
 * "50 mm" and "5 cm" comparable.
 */

import { parseMeasure, parseFraction, toBase, quantityOf } from './units.js';
import { canonicalizePhrase, cleanRaw } from './normalize.js';

export const FAMILIES = [
  {
    id: 'bearings', label: 'Bearings & Transmission', cnmc: '30-01', icon: '⚙',
    keywords: ['bearing', 'brg', 'bush', 'roller', 'thrust', 'pillow block', 'coupling', 'sprocket', 'chain', 'gear', 'pulley', 'belt']
  },
  {
    id: 'fasteners', label: 'Fasteners & Hardware', cnmc: '30-02', icon: '🔩',
    keywords: ['bolt', 'nut', 'screw', 'washer', 'stud', 'rivet', 'circlip', 'pin', 'clamp', 'fastener', 'anchor', 'csk', 'hexagonal head']
  },
  {
    id: 'seals', label: 'Seals, Gaskets & Packing', cnmc: '30-03', icon: '◎',
    keywords: ['seal', 'gasket', 'o-ring', 'oring', 'packing', 'oil seal', 'lip seal', 'ring', 'jointing', 'rope']
  },
  {
    id: 'pipes', label: 'Pipes, Tubes & Fittings', cnmc: '30-04', icon: '⛓',
    keywords: ['pipe', 'tube', 'elbow', 'tee', 'reducer', 'bend', 'flange', 'fitting', 'coupling', 'nipple', 'union', 'socket', 'ferrule']
  },
  {
    id: 'valves', label: 'Valves & Actuators', cnmc: '30-05', icon: '🚰',
    keywords: ['valve', 'cock', 'gate valve', 'globe', 'butterfly', 'ball valve', 'check valve', 'solenoid', 'actuator', 'strainer', 'trap']
  },
  {
    id: 'pumps', label: 'Pumps & Compressors', cnmc: '30-06', icon: '🌀',
    keywords: ['pump', 'compressor', 'impeller', 'blower', 'fan', 'dosing', 'submersible']
  },
  {
    id: 'motors', label: 'Motors & Drives', cnmc: '31-01', icon: '🔌',
    keywords: ['motor', 'gearbox', 'drive', 'vfd', 'starter', 'alternator', 'generator']
  },
  {
    id: 'electricals', label: 'Cables & Electricals', cnmc: '31-02', icon: '⚡',
    keywords: ['cable', 'wire', 'conductor', 'lug', 'gland', 'conduit', 'tray', 'light', 'lamp', 'battery', 'charger', 'mcb', 'switch', 'socket', 'panel', 'insulator', 'terminal', 'capacitor']
  },
  {
    id: 'instruments', label: 'Instruments & Control', cnmc: '31-04', icon: '📈',
    keywords: ['gauge', 'gauge|', 'sensor', 'transmitter', 'indicator', 'meter', 'thermometer', 'flow meter', 'pressure gauge', 'controller', 'relay', 'transducer', 'switch', 'level']
  },
  {
    id: 'structurals', label: 'Structural & Raw Material', cnmc: '30-07', icon: '🏗',
    keywords: ['plate', 'sheet', 'angle', 'channel', 'beam', 'flat', 'bar', 'rod', 'section', 'mesh', 'grating', 'ms plate', 'chequered']
  },
  {
    id: 'filters', label: 'Filters & Lubricants', cnmc: '30-08', icon: '🧴',
    keywords: ['filter', 'element', 'cartridge', 'lubricant', 'oil', 'grease', 'strainer', 'strainer|', 'desiccant', 'coolant']
  },
  {
    id: 'consumables', label: 'Consumables & Safety', cnmc: '32-01', icon: '🧰',
    keywords: ['electrode', 'welding', 'abrasive', 'disc', 'cutting', 'gloves', 'helmet', 'safety', 'cotton', 'brush', 'paint', 'thinner', 'tape', 'adhesive', 'drill', 'tap', 'reamer']
  }
];

const MATERIAL_PATTERNS = [
  ['SS 316L', /\b(ss\s*316l|ss316l|stainless\s*steel\s*316l|a4\s*80|316l)\b/i],
  ['SS 316', /\b(ss\s*316|ss316|stainless\s*steel\s*316|a4[- ]?(?:70|80)|316)\b/i],
  ['SS 304', /\b(ss\s*304|ss304|stainless\s*steel\s*304|a2[- ]?(?:70|80)|304)\b/i],
  ['SS', /\b(ss|stainless\s*steel|stainless|sst)\b/i],
  ['MS', /\b(ms|mild\s*steel)\b/i],
  ['CS', /\b(cs|carbon\s*steel)\b/i],
  ['Forged Steel', /\bforged\s*steel\b/i],
  ['Alloy Steel', /\balloy\s*steel\b/i],
  ['CI', /\b(ci|cast\s*iron|grey\s*iron|gray\s*iron)\b/i],
  ['DI', /\b(ductile\s*iron|sg\s*iron|di)\b/i],
  ['GI', /\b(gi|galvanized\s*iron|galvanised\s*iron|hdg|hot\s*dip\s*galvanized)\b/i],
  ['Aluminium', /\b(aluminium|aluminum|alu|al)\b/i],
  ['Brass', /\b(brass|br)\b/i],
  ['Bronze', /\bbronze\b/i],
  ['Copper', /\bcopper\b/i],
  ['NBR', /\b(nitrile|nbr)\b/i],
  ['EPDM', /\bepdm\b/i],
  ['PTFE', /\b(ptfe|teflon)\b/i],
  ['PU', /\b(polyurethane|pu)\b/i],
  ['PP', /\b(polypropylene|pp)\b/i],
  ['PE', /\b(polyethylene|hdpe|pe)\b/i],
  ['uPVC', /\b(upvc)\b/i],
  ['CPVC', /\b(cpvc)\b/i],
  ['Zinc Plated', /\b(zinc\s*plated|zn\s*plated|electroplated)\b/i],
  ['Rubber', /\b(rubber|elastomer)\b/i]
];

const STANDARD_PATTERNS = [
  /\b(IS\s?-?\s?\d{2,5}(?:\s?(?:part|pt)\s?\d+)?(?:\s?:\s?\d{4})?)\b/i,
  /\b(ISO\s?-?\s?\d{2,5}(?:[-:]\d{4})?)\b/i,
  /\b(DIN\s?-?\s?\d{2,5}(?:[-:]\d{4})?)\b/i,
  /\b(ASTM\s?-?\s?[A-Z]\d{1,4}(?:[-/]\d{1,3})?)\b/i,
  /\b(ANSI\s?-?\s?[A-Z]?\d{1,3}(?:\.\d{1,2})?)\b/i,
  /\b(BS\s?-?\s?\d{2,5}(?:[-:]\d{2,4})?)\b/i,
  /\b(API\s?-?\s?\d{2,4}[A-Z]?)\b/i,
  /\b(IEC\s?-?\s?\d{3,5}(?:-\d{1,3})?)\b/i,
  /\b(ASME\s?-?\s?B?\d{1,3}(?:\.\d{1,2})?)\b/i
];

const GRADE_PATTERNS = [
  /\b(8\.8|10\.9|12\.9|4\.6|5\.6|6\.8)\b/,
  /\b(a2[- ]?70|a4[- ]?80|a2[- ]?80)\b/i,
  /\b(en\s?-?\s?(?:8|19|24|31|353|36))\b/i,
  /\b(gr\.?\s?[a-z0-9]{1,6})\b/i,
  /\b(?:grade|gr)\s*[:=]?\s*([a-z]?\d{2,4}[a-z]?)\b/i
];

const SPEC_EXTRACTORS = [
  // ---- O-rings & seal cross-sections: "70 mm ID x 4 mm thick" --------------
  {
    key: 'oringSection', label: 'Seal Cross Section', group: 'dimension', critical: true,
    match(raw) {
      if (!/\b(o[- ]?ring|oring|seal|gasket|washer|packing|joint)\b/i.test(raw)) return null;
      const m = raw.match(/(\d+(?:\.\d+)?)\s*(mm|cm|inch|in|")?\s*(?:id|i\.d|inner\s*dia(?:meter)?|bore)?\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(mm|cm|inch|in|")?/i);
      if (!m) return null;
      const a = toBase(Number(m[1]), m[2] || 'mm');
      const b = toBase(Number(m[3]), m[4] || m[2] || 'mm');
      if (!a || !b || a.quantity !== 'length') return null;
      return {
        text: `${m[1]} x ${m[3]} ${m[4] || m[2] || 'mm'}`,
        baseValue: a.value, baseUnit: 'mm', quantity: 'length',
        secondaryBaseValue: b.value, secondaryBaseUnit: 'mm',
        group: 'dimension', critical: true
      };
    }
  },
  // ---- Designations / part codes -------------------------------------------
  {
    key: 'designation', label: 'Bearing / Part Designation', group: 'designation', critical: true,
    match(rawSource) {
      const raw = String(rawSource)
        .replace(/\b(2RS|2RZ|2Z|RS1|RS|ZZ|C3|C4|P6|P5|TN9|J|NR)\b/gi, ' ')
        .replace(/(\d{4,5})(2RS|2RZ|2Z|ZZ|RS|C3|C4|TN9)/gi, '$1');
      const re = /\b((?:\d{4,5}|[A-Z]{1,3}\d{3,5})(?:[- ]?(?:2RS|2Z|ZZ|RS|C3|P6|TN9))?)\b/gi;
      let m;
      while ((m = re.exec(raw)) !== null) {
        const token = m[1].toUpperCase();
        const before = raw.slice(Math.max(0, m.index - 8), m.index);
        if (/(?:ASME|IS|ISO|DIN|ASTM|ANSI|BS|API|IEC|EN|JIS|PN|DN|CLASS|SCH|SIZE|TYPE|FRAME)\s?$/i.test(before)) continue;
        if (/^(?:IS|ISO|DIN|ASTM|ANSI|BS|API|IEC|ASME|PN|CLASS)$/.test(token)) continue;
        if (/^\d{2,3}$/.test(token)) continue;
        if (/^0\d{3,4}$/.test(token)) continue;              // padded part numbers (0002)
        if (/(?:MM|CM|KG|KW|RPM|VOLT|AMP|SHORE|PSI|BAR)$/.test(token)) continue;
        if (/^\d{4}$/.test(token) && !/bearing|roller|brg/i.test(raw)) continue;  // bare 4-digit year-like noise
        return { text: token, group: 'designation' };
      }
      return null;
    }
  },
  {
    key: 'sealType', label: 'Sealing / Closure', group: 'designation',
    match(raw) {
      const m = raw.match(/\b(2RS|2RZ|2Z|ZZ|RS1?|z|open)\b/i);
      if (!m) return null;
      return { text: m[1].toUpperCase().replace(/^Z$/, 'ZZ') };
    }
  },
  // ---- Material ------------------------------------------------------------
  {
    key: 'material', label: 'Material', group: 'material', critical: false,
    match(raw) {
      for (const [canon, re] of MATERIAL_PATTERNS) if (re.test(raw)) return { text: canonicalizePhrase(canon), canon };
      return null;
    }
  },
  {
    key: 'finish', label: 'Finish / Coating', group: 'material',
    match(raw) {
      const m = raw.match(/\b(hot\s*dip\s*galvanized|hdg|zinc\s*plated|zn\s*plated|powder\s*coated|painted|epoxy\s*coated|galvanised|plain|black\s*oxide|electroplated|chrome\s*plated)\b/i);
      return m ? { text: canonicalizePhrase(m[1]) } : null;
    }
  },
  // ---- Standards & grades --------------------------------------------------
  {
    key: 'standard', label: 'Standard', group: 'standard',
    match(raw) {
      for (const re of STANDARD_PATTERNS) {
        const m = raw.match(re);
        if (m) return { text: m[1].toUpperCase().replace(/\s+/g, ' ').replace(/\s?-\s?/, ' ') };
      }
      return null;
    }
  },
  {
    key: 'grade', label: 'Grade', group: 'grade', critical: true,
    match(raw) {
      for (const re of GRADE_PATTERNS) {
        const m = raw.match(re);
        if (m) {
          const val = (m[1] || m[0]).trim().toUpperCase().replace(/^GR\.?\s*/, '');
          if (/^(?:IS|ISO|DIN|ASTM)$/.test(val)) continue;
          return { text: val };
        }
      }
      return null;
    }
  },
  // ---- Dimensions ----------------------------------------------------------
  {
    key: 'bore', label: 'Bore / Inner Dia', group: 'dimension', critical: true,
    match(raw) {
      const m = raw.match(/\b(?:bore|id|inner\s*dia(?:meter)?|inner)\s*[:=]?\s*([\d.\/]+)\s*(mm|cm|m|in|inch|"|")?/i)
        || raw.match(/\b(?:bore|id)\s*[:=]?\s*([\d.\/]+)/i);
      if (!m) return null;
      const value = parseFraction(m[1]);
      const unit = m[2] || 'mm';
      return measure('bore', value, unit, m[0]);
    }
  },
  {
    key: 'od', label: 'Outer Dia', group: 'dimension', critical: true,
    match(raw) {
      const m = raw.match(/\b(?:od|outer\s*dia(?:meter)?|outside\s*dia)\s*[:=]?\s*([\d.\/]+)\s*(mm|cm|m|in|inch|"|")?/i);
      if (!m) return null;
      return measure('od', parseFraction(m[1]), m[2] || 'mm', m[0]);
    }
  },
  {
    key: 'width', label: 'Width / Thickness', group: 'dimension', critical: true,
    match(raw) {
      let m = raw.match(/\b(?:width|w|thk|thickness|broad)\s*[:=]?\s*([\d.\/]+)\s*(mm|cm|m|in|inch|")?/i);
      if (!m) m = raw.match(/([\d.\/]+)\s*(mm|cm|m|in|inch|")\s*(?:thk|thick|thickness|wide|width|broad)\b/i);
      if (!m) return null;
      return measure('width', parseFraction(m[1]), m[2] || 'mm', m[0]);
    }
  },
  {
    key: 'nominalSize', label: 'Nominal Size (DN)', group: 'dimension', critical: true,
    match(raw) {
      const m = raw.match(/\b(?:dn|nb|nps)\s*[-]?\s*(\d{1,4}(?:\.\d+)?)/i);
      if (!m) return null;
      const isNps = /nps/i.test(m[0]);
      const value = isNps ? Number(m[1]) * 25.4 : Number(m[1]);
      return { text: m[0].toUpperCase().replace(/\s+/g, ''), baseValue: value, baseUnit: 'mm', quantity: 'length', unit: 'mm', group: 'dimension', critical: true };
    }
  },
  {
    key: 'thread', label: 'Thread / Diameter', group: 'dimension', critical: true,
    match(raw) {
      const m = raw.match(/\bm\s?(\d{1,3})(?:\s?x\s?(\d+(?:\.\d+)?))?\b/i);
      if (!m) return null;
      const dia = Number(m[1]);
      if (dia < 2 || dia > 100) return null;
      const pitch = m[2] ? Number(m[2]) : null;
      return {
        text: `M${m[1]}${pitch ? ` x ${m[2]}` : ''}`,
        baseValue: dia, baseUnit: 'mm', quantity: 'length', unit: 'mm', group: 'dimension', critical: true, pitch
      };
    }
  },
  {
    key: 'length', label: 'Length', group: 'dimension',
    match(raw) {
      const m = raw.match(/\b(?:length|lg|l)\s*[:=]?\s*([\d.\/]+)\s*(mm|cm|m|in|inch|"|")?/i);
      if (m) return measure('length', parseFraction(m[1]), (m[2] || 'mm'), m[0]);
      const glued = raw.match(/\bm\s?\d{1,3}\s?x\s?(\d{1,4})\b/i);
      if (glued) return measure('length', parseFraction(glued[1]), 'mm', glued[0]);
      const after = raw.match(/(\d+(?:\.\d+)?)\s*(mm|cm|inch|in|")\s*(?:long|length|lg)\b/i);
      if (after) return measure('length', Number(after[1]), after[2], after[0]);
      return null;
    }
  },
  {
    key: 'genericSize', label: 'Dimension', group: 'dimension',
    match(raw) {
      const m = raw.match(/(\d+(?:\.\d+)?)\s*(mm|cm|inch|")\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(mm|cm|inch|")?/i);
      if (!m) return null;
      const a = toBase(Number(m[1]), m[2]);
      const b = toBase(Number(m[3]), (m[4] || m[2]));
      if (!a || !b) return null;
      return {
        text: `${m[1]} x ${m[3]} ${m[4] || m[2]}`,
        baseValue: a.value, baseUnit: a.unit, quantity: a.quantity,
        secondaryBaseValue: b.value, secondaryBaseUnit: b.unit,
        group: 'dimension', critical: false
      };
    }
  },
  // ---- Ratings -------------------------------------------------------------
  {
    key: 'pressureClass', label: 'Pressure Class', group: 'rating', critical: true,
    match(raw) {
      let m = raw.match(/\bpn\s*[-]?\s?(\d{1,3})\b/i);
      if (m) return { text: `PN${m[1]}`, baseValue: Number(m[1]) * 100, baseUnit: 'kPa', quantity: 'pressure', unit: 'kPa', group: 'rating', critical: true };
      m = raw.match(/\bclass\s*[-]?\s?(150|300|600|900|1500|2500)\b/i);
      if (m) return { text: `CLASS ${m[1]}`, baseValue: Number(m[1]) * 6.895, baseUnit: 'kPa', quantity: 'pressure', unit: 'kPa', group: 'rating', critical: true };
      return null;
    }
  },
  {
    key: 'pressureRating', label: 'Operating Pressure', group: 'rating',
    match(raw) {
      const m = raw.match(/(\d+(?:\.\d+)?)\s*(kg\/cm2|kgcm2|bar|psi|kpa|mpa)\b/i);
      if (!m) return null;
      const base = toBase(Number(m[1]), m[2]);
      if (!base) return null;
      return { text: `${m[1]} ${m[2].toLowerCase()}`, baseValue: base.value, baseUnit: base.unit, quantity: base.quantity, unit: m[2], group: 'rating' };
    }
  },
  {
    key: 'power', label: 'Rated Power', group: 'rating', critical: true,
    match(raw) {
      const m = raw.match(/(\d+(?:\.\d+)?)\s*(kw|hp|w)\b/i);
      if (!m) return null;
      const base = toBase(Number(m[1]), m[2]);
      if (!base) return null;
      return { text: `${m[1]} ${m[2].toUpperCase()}`, baseValue: base.value, baseUnit: base.unit, quantity: base.quantity, unit: m[2], group: 'rating', critical: true };
    }
  },
  {
    key: 'voltage', label: 'Voltage', group: 'rating', critical: true,
    match(raw) {
      const m = raw.match(/(\d+(?:\.\d+)?)\s*(?:-|to)?\s*(\d{2,6})?\s*(kv|v|vac|volts?)\b/i);
      if (!m) return null;
      const first = Number(m[1]);
      const raw1 = m[3].toLowerCase();
      const upper = m[2] ? Number(m[2]) : null;
      const base = toBase(first, raw1);
      if (!base || base.quantity !== 'voltage') return null;
      const hi = upper ? toBase(upper, raw1) : null;
      return {
        text: `${m[1]}${hi ? `-${m[2]}` : ''} ${m[3].toUpperCase()}`,
        baseValue: hi ? (base.value + hi.value) / 2 : base.value,
        rangeLow: base.value, rangeHigh: hi ? hi.value : null,
        baseUnit: base.unit, quantity: 'voltage', unit: m[3], group: 'rating', critical: true
      };
    }
  },
  {
    key: 'ipRating', label: 'IP Protection', group: 'rating',
    match(raw) {
      const m = raw.match(/\bip\s?(\d{2})\b/i);
      return m ? { text: `IP${m[1]}`, group: 'rating' } : null;
    }
  },
  {
    key: 'efficiencyClass', label: 'Efficiency Class', group: 'rating', critical: true,
    match(raw) {
      const m = raw.match(/\b(ie[1-4]|ef[1-3])\b/i);
      return m ? { text: m[1].toUpperCase(), group: 'rating', critical: true } : null;
    }
  },
  {
    key: 'insulationClass', label: 'Insulation Class', group: 'rating',
    match(raw) {
      const m = raw.match(/\b(?:ins(?:ulation)?\s*class|class)\s*[-:=]?\s*([a-h])\b/i) || raw.match(/\bclass\s?([fhb])\b/i);
      return m ? { text: `Class ${m[1].toUpperCase()}`, group: 'rating' } : null;
    }
  },
  {
    key: 'speed', label: 'Speed', group: 'rating',
    match(raw) {
      const m = raw.match(/(\d{2,5})\s*(rpm|r\/min)\b/i);
      if (!m) return null;
      return { text: `${m[1]} RPM`, baseValue: Number(m[1]), baseUnit: 'rpm', quantity: 'speed', unit: 'rpm', group: 'rating' };
    }
  },
  {
    key: 'capacity', label: 'Flow Capacity', group: 'rating', critical: true,
    match(raw) {
      const m = raw.match(/(\d+(?:\.\d+)?)\s*(m3\/h|m3h|lpm|lps|gpm|lph)\b/i);
      if (!m) return null;
      const base = toBase(Number(m[1]), m[2]);
      if (!base) return null;
      return { text: `${m[1]} ${m[2].toUpperCase()}`, baseValue: base.value, baseUnit: base.unit, quantity: base.quantity, unit: m[2], group: 'rating', critical: true };
    }
  },
  {
    key: 'head', label: 'Head / Lift', group: 'rating',
    match(raw) {
      const m = raw.match(/\b(?:head|lift)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(m|ft|mm)\b/i);
      if (!m) return null;
      const base = toBase(Number(m[1]), m[2]);
      if (!base) return null;
      return { text: `${m[1]} ${m[2]}`, baseValue: base.value, baseUnit: base.unit, quantity: base.quantity, unit: m[2], group: 'rating' };
    }
  },
  {
    key: 'crossSection', label: 'Cross Section', group: 'dimension', critical: true,
    match(raw) {
      const m = raw.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(?:sq\.?\s?mm|mm2)\b/i);
      if (!m) return null;
      return { text: `${m[1]} sq mm`, baseValue: Number(m[1]), baseUnit: 'mm2', quantity: 'area', unit: 'mm2', group: 'dimension', critical: true };
    }
  },
  {
    key: 'cores', label: 'Cores', group: 'dimension',
    match(raw) {
      const m = raw.match(/(\d)\s*(?:core|c)\s*x\s*\d/i) || raw.match(/(\d)\s*c\s*x\s*\d/i);
      return m ? { text: `${m[1]} CORE`, baseValue: Number(m[1]), group: 'dimension' } : null;
    }
  },
  {
    key: 'angle', label: 'Angle / Bend', group: 'dimension', critical: true,
    match(raw) {
      const m = raw.match(/\b(\d{1,3})\s*(?:deg(?:rees?)?\.?|°)\b/i);
      if (!m) return null;
      const deg = Number(m[1]);
      if (deg <= 0 || deg > 360) return null;
      return { text: `${m[1]} deg`, baseValue: deg, baseUnit: 'deg', quantity: 'angle', group: 'dimension', critical: true };
    }
  },
  {
    key: 'ends', label: 'End Connection', group: 'designation',
    match(raw) {
      const m = raw.match(/\b(flanged|screwed|threaded|butt\s*weld|socket\s*weld|socket\s*type|grooved|bw|sw|victaulic|spigot|solvent\s*weld)\b/i);
      return m ? { text: canonicalizePhrase(m[1].replace(/\s+/g, ' ')) } : null;
    }
  },
  {
    key: 'ratio', label: 'Reduction Ratio', group: 'designation', critical: true,
    match(raw) {
      const m = raw.match(/\b(\d{1,3})\s*:\s*(\d{1,3})\b/);
      if (!m) return null;
      const a = Number(m[1]); const b = Number(m[2]);
      if (!a || !b || a > 200 || b > 200) return null;
      return { text: `${m[1]}:${m[2]}`, baseValue: a / b, group: 'designation', critical: true };
    }
  },
  {
    key: 'hardness', label: 'Hardness', group: 'rating',
    match(raw) {
      let m = raw.match(/(\d{2,3})\s*(hrc|hb|hv)\b/i);
      if (m) return { text: `${m[1]} ${m[2].toUpperCase()}`, baseValue: Number(m[1]), group: 'rating' };
      m = raw.match(/(\d{2,3})\s*shore\s*([a-d])\b/i);
      if (m) return { text: `${m[1]} Shore ${m[2].toUpperCase()}`, baseValue: Number(m[1]), group: 'rating', critical: true };
      return null;
    }
  },
  {
    key: 'weight', label: 'Unit Weight', group: 'dimension',
    match(raw) {
      const m = raw.match(/(\d+(?:\.\d+)?)\s*(kg\/(?:m|meter)|kgm)\b/i);
      if (!m) return null;
      return { text: `${m[1]} kg/m`, baseValue: Number(m[1]), baseUnit: 'kg/m', group: 'dimension' };
    }
  }
];

function measure(key, value, unit, raw) {
  if (!Number.isFinite(value)) return null;
  const base = toBase(value, unit);
  if (!base) return null;
  return {
    text: `${value} ${unit}`.replace(/\s+/g, ' ').trim(),
    baseValue: base.value, baseUnit: base.unit, quantity: base.quantity,
    unit, group: 'dimension', raw
  };
}

export function detectFamily(normalizedText, tokens) {
  const hay = ` ${normalizedText} `;
  let best = null;
  for (const fam of FAMILIES) {
    let score = 0;
    for (const kw of fam.keywords) {
      const needle = kw.replace(/\|/g, '');
      if (!needle) continue;
      if (hay.includes(` ${needle} `) || hay.includes(`${needle} `)) score += needle.includes(' ') ? 2 : 1.4;
      else if (hay.includes(needle)) score += 0.8;
    }
    if (score > 0 && (!best || score > best.score)) best = { ...fam, score };
  }
  if (!best) return { id: 'unclassified', label: 'Unclassified', cnmc: '99-99', icon: '◇', score: 0 };
  return { id: best.id, label: best.label, cnmc: best.cnmc, icon: best.icon, score: best.score };
}

/** Coarse "type" phrase used in the standardized master description. */
const TYPE_PATTERNS = [
  [/deep\s*groove\s*ball\s*bearing|dgbb/i, 'BALL BEARING, DEEP GROOVE'],
  [/angular\s*contact/i, 'BALL BEARING, ANGULAR CONTACT'],
  [/self[- ]align/i, 'BALL BEARING, SELF ALIGNING'],
  [/cylindrical\s*roller/i, 'ROLLER BEARING, CYLINDRICAL'],
  [/taper(?:ed)?\s*roller/i, 'ROLLER BEARING, TAPERED'],
  [/spherical\s*roller/i, 'ROLLER BEARING, SPHERICAL'],
  [/thrust/i, 'BEARING, THRUST'],
  [/pillow\s*block|plummer/i, 'PILLOW BLOCK BEARING HOUSING'],
  [/hex(?:agonal)?\s*(?:head\s*)?bolt|ht\s*bolt/i, 'BOLT, HEXAGONAL HEAD'],
  [/socket\s*head\s*cap\s*screw|shcs/i, 'SCREW, SOCKET HEAD CAP'],
  [/hex(?:agonal)?\s*nut|ht\s*nut/i, 'NUT, HEXAGONAL'],
  [/nylock|nylon\s*insert\s*nut/i, 'NUT, NYLON INSERT LOCK'],
  [/spring\s*washer/i, 'WASHER, SPRING'],
  [/plain\s*washer|washer/i, 'WASHER, PLAIN'],
  [/stud\s*bolt|stud/i, 'STUD, THREADED'],
  [/anchor\s*bolt/i, 'ANCHOR BOLT'],
  [/o[- ]?ring|oring/i, 'O-RING'],
  [/oil\s*seal|rotary\s*shaft\s*seal/i, 'OIL SEAL, ROTARY SHAFT'],
  [/gasket/i, 'GASKET'],
  [/gate\s*valve/i, 'VALVE, GATE'],
  [/globe\s*valve/i, 'VALVE, GLOBE'],
  [/ball\s*valve/i, 'VALVE, BALL'],
  [/butterfly\s*valve/i, 'VALVE, BUTTERFLY'],
  [/check\s*valve|non\s*return/i, 'VALVE, CHECK'],
  [/solenoid\s*valve/i, 'VALVE, SOLENOID'],
  [/strainer/i, 'STRAINER, Y-TYPE'],
  [/centrifugal\s*pump|monoblock|monobloc/i, 'PUMP, CENTRIFUGAL'],
  [/submersible\s*pump/i, 'PUMP, SUBMERSIBLE'],
  [/compressor/i, 'COMPRESSOR, AIR'],
  [/induction\s*motor|motor/i, 'MOTOR, INDUCTION'],
  [/elbow/i, 'ELBOW, PIPE FITTING'],
  [/tee\b/i, 'TEE, PIPE FITTING'],
  [/reducer/i, 'REDUCER, PIPE FITTING'],
  [/flange/i, 'FLANGE'],
  [/nipple/i, 'NIPPLE, PIPE'],
  [/union/i, 'UNION, PIPE FITTING'],
  [/pipe/i, 'PIPE'],
  [/angle/i, 'ANGLE SECTION'],
  [/channel/i, 'CHANNEL SECTION'],
  [/beam/i, 'BEAM SECTION'],
  [/chequer/i, 'PLATE, CHEQUERED'],
  [/plate|sheet/i, 'PLATE'],
  [/cable|wire/i, 'CABLE'],
  [/gland/i, 'CABLE GLAND'],
  [/lug/i, 'TERMINAL LUG'],
  [/gauge/i, 'PRESSURE GAUGE'],
  [/filter|element|cartridge/i, 'FILTER ELEMENT'],
  [/grease/i, 'GREASE, LITHIUM BASE'],
  [/electrode/i, 'WELDING ELECTRODE'],
  [/gloves/i, 'HAND GLOVES'],
  [/v[- ]?belt|belt/i, 'V-BELT'],
  [/coupling/i, 'COUPLING, FLEXIBLE'],
  [/wire\s*rope|rope/i, 'WIRE ROPE, STEEL']
];

export function detectType(text) {
  for (const [re, label] of TYPE_PATTERNS) if (re.test(text)) return label;
  const words = String(text).split(' ').slice(0, 4).join(' ');
  return words ? words.toUpperCase() : 'MATERIAL';
}

/**
 * Extract structured attributes for one record.
 * @returns {object} record enriched with { family, type, specs, specMap }
 */
/** Extractor scopes: specs read from the cleaned text first, then the raw string. */
const NORMALIZED_SCOPE = new Set(['designation', 'sealType', 'standard', 'grade', 'material', 'finish']);

export function extractAttributes(record) {
  const raw = record.raw;
  const norm = record.normalized || {};
  const searchText = `${raw} :: ${norm.text || ''}`;
  const specs = [];
  const specMap = new Map();

  for (const ex of SPEC_EXTRACTORS) {
    let hit = null;
    try {
      if (NORMALIZED_SCOPE.has(ex.key)) {
        hit = (norm.text ? ex.match(norm.text) : null) || ex.match(cleanRaw(raw));
      } else {
        hit = ex.match(searchText);
      }
    } catch (e) { hit = null; }
    if (!hit) continue;
    const spec = {
      key: ex.key,
      label: hit.label || ex.label,
      group: hit.group || ex.group || 'other',
      critical: hit.critical !== undefined ? hit.critical : Boolean(ex.critical),
      text: hit.text,
      canon: hit.canon || null,
      unit: hit.unit || null,
      quantity: hit.quantity || null,
      baseValue: Number.isFinite(hit.baseValue) ? hit.baseValue : null,
      baseUnit: hit.baseUnit || null,
      secondaryBaseValue: hit.secondaryBaseValue ?? null,
      secondaryBaseUnit: hit.secondaryBaseUnit ?? null,
      rangeHigh: hit.rangeHigh ?? null,
      pitch: hit.pitch ?? null
    };
    specs.push(spec);
    if (!specMap.has(ex.key)) specMap.set(ex.key, spec);
  }

  // Fallback dimension: when nothing structured was found for a numeric
  // specification, keep the first explicit "<number> <length unit>" so two
  // otherwise-identical rows with different sizes can never be silently merged.
  const hasDimension = specs.some((s) => s.group === 'dimension' || (s.baseValue !== null && s.quantity === 'length'));
  if (!hasDimension) {
    const loose = searchText.match(/(^|[\s,;(])(\d+(?:\.\d+)?|[0-9]+\/[0-9]+)\s*(mm|cm|inch|in|")\b/i);
    if (loose) {
      const value = /^\d+\/\d+$/.test(loose[2]) ? parseFraction(loose[2]) : Number(loose[2]);
      const base = toBase(value, loose[3]);
      if (base && base.quantity === 'length') {
        specs.push({
          key: 'size', label: 'Size (parsed)', group: 'dimension', critical: true,
          text: `${loose[2]} ${loose[3]}`, unit: loose[3], quantity: base.quantity,
          baseValue: base.value, baseUnit: base.baseUnit, canon: null
        });
        specMap.set('size', specs[specs.length - 1]);
      }
    }
  }

  const family = detectFamily(norm.text || raw, norm.tokens || []);
  const type = detectType(searchText);

  return { ...record, family, type, specs, specMap };
}

/** Standardized master description assembled from validated attributes. */
export function buildStandardDescription(record) {
  const get = (k) => record.specMap && record.specMap.get(k);
  const parts = [record.type || detectType(record.normalized ? record.normalized.text : record.raw)];

  const material = get('material');
  if (material) parts.push(`MATERIAL ${material.canon || material.text}`);

  const dim = (k, label) => {
    const s = get(k);
    if (!s) return;
    const v = s.baseValue !== null ? `${Number(s.baseValue.toFixed(s.baseValue % 1 === 0 ? 0 : 2))} ${s.baseUnit || 'mm'}` : s.text;
    parts.push(`${label} ${v}`.toUpperCase());
  };
  dim('nominalSize', 'SIZE');
  dim('thread', 'THREAD');
  dim('bore', 'BORE');
  dim('od', 'OD');
  dim('width', 'WIDTH');
  dim('length', 'LENGTH');
  dim('crossSection', 'CROSS SECTION');

  const grade = get('grade');
  if (grade) parts.push(`GRADE ${grade.text}`);
  const pressure = get('pressureClass') || get('pressureRating');
  if (pressure) parts.push(`PRESSURE ${pressure.text.toUpperCase()}`);
  const power = get('power');
  if (power) parts.push(`POWER ${power.text.toUpperCase()}`);
  const voltage = get('voltage');
  if (voltage) parts.push(`SUPPLY ${voltage.text.toUpperCase()}`);
  const standard = get('standard');
  if (standard) parts.push(`TO ${standard.text}`);
  const ends = get('ends');
  if (ends) parts.push(`ENDS ${ends.text.toUpperCase()}`);
  const seal = get('sealType');
  if (seal) parts.push(`SEAL ${seal.text}`);

  if (parts.length === 1) {
    const tokens = (record.normalized && record.normalized.tokens) || [];
    parts.push(...tokens.slice(0, 6).map((t) => t.toUpperCase()));
  }
  return parts.join(', ').replace(/\s+/g, ' ').slice(0, 180);
}

/** Quality score: how much structured engineering information a record carries. */
export function specDensity(record) {
  if (!record.specs || !record.specs.length) return 0;
  const groups = new Set(record.specs.map((s) => s.group));
  const numeric = record.specs.filter((s) => s.baseValue !== null).length;
  return Math.min(1, (record.specs.length * 0.09) + (groups.size * 0.1) + (numeric * 0.10));
}

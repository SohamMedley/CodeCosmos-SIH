/**
 * Code Cosmos · Unit Standardization Layer
 * ------------------------------------------------------------------
 * Every extracted technical attribute is converted into a single
 * SI-style base unit per physical quantity so that equivalent
 * specifications written differently (50 mm vs 5 cm vs 2 inch) can be
 * compared as numbers instead of strings.
 */

export const UNIT_TABLES = {
  length: {
    base: 'mm',
    units: {
      mm: 1, millimeter: 1, millimeters: 1, millimetre: 1, millimetres: 1,
      cm: 10, centimeter: 10, centimeters: 10, centimetre: 10,
      m: 1000, meter: 1000, meters: 1000, metre: 1000, metres: 1000,
      in: 25.4, inch: 25.4, inches: 25.4, '"': 25.4, 'in.': 25.4,
      ft: 304.8, foot: 304.8, feet: 304.8, mils: 0.0254, thou: 0.0254,
      micron: 0.001, microns: 0.001, um: 0.001
    }
  },
  mass: {
    base: 'kg',
    units: {
      kg: 1, kilogram: 1, kilograms: 1, kgs: 1, kilo: 1,
      g: 0.001, gram: 0.001, grams: 0.001, gm: 0.001, gms: 0.001,
      t: 1000, ton: 1000, tons: 1000, tonne: 1000, tonnes: 1000, mt: 1000,
      lb: 0.45359237, lbs: 0.45359237, kgm: 1
    }
  },
  pressure: {
    base: 'kPa',
    units: {
      kpa: 1, mpa: 1000, pa: 0.001, bar: 100, bars: 100, mbar: 0.1,
      psi: 6.894757, psig: 6.894757, kgcm2: 98.0665, 'kg/cm2': 98.0665,
      kgfcm2: 98.0665, mmwc: 0.00980665, mmh2o: 0.00980665, mwc: 9.80665, inh2o: 0.249089
    }
  },
  power: {
    base: 'kW',
    units: {
      kw: 1, kilowatt: 1, kilowatts: 1, w: 0.001, watt: 0.001, watts: 0.001,
      hp: 0.7457, hps: 0.7457, bhp: 0.7457, ps: 0.7355, kva: 0.8, mva: 800
    }
  },
  voltage: {
    base: 'V',
    units: { v: 1, volt: 1, volts: 1, kv: 1000, mv: 0.001 }
  },
  current: {
    base: 'A',
    units: { a: 1, amp: 1, amps: 1, ampere: 1, amperes: 1, ka: 1000, ma: 0.001 }
  },
  frequency: {
    base: 'Hz',
    units: { hz: 1, hertz: 1, khz: 1000 }
  },
  temperature: {
    base: 'degC',
    units: { c: 1, degc: 1, '°c': 1, celsius: 1, centigrade: 1 }
  },
  flow: {
    base: 'LPM',
    units: {
      lpm: 1, lps: 60, lph: 0.0166667, m3h: 16.6667, 'm3/h': 16.6667,
      m3hr: 16.6667, gpm: 3.78541, cumh: 16.6667
    }
  },
  torque: {
    base: 'N.m',
    units: { nm: 1, 'n.m': 1, nm2: 1, kgm: 9.80665, lbft: 1.35582, lbfin: 0.112985 }
  },
  speed: {
    base: 'rpm',
    units: { rpm: 1, rmin: 1, 'r/min': 1, rps: 60 }
  },
  area: {
    base: 'mm2',
    units: { mm2: 1, sqmm: 1, 'sq.mm': 1, sqmm2: 1, cm2: 100, m2: 1000000 }
  },
  volume: {
    base: 'L',
    units: { l: 1, litre: 1, liter: 1, litres: 1, ml: 0.001, m3: 1000, cum: 1000, gal: 3.78541 }
  },
  head: {
    base: 'm',
    units: { mwc: 1, meter: 1, metre: 1, ft: 0.3048 }
  }
};

/** Map a raw unit string to its physical quantity (first declaration wins). */
const UNIT_LOOKUP = (() => {
  const map = new Map();
  // `head` is applied last: 'mm'/'m' must resolve to length, not to head.
  const order = Object.keys(UNIT_TABLES).filter((q) => q !== 'head').concat('head');
  for (const quantity of order) {
    const table = UNIT_TABLES[quantity];
    for (const u of Object.keys(table.units)) if (!map.has(u)) map.set(u, quantity);
  }
  return map;
})();

export function quantityOf(unit) {
  if (!unit) return null;
  return UNIT_LOOKUP.get(String(unit).toLowerCase().replace(/\s+/g, '')) || null;
}

/** Convert a value expressed in `unit` into the base unit of its quantity. */
export function toBase(value, unit) {
  const q = quantityOf(unit);
  if (!q || !Number.isFinite(value)) return null;
  const table = UNIT_TABLES[q];
  const factor = table.units[String(unit).toLowerCase().replace(/\s+/g, '')];
  return { quantity: q, unit: table.base, value: value * factor, factor };
}

/** Convert between two units of the same quantity (returns null if incompatible). */
export function convert(value, from, to) {
  const a = toBase(value, from);
  const b = toBase(1, to);
  if (!a || !b || a.quantity !== b.quantity) return null;
  return a.value / b.value;
}

export function sameQuantity(a, b) {
  const qa = quantityOf(a); const qb = quantityOf(b);
  return Boolean(qa && qb && qa === qb);
}

/** Pretty-print a standardized value for the material master. */
export function formatBase(qty, value) {
  if (!qty || !Number.isFinite(value)) return '';
  if (Math.abs(value - Math.round(value)) < 0.005 && Math.abs(value) < 1e6) {
    return `${Math.round(value)} ${UNIT_TABLES[qty] ? UNIT_TABLES[qty].base : ''}`.trim();
  }
  return `${Number(value.toFixed(3))} ${UNIT_TABLES[qty] ? UNIT_TABLES[qty].base : ''}`.trim();
}

/** "1/2" -> 0.5 · "3/4" -> 0.75 · "1 1/2" -> 1.5 */
export function parseFraction(str) {
  const s = String(str).trim();
  const mixed = s.match(/^(\d+)[\s-]+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const num = Number(s);
  return Number.isFinite(num) ? num : NaN;
}

/** Diameter-style codes: DN50 -> 50 mm nominal, 2" -> 50.8 mm, M10 -> 10 mm */
export function parseNominalSize(text) {
  const s = String(text);
  let m = s.match(/\bdn\s*[-]?\s*(\d{1,4})\b/i);
  if (m) return { value: Number(m[1]), unit: 'mm', nominal: true, raw: m[0] };
  m = s.match(/\bnb\s*[-]?\s*(\d{1,4})\b/i);
  if (m) return { value: Number(m[1]), unit: 'mm', nominal: true, raw: m[0] };
  m = s.match(/\bnps\s*[-]?\s*(\d+(?:\.\d+)?)/i);
  if (m) return { value: Number(m[1]) * 25.4, unit: 'mm', nominal: true, raw: m[0] };
  return null;
}

/** Metric thread callouts: M10, M10x1.5, M12 x 50 */
export function parseMetricThread(text) {
  const m = String(text).match(/\bm\s?(\d{1,3})(?:\s?x\s?(\d+(?:\.\d+)?))?/i);
  if (!m) return null;
  const dia = Number(m[1]);
  if (dia < 2 || dia > 100) return null;
  return { value: dia, unit: 'mm', pitch: m[2] ? Number(m[2]) : null, raw: m[0].trim(), metric: true };
}

/** Parse any "<number><unit>" fragment, honouring fractions and inch marks. */
export function parseMeasure(text) {
  const s = String(text).replace(/[×✕⨯]/g, 'x');
  let m = s.match(/(\d+(?:\.\d+)?)\s*(mm|cm|m|in|inch|inches|"|ft|kg|g|gm|mt|ton|kpa|mpa|bar|psi|kg\/cm2|kw|hp|w|v|kv|a|ka|hz|rpm|lpm|m3\/h|gpm|nm|n\.m|mm2|cum|m3|degc|°c|celsius)\b/i);
  if (m) {
    const value = Number(m[1]);
    const base = toBase(value, m[2]);
    if (base) return { ...base, raw: m[0].trim() };
  }
  m = s.match(/(\d+)\s+(\d+)\/(\d+)\s*(?:"|inch|in\b)?/i);
  if (m) {
    const value = parseFraction(`${m[1]} ${m[2]}/${m[3]}`) * 25.4;
    return { quantity: 'length', unit: 'mm', value, factor: 25.4, raw: m[0].trim() };
  }
  m = s.match(/(\d+)\s*\/\s*(\d+)\s*(?:"|inch|in\b)/i);
  if (m) {
    const value = parseFraction(`${m[1]}/${m[2]}`) * 25.4;
    return { quantity: 'length', unit: 'mm', value, factor: 25.4, raw: m[0].trim() };
  }
  m = s.match(/(\d+(?:\.\d+)?)\s*"/);
  if (m) {
    return { quantity: 'length', unit: 'mm', value: Number(m[1]) * 25.4, factor: 25.4, raw: m[0].trim() };
  }
  return null;
}

/** Relative difference used for numeric spec comparison. */
export function relDiff(a, b) {
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) / denom;
}

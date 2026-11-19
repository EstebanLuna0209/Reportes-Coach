// Definición de métricas, rangos de referencia y utilidades de texto.

// better: 'down' = bajar es mejora, 'up' = subir es mejora, 'goal' = depende del objetivo del cliente
export const METRICS = [
  { key: 'weight', label: 'Peso', unit: 'kg', dec: 1, better: 'goal', required: true },
  { key: 'bmi', label: 'IMC (BMI)', unit: '', dec: 1, better: 'down' },
  { key: 'fatPct', label: '% de grasa corporal', short: '% Grasa', unit: '%', dec: 1, better: 'down' },
  { key: 'musclePct', label: '% de músculo', short: '% Músculo', unit: '%', dec: 1, better: 'up' },
  { key: 'rm', label: 'Metabolismo en reposo (RM)', short: 'RM', unit: 'kcal', dec: 0, better: 'up' },
  { key: 'metabolicAge', label: 'Edad metabólica', short: 'Edad metab.', unit: 'años', dec: 0, better: 'down' },
  { key: 'visceral', label: 'Grasa visceral', short: 'G. visceral', unit: 'nivel', dec: 0, better: 'down' },
];

// Datos adicionales que reportan básculas InBody (opcionales)
export const EXTRA = [
  { key: 'smmKg', label: 'Masa músculo esquelético', short: 'Músculo esq.', unit: 'kg', dec: 1, better: 'up' },
  { key: 'fatMassKg', label: 'Masa grasa (báscula)', short: 'Masa grasa', unit: 'kg', dec: 1, better: 'down' },
  { key: 'water', label: 'Agua corporal total', short: 'Agua', unit: 'L', dec: 1, better: 'up' },
  { key: 'protein', label: 'Proteína', unit: 'kg', dec: 1, better: 'up' },
  { key: 'minerals', label: 'Minerales', unit: 'kg', dec: 2, better: 'up' },
  { key: 'inbodyScore', label: 'Puntuación InBody', short: 'Puntuación', unit: 'pts', dec: 0, better: 'up' },
];

// Medidas con cinta (opcionales)
export const TAPE = [
  { key: 'neck', label: 'Cuello', unit: 'cm', dec: 1, better: 'none' },
  { key: 'chest', label: 'Pecho', unit: 'cm', dec: 1, better: 'none' },
  { key: 'arm', label: 'Brazo', unit: 'cm', dec: 1, better: 'none' },
  { key: 'waist', label: 'Cintura', unit: 'cm', dec: 1, better: 'down' },
  { key: 'abdomen', label: 'Abdomen', unit: 'cm', dec: 1, better: 'down' },
  { key: 'hip', label: 'Cadera', unit: 'cm', dec: 1, better: 'down' },
  { key: 'thigh', label: 'Muslo', unit: 'cm', dec: 1, better: 'none' },
  { key: 'calf', label: 'Pantorrilla', unit: 'cm', dec: 1, better: 'none' },
];

export const DERIVED = [
  { key: 'fatKg', label: 'Masa grasa', unit: 'kg', dec: 1, better: 'down' },
  { key: 'muscleKg', label: 'Masa muscular', unit: 'kg', dec: 1, better: 'up' },
  { key: 'leanKg', label: 'Masa libre de grasa', unit: 'kg', dec: 1, better: 'up' },
];

export const GOALS = {
  bajar: 'Bajar grasa / peso',
  subir: 'Subir masa muscular / peso',
  recomp: 'Recomposición corporal',
  mantener: 'Mantenimiento',
};

export function withDerived(m) {
  const out = { ...m };
  if (num(m.fatMassKg)) out.fatKg = m.fatMassKg;
  else if (num(m.weight) && num(m.fatPct)) out.fatKg = m.weight * m.fatPct / 100;
  if (num(m.weight) && num(out.fatKg)) out.leanKg = m.weight - out.fatKg;
  if (num(m.weight) && !num(m.fatPct) && num(m.fatMassKg)) out.fatPct = m.fatMassKg / m.weight * 100;
  if (num(m.waist) && num(m.hip)) out.whr = m.waist / m.hip;
  if (num(m.weight) && num(m.musclePct)) out.muscleKg = m.weight * m.musclePct / 100;
  return out;
}

export function num(v) { return typeof v === 'number' && !isNaN(v); }

export function fmt(v, dec = 1) {
  if (!num(v)) return '—';
  return v.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function fmtDelta(v, dec = 1) {
  if (!num(v)) return '—';
  const r = Number(v.toFixed(dec));
  if (r === 0) return '0';
  return (r > 0 ? '+' : '−') + fmt(Math.abs(r), dec);
}

// Devuelve 'good' | 'bad' | 'neutral' para un cambio.
export function deltaQuality(metric, delta, goal = 'bajar') {
  if (!num(delta) || Math.abs(delta) < 1e-9) return 'neutral';
  let dir = metric.better;
  if (dir === 'none') return 'neutral';
  if (dir === 'goal') {
    if (goal === 'subir') dir = 'up';
    else if (goal === 'bajar') dir = 'down';
    else return 'neutral';
  }
  return (dir === 'up') === (delta > 0) ? 'good' : 'bad';
}

export function ageFrom(birthdate, at = new Date()) {
  if (!birthdate) return null;
  const b = new Date(birthdate + 'T00:00:00');
  if (isNaN(b)) return null;
  let a = at.getFullYear() - b.getFullYear();
  const md = at.getMonth() - b.getMonth();
  if (md < 0 || (md === 0 && at.getDate() < b.getDate())) a--;
  return a;
}

export function clientAge(client, at) {
  return ageFrom(client.birthdate, at) ?? (num(client.age) ? client.age : null);
}

// ---------- Rangos de referencia (básculas de bioimpedancia tipo Omron/Tanita) ----------
function byAge(age, table) {
  if (age == null) return table[0];
  return table.find(r => age <= r[0]) || table[table.length - 1];
}

const FAT_RANGES = {
  M: [[39, 8, 20, 25], [59, 11, 22, 28], [200, 13, 25, 30]],
  F: [[39, 21, 33, 39], [59, 23, 34, 40], [200, 24, 36, 42]],
};
const MUSCLE_RANGES = {
  M: [[39, 33.3, 39.4, 44.1], [59, 33.1, 39.2, 43.9], [200, 32.9, 39.0, 43.7]],
  F: [[39, 24.3, 30.4, 35.4], [59, 24.1, 30.2, 35.2], [200, 23.9, 30.0, 35.0]],
};

/**
 * Devuelve { cuts:[c1,c2,c3], labels:[...4], min, max } o null.
 * cuts separan: [min,c1) bajo, [c1,c2) normal, [c2,c3) alto, [c3,max] muy alto
 */
export function rangeFor(key, client, measurement) {
  const sex = client.sex === 'F' ? 'F' : 'M';
  const age = clientAge(client, measurement ? new Date(measurement.date) : undefined);
  const h = num(client.height) ? client.height / 100 : null;
  switch (key) {
    case 'weight': {
      if (!h) return null;
      const lo = 18.5 * h * h, hi = 24.9 * h * h, ob = 30 * h * h;
      return { cuts: [lo, hi, ob], labels: ['Bajo', 'Normal', 'Sobrepeso', 'Obesidad'], min: lo * 0.7, max: ob * 1.35 };
    }
    case 'bmi':
      return { cuts: [18.5, 25, 30], labels: ['Bajo', 'Normal', 'Sobrepeso', 'Obesidad'], min: 12, max: 45 };
    case 'fatPct': {
      const r = byAge(age, FAT_RANGES[sex]);
      return { cuts: [r[1], r[2], r[3]], labels: ['Bajo', 'Normal', 'Alto', 'Muy alto'], min: 0, max: sex === 'F' ? 55 : 45 };
    }
    case 'musclePct': {
      const r = byAge(age, MUSCLE_RANGES[sex]);
      return { cuts: [r[1], r[2], r[3]], labels: ['Bajo', 'Normal', 'Alto', 'Muy alto'], min: sex === 'F' ? 15 : 22, max: sex === 'F' ? 45 : 52 };
    }
    case 'visceral':
      return { cuts: [1, 10, 15], labels: ['', 'Normal', 'Alto', 'Muy alto'], min: 1, max: 30 };
    case 'metabolicAge': {
      if (age == null) return null;
      return { cuts: [age - 30, age + 1, age + 10], labels: ['', 'Igual o menor a tu edad', 'Mayor', 'Muy mayor'], min: Math.max(10, age - 25), max: age + 30 };
    }
    default:
      return null;
  }
}

export function classify(value, range) {
  if (!range || !num(value)) return null;
  const i = value < range.cuts[0] ? 0 : value < range.cuts[1] ? 1 : value < range.cuts[2] ? 2 : 3;
  return { index: i, label: range.labels[i] };
}

// ---------- Interpretación de texto pegado ----------

// "Peso:93.2 / BMI:30.4 / Porcentaje de grasa:28.0 ..." -> objeto
export function parseScaleText(text) {
  const out = {};
  const rules = [
    ['visceral', /grasa\s*visceral|visceral/i],
    ['metabolicAge', /edad\s*(metab|corporal)|body\s*age/i],
    ['smmKg', /esquel[eé]tic|\bsmm\b/i],
    ['fatMassKg', /masa\s*(de\s*)?grasa|grasa\s*corporal\s*\(?kg|body\s*fat\s*mass/i],
    ['fatPct', /grasa|\bpbf\b/i],
    ['musclePct', /m[uú]sculo|muscular/i],
    ['bmi', /\bbmi\b|\bimc\b/i],
    ['rm', /\brm\b|metabolismo|basal|\bbmr\b|\btmb\b/i],
    ['water', /agua|\btbw\b/i],
    ['protein', /prote[ií]na/i],
    ['minerals', /mineral/i],
    ['inbodyScore', /puntuaci[oó]n|score|puntaje/i],
    ['neck', /cuello/i], ['chest', /pecho|t[oó]rax/i], ['arm', /brazo|b[ií]ceps/i], ['waist', /cintura/i],
    ['abdomen', /abdomen|ombligo/i], ['hip', /cadera|gl[uú]teo/i], ['thigh', /muslo|pierna/i], ['calf', /pantorrilla/i],
    ['weight', /peso|weight/i],
  ];
  for (const raw of text.split(/\n|;/)) {
    const line = raw.trim();
    if (!line) continue;
    const nm = line.match(/(-?\d+(?:[.,]\d+)?)\s*(?:kg|kcal|%|años|cm|l|pts|puntos)?\s*$/i);
    if (!nm) continue;
    const label = line.slice(0, nm.index);
    const isPct = /%|porcentaje/i.test(line);
    const rule = rules.find(([k, re]) => re.test(label) && !(isPct && (k === 'smmKg' || k === 'fatMassKg')));
    if (rule && out[rule[0]] === undefined) out[rule[0]] = parseFloat(nm[1].replace(',', '.'));
  }
  return out;
}

const HEADER_RE = /^(comida|desayuno|almuerzo|colaci[oó]n|cena|snack|merienda|pre[\s-]?entreno|post[\s-]?entreno|d[ií]a\s*\d|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i;

// Texto en bloques -> [{title, lines:[]}]
export function parseBlocks(text) {
  const blocks = [];
  let cur = null;
  let prevBlank = true;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) { prevBlank = true; continue; }
    const isHeader = HEADER_RE.test(line) || (prevBlank && (!cur || cur.lines.length > 0) && line.length <= 40 && !/\d+\s*[x×]\s*\d/.test(line) && !/,/.test(line));
    if (isHeader || !cur) {
      cur = { title: line.replace(/:$/, ''), lines: [] };
      blocks.push(cur);
    } else {
      cur.lines.push(line);
    }
    prevBlank = false;
  }
  return blocks;
}

// "Sentadilla 4x12 descanso 90s" -> {name, sets, reps, notes}
export function parseExercise(line) {
  const clean = line.replace(/^[-•*·\d.)\s]+(?=[A-Za-zÁÉÍÓÚÑáéíóúñ])/, '').trim();
  const m = clean.match(/(\d+)\s*(?:x|×|series?\s*(?:de|x)?)\s*(\d+(?:\s*(?:-|–|a)\s*\d+)?|al fallo|fallo)\s*(?:reps?|repeticiones)?/i);
  if (!m) return { name: clean, sets: '', reps: '', notes: '' };
  const name = clean.slice(0, m.index).replace(/[\s:,\-–]+$/, '').trim();
  const notes = clean.slice(m.index + m[0].length).replace(/^[\s:,\-–()]+|[)\s]+$/g, '').trim();
  return { name: name || clean, sets: m[1], reps: m[2].replace(/\s*([-–])\s*/g, '$1'), notes };
}

export function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function fmtDate(iso, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-MX', opts).replace('.', '');
}

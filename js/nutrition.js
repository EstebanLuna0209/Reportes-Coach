// Estimación aproximada de calorías y macros a partir del texto de la dieta.
// Valores por 100 g (fuente: tablas USDA / SMAE, redondeados). Son aproximaciones.

// [id, nombre, alias (separados por |), kcal, proteína, carbohidratos, grasa, {unidades en gramos}, variante cocida opcional]
// unidades: pieza = peso de 1 pieza sin unidad (ej. "2 huevos"), toma, taza, cda, rebanada, lata
const RAW = [
  // Proteínas
  ['huevo', 'Huevo entero', 'huevo|huevo entero|huevo estrellado|huevo cocido', 143, 12.6, 0.7, 9.5, { pieza: 50 }],
  ['clara', 'Claras de huevo', 'clara|clara de huevo|claras liquidas', 52, 10.9, 0.7, 0.2, { pieza: 33, taza: 240 }],
  ['whey', 'Proteína en polvo (whey)', 'proteina|proteina en polvo|whey|scoop|scoops|isolate|batido de proteina|toma de proteina', 390, 78, 8, 5, { toma: 30, pieza: 30, cda: 10 }],
  ['pollo', 'Pechuga de pollo', 'pollo|pechuga|pechuga de pollo|pechuga de pavo|pavo molido', 120, 22.5, 0, 2.6, { pieza: 150 }, [165, 31, 0, 3.6]],
  ['res', 'Carne de res magra', 'carne|res|carne de res|bistec|bistek|filete|carne molida|molida|sirloin|arrachera', 140, 21, 0, 6, { pieza: 150 }, [200, 30, 0, 8.5]],
  ['cerdo', 'Lomo de cerdo', 'cerdo|lomo|lomo de cerdo|chuleta', 143, 21, 0, 6, { pieza: 150 }, [200, 29, 0, 9]],
  ['tilapia', 'Pescado blanco (tilapia)', 'tilapia|pescado|pescado blanco|basa|mojarra|robalo|huachinango|merluza', 96, 20, 0, 1.7, { pieza: 150 }, [128, 26, 0, 2.7]],
  ['salmon', 'Salmón', 'salmon', 208, 20, 0, 13, { pieza: 150 }, [206, 22, 0, 12]],
  ['atun', 'Atún en agua', 'atun|atun en agua|lata de atun', 116, 25.5, 0, 0.8, { lata: 120, pieza: 120, taza: 160 }],
  ['camaron', 'Camarón', 'camaron', 85, 20, 0, 0.5, { pieza: 12 }, [99, 24, 0.2, 0.3]],
  ['jamon', 'Jamón de pavo', 'jamon|jamon de pavo|pechuga de pavo rebanada', 104, 17, 2, 3, { rebanada: 20, pieza: 20 }],
  ['panela', 'Queso panela', 'queso panela|panela|queso fresco|queso', 220, 20, 3, 14, { rebanada: 30, pieza: 30 }],
  ['cottage', 'Queso cottage', 'cottage|queso cottage', 98, 11, 3.4, 4.3, { taza: 225, cda: 15 }],
  ['yogurt', 'Yogurt griego natural', 'yogurt|yogur|yogurt griego|yoghurt', 59, 10, 3.6, 0.4, { taza: 245, pieza: 150 }],
  ['leche', 'Leche descremada', 'leche|leche descremada|leche light|leche deslactosada', 35, 3.4, 5, 0.1, { taza: 240, vaso: 240 }],
  ['lechealm', 'Leche de almendra', 'leche de almendra|leche vegetal', 15, 0.6, 0.3, 1.1, { taza: 240, vaso: 240 }],
  // Carbohidratos
  ['arroz', 'Arroz blanco', 'arroz|arroz blanco', 365, 7.1, 80, 0.7, { taza: 185 }, [130, 2.7, 28, 0.3]],
  ['arrozint', 'Arroz integral', 'arroz integral', 370, 7.9, 77, 2.9, { taza: 190 }, [123, 2.7, 25.6, 1]],
  ['avena', 'Avena', 'avena|hojuelas de avena|oats', 389, 16.9, 66, 6.9, { taza: 80, cda: 8 }],
  ['tortilla', 'Tortilla de maíz', 'tortilla|tortilla de maiz', 218, 5.7, 44.6, 2.9, { pieza: 30 }],
  ['tortharina', 'Tortilla de harina', 'tortilla de harina', 304, 8, 50, 7.5, { pieza: 40 }],
  ['pan', 'Pan integral', 'pan|pan integral|pan de caja', 250, 12, 43, 3.5, { rebanada: 30, pieza: 30 }],
  ['tostada', 'Tostada horneada', 'tostada|tostadas horneadas|tostada horneada', 400, 9, 75, 7, { pieza: 12 }],
  ['galletaarroz', 'Galleta de arroz', 'galleta de arroz|galletas de arroz|tortita de arroz', 387, 8, 81, 3, { pieza: 9 }],
  ['papa', 'Papa', 'papa|papas', 77, 2, 17, 0.1, { pieza: 170, taza: 150 }, [87, 1.9, 20, 0.1]],
  ['camote', 'Camote', 'camote|batata', 86, 1.6, 20, 0.1, { pieza: 150, taza: 200 }, [90, 2, 20.7, 0.2]],
  ['pasta', 'Pasta', 'pasta|espagueti|spaghetti|fideo|macarrones', 371, 13, 75, 1.5, { taza: 100 }, [158, 5.8, 31, 0.9]],
  ['frijol', 'Frijoles cocidos', 'frijol|frijoles|frijoles de la olla|lentejas|garbanzos', 127, 8.7, 22.8, 0.5, { taza: 170, cda: 15 }],
  ['granola', 'Granola', 'granola', 470, 10, 64, 20, { taza: 120, cda: 10 }],
  ['miel', 'Miel', 'miel|maple|jarabe', 304, 0.3, 82, 0, { cda: 21, cdita: 7 }],
  // Frutas
  ['platano', 'Plátano', 'platano|banana|banano', 89, 1.1, 22.8, 0.3, { pieza: 120, taza: 150 }],
  ['manzana', 'Manzana', 'manzana|manzana verde|manzana roja', 52, 0.3, 13.8, 0.2, { pieza: 180, taza: 125 }],
  ['fresa', 'Fresas', 'fresa|fresas', 32, 0.7, 7.7, 0.3, { taza: 150, pieza: 12 }],
  ['arandano', 'Arándanos / frutos rojos', 'arandano|arandanos|frutos rojos|moras|zarzamora|frambuesa', 57, 0.7, 14.5, 0.3, { taza: 148 }],
  ['papaya', 'Papaya', 'papaya', 43, 0.5, 11, 0.3, { taza: 145 }],
  ['pina', 'Piña', 'pina', 50, 0.5, 13, 0.1, { taza: 165, rebanada: 85 }],
  ['melon', 'Melón', 'melon|sandia', 34, 0.8, 8.2, 0.2, { taza: 160, rebanada: 130 }],
  ['mango', 'Mango', 'mango', 60, 0.8, 15, 0.4, { pieza: 200, taza: 165 }],
  ['naranja', 'Naranja / mandarina', 'naranja|mandarina|toronja', 47, 0.9, 11.8, 0.1, { pieza: 130 }],
  ['pera', 'Pera', 'pera', 57, 0.4, 15, 0.1, { pieza: 180 }],
  ['uva', 'Uvas', 'uva|uvas', 69, 0.7, 18, 0.2, { taza: 150, pieza: 5 }],
  ['kiwi', 'Kiwi', 'kiwi', 61, 1.1, 14.7, 0.5, { pieza: 75 }],
  ['fruta', 'Fruta (promedio)', 'fruta|fruta picada|frutas', 50, 0.6, 12.5, 0.2, { taza: 150, pieza: 150 }],
  // Verduras
  ['espinaca', 'Espinaca', 'espinaca|espinacas|acelga|kale', 23, 2.9, 3.6, 0.4, { taza: 30 }],
  ['brocoli', 'Brócoli / coliflor', 'brocoli|coliflor', 34, 2.8, 7, 0.4, { taza: 90 }],
  ['lechuga', 'Lechuga / ensalada verde', 'lechuga|ensalada|ensalada verde', 15, 1.4, 2.9, 0.2, { taza: 50 }],
  ['jitomate', 'Jitomate', 'jitomate|tomate', 18, 0.9, 3.9, 0.2, { pieza: 120, taza: 180 }],
  ['nopal', 'Nopales', 'nopal|nopales', 16, 1.3, 3.3, 0.1, { pieza: 60, taza: 150 }],
  ['calabacita', 'Calabacita', 'calabacita|calabaza|zucchini', 17, 1.2, 3.1, 0.3, { pieza: 200, taza: 120 }],
  ['zanahoria', 'Zanahoria', 'zanahoria', 41, 0.9, 9.6, 0.2, { pieza: 70, taza: 120 }],
  ['champinon', 'Champiñones', 'champinon|champinones|hongos', 22, 3.1, 3.3, 0.3, { taza: 70 }],
  ['pepino', 'Pepino', 'pepino', 15, 0.7, 3.6, 0.1, { pieza: 200, taza: 120 }],
  ['ejote', 'Ejotes', 'ejote|ejotes', 31, 1.8, 7, 0.2, { taza: 110 }],
  ['verdura', 'Verduras (promedio)', 'verdura|verduras|vegetal|vegetales|verduras mixtas|vegetales mixtos', 35, 2, 7, 0.3, { taza: 120 }],
  // Grasas
  ['aguacate', 'Aguacate', 'aguacate|guacamole', 160, 2, 8.5, 14.7, { pieza: 150, cda: 15 }],
  ['almendra', 'Almendras', 'almendra|almendras', 579, 21, 22, 50, { pieza: 1.2, taza: 140, cda: 9 }],
  ['nuez', 'Nueces', 'nuez|nueces', 654, 15, 14, 65, { pieza: 4, taza: 100, cda: 8 }],
  ['cacahuate', 'Cacahuates', 'cacahuate|cacahuates|mani', 567, 26, 16, 49, { pieza: 0.8, cda: 9 }],
  ['crema_cac', 'Crema de cacahuate', 'crema de cacahuate|mantequilla de mani|crema de almendra', 588, 25, 20, 50, { cda: 16, cdita: 5 }],
  ['aceite', 'Aceite (oliva/aguacate)', 'aceite|aceite de oliva|aceite de aguacate|aceite de coco', 884, 0, 0, 100, { cda: 14, cdita: 5 }],
  ['chia', 'Chía / linaza', 'chia|linaza', 486, 17, 42, 31, { cda: 12 }],
];

export const UNIT_WORDS = {
  g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg',
  ml: 'ml', l: 'l', litro: 'l', litros: 'l',
  oz: 'oz', onza: 'oz', onzas: 'oz',
  toma: 'toma', tomas: 'toma', scoop: 'toma', scoops: 'toma', medida: 'toma', medidas: 'toma',
  taza: 'taza', tazas: 'taza',
  vaso: 'vaso', vasos: 'vaso',
  cda: 'cda', cdas: 'cda', cucharada: 'cda', cucharadas: 'cda',
  cdita: 'cdita', cditas: 'cdita', cucharadita: 'cdita', cucharaditas: 'cdita',
  rebanada: 'rebanada', rebanadas: 'rebanada',
  lata: 'lata', latas: 'lata',
  pieza: 'pieza', piezas: 'pieza', pza: 'pieza', pzas: 'pieza', pz: 'pieza',
};
const GENERIC_UNIT = { taza: 240, vaso: 240, cda: 15, cdita: 5, rebanada: 30, lata: 150, toma: 30, pieza: 100 };

const WORD_NUM = { un: 1, una: 1, uno: 1, medio: 0.5, media: 0.5, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 };

export const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Quita la "s" final de cada palabra para empatar singular/plural.
const stemWord = w => {
  if (w.length <= 3 || !w.endsWith('s')) return w;
  if (/[lnrdz]es$/.test(w)) return w.slice(0, -2); // frijoles -> frijol, camarones -> camaron
  return w.slice(0, -1); // huevos -> huevo, aguacates -> aguacate
};
const stem = s => norm(s).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).map(stemWord).join(' ');

export function buildFoodDB(custom = []) {
  const builtin = RAW.map(([id, name, aliases, kcal, p, c, f, units, cooked]) => ({
    id, name, aliases: aliases.split('|'), kcal, p, c, f, units, cooked: cooked ? { kcal: cooked[0], p: cooked[1], c: cooked[2], f: cooked[3] } : null, builtin: true,
  }));
  const all = [...custom.map(x => ({ ...x, custom: true })), ...builtin];
  for (const food of all) food._stems = [food.name, ...(food.aliases || [])].map(stem).filter(Boolean);
  return all;
}

export const BUILTIN_FOODS = buildFoodDB();

function findFood(text, foods) {
  const t = ' ' + stem(text) + ' ';
  let best = null;
  for (const food of foods) {
    for (const a of food._stems) {
      const pos = t.indexOf(' ' + a + ' ');
      if (pos < 0) continue;
      const score = a.length * 1000 - pos + (food.custom ? 500 : 0);
      if (!best || score > best.score) best = { food, score };
    }
  }
  return best && best.food;
}

function parseQty(s) {
  s = s.trim();
  let m = s.match(/^(\d+)\s+(\d)\/(\d)/); // 1 1/2
  if (m) return [Number(m[1]) + m[2] / m[3], m[0].length];
  m = s.match(/^(\d)\/(\d)/);
  if (m) return [m[1] / m[2], m[0].length];
  m = s.match(/^½/);
  if (m) return [0.5, 1];
  m = s.match(/^(\d+(?:[.,]\d+)?)/);
  if (m) return [parseFloat(m[1].replace(',', '.')), m[0].length];
  m = norm(s).match(/^(un|una|uno|medio|media|dos|tres|cuatro|cinco|seis)\b/);
  if (m) return [WORD_NUM[m[1]], m[0].length];
  return [null, 0];
}

/**
 * Interpreta un alimento: "200g claras", "1.5 tomas de proteína", "un plátano".
 * cookedMode: 'crudo' | 'cocido' -> qué valores usar cuando el alimento tiene ambas versiones.
 */
export function parseFoodItem(text, foods = BUILTIN_FOODS, cookedMode = 'crudo') {
  const raw = text.trim().replace(/^[-•*·]\s*/, '');
  if (!raw) return null;
  let [qty, len] = parseQty(raw);
  let rest = raw.slice(len).trim();
  let unit = null;
  const um = norm(rest).match(/^([a-z]+)\.?\b/);
  if (um && UNIT_WORDS[um[1]]) { unit = UNIT_WORDS[um[1]]; rest = rest.slice(um[0].length).trim(); }
  else if (qty != null) { // "200g" pegado
    const um2 = norm(raw.slice(0, len + 6)).match(/^\d+(?:[.,]\d+)?\s*(g|gr|grs|kg|ml|oz)\b/);
    if (um2) unit = UNIT_WORDS[um2[1]];
  }
  rest = rest.replace(/^(de|del)\s+/i, '');
  const food = findFood(rest || raw, foods);
  if (!food) return { text: raw, food: null };
  if (qty == null) qty = 1;

  let grams;
  if (unit === 'g' || unit === 'ml') grams = qty;
  else if (unit === 'kg' || unit === 'l') grams = qty * 1000;
  else if (unit === 'oz') grams = qty * 28.35;
  else if (unit) grams = qty * ((food.units && food.units[unit]) || GENERIC_UNIT[unit] || 100);
  else grams = qty * ((food.units && food.units.pieza) || 100);

  let v = food;
  const forceCooked = /\bcocid[oa]s?\b|\bhervid[oa]\b|\basad[oa]\b|\ba la plancha\b/.test(norm(raw));
  const forceRaw = /\bcrud[oa]s?\b/.test(norm(raw));
  if (food.cooked && (forceCooked || (cookedMode === 'cocido' && !forceRaw))) v = food.cooked;
  const k = grams / 100;
  return {
    text: raw, food, grams,
    kcal: v.kcal * k, p: v.p * k, c: v.c * k, f: v.f * k,
  };
}

// Separa el texto de una comida en alimentos individuales.
const QTY_SPLIT = /(?<=[a-záéíóúñ)])\s+(?=\d+(?:[.,]\d+)?\s*(?:g|gr|grs|gramos|ml|kg|oz|tomas?|scoops?|piezas?|pzas?|tazas?|cdas?|cucharadas?|rebanadas?)\b)/i;
export function splitItems(text) {
  return String(text || '')
    .split(/\n|,(?![^(]*\))|;|\s+\+\s+|\s+y\s+(?=\d|un\b|una\b|medio\b|media\b)/i)
    .flatMap(s => s.split(QTY_SPLIT))
    .map(s => s.trim().replace(/^[-•*·]\s*/, ''))
    .filter(Boolean);
}

export function analyzeMeal(text, foods, cookedMode) {
  const items = splitItems(text).map(t => parseFoodItem(t, foods, cookedMode)).filter(Boolean);
  const total = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const it of items) if (it.food) for (const k in total) total[k] += it[k];
  return { items, total, unknown: items.filter(i => !i.food).map(i => i.text) };
}

export function analyzeDiet(diet, foods, cookedMode) {
  const meals = (diet.meals || []).map(m => analyzeMeal(m.items, foods, cookedMode));
  const total = { kcal: 0, p: 0, c: 0, f: 0 };
  meals.forEach(m => { for (const k in total) total[k] += m.total[k]; });
  return { meals, total };
}

export const fmtMacros = (t, sep = ' · ') =>
  `${Math.round(t.kcal).toLocaleString('es-MX')} kcal${sep}P ${Math.round(t.p)} g${sep}C ${Math.round(t.c)} g${sep}G ${Math.round(t.f)} g`;

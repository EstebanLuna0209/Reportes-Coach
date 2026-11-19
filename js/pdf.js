// Generación del PDF estilo "hoja de resultados InBody".
import {
  METRICS, DERIVED, EXTRA, TAPE, GOALS, withDerived, num, fmt, deltaQuality, rangeFor, classify,
  clientAge, fmtDate,
} from './metrics.js';
import { analyzeDiet, splitItems, fmtMacros } from './nutrition.js';

const PAGE_W = 210, PAGE_H = 297, M = 12; // mm
const CW = PAGE_W - 2 * M;

const C = {
  text: [33, 37, 41], muted: [110, 117, 125], line: [200, 205, 210], soft: [244, 246, 248],
  good: [25, 135, 84], bad: [200, 35, 51], neutral: [110, 117, 125],
  zones: [[226, 232, 240], [209, 240, 222], [255, 233, 196], [252, 214, 214]],
  zoneText: [[90, 100, 115], [25, 110, 70], [160, 100, 10], [170, 30, 40]],
};

function hexToRgb(hex) {
  const h = (hex || '#1f3a5f').replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
function mix(rgb, t) { return rgb.map(c => Math.round(c + (255 - c) * t)); }
// Helvetica estándar no trae el signo menos unicode.
const pdfTxt = s => String(s ?? '').replace(/−/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

function deltaStr(v, dec) {
  if (!num(v)) return '—';
  const r = Number(v.toFixed(dec));
  if (r === 0) return '0';
  return (r > 0 ? '+' : '-') + fmt(Math.abs(r), dec);
}

export async function buildReportPDF({ settings, client, measurements, currentId, plan, options }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const accent = hexToRgb(settings.color);
  const accentSoft = mix(accent, 0.9);
  const goal = client.goal || 'bajar';

  const ms = measurements.map(withDerived);
  let curIdx = ms.findIndex(m => m.id === currentId);
  if (curIdx < 0) curIdx = ms.length - 1;
  const cur = ms[curIdx];
  const prev = curIdx > 0 ? ms[curIdx - 1] : null;
  const first = curIdx > 0 ? ms[0] : null;
  const prevM = prev, firstM = first;
  const upto = ms.slice(0, curIdx + 1);

  let y = 0;

  // ---------- helpers ----------
  const setText = (rgb = C.text) => doc.setTextColor(...rgb);
  const font = (style = 'normal', size = 9) => { doc.setFont('helvetica', style); doc.setFontSize(size); };

  function header(subtitle) {
    doc.setFillColor(...accent);
    doc.rect(0, 0, PAGE_W, 24, 'F');
    let x = M;
    if (settings.logo) {
      try {
        const props = doc.getImageProperties(settings.logo);
        const h = 16, w = Math.min(40, h * props.width / props.height);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(x - 1, 4 - 1, w + 2, h + 2, 1.5, 1.5, 'F');
        doc.addImage(settings.logo, x, 4, w, h);
        x += w + 5;
      } catch (e) { /* logo inválido */ }
    }
    setText([255, 255, 255]);
    font('bold', 15);
    doc.text(pdfTxt(settings.business || 'Mi Coaching'), x, 11.5);
    font('normal', 8.5);
    const contact = [settings.coachName, settings.phone, settings.social].filter(Boolean).join('  ·  ');
    if (contact) doc.text(pdfTxt(contact), x, 17.5);
    font('bold', 10);
    doc.text(pdfTxt(subtitle), PAGE_W - M, 11.5, { align: 'right' });
    font('normal', 8);
    doc.text(pdfTxt(fmtDate(cur ? cur.date : null, { day: '2-digit', month: 'long', year: 'numeric' })), PAGE_W - M, 17.5, { align: 'right' });
    y = 30;
  }

  function clientBox() {
    const age = clientAge(client, cur ? new Date(cur.date + 'T12:00:00') : undefined);
    const cells = [
      ['Nombre', client.name, 2.2],
      ['Edad', age != null ? `${age} años` : '—', 0.9],
      ['Sexo', client.sex === 'F' ? 'Mujer' : 'Hombre', 0.9],
      ['Estatura', num(client.height) ? `${fmt(client.height, 0)} cm` : '—', 0.9],
      ['Objetivo', GOALS[goal] || '—', 1.8],
      ['Medición', `#${curIdx + 1} de ${ms.length}`, 0.9],
    ];
    const total = cells.reduce((s, c) => s + c[2], 0);
    const h = 12;
    doc.setDrawColor(...C.line);
    doc.setLineWidth(0.3);
    doc.rect(M, y, CW, h);
    let x = M;
    cells.forEach(([label, value, wf], i) => {
      const w = CW * wf / total;
      if (i > 0) doc.line(x, y, x, y + h);
      font('normal', 7); setText(C.muted);
      doc.text(label.toUpperCase(), x + 2.5, y + 4.2);
      font('bold', 9.5); setText();
      const v = doc.splitTextToSize(pdfTxt(value), w - 4)[0];
      doc.text(v, x + 2.5, y + 9.4);
      x += w;
    });
    y += h + 6;
  }

  function sectionTitle(title, right) {
    ensure(14);
    doc.setFillColor(...accent);
    doc.rect(M, y, 2, 6.5, 'F');
    font('bold', 11); setText(accent);
    doc.text(pdfTxt(title), M + 4.5, y + 5);
    if (right) { font('normal', 7.5); setText(C.muted); doc.text(pdfTxt(right), PAGE_W - M, y + 5, { align: 'right' }); }
    doc.setDrawColor(...accent); doc.setLineWidth(0.4);
    doc.line(M, y + 8, PAGE_W - M, y + 8);
    y += 11;
  }

  function ensure(h) {
    if (y + h > PAGE_H - 16) { doc.addPage(); header(currentSubtitle); }
  }

  function triangle(x, yy, up, color) {
    doc.setFillColor(...color);
    if (up) doc.triangle(x, yy + 1.6, x + 1.8, yy + 1.6, x + 0.9, yy, 'F');
    else doc.triangle(x, yy, x + 1.8, yy, x + 0.9, yy + 1.6, 'F');
  }

  // Tabla comparativa: actual / anterior / cambio / inicio / cambio total
  function compareTable(defs, extraRows = [], base = {}) {
    const prev = base.prev !== undefined ? base.prev : prevM;
    const first = base.first !== undefined ? base.first : firstM;
    const rows = [];
    const meta = [];
    for (const def of defs) {
      if (!num(cur[def.key])) continue;
      const unit = def.unit && def.unit !== 'nivel' ? ` ${def.unit}` : '';
      const r = [def.label, fmt(cur[def.key], def.dec) + unit];
      const dPrev = prev && num(prev[def.key]) ? cur[def.key] - prev[def.key] : null;
      const dFirst = first && num(first[def.key]) ? cur[def.key] - first[def.key] : null;
      if (prev) r.push(num(prev[def.key]) ? fmt(prev[def.key], def.dec) : '—', deltaStr(dPrev, def.dec));
      if (first && first !== prev) r.push(num(first[def.key]) ? fmt(first[def.key], def.dec) : '—', deltaStr(dFirst, def.dec));
      rows.push(r);
      meta.push({ def, dPrev, dFirst, derived: DERIVED.includes(def) });
    }
    for (const def of extraRows) {
      if (!num(cur[def.key])) continue;
      const r = [def.label, fmt(cur[def.key], def.dec)];
      const dPrev = prev && num(prev[def.key]) ? cur[def.key] - prev[def.key] : null;
      const dFirst = first && num(first[def.key]) ? cur[def.key] - first[def.key] : null;
      if (prev) r.push(num(prev[def.key]) ? fmt(prev[def.key], def.dec) : '—', deltaStr(dPrev, def.dec));
      if (first && first !== prev) r.push(num(first[def.key]) ? fmt(first[def.key], def.dec) : '—', deltaStr(dFirst, def.dec));
      rows.push(r);
      meta.push({ def, dPrev, dFirst, derived: true });
    }
    if (!rows.length) return false;
    const head = ['Indicador', 'Actual'];
    if (prev) head.push(`Anterior\n${fmtDate(prev.date)}`, 'Cambio');
    if (first && first !== prev) head.push(`Inicio\n${fmtDate(first.date)}`, 'Cambio total');

    const deltaCols = new Set();
    if (prev) deltaCols.add(3);
    if (first && first !== prev) deltaCols.add(5);

    doc.autoTable({
      startY: y,
      head: [head],
      body: rows,
      margin: { left: M, right: M, top: 30, bottom: 16 },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 1.3, bottom: 1.3, left: 2.5, right: 2.5 }, lineColor: C.line, lineWidth: 0.2, textColor: C.text, valign: 'middle' },
      headStyles: { fillColor: accentSoft, textColor: accent, fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
      columnStyles: { 0: { fontStyle: 'bold', halign: 'left', cellWidth: 52 }, 1: { fontStyle: 'bold', halign: 'center', fillColor: [250, 251, 252] } },
      bodyStyles: { halign: 'center' },
      didParseCell: (d) => {
        if (d.section === 'body') {
          const mm = meta[d.row.index];
          if (mm.derived) d.cell.styles.textColor = d.column.index === 0 ? C.muted : d.cell.styles.textColor;
          if (deltaCols.has(d.column.index)) {
            const delta = d.column.index === 3 ? mm.dPrev : mm.dFirst;
            const q = deltaQuality(mm.def, delta, goal);
            d.cell.styles.textColor = C[q];
            d.cell.styles.fontStyle = 'bold';
            d.cell.styles.cellPadding = { top: 1.3, bottom: 1.3, left: 6, right: 2.5 };
          }
        }
        if (d.cell.raw && typeof d.cell.raw === 'string') d.cell.text = d.cell.text.map(pdfTxt);
      },
      didDrawCell: (d) => {
        if (d.section !== 'body' || !deltaCols.has(d.column.index)) return;
        const mm = meta[d.row.index];
        const delta = d.column.index === 3 ? mm.dPrev : mm.dFirst;
        if (!num(delta) || Number(delta.toFixed(mm.def.dec)) === 0) return;
        const q = deltaQuality(mm.def, delta, goal);
        const tw = doc.getTextWidth(d.cell.text[0] || '');
        const cx = d.cell.x + d.cell.width / 2 - tw / 2 - 3.2;
        triangle(cx, d.cell.y + d.cell.height / 2 - 0.8, delta > 0, C[q]);
      },
      willDrawPage: d => { if (d.pageNumber > 1) header(currentSubtitle); },
    });
    y = doc.lastAutoTable.finalY + 6;
    return true;
  }

  let currentSubtitle = 'REPORTE DE COMPOSICIÓN CORPORAL';

  // ======================= PÁGINA 1: RESULTADOS =======================
  header(currentSubtitle);
  clientBox();

  if (cur) {
    // ---- 1. Composición corporal ----
    sectionTitle('Análisis de composición corporal',
      prev ? `Comparado con ${fmtDate(prev.date)}${first && first !== prev ? ' y con tu inicio ' + fmtDate(first.date) : ''}` : 'Primera medición');

    compareTable([...METRICS, ...EXTRA, ...DERIVED.filter(d => !(d.key === 'fatKg' && num(cur.fatMassKg)))]);
    y += 1;

    // ---- 2. Análisis músculo-grasa (barras con rangos) ----
    const bars = ['weight', 'musclePct', 'fatPct', 'bmi', 'visceral', 'metabolicAge']
      .map(k => ({ def: [...METRICS].find(d => d.key === k), range: rangeFor(k, client, cur) }))
      .filter(b => b.range && num(cur[b.def.key]));
    if (bars.length) {
      ensure(14 + bars.length * 10);
      sectionTitle('Análisis músculo - grasa', 'Rangos de referencia según sexo, edad y estatura');
      const labelW = 40, valueW = 30, barX = M + labelW, barW = CW - labelW - valueW, rowH = 10;
      bars.forEach(({ def, range }) => {
        const v = cur[def.key];
        const scale = val => barX + Math.max(0, Math.min(1, (val - range.min) / (range.max - range.min))) * barW;
        // etiqueta
        font('bold', 8.5); setText();
        doc.text(pdfTxt(def.short || def.label), M, y + 5.6);
        font('normal', 6.5); setText(C.muted);
        doc.text(def.unit === 'nivel' ? 'nivel' : def.unit || '', M, y + 8.6);
        // zonas
        const edges = [range.min, ...range.cuts, range.max];
        for (let i = 0; i < 4; i++) {
          const x0 = scale(edges[i]), x1 = scale(edges[i + 1]);
          if (x1 - x0 <= 0.1) continue;
          doc.setFillColor(...C.zones[i]);
          doc.rect(x0, y + 1.5, x1 - x0, 7, 'F');
          if (range.labels[i] && x1 - x0 > 9) {
            font('normal', 5.6); setText(C.zoneText[i]);
            doc.text(pdfTxt(range.labels[i]).toUpperCase(), (x0 + x1) / 2, y + 3.6, { align: 'center', maxWidth: x1 - x0 - 1 });
          }
        }
        // marcas de corte
        font('normal', 5.5); setText(C.muted);
        range.cuts.forEach((c) => {
          const cx = scale(c);
          if (cx <= barX + 0.5 || cx >= barX + barW - 0.5) return;
          doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.5);
          doc.line(cx, y + 1.5, cx, y + 8.5);
          doc.text(fmt(c, def.dec === 0 ? 0 : 1), cx, y + 10.6, { align: 'center' });
        });
        // barra de valor
        const vx = scale(v);
        doc.setFillColor(...accent);
        doc.rect(barX, y + 5, vx - barX, 2.4, 'F');
        doc.setFillColor(...C.text);
        doc.circle(vx, y + 6.2, 1.3, 'F');
        // valor
        const cls = classify(v, range);
        font('bold', 9.5); setText();
        doc.text(fmt(v, def.dec), PAGE_W - M, y + 5.4, { align: 'right' });
        if (cls && cls.label) {
          font('bold', 6.5); setText(C.zoneText[cls.index]);
          doc.text(pdfTxt(cls.label).toUpperCase(), PAGE_W - M, y + 8.8, { align: 'right' });
        }
        y += rowH + 1.5;
      });
      if (num(client.height) && bars.some(b => b.def.key === 'weight')) {
        const h = client.height / 100;
        font('italic', 6.8); setText(C.muted);
        doc.text(pdfTxt(`Peso saludable para tu estatura (IMC 18.5 - 24.9): ${fmt(18.5 * h * h)} - ${fmt(24.9 * h * h)} kg`), M, y + 2.5);
        y += 5;
      }
      y += 4;
    }

    // ---- 3. Resumen de progreso ----
    const summary = buildSummary(first || prev, cur, goal);
    const comments = (options.comments || '').trim();
    if (summary.length || comments) {
      font('normal', 8.5);
      const lines = [];
      summary.forEach(s => lines.push(...doc.splitTextToSize(pdfTxt('•  ' + s), CW - 10)));
      const cLines = comments ? doc.splitTextToSize(pdfTxt(comments), CW - 10) : [];
      const boxH = 4 + lines.length * 4.2 + (cLines.length ? 7 + cLines.length * 4.2 : 0) + 1.5;
      ensure(boxH + 14);
      sectionTitle('Resumen de tu progreso');
      doc.setFillColor(...accentSoft);
      doc.setDrawColor(...mix(accent, 0.6));
      doc.setLineWidth(0.3);
      doc.roundedRect(M, y, CW, boxH, 2, 2, 'FD');
      let yy = y + 6;
      font('normal', 8.5); setText();
      if (lines.length) { lines.forEach(l => { doc.text(l, M + 5, yy); yy += 4.2; }); }
      if (cLines.length) {
        if (lines.length) yy += 2.5;
        font('bold', 8.5); setText(accent);
        doc.text('Comentarios de tu coach', M + 5, yy); yy += 5;
        font('normal', 8.5); setText();
        cLines.forEach(l => { doc.text(l, M + 5, yy); yy += 4.2; });
      }
      y += boxH + 6;
    }

    // ---- 4. Gráficas ----
    if (options.includeCharts !== false && upto.length >= 2) {
      const keys = ['weight', 'fatPct', 'musclePct'].filter(k => upto.filter(m => num(m[k])).length >= 2);
      if (keys.length) {
        ensure(58);
        sectionTitle('Evolución');
        const gap = 5, w = (CW - gap * (keys.length - 1)) / keys.length, h = 42;
        keys.forEach((k, i) => {
          const def = METRICS.find(d => d.key === k);
          drawChart(doc, M + i * (w + gap), y, w, h, `${def.short || def.label} (${def.unit})`,
            upto.filter(m => num(m[k])).slice(-12).map(m => ({ d: m.date, v: m[k] })), accent, def.dec);
        });
        y += h + 7;
      }
    }

    // ---- 4b. Medidas con cinta ----
    if (TAPE.some(d => num(cur[d.key]))) {
      ensure(30);
      sectionTitle('Medidas corporales (cm)');
      const hasTape = m => TAPE.some(d => num(m[d.key]));
      const earlier = upto.slice(0, -1).filter(hasTape);
      const tPrev = earlier.length ? earlier[earlier.length - 1] : null;
      const tFirst = earlier.length > 1 ? earlier[0] : null;
      compareTable(TAPE, [{ key: 'whr', label: 'Índice cintura / cadera', dec: 2, better: 'down' }], { prev: tPrev, first: tFirst });
    }

    // ---- 5. Historial ----
    if (options.includeHistory !== false && upto.length >= 2) {
      const hist = upto.slice(-12).reverse();
      const cols = METRICS.filter(d => hist.some(m => num(m[d.key])));
      ensure(30);
      sectionTitle('Historial de mediciones', upto.length > 12 ? 'Últimas 12 mediciones' : '');
      doc.autoTable({
        startY: y,
        head: [['Fecha', ...cols.map(c => (c.short || c.label) + (c.unit && c.unit !== 'nivel' && c.unit !== 'años' ? `\n(${c.unit})` : ''))]],
        body: hist.map(m => [fmtDate(m.date), ...cols.map(c => fmt(m[c.key], c.dec))]),
        margin: { left: M, right: M, top: 30, bottom: 16 },
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8, halign: 'center', cellPadding: 1.5, lineColor: C.line, lineWidth: 0.2, textColor: C.text },
        headStyles: { fillColor: accentSoft, textColor: accent, fontStyle: 'bold', fontSize: 7.2 },
        columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
        didParseCell: d => {
          if (d.section === 'body' && d.row.index === 0) d.cell.styles.fillColor = [250, 251, 252];
          d.cell.text = d.cell.text.map(pdfTxt);
        },
        willDrawPage: d => { if (d.pageNumber > 1) header(currentSubtitle); },
      });
      y = doc.lastAutoTable.finalY + 6;
    }
  } else {
    font('normal', 10); setText(C.muted);
    doc.text('Aún no hay mediciones registradas.', M, y + 6);
  }

  // ======================= DIETA =======================
  const diet = plan && plan.diet;
  if (options.includeDiet && diet && (diet.meals?.length || diet.notes)) {
    doc.addPage();
    currentSubtitle = 'PLAN DE ALIMENTACIÓN';
    header(currentSubtitle);
    clientBox();
    if (diet.title || diet.kcal) {
      font('bold', 10); setText();
      doc.text(pdfTxt([diet.title, diet.kcal ? `${diet.kcal}` : ''].filter(Boolean).join('  ·  ')), M, y);
      y += 6;
    }
    const meals = (diet.meals || []).filter(m => m.title || m.items);
    if (meals.length) {
      const showMacros = options.includeMacros !== false;
      const an = showMacros ? analyzeDiet({ meals }, options.foods, diet.cookedMode || 'crudo') : null;
      sectionTitle('Comidas del día', showMacros ? 'Calorías y macros aproximados' : '');
      const mac = t => `${Math.round(t.kcal)} kcal\nP ${Math.round(t.p)} g\nC ${Math.round(t.c)} g\nG ${Math.round(t.f)} g`;
      const body = meals.map((m, i) => {
        const r = [m.title || '', splitItems(m.items).map(s => '•  ' + s).join('\n')];
        if (showMacros) r.push(an.meals[i].total.kcal > 0 ? mac(an.meals[i].total) : '—');
        return r;
      });
      doc.autoTable({
        startY: y,
        head: showMacros ? [['Comida', 'Alimentos', 'Aprox.']] : undefined,
        body,
        foot: showMacros && an.total.kcal > 0 ? [['Total del día', { content: fmtMacros(an.total, '   ·   '), colSpan: 2, styles: { halign: 'left' } }]] : undefined,
        margin: { left: M, right: M, top: 30, bottom: 16 },
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 3, lineColor: C.line, lineWidth: 0.2, textColor: C.text, valign: 'middle' },
        headStyles: { fillColor: accentSoft, textColor: accent, fontStyle: 'bold', fontSize: 8 },
        footStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9.5 },
        columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold', fillColor: accentSoft, textColor: accent }, 2: { cellWidth: 26, fontSize: 8, halign: 'center', textColor: C.text } },
        didParseCell: d => {
          d.cell.text = d.cell.text.map(pdfTxt);
          if (d.section === 'body' && d.column.index === 2) { d.cell.styles.fontStyle = 'normal'; }
        },
        willDrawPage: d => { if (d.pageNumber > 1) header(currentSubtitle); },
      });
      y = doc.lastAutoTable.finalY + 3;
      if (showMacros) {
        font('italic', 6.8); setText(C.muted);
        doc.text(pdfTxt(`Valores aproximados. Carnes, arroz y pasta calculados en peso ${diet.cookedMode === 'cocido' ? 'cocido' : 'crudo'}. P = proteína, C = carbohidratos, G = grasa.`), M, y + 1.5);
        y += 6;
      } else y += 3;
    }
    notesBox('Indicaciones', diet.notes);
  }

  // ======================= RUTINA =======================
  const routine = plan && plan.routine;
  if (options.includeRoutine && routine && (routine.days?.length || routine.notes)) {
    doc.addPage();
    currentSubtitle = 'RUTINA DE ENTRENAMIENTO';
    header(currentSubtitle);
    clientBox();
    if (routine.title) {
      font('bold', 10); setText();
      doc.text(pdfTxt(routine.title), M, y);
      y += 6;
    }
    for (const day of (routine.days || [])) {
      const ex = (day.exercises || []).filter(e => e.name);
      if (!ex.length && !day.title) continue;
      ensure(24);
      sectionTitle(day.title || 'Día');
      doc.autoTable({
        startY: y,
        head: [['#', 'Ejercicio', 'Series', 'Repeticiones', 'Notas']],
        body: ex.map((e, i) => [i + 1, e.name, e.sets || '', e.reps || '', e.notes || '']),
        margin: { left: M, right: M, top: 30, bottom: 16 },
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2, lineColor: C.line, lineWidth: 0.2, textColor: C.text, valign: 'middle' },
        headStyles: { fillColor: accentSoft, textColor: accent, fontStyle: 'bold', fontSize: 8 },
        columnStyles: { 0: { cellWidth: 8, halign: 'center', textColor: C.muted }, 1: { fontStyle: 'bold', cellWidth: 70 }, 2: { halign: 'center', cellWidth: 18 }, 3: { halign: 'center', cellWidth: 26 } },
        didParseCell: d => { d.cell.text = d.cell.text.map(pdfTxt); },
        willDrawPage: d => { if (d.pageNumber > 1) header(currentSubtitle); },
      });
      y = doc.lastAutoTable.finalY + 6;
    }
    notesBox('Indicaciones', routine.notes);
  }

  // ---------- pie de página ----------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.line); doc.setLineWidth(0.2);
    doc.line(M, PAGE_H - 11, PAGE_W - M, PAGE_H - 11);
    font('normal', 7); setText(C.muted);
    doc.text(pdfTxt(`${client.name} · ${settings.business || ''}`), M, PAGE_H - 7);
    doc.text(`Página ${i} de ${pages}`, PAGE_W - M, PAGE_H - 7, { align: 'right' });
    if (i === 1) {
      font('normal', 6); setText(C.muted);
      doc.text('Valores obtenidos por bioimpedancia. Los rangos son orientativos y no sustituyen una valoración médica.', PAGE_W / 2, PAGE_H - 3.5, { align: 'center' });
    }
  }

  return doc;

  function notesBox(title, text) {
    text = (text || '').trim();
    if (!text) return;
    font('normal', 9);
    const lines = doc.splitTextToSize(pdfTxt(text), CW - 10);
    ensure(20 + lines.length * 4.5);
    sectionTitle(title);
    const h = lines.length * 4.5 + 6;
    doc.setFillColor(...C.soft);
    doc.roundedRect(M, y, CW, h, 2, 2, 'F');
    setText(); font('normal', 9);
    lines.forEach((l, i) => doc.text(l, M + 5, y + 6 + i * 4.5));
    y += h + 6;
  }
}

function buildSummary(base, cur, goal) {
  if (!base || !cur) return [];
  const out = [];
  const d = k => (num(cur[k]) && num(base[k]) ? cur[k] - base[k] : null);
  const since = `Desde el ${fmtDate(base.date, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  const dw = d('weight'), df = d('fatKg'), dm = d('muscleKg');
  const kg = v => `${fmt(Math.abs(v), 1)} kg`;
  if (num(dw)) {
    let s = `${since} tu peso ${dw < -0.05 ? 'bajó ' + kg(dw) : dw > 0.05 ? 'subió ' + kg(dw) : 'se mantuvo estable'}`;
    const parts = [];
    if (num(df) && Math.abs(df) >= 0.05) parts.push(`${df < 0 ? 'perdiste' : 'ganaste'} ${kg(df)} de grasa`);
    if (num(dm) && Math.abs(dm) >= 0.05) parts.push(`${dm > 0 ? 'ganaste' : 'perdiste'} ${kg(dm)} de músculo`);
    if (parts.length) s += `: ${parts.join(' y ')}`;
    out.push(s + '.');
  }
  const dfp = d('fatPct'), dmp = d('musclePct');
  if (num(dfp) && Math.abs(dfp) >= 0.05) out.push(`Tu porcentaje de grasa ${dfp < 0 ? 'bajó' : 'subió'} ${fmt(Math.abs(dfp), 1)} puntos (de ${fmt(base.fatPct)}% a ${fmt(cur.fatPct)}%).`);
  if (num(dmp) && Math.abs(dmp) >= 0.05) out.push(`Tu porcentaje de músculo ${dmp > 0 ? 'subió' : 'bajó'} ${fmt(Math.abs(dmp), 1)} puntos (de ${fmt(base.musclePct)}% a ${fmt(cur.musclePct)}%).`);
  const dw2 = d('waist');
  if (num(dw2) && Math.abs(dw2) >= 0.1) out.push(`Tu cintura ${dw2 < 0 ? 'bajó' : 'subió'} ${fmt(Math.abs(dw2), 1)} cm (de ${fmt(base.waist)} a ${fmt(cur.waist)} cm).`);
  const dv = d('visceral');
  if (num(dv) && dv !== 0) out.push(`Tu grasa visceral ${dv < 0 ? 'bajó' : 'subió'} de nivel ${fmt(base.visceral, 0)} a ${fmt(cur.visceral, 0)}.`);
  const da = d('metabolicAge');
  if (num(da) && da !== 0) out.push(`Tu edad metabólica ${da < 0 ? 'bajó' : 'subió'} ${fmt(Math.abs(da), 0)} año${Math.abs(da) === 1 ? '' : 's'}.`);
  return out;
}

function drawChart(doc, x, y, w, h, title, pts, accent, dec) {
  doc.setDrawColor(...C.line); doc.setLineWidth(0.2);
  doc.setFillColor(252, 252, 253);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...C.text);
  doc.text(pdfTxt(title), x + 3, y + 5);
  const px = x + 10, py = y + 11, pw = w - 15, ph = h - 19;
  let lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v));
  const pad = Math.max((hi - lo) * 0.2, 0.5);
  lo -= pad; hi += pad;
  const X = i => px + (pts.length === 1 ? pw / 2 : (i / (pts.length - 1)) * pw);
  const Y = v => py + ph - ((v - lo) / (hi - lo)) * ph;
  // grid
  doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.muted);
  for (let g = 0; g <= 3; g++) {
    const v = lo + (hi - lo) * g / 3, gy = Y(v);
    doc.setDrawColor(232, 235, 238); doc.line(px, gy, px + pw, gy);
    doc.text(fmt(v, 1), px - 1.2, gy + 1, { align: 'right' });
  }
  // área
  doc.setDrawColor(...accent); doc.setLineWidth(0.6);
  for (let i = 1; i < pts.length; i++) doc.line(X(i - 1), Y(pts[i - 1].v), X(i), Y(pts[i].v));
  pts.forEach((p, i) => {
    doc.setFillColor(255, 255, 255); doc.circle(X(i), Y(p.v), 0.9, 'FD');
  });
  // etiquetas
  doc.setTextColor(...C.text); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.2);
  const lab = (i) => doc.text(fmt(pts[i].v, dec), X(i), Y(pts[i].v) - 1.8, { align: 'center' });
  lab(0); if (pts.length > 1) lab(pts.length - 1);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(...C.muted);
  const short = iso => fmtDate(iso, { day: '2-digit', month: 'short' });
  doc.text(short(pts[0].d), X(0), y + h - 3, { align: 'left' });
  if (pts.length > 1) doc.text(short(pts[pts.length - 1].d), X(pts.length - 1), y + h - 3, { align: 'right' });
}

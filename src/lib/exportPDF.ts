import jsPDF from "jspdf";
import type { KPIResult, HourlyRow, HeatmapRow, ZoneBreakdownRow, ChannelBreakdownRow, GenderRow, AgeRow } from "./types";

const TEAL: [number, number, number] = [45, 212, 191];
const DARK: [number, number, number] = [11, 18, 34];
const LIGHT_BG: [number, number, number] = [248, 250, 252];
const MID_BG: [number, number, number] = [241, 245, 249];
const DOWS_ES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// ─── Layout helpers ────────────────────────────────────────────────────────────

function pageHeader(doc: jsPDF, title: string, period: string) {
  doc.setFillColor(...DARK);
  doc.rect(0, 0, 210, 16, "F");
  doc.setFillColor(...TEAL);
  doc.rect(0, 13, 210, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("VISION NODE", 14, 9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Pixel Civik Analytics Platform", 50, 9);
  doc.setTextColor(...TEAL);
  doc.text(period, 210 - 14, 9, { align: "right" });
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7.5);
  doc.text(title, 210 - 14, 14.5, { align: "right" });
  doc.setTextColor(0, 0, 0);
}

function sectionTitle(doc: jsPDF, text: string, y: number): number {
  doc.setFillColor(...TEAL);
  doc.rect(14, y, 3, 6, "F");
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text(text, 20, y + 4.5);
  doc.setTextColor(0, 0, 0);
  return y + 12;
}

function pdfTable(
  doc: jsPDF,
  headers: string[],
  rows: (string | number)[][],
  y: number,
  colWidths: number[],
  alignRight: boolean[] = [],
  pageTitle = "",
  period = "",
): number {
  const startX = 14;
  const rowH = 7;
  const totalW = colWidths.reduce((a, b) => a + b, 0);

  doc.setFillColor(...DARK);
  doc.rect(startX, y, totalW, rowH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  let cx = startX + 3;
  headers.forEach((h, i) => {
    doc.text(h, alignRight[i] ? cx + colWidths[i] - 6 : cx, y + 4.8, {
      align: alignRight[i] ? "right" : "left",
    });
    cx += colWidths[i];
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  let ry = y + rowH;

  rows.forEach((row, ri) => {
    if (ry > 272) {
      doc.addPage();
      pageHeader(doc, pageTitle, period);
      ry = 28;
      doc.setFillColor(...DARK);
      doc.rect(startX, ry, totalW, rowH, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      cx = startX + 3;
      headers.forEach((h, i) => {
        doc.text(h, alignRight[i] ? cx + colWidths[i] - 6 : cx, ry + 4.8, {
          align: alignRight[i] ? "right" : "left",
        });
        cx += colWidths[i];
      });
      ry += rowH;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
    }
    doc.setFillColor(...(ri % 2 === 0 ? LIGHT_BG : ([255, 255, 255] as [number, number, number])));
    doc.rect(startX, ry, totalW, rowH, "F");
    doc.setTextColor(51, 65, 85);
    cx = startX + 3;
    row.forEach((cell, i) => {
      doc.text(String(cell), alignRight[i] ? cx + colWidths[i] - 6 : cx, ry + 4.8, {
        align: alignRight[i] ? "right" : "left",
      });
      cx += colWidths[i];
    });
    ry += rowH;
  });

  doc.setTextColor(0, 0, 0);
  return ry + 5;
}

function kpiBox(doc: jsPDF, label: string, value: string, x: number, y: number, w: number) {
  doc.setFillColor(...MID_BG);
  doc.roundedRect(x, y, w, 18, 2, 2, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(label, x + w / 2, y + 6, { align: "center" });
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text(value, x + w / 2, y + 14, { align: "center" });
  doc.setTextColor(0, 0, 0);
}

// ─── Data builders ─────────────────────────────────────────────────────────────

function buildHourlyRows(hourly: HourlyRow[]) {
  const map = new Map<number, { enters: number; exits: number }>();
  for (let h = 7; h <= 22; h++) map.set(h, { enters: 0, exits: 0 });
  for (const r of hourly) {
    if (r.event_type !== "enter" && r.event_type !== "exit") continue;
    const cur = map.get(r.hour) ?? { enters: 0, exits: 0 };
    if (r.event_type === "enter") cur.enters += r.count;
    else cur.exits += r.count;
    map.set(r.hour, cur);
  }
  const rows = Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hour, d]) => ({ hour, enters: d.enters, exits: d.exits, net: d.enters - d.exits }))
    .filter((d) => d.enters > 0 || d.exits > 0);
  const totalEnters = rows.reduce((s, r) => s + r.enters, 0);
  return { rows, totalEnters };
}

function buildPeakRows(hourly: HourlyRow[], top = 8) {
  const map = new Map<number, number>();
  for (const r of hourly) {
    if (r.event_type !== "enter") continue;
    map.set(r.hour, (map.get(r.hour) ?? 0) + r.count);
  }
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([hour, count], i) => [
      `#${i + 1}`,
      `${hour}:00 h`,
      count.toLocaleString("es-PE"),
      total > 0 ? `${((count / total) * 100).toFixed(1)}%` : "0%",
    ]);
}

function buildDOWRows(heatmap: HeatmapRow[]) {
  const map = new Map<number, number>();
  for (const r of heatmap) {
    map.set(r.dow, (map.get(r.dow) ?? 0) + r.count);
  }
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
  return DOWS_ES.map((name, i) => {
    const count = map.get(i) ?? 0;
    return [
      name,
      count.toLocaleString("es-PE"),
      total > 0 ? `${((count / total) * 100).toFixed(1)}%` : "0%",
    ];
  });
}

function buildBandsRows(hourly: HourlyRow[]) {
  const bands = { morning: 0, afternoon: 0, evening: 0 };
  for (const r of hourly) {
    if (r.event_type !== "enter") continue;
    if (r.hour >= 7 && r.hour <= 11) bands.morning += r.count;
    else if (r.hour >= 12 && r.hour <= 17) bands.afternoon += r.count;
    else if (r.hour >= 18 && r.hour <= 22) bands.evening += r.count;
  }
  const total = bands.morning + bands.afternoon + bands.evening;
  return [
    ["Mañana (7h – 11h)", bands.morning.toLocaleString("es-PE"), total > 0 ? `${((bands.morning / total) * 100).toFixed(1)}%` : "0%", bands.morning > 0 ? "☀" : "—"],
    ["Tarde (12h – 17h)", bands.afternoon.toLocaleString("es-PE"), total > 0 ? `${((bands.afternoon / total) * 100).toFixed(1)}%` : "0%", bands.afternoon > 0 ? "◑" : "—"],
    ["Noche (18h – 22h)", bands.evening.toLocaleString("es-PE"), total > 0 ? `${((bands.evening / total) * 100).toFixed(1)}%` : "0%", bands.evening > 0 ? "●" : "—"],
  ];
}

// ─── Main export function ──────────────────────────────────────────────────────

export type PDFInclude = {
  kpi?: boolean;
  hourly?: boolean;
  peak_hours?: boolean;
  dow?: boolean;
  bands?: boolean;
  gender_age?: boolean;
  zones?: boolean;
  channels?: boolean;
};

export function exportPDF(opts: {
  title: string;
  subtitle: string;
  startTs: string;
  endTs: string;
  kpis?: KPIResult | null;
  hourly?: HourlyRow[];
  heatmap?: HeatmapRow[];
  zones?: ZoneBreakdownRow[];
  channels?: ChannelBreakdownRow[];
  gender?: GenderRow[];
  age?: AgeRow[];
  include?: PDFInclude;
  sections?: { title: string; rows: [string, string][] }[];
  chartImages?: { label: string; dataUrl: string }[];
}) {
  const inc: PDFInclude = {
    kpi: true,
    hourly: true,
    peak_hours: true,
    dow: true,
    bands: true,
    gender_age: true,
    zones: true,
    channels: true,
    ...opts.include,
  };

  const doc = new jsPDF();
  const period = `${opts.startTs.slice(0, 10)} → ${opts.endTs.slice(0, 10)}`;
  let y = 24;

  function newPage() {
    doc.addPage();
    pageHeader(doc, opts.title, period);
    y = 28;
  }

  function ensureSpace(needed: number) {
    if (y + needed > 272) newPage();
  }

  // ── Header ──
  pageHeader(doc, opts.title, period);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text(opts.title, 14, y);
  y += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(opts.subtitle, 14, y);
  y += 5;
  doc.setFontSize(8);
  doc.text(`Generado: ${new Date().toLocaleString("es-PE")}  ·  Período: ${period}`, 14, y);
  y += 10;
  doc.setTextColor(0, 0, 0);

  // ── KPI boxes ──
  if (inc.kpi && opts.kpis) {
    const k = opts.kpis;
    const d = Math.max(1, k.days);
    const exitRate = k.enters > 0 ? `${((k.exits / k.enters) * 100).toFixed(1)}%` : "—";
    const boxes: [string, string][] = [
      ["Entradas totales", k.enters.toLocaleString("es-PE")],
      ["Salidas totales", k.exits.toLocaleString("es-PE")],
      ["Flujo neto", `${k.net >= 0 ? "+" : ""}${k.net.toLocaleString("es-PE")}`],
      ["Ent/día (prom.)", (k.enters / d).toFixed(1)],
      ["Días analizados", k.days.toString()],
      ["Tasa de salida", exitRate],
    ];
    const bw = (210 - 28 - 10) / 3;
    boxes.forEach(([label, val], i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      kpiBox(doc, label, val, 14 + col * (bw + 5), y + row * 22, bw);
    });
    y += 2 * 22 + 10;
  }

  // ── Hourly breakdown ──
  if (inc.hourly && opts.hourly && opts.hourly.length > 0) {
    ensureSpace(50);
    y = sectionTitle(doc, "Tráfico detallado por hora", y);
    const { rows: hRows, totalEnters } = buildHourlyRows(opts.hourly);
    if (hRows.length > 0) {
      const peakH = hRows.reduce((b, r) => (r.enters > b.enters ? r : b), hRows[0]);
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Hora pico de entradas: ${peakH.hour}:00 h (${peakH.enters.toLocaleString("es-PE")} entradas, ${totalEnters > 0 ? ((peakH.enters / totalEnters) * 100).toFixed(1) : 0}% del total)`,
        14,
        y - 4,
      );
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      y = pdfTable(
        doc,
        ["Hora", "Entradas", "Salidas", "Neto", "% Entradas"],
        hRows.map((r) => [
          `${r.hour}:00 h`,
          r.enters.toLocaleString("es-PE"),
          r.exits.toLocaleString("es-PE"),
          r.net >= 0 ? `+${r.net}` : r.net,
          totalEnters > 0 ? `${((r.enters / totalEnters) * 100).toFixed(1)}%` : "0%",
        ]),
        y,
        [30, 38, 38, 36, 40],
        [false, true, true, true, true],
        opts.title,
        period,
      );
    }
  }

  // ── Peak hours ──
  if (inc.peak_hours && opts.hourly && opts.hourly.length > 0) {
    ensureSpace(80);
    y = sectionTitle(doc, "Ranking de horas pico", y);
    const peakRows = buildPeakRows(opts.hourly, 8);
    y = pdfTable(
      doc,
      ["Ranking", "Hora", "Entradas", "% del total"],
      peakRows,
      y,
      [28, 40, 50, 64],
      [false, false, true, true],
      opts.title,
      period,
    );
  }

  // ── Day of week ──
  if (inc.dow && opts.heatmap && opts.heatmap.length > 0) {
    ensureSpace(80);
    y = sectionTitle(doc, "Distribución por día de semana", y);
    y = pdfTable(
      doc,
      ["Día", "Eventos totales", "% del período"],
      buildDOWRows(opts.heatmap),
      y,
      [70, 60, 52],
      [false, true, true],
      opts.title,
      period,
    );
  }

  // ── Franjas horarias ──
  if (inc.bands && opts.hourly && opts.hourly.length > 0) {
    ensureSpace(60);
    y = sectionTitle(doc, "Distribución por franja horaria", y);
    y = pdfTable(
      doc,
      ["Franja", "Entradas", "% del total", ""],
      buildBandsRows(opts.hourly),
      y,
      [70, 42, 42, 28],
      [false, true, true, true],
      opts.title,
      period,
    );
  }

  // ── Gender / Age ──
  if (inc.gender_age) {
    if (opts.gender && opts.gender.length > 0) {
      ensureSpace(60);
      y = sectionTitle(doc, "Distribución por género", y);
      const gTotal = opts.gender.reduce((s, g) => s + g.count, 0);
      y = pdfTable(
        doc,
        ["Género", "Cantidad", "% del total"],
        opts.gender.map((g) => [
          g.gender === "male" ? "Hombre" : g.gender === "female" ? "Mujer" : g.gender,
          g.count.toLocaleString("es-PE"),
          gTotal > 0 ? `${((g.count / gTotal) * 100).toFixed(1)}%` : "—",
        ]),
        y,
        [70, 60, 52],
        [false, true, true],
        opts.title,
        period,
      );
    }
    if (opts.age && opts.age.length > 0) {
      ensureSpace(80);
      y = sectionTitle(doc, "Distribución por grupo de edad", y);
      const aTotal = opts.age.reduce((s, a) => s + a.count, 0);
      y = pdfTable(
        doc,
        ["Grupo de edad", "Cantidad", "% del total"],
        opts.age.slice(0, 8).map((a) => [
          a.age,
          a.count.toLocaleString("es-PE"),
          aTotal > 0 ? `${((a.count / aTotal) * 100).toFixed(1)}%` : "—",
        ]),
        y,
        [70, 60, 52],
        [false, true, true],
        opts.title,
        period,
      );
    }
  }

  // ── Zone breakdown ──
  if (inc.zones && opts.zones && opts.zones.length > 0) {
    ensureSpace(60);
    y = sectionTitle(doc, "Desglose por zona", y);
    const zMap = new Map<string, { enters: number; exits: number }>();
    for (const r of opts.zones) {
      if (!["enter", "exit"].includes(r.event_type)) continue;
      const cur = zMap.get(r.zone) ?? { enters: 0, exits: 0 };
      if (r.event_type === "enter") cur.enters += r.count;
      else cur.exits += r.count;
      zMap.set(r.zone, cur);
    }
    const zTotal = Array.from(zMap.values()).reduce((s, d) => s + d.enters, 0);
    y = pdfTable(
      doc,
      ["Zona", "Entradas", "Salidas", "Neto", "% Ent."],
      Array.from(zMap.entries())
        .sort((a, b) => b[1].enters - a[1].enters)
        .map(([zone, d]) => [
          zone,
          d.enters.toLocaleString("es-PE"),
          d.exits.toLocaleString("es-PE"),
          d.enters - d.exits,
          zTotal > 0 ? `${((d.enters / zTotal) * 100).toFixed(1)}%` : "0%",
        ]),
      y,
      [62, 34, 34, 28, 24],
      [false, true, true, true, true],
      opts.title,
      period,
    );
  }

  // ── Channel breakdown ──
  if (inc.channels && opts.channels && opts.channels.length > 0) {
    ensureSpace(60);
    y = sectionTitle(doc, "Desglose por cámara", y);
    const cMap = new Map<string, { enters: number; exits: number }>();
    for (const r of opts.channels) {
      if (!["enter", "exit"].includes(r.event_type)) continue;
      const cur = cMap.get(r.channel) ?? { enters: 0, exits: 0 };
      if (r.event_type === "enter") cur.enters += r.count;
      else cur.exits += r.count;
      cMap.set(r.channel, cur);
    }
    const cTotal = Array.from(cMap.values()).reduce((s, d) => s + d.enters, 0);
    y = pdfTable(
      doc,
      ["Cámara", "Entradas", "Salidas", "Neto", "% Ent."],
      Array.from(cMap.entries())
        .sort((a, b) => b[1].enters - a[1].enters)
        .map(([ch, d]) => [
          ch,
          d.enters.toLocaleString("es-PE"),
          d.exits.toLocaleString("es-PE"),
          d.enters - d.exits,
          cTotal > 0 ? `${((d.enters / cTotal) * 100).toFixed(1)}%` : "0%",
        ]),
      y,
      [62, 34, 34, 28, 24],
      [false, true, true, true, true],
      opts.title,
      period,
    );
  }

  // ── Custom extra sections ──
  for (const section of opts.sections ?? []) {
    ensureSpace(50);
    y = sectionTitle(doc, section.title, y);
    y = pdfTable(
      doc,
      ["Descripción", "Valor"],
      section.rows,
      y,
      [130, 52],
      [false, true],
      opts.title,
      period,
    );
  }

  // ── Chart images (captured via html2canvas) ──
  if (opts.chartImages && opts.chartImages.length > 0) {
    newPage();
    y = sectionTitle(doc, "Gráficos del período", y);
    for (const { label, dataUrl } of opts.chartImages) {
      const imgW = 182;
      // Estimate height from aspect ratio — decode from base64 if needed; use safe default
      const imgH = 80; // fixed height per chart in PDF
      ensureSpace(imgH + 16);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text(label, 14, y);
      y += 5;
      doc.addImage(dataUrl, "PNG", 14, y, imgW, imgH);
      y += imgH + 10;
    }
  }

  // ── Footer ──
  const pageCount = (doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFillColor(...MID_BG);
    doc.rect(0, 285, 210, 12, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text("Pixel Civik Analytics — Vision Node  ·  Confidencial", 14, 291);
    doc.text(`Pág. ${p} / ${pageCount}`, 210 - 14, 291, { align: "right" });
  }

  const fname = `vision_node_${opts.title.toLowerCase().replace(/\s+/g, "_")}_${opts.startTs.slice(0, 10)}.pdf`;
  doc.save(fname);
}

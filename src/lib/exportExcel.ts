import type { KPIResult, HourlyRow, HeatmapRow, ZoneBreakdownRow, ChannelBreakdownRow, DailyRow } from "./types";

const DOWS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// ── Colors ─────────────────────────────────────────────────────────────────────
const C_DARK   = "FF0B1222";
const C_TEAL   = "FF2DD4BF";
const C_WHITE  = "FFFFFFFF";
const C_GRAY   = "FFF8FAFC";
const C_BORDER = "FFE2E8F0";
const C_TEXT   = "FF334155";

export interface ExcelReporteInclude {
  kpi?: boolean;
  daily?: boolean;
  hourly?: boolean;
  peak_hours?: boolean;
  dow?: boolean;
  bands?: boolean;
  zones?: boolean;
  channels?: boolean;
}

type CellValue = string | number;

async function buildWorkbook(
  sheets: { name: string; headers: string[]; rows: CellValue[][]; colWidths: number[] }[],
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vision Node · Pixel Civik";
  wb.created = new Date();

  for (const { name, headers, rows, colWidths } of sheets) {
    const ws = wb.addWorksheet(name, {
      pageSetup: { fitToPage: true, fitToWidth: 1 },
    });

    // Column widths
    ws.columns = colWidths.map((w) => ({ width: w }));

    // ── Header row ──────────────────────────────────────────────────────────
    const hRow = ws.addRow(headers);
    hRow.height = 24;
    hRow.eachCell((cell, col) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: col === 1 ? C_TEAL : C_DARK },
      };
      cell.font = {
        bold: true,
        color: { argb: col === 1 ? C_DARK : C_WHITE },
        size: 10,
        name: "Calibri",
      };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
      cell.border = {
        bottom: { style: "medium", color: { argb: C_TEAL } },
      };
    });

    // ── Data rows ───────────────────────────────────────────────────────────
    rows.forEach((row, ri) => {
      const dRow = ws.addRow(row);
      dRow.height = 18;
      dRow.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: ri % 2 === 0 ? C_GRAY : C_WHITE },
        };
        cell.font = { size: 10, name: "Calibri", color: { argb: C_TEXT } };
        cell.alignment = {
          vertical: "middle",
          horizontal: col === 1 ? "left" : "right",
        };
        cell.border = {
          top:    { style: "thin", color: { argb: C_BORDER } },
          bottom: { style: "thin", color: { argb: C_BORDER } },
          left:   { style: "thin", color: { argb: C_BORDER } },
          right:  { style: "thin", color: { argb: C_BORDER } },
        };
      });
    });

    // Freeze header
    ws.views = [{ state: "frozen", ySplit: 1, activeCell: "A2" }];
  }

  return wb;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function download(buffer: any, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── Public export function ─────────────────────────────────────────────────────
export async function exportExcelReporte(params: {
  kpis: KPIResult | null;
  daily?: DailyRow[];
  hourly: HourlyRow[];
  heatmap: HeatmapRow[];
  zones: ZoneBreakdownRow[];
  channels: ChannelBreakdownRow[];
  startTs: string;
  endTs: string;
  include: ExcelReporteInclude;
}) {
  const { kpis, daily, hourly, heatmap, zones, channels, startTs, endTs, include: inc } = params;
  const sheets: Parameters<typeof buildWorkbook>[0] = [];

  // ── KPI summary ──────────────────────────────────────────────────────────────
  if (inc.kpi && kpis) {
    const d = Math.max(1, kpis.days);
    const exitRate = kpis.enters > 0 ? ((kpis.exits / kpis.enters) * 100).toFixed(1) + "%" : "—";
    sheets.push({
      name: "Resumen KPI",
      headers: ["Parámetro", "Valor"],
      colWidths: [32, 20],
      rows: [
        ["Período inicio",         startTs.slice(0, 10)],
        ["Período fin",            endTs.slice(0, 10)],
        ["Días analizados",        kpis.days],
        ["Entradas (total)",       kpis.enters],
        ["Entradas / día",         Number((kpis.enters / d).toFixed(1))],
        ["Salidas (total)",        kpis.exits],
        ["Salidas / día",          Number((kpis.exits / d).toFixed(1))],
        ["Neto (total)",           kpis.net],
        ["Neto / día",             Number((kpis.net / d).toFixed(1))],
        ["Tasa captura salidas",   exitRate],
        ["Tracks únicos",          kpis.unique_tracks ?? "—"],
      ],
    });
  }

  // ── Daily breakdown ──────────────────────────────────────────────────────────
  if (inc.daily && daily?.length) {
    const totalE = daily.reduce((s, r) => s + r.enters, 0);
    sheets.push({
      name: "Por Día",
      headers: ["Fecha", "Entradas", "Salidas", "Neto", "Entradas %"],
      colWidths: [16, 14, 14, 14, 14],
      rows: daily.map((r) => [
        r.date,
        r.enters,
        r.exits,
        r.enters - r.exits,
        totalE > 0 ? ((r.enters / totalE) * 100).toFixed(1) + "%" : "0%",
      ]),
    });
  }

  // ── Hourly enter / exit ──────────────────────────────────────────────────────
  if (inc.hourly) {
    const map = new Map<number, { enters: number; exits: number }>();
    for (let h = 7; h <= 22; h++) map.set(h, { enters: 0, exits: 0 });
    for (const r of hourly) {
      if (r.event_type !== "enter" && r.event_type !== "exit") continue;
      const cur = map.get(r.hour) ?? { enters: 0, exits: 0 };
      if (r.event_type === "enter") cur.enters += r.count; else cur.exits += r.count;
      map.set(r.hour, cur);
    }
    const totalE = Array.from(map.values()).reduce((s, v) => s + v.enters, 0);
    sheets.push({
      name: "Por Hora",
      headers: ["Hora", "Entradas", "Salidas", "Neto", "Entradas %"],
      colWidths: [12, 14, 14, 14, 14],
      rows: Array.from(map.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([h, v]) => [
          `${h}:00`,
          v.enters,
          v.exits,
          v.enters - v.exits,
          totalE > 0 ? ((v.enters / totalE) * 100).toFixed(1) + "%" : "0%",
        ]),
    });
  }

  // ── Peak hours ───────────────────────────────────────────────────────────────
  if (inc.peak_hours) {
    const map = new Map<number, number>();
    for (const r of hourly) {
      if (r.event_type !== "enter") continue;
      map.set(r.hour, (map.get(r.hour) ?? 0) + r.count);
    }
    const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
    sheets.push({
      name: "Horas Pico",
      headers: ["Posición", "Hora", "Entradas", "Participación %"],
      colWidths: [14, 12, 14, 18],
      rows: Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([h, count], i) => [
          `#${i + 1}`,
          `${h}:00`,
          count,
          total > 0 ? ((count / total) * 100).toFixed(1) + "%" : "0%",
        ]),
    });
  }

  // ── Day of week ──────────────────────────────────────────────────────────────
  if (inc.dow) {
    const map = new Map<number, number>();
    for (const r of heatmap) map.set(r.dow, (map.get(r.dow) ?? 0) + r.count);
    const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
    sheets.push({
      name: "Día de Semana",
      headers: ["Día", "Eventos", "Participación %"],
      colWidths: [18, 14, 18],
      rows: DOWS.map((name, i) => {
        const count = map.get(i) ?? 0;
        return [name, count, total > 0 ? ((count / total) * 100).toFixed(1) + "%" : "0%"];
      }),
    });
  }

  // ── Time bands ───────────────────────────────────────────────────────────────
  if (inc.bands) {
    const b = { morning: 0, afternoon: 0, evening: 0 };
    for (const r of hourly) {
      if (r.event_type !== "enter") continue;
      if (r.hour >= 7  && r.hour <= 11) b.morning += r.count;
      else if (r.hour >= 12 && r.hour <= 17) b.afternoon += r.count;
      else if (r.hour >= 18 && r.hour <= 22) b.evening += r.count;
    }
    const total = b.morning + b.afternoon + b.evening;
    const pct = (v: number) => (total > 0 ? ((v / total) * 100).toFixed(1) + "%" : "0%");
    sheets.push({
      name: "Franjas Horarias",
      headers: ["Franja", "Entradas", "Participación %"],
      colWidths: [22, 14, 18],
      rows: [
        ["Mañana  (7h – 11h)",  b.morning,   pct(b.morning)],
        ["Tarde   (12h – 17h)", b.afternoon, pct(b.afternoon)],
        ["Noche   (18h – 22h)", b.evening,   pct(b.evening)],
      ],
    });
  }

  // ── Zone breakdown ───────────────────────────────────────────────────────────
  if (inc.zones && zones.length) {
    const map = new Map<string, { enters: number; exits: number }>();
    for (const r of zones) {
      if (r.event_type !== "enter" && r.event_type !== "exit") continue;
      const cur = map.get(r.zone) ?? { enters: 0, exits: 0 };
      if (r.event_type === "enter") cur.enters += r.count; else cur.exits += r.count;
      map.set(r.zone, cur);
    }
    const totalE = Array.from(map.values()).reduce((s, v) => s + v.enters, 0);
    sheets.push({
      name: "Por Zona",
      headers: ["Zona", "Entradas", "Salidas", "Neto", "Entradas %"],
      colWidths: [28, 14, 14, 14, 14],
      rows: Array.from(map.entries())
        .sort((a, b) => b[1].enters - a[1].enters)
        .map(([zone, v]) => [
          zone,
          v.enters,
          v.exits,
          v.enters - v.exits,
          totalE > 0 ? ((v.enters / totalE) * 100).toFixed(1) + "%" : "0%",
        ]),
    });
  }

  // ── Channel breakdown ────────────────────────────────────────────────────────
  if (inc.channels && channels.length) {
    const map = new Map<string, { enters: number; exits: number }>();
    for (const r of channels) {
      if (r.event_type !== "enter" && r.event_type !== "exit") continue;
      const cur = map.get(r.channel) ?? { enters: 0, exits: 0 };
      if (r.event_type === "enter") cur.enters += r.count; else cur.exits += r.count;
      map.set(r.channel, cur);
    }
    const totalE = Array.from(map.values()).reduce((s, v) => s + v.enters, 0);
    sheets.push({
      name: "Por Cámara",
      headers: ["Cámara", "Entradas", "Salidas", "Neto", "Entradas %"],
      colWidths: [28, 14, 14, 14, 14],
      rows: Array.from(map.entries())
        .sort((a, b) => b[1].enters - a[1].enters)
        .map(([ch, v]) => [
          ch,
          v.enters,
          v.exits,
          v.enters - v.exits,
          totalE > 0 ? ((v.enters / totalE) * 100).toFixed(1) + "%" : "0%",
        ]),
    });
  }

  if (sheets.length === 0) return;

  const wb = await buildWorkbook(sheets);
  const buffer = await wb.xlsx.writeBuffer();
  const fname = `reporte_${startTs.slice(0, 10)}_${endTs.slice(0, 10)}.xlsx`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  download(buffer as any, fname);
}

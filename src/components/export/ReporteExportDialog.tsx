"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, BarChart2, Table2, Loader2 } from "lucide-react";
import type { KPIResult, HourlyRow, HeatmapRow, ZoneBreakdownRow, ChannelBreakdownRow } from "@/lib/types";
import { exportPDF } from "@/lib/exportPDF";

// ── Chart definitions (must match the `id` on chart wrapper divs in the page) ──
const CHART_OPTIONS = [
  { id: "export-chart-combined",   label: "Tráfico combinado por hora",          desc: "Barras entradas/salidas + líneas visitantes/pasantes" },
  { id: "export-chart-funnel",     label: "Embudo de conversión",                desc: "Pasantes → Visitantes → Entradas con porcentajes" },
  { id: "export-chart-conversion", label: "Conversión por hora",                 desc: "% de pasantes que ingresaron, hora a hora" },
  { id: "export-chart-period",     label: "Distribución por franja horaria",     desc: "Mañana / Tarde / Noche como % de entradas" },
  { id: "export-chart-dow",        label: "Tráfico por día de semana",           desc: "Lun–Dom: qué día concentra más eventos" },
  { id: "export-chart-heatmap",    label: "Mapa de calor hora × día",            desc: "Intensidad de tráfico en la semana" },
  { id: "export-chart-behavior",   label: "Entradas y salidas por hora",         desc: "Gráfico de barras + línea de tendencia" },
  { id: "export-chart-opportunity", label: "Zona de oportunidad de captación",    desc: "Horas con alto tráfico de pasantes y baja conversión" },
];

// ── Table definitions ──
const TABLE_OPTIONS = [
  { id: "kpi",        label: "Resumen ejecutivo (KPIs)",           desc: "Entradas, salidas, neto, promedios, tasa de salida" },
  { id: "hourly",     label: "Tabla detallada por hora",           desc: "Entradas, salidas, neto y % por cada hora del día" },
  { id: "peak_hours", label: "Ranking horas pico",                 desc: "Top 8 horas con mayor volumen de entradas" },
  { id: "dow",        label: "Tabla día de semana",                desc: "Eventos totales por día con % sobre el período" },
  { id: "bands",      label: "Tabla franjas horarias",             desc: "Mañana / Tarde / Noche con entradas absolutas y %" },
  { id: "zones",      label: "Desglose por zona",                  desc: "Entradas, salidas, neto y % por zona de detección" },
  { id: "channels",   label: "Desglose por cámara",               desc: "Entradas, salidas, neto y % por cámara" },
];

interface Props {
  kpis: KPIResult | null;
  hourly: HourlyRow[];
  heatmap: HeatmapRow[];
  zones: ZoneBreakdownRow[];
  channels: ChannelBreakdownRow[];
  startTs: string;
  endTs: string;
}

async function captureElement(id: string): Promise<string | null> {
  const el = document.getElementById(id);
  if (!el) return null;
  try {
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(el, {
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true,
    } as Parameters<typeof html2canvas>[1]);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export function ReporteExportDialog({ kpis, hourly, heatmap, zones, channels, startTs, endTs }: Props) {
  const [open, setOpen] = useState(false);
  const [selCharts, setSelCharts] = useState<Set<string>>(
    new Set(["export-chart-combined", "export-chart-funnel", "export-chart-dow"]),
  );
  const [selTables, setSelTables] = useState<Set<string>>(
    new Set(["kpi", "hourly", "peak_hours"]),
  );
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useState<"graficos" | "tablas">("graficos");

  function toggleChart(id: string) {
    setSelCharts((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleTable(id: string) {
    setSelTables((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      // Capture selected charts
      const chartImages: { label: string; dataUrl: string }[] = [];
      for (const chartId of CHART_OPTIONS.filter((c) => selCharts.has(c.id))) {
        const dataUrl = await captureElement(chartId.id);
        if (dataUrl) chartImages.push({ label: chartId.label, dataUrl });
      }

      // Build include flags for tables
      const inc = Object.fromEntries(TABLE_OPTIONS.map((t) => [t.id, selTables.has(t.id)])) as Record<string, boolean>;

      exportPDF({
        title: "Reporte de Tráfico",
        subtitle: "Análisis completo del período — Pixel Civik Vision Node",
        startTs,
        endTs,
        kpis,
        hourly: (inc.hourly || inc.peak_hours || inc.bands) ? hourly : undefined,
        heatmap: inc.dow ? heatmap : undefined,
        zones: inc.zones ? zones : undefined,
        channels: inc.channels ? channels : undefined,
        include: {
          kpi: inc.kpi,
          hourly: inc.hourly,
          peak_hours: inc.peak_hours,
          dow: inc.dow,
          bands: inc.bands,
          zones: inc.zones,
          channels: inc.channels,
        },
        chartImages,
      });

      setOpen(false);
    } finally {
      setGenerating(false);
    }
  }

  const total = selCharts.size + selTables.size;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
        <Download size={14} />
        Exportar reporte
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">Exportar reporte PDF</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500 -mt-1">
          Período: <span className="font-medium text-slate-700">{startTs.slice(0, 10)}</span>
          {" → "}
          <span className="font-medium text-slate-700">{endTs.slice(0, 10)}</span>
        </p>

        {/* Tab switcher */}
        <div className="flex gap-1 border-b border-slate-100 -mx-1">
          {(["graficos", "tablas"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                tab === t
                  ? "border-[#2DD4BF] text-[#2DD4BF]"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t === "graficos" ? <><BarChart2 size={14} /> Gráficos ({selCharts.size})</> : <><Table2 size={14} /> Tablas ({selTables.size})</>}
            </button>
          ))}
        </div>

        {/* Charts panel */}
        {tab === "graficos" && (
          <div className="space-y-1.5 max-h-[52vh] overflow-y-auto pr-0.5">
            <p className="text-[10px] text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
              Los gráficos se capturan tal como aparecen en la pantalla. Asegúrate de que estén visibles.
            </p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setSelCharts(new Set(CHART_OPTIONS.map(c => c.id)))} className="text-xs text-[#2DD4BF] hover:underline font-medium">Todos</button>
              <span className="text-slate-200">|</span>
              <button onClick={() => setSelCharts(new Set())} className="text-xs text-slate-400 hover:underline font-medium">Ninguno</button>
            </div>
            {CHART_OPTIONS.map(({ id, label, desc }) => {
              const checked = selCharts.has(id);
              return (
                <label
                  key={id}
                  className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                    checked ? "border-[#2DD4BF]/40 bg-[#2DD4BF]/5" : "border-slate-100 hover:bg-slate-50"
                  }`}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggleChart(id)} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 leading-tight">{label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {/* Tables panel */}
        {tab === "tablas" && (
          <div className="space-y-1.5 max-h-[52vh] overflow-y-auto pr-0.5">
            <div className="flex gap-2">
              <button onClick={() => setSelTables(new Set(TABLE_OPTIONS.map(t => t.id)))} className="text-xs text-[#2DD4BF] hover:underline font-medium">Todos</button>
              <span className="text-slate-200">|</span>
              <button onClick={() => setSelTables(new Set())} className="text-xs text-slate-400 hover:underline font-medium">Ninguno</button>
            </div>
            {TABLE_OPTIONS.map(({ id, label, desc }) => {
              const checked = selTables.has(id);
              return (
                <label
                  key={id}
                  className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                    checked ? "border-[#2DD4BF]/40 bg-[#2DD4BF]/5" : "border-slate-100 hover:bg-slate-50"
                  }`}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggleTable(id)} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-700 leading-tight">{label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            {total === 0 ? "Selecciona al menos un elemento" : `${selCharts.size} gráfico${selCharts.size !== 1 ? "s" : ""} · ${selTables.size} tabla${selTables.size !== 1 ? "s" : ""}`}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={generating}>Cancelar</Button>
            <Button
              size="sm"
              className="gap-1.5 bg-[#2DD4BF] hover:bg-[#14B8A6] text-white border-0 min-w-[130px]"
              onClick={handleGenerate}
              disabled={total === 0 || generating}
            >
              {generating ? (
                <><Loader2 size={13} className="animate-spin" /> Generando...</>
              ) : (
                <><Download size={13} /> Generar PDF</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

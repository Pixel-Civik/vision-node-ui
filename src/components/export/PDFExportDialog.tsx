"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText } from "lucide-react";
import type {
  KPIResult, HourlyRow, HeatmapRow,
  ZoneBreakdownRow, ChannelBreakdownRow,
  GenderRow, AgeRow, DashboardFilters,
} from "@/lib/types";
import { exportPDF, type PDFInclude } from "@/lib/exportPDF";

const SECTION_GROUPS: {
  group: string;
  items: { id: keyof PDFInclude; label: string; desc: string; default: boolean }[];
}[] = [
  {
    group: "Principales",
    items: [
      {
        id: "kpi",
        label: "Resumen ejecutivo",
        desc: "KPIs del período: entradas, salidas, neto, promedio/día y tasa de salida",
        default: true,
      },
      {
        id: "hourly",
        label: "Tabla detallada por hora",
        desc: "Entradas, salidas, flujo neto y % del total por cada hora del día (7h – 22h)",
        default: true,
      },
      {
        id: "peak_hours",
        label: "Ranking de horas pico",
        desc: "Top 8 horas con mayor afluencia: volumen y porcentaje sobre el total de entradas",
        default: true,
      },
    ],
  },
  {
    group: "Tendencias",
    items: [
      {
        id: "dow",
        label: "Distribución por día de semana",
        desc: "Eventos Lun–Dom con % sobre el período completo · identifica días de mayor tráfico",
        default: false,
      },
      {
        id: "bands",
        label: "Franjas horarias",
        desc: "Distribución Mañana / Tarde / Noche con entradas absolutas y porcentaje",
        default: false,
      },
    ],
  },
  {
    group: "Demográfico",
    items: [
      {
        id: "gender_age",
        label: "Género y grupo de edad",
        desc: "Distribución demográfica de personas que ingresaron al local en el período",
        default: false,
      },
    ],
  },
  {
    group: "Operacional",
    items: [
      {
        id: "zones",
        label: "Desglose por zona",
        desc: "Entradas, salidas, neto y % por zona de detección ordenadas por volumen",
        default: false,
      },
      {
        id: "channels",
        label: "Rendimiento por cámara",
        desc: "Entradas, salidas, neto y % por cada cámara/punto de seguimiento",
        default: false,
      },
    ],
  },
];

const ALL_IDS = SECTION_GROUPS.flatMap((g) => g.items.map((i) => i.id));
const DEFAULT_IDS = SECTION_GROUPS.flatMap((g) =>
  g.items.filter((i) => i.default).map((i) => i.id),
);

interface Props {
  kpis: KPIResult | null;
  hourly: HourlyRow[];
  heatmap: HeatmapRow[];
  zones: ZoneBreakdownRow[];
  channels: ChannelBreakdownRow[];
  gender: GenderRow[];
  age: AgeRow[];
  filters: DashboardFilters;
  title?: string;
  subtitle?: string;
}

export function PDFExportDialog({
  kpis, hourly, heatmap, zones, channels,
  gender, age, filters,
  title = "Entradas y Salidas",
  subtitle = "Análisis detallado de flujo de tráfico de personas",
}: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<keyof PDFInclude>>(new Set(DEFAULT_IDS));

  function toggle(id: keyof PDFInclude) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() { setSelected(new Set(ALL_IDS)); }
  function selectNone() { setSelected(new Set()); }

  function handleExport() {
    const inc = Object.fromEntries(ALL_IDS.map((id) => [id, selected.has(id)])) as PDFInclude;
    exportPDF({
      title,
      subtitle,
      startTs: filters.startTs,
      endTs: filters.endTs,
      kpis: kpis ?? undefined,
      hourly: (inc.hourly || inc.peak_hours || inc.bands) ? hourly : undefined,
      heatmap: inc.dow ? heatmap : undefined,
      zones: inc.zones ? zones : undefined,
      channels: inc.channels ? channels : undefined,
      gender: inc.gender_age ? gender : undefined,
      age: inc.gender_age ? age : undefined,
      include: inc,
    });
    setOpen(false);
  }

  const count = selected.size;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
        <FileText size={13} />
        PDF detallado
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Exportar reporte PDF</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500 -mt-1 mb-1">
          Período: <span className="font-medium text-slate-700">{filters.startTs.slice(0, 10)}</span>
          {" → "}
          <span className="font-medium text-slate-700">{filters.endTs.slice(0, 10)}</span>
          {"  ·  Selecciona las secciones a incluir"}
        </p>

        {/* Select all / none */}
        <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
          <button
            onClick={selectAll}
            className="text-xs text-[#2DD4BF] hover:text-[#14B8A6] font-medium transition-colors"
          >
            Seleccionar todo
          </button>
          <span className="text-slate-200">|</span>
          <button
            onClick={selectNone}
            className="text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors"
          >
            Limpiar selección
          </button>
          <span className="ml-auto text-xs text-slate-400">
            {count} sección{count !== 1 ? "es" : ""}
          </span>
        </div>

        {/* Sections list */}
        <div className="space-y-4 max-h-[52vh] overflow-y-auto pr-0.5">
          {SECTION_GROUPS.map(({ group, items }) => (
            <div key={group}>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2 px-1">
                {group}
              </p>
              <div className="space-y-1.5">
                {items.map(({ id, label, desc }) => {
                  const checked = selected.has(id);
                  return (
                    <label
                      key={id}
                      className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                        checked
                          ? "border-[#2DD4BF]/40 bg-[#2DD4BF]/5"
                          : "border-slate-100 hover:bg-slate-50"
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(id)}
                        className="mt-0.5 shrink-0"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-700 leading-tight">{label}</p>
                        <p className="text-xs text-slate-400 mt-0.5 leading-snug">{desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            {count === 0 ? "Sin secciones — elige al menos una" : `${count} sección${count !== 1 ? "es" : ""} seleccionada${count !== 1 ? "s" : ""}`}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-[#2DD4BF] hover:bg-[#14B8A6] text-white border-0"
              onClick={handleExport}
              disabled={count === 0}
            >
              <FileText size={13} />
              Generar PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

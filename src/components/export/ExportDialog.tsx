"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Download, FileText, Table2 } from "lucide-react";
import type { KPIResult, HourlyRow, ZoneBreakdownRow, ChannelBreakdownRow, ConversionHourRow, TIZKpiRow } from "@/lib/types";
import { exportPDF } from "@/lib/exportPDF";
import * as XLSX from "xlsx";

interface Props {
  kpis: KPIResult | null;
  hourly: HourlyRow[];
  zones: ZoneBreakdownRow[];
  channels?: ChannelBreakdownRow[];
  conversion: ConversionHourRow[];
  tiz: TIZKpiRow[];
  startTs: string;
  endTs: string;
}

function exportExcel(data: Props, sections: string[]) {
  const wb = XLSX.utils.book_new();

  if (data.kpis) {
    const d = data.kpis;
    const days = Math.max(1, d.days);
    const summary = [
      ["Parámetro", "Valor"],
      ["Período inicio", data.startTs],
      ["Período fin", data.endTs],
      ["Entradas (total)", d.enters],
      ["Entradas/día", (d.enters / days).toFixed(1)],
      ["Salidas (total)", d.exits],
      ["Salidas/día", (d.exits / days).toFixed(1)],
      ["Neto (total)", d.net],
      ["Días", d.days],
      ["Tasa salida %", d.enters > 0 ? ((d.exits / d.enters) * 100).toFixed(1) + "%" : "—"],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Resumen");
  }

  if (sections.includes("enter_exit")) {
    // Hourly pivot: one row per hour with enters, exits, net
    const hourMap = new Map<number, { enters: number; exits: number }>();
    for (const r of data.hourly) {
      if (!["enter", "exit"].includes(r.event_type)) continue;
      const cur = hourMap.get(r.hour) ?? { enters: 0, exits: 0 };
      if (r.event_type === "enter") cur.enters += r.count;
      else cur.exits += r.count;
      hourMap.set(r.hour, cur);
    }
    const hourly = Array.from(hourMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([h, d]) => ({ Hora: `${h}:00 h`, Entradas: d.enters, Salidas: d.exits, Neto: d.enters - d.exits }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hourly), "Por_Hora");

    // Zone pivot
    const zoneMap = new Map<string, { enters: number; exits: number }>();
    for (const r of data.zones) {
      if (!["enter", "exit"].includes(r.event_type)) continue;
      const cur = zoneMap.get(r.zone) ?? { enters: 0, exits: 0 };
      if (r.event_type === "enter") cur.enters += r.count;
      else cur.exits += r.count;
      zoneMap.set(r.zone, cur);
    }
    const byZone = Array.from(zoneMap.entries())
      .map(([z, d]) => ({ Zona: z, Entradas: d.enters, Salidas: d.exits, Neto: d.enters - d.exits }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byZone), "Por_Zona");

    // Channel pivot
    if (data.channels && data.channels.length > 0) {
      const chMap = new Map<string, { enters: number; exits: number }>();
      for (const r of data.channels) {
        if (!["enter", "exit"].includes(r.event_type)) continue;
        const cur = chMap.get(r.channel) ?? { enters: 0, exits: 0 };
        if (r.event_type === "enter") cur.enters += r.count;
        else cur.exits += r.count;
        chMap.set(r.channel, cur);
      }
      const byCam = Array.from(chMap.entries())
        .map(([c, d]) => ({ Camara: c, Entradas: d.enters, Salidas: d.exits, Neto: d.enters - d.exits }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byCam), "Por_Camara");
    }
  }

  if (sections.includes("conversion")) {
    const conv = data.conversion.map((r) => ({
      Hora: r.hour,
      Pasantes: r.pasantes,
      Ingresos: r.enters,
      Visitantes: r.visitors,
      "Conv_Enter_%": r.conv_enter_pct,
      "Conv_Visitor_%": r.conv_visitor_pct,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(conv), "Conversión_Por_Hora");
  }

  if (sections.includes("tiz") && data.tiz.length) {
    const tiz = data.tiz.map((r) => ({
      Zona: r.zone,
      Registros: r.count,
      Mediana_s: r.median_s,
      Promedio_s: r.avg_s,
      P90_s: r.p90_s,
      Mediana_min: (r.median_s / 60).toFixed(2),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tiz), "TIZ_Por_Zona");
  }

  const fname = `vision_node_${new Date().toISOString().slice(0, 16).replace(/[T:]/g, "_")}.xlsx`;
  XLSX.writeFile(wb, fname);
}

function Preview({ kpis }: { kpis: KPIResult | null }) {
  if (!kpis) return <p className="text-sm text-gray-400">Sin datos KPI.</p>;
  const d = Math.max(1, kpis.days);
  return (
    <table className="text-xs w-full border-collapse">
      <thead>
        <tr className="bg-gray-800 text-white">
          <th className="text-left px-3 py-2">Métrica</th>
          <th className="text-right px-3 py-2">Prom/día</th>
          <th className="text-right px-3 py-2">Total</th>
        </tr>
      </thead>
      <tbody>
        {[
          ["Entradas", (kpis.enters / d).toFixed(1), kpis.enters.toLocaleString()],
          ["Salidas", (kpis.exits / d).toFixed(1), kpis.exits.toLocaleString()],
          ["Neto", (kpis.net / d).toFixed(1), kpis.net.toLocaleString()],
          ["Días", "—", kpis.days.toString()],
        ].map(([m, avg, total], i) => (
          <tr key={m} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
            <td className="px-3 py-1.5 text-gray-700">{m}</td>
            <td className="px-3 py-1.5 text-right text-gray-600">{avg}</td>
            <td className="px-3 py-1.5 text-right font-medium text-gray-800">{total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ExportDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState(["enter_exit", "conversion", "tiz"]);
  const [tab, setTab] = useState<"opciones" | "preview">("opciones");

  const hasConv = props.conversion.length > 0;
  const hasTiz = props.tiz.length > 0;

  function toggleSection(s: string) {
    setSections((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
        <Download size={14} />
        Exportar reporte
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Exportar reporte</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 border-b border-gray-200 mb-4">
          {(["opciones", "preview"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm capitalize transition-colors ${
                tab === t
                  ? "border-b-2 border-blue-500 text-blue-600 font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "opciones" ? "Opciones" : "Vista previa"}
            </button>
          ))}
        </div>

        {tab === "opciones" && (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Secciones a incluir</p>
              <div className="space-y-2.5">
                {[
                  { id: "enter_exit", label: "Entradas y Salidas (por hora y zona)", always: true },
                  { id: "conversion", label: "Conversión Pasantes → Ingreso (por hora)", always: hasConv },
                  { id: "tiz", label: "Tiempo en Zona", always: hasTiz },
                ].map(({ id, label, always }) => (
                  <label key={id} className="flex items-center gap-2.5 cursor-pointer">
                    <Checkbox
                      checked={sections.includes(id)}
                      disabled={!always}
                      onCheckedChange={() => toggleSection(id)}
                    />
                    <span className={`text-sm ${!always ? "text-gray-400" : "text-gray-700"}`}>
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                className="flex-1 gap-1.5"
                onClick={() => { exportExcel(props, sections); setOpen(false); }}
                disabled={!sections.length}
              >
                <Table2 size={14} />
                Descargar Excel
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-1.5"
                onClick={() => {
                  exportPDF({
                    title: "Reporte de Tráfico",
                    subtitle: "Análisis completo del período seleccionado",
                    startTs: props.startTs,
                    endTs: props.endTs,
                    kpis: props.kpis,
                    hourly: props.hourly,
                    zones: props.zones,
                    channels: props.channels,
                  });
                  setOpen(false);
                }}
              >
                <FileText size={14} />
                Descargar PDF
              </Button>
            </div>
            <p className="text-xs text-gray-400 text-center">
              El Excel incluye una hoja Resumen + hojas por sección seleccionada.
            </p>
          </div>
        )}

        {tab === "preview" && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-gray-700">Resumen ejecutivo del período</p>
            <Preview kpis={props.kpis} />
            {props.conversion.length > 0 && (
              <>
                <p className="text-sm font-medium text-gray-700 mt-4">Conversión por hora (primeras 5 filas)</p>
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-800 text-white">
                      <th className="px-2 py-1.5 text-left">Hora</th>
                      <th className="px-2 py-1.5 text-right">Pasantes</th>
                      <th className="px-2 py-1.5 text-right">Ingresos</th>
                      <th className="px-2 py-1.5 text-right">Conv %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.conversion.slice(0, 5).map((r, i) => (
                      <tr key={r.hour} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                        <td className="px-2 py-1">{r.hour}h</td>
                        <td className="px-2 py-1 text-right">{r.pasantes}</td>
                        <td className="px-2 py-1 text-right">{r.enters}</td>
                        <td className="px-2 py-1 text-right font-medium text-green-700">{r.conv_enter_pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { ChevronDown } from "lucide-react";
import type { HourlyRow, KPIResult } from "@/lib/types";

function sum(rows: HourlyRow[], type: string) {
  return rows.filter((r) => r.event_type === type).reduce((s, r) => s + r.count, 0);
}


function fmtPct(n: number, d: number): string | null {
  if (!d || !n) return null;
  return `${((n / d) * 100).toFixed(1)}%`;
}

// Square-root scale so funnel shape stays visible even at low conversion rates
function widthOf(count: number, base: number, minPct: number): number {
  if (!base || count >= base) return 100;
  return Math.max(minPct, Math.round(Math.sqrt(count / base) * 100));
}

export function TrafficFunnel({
  rows,
  loading,
  kpis,
}: {
  rows: HourlyRow[];
  loading: boolean;
  kpis?: KPIResult | null;
}) {
  if (loading) {
    return (
      <div className="space-y-2 py-2">
        {[100, 68, 48].map((w) => (
          <div key={w} style={{ width: `${w}%` }} className="mx-auto h-20 bg-slate-100 animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  // rows already contains server-computed averages (dashboard_hourly_avg)
  const pasantes = sum(rows, "pasante");
  const visitors = sum(rows, "visitor");
  const enters   = sum(rows, "enter");

  // Label: show "prom/día" only for multi-day periods
  const isMultiDay = (kpis?.days ?? 1) > 1;
  const avgUnit = isMultiDay ? "/día" : "";

  const w2 = widthOf(visitors, pasantes, 38);
  const w3 = widthOf(enters,   pasantes, 25);

  const conv1 = fmtPct(visitors, pasantes);
  const conv2 = fmtPct(enters, visitors);

  const stages = [
    {
      n: 1, label: "Pasantes", sub: "Personas frente a la tienda",
      count: pasantes, pctBase: null, width: 100,
      bg: "#DBEAFE", fg: "#1E3A8A", muted: "#3B82F6",
    },
    {
      n: 2, label: "Visitantes", sub: "Se acercaron / mostraron interés",
      count: visitors, pctBase: fmtPct(visitors, pasantes), width: w2,
      bg: "#3B82F6", fg: "#FFFFFF", muted: "#BFDBFE",
    },
    {
      n: 3, label: "Entradas", sub: "Ingresaron al local",
      count: enters, pctBase: fmtPct(enters, pasantes), width: w3,
      bg: "#1D4ED8", fg: "#FFFFFF", muted: "#93C5FD",
    },
  ];

  const convs = [conv1, conv2];
  const convLabels = ["se acercaron", "ingresaron"];

  const noData = pasantes === 0 && enters === 0 && visitors === 0;

  return (
    <div className="py-1">
      {noData ? (
        <div className="h-52 flex items-center justify-center text-sm text-slate-400">
          Sin datos para el período seleccionado
        </div>
      ) : (
        <div className="space-y-0">
          {stages.map((s, i) => (
            <div key={s.n}>
              {/* Conversion arrow between stages */}
              {i > 0 && (
                <div className="flex justify-center items-center gap-1.5 py-1.5">
                  <ChevronDown size={13} className="text-slate-300" />
                  {convs[i - 1] ? (
                    <span className="text-xs font-semibold text-slate-500">
                      {convs[i - 1]}{" "}
                      <span className="font-normal text-slate-400">{convLabels[i - 1]}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </div>
              )}

              {/* Stage block — width narrows each step */}
              <div style={{ width: `${s.width}%` }} className="mx-auto">
                <div
                  className="rounded-2xl px-5 py-4 flex items-center justify-between gap-4"
                  style={{ backgroundColor: s.bg }}
                >
                  {/* Left: step badge + label */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                      style={{ backgroundColor: "rgba(255,255,255,0.25)", color: s.fg }}
                    >
                      {s.n}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold leading-tight" style={{ color: s.fg }}>
                        {s.label}
                      </p>
                      <p className="text-[11px] leading-tight" style={{ color: s.muted }}>
                        {s.sub}
                      </p>
                    </div>
                  </div>
                  {/* Right: avg count + unit + % */}
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-bold leading-none" style={{ color: s.fg }}>
                      {s.count.toLocaleString("es-PE")}
                      <span className="text-sm font-medium ml-1" style={{ color: s.muted }}>
                        {avgUnit}
                      </span>
                    </p>
                    {s.pctBase && (
                      <p className="text-[11px] mt-0.5 font-medium" style={{ color: s.muted }}>
                        {s.pctBase} del total
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Summary tasa de conversión global */}
          {pasantes > 0 && enters > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
              {conv1 && (
                <span>
                  Pasante→Visitante:{" "}
                  <strong className="text-slate-700">{conv1}</strong>
                </span>
              )}
              {conv2 && (
                <span>
                  Visitante→Entrada:{" "}
                  <strong className="text-slate-700">{conv2}</strong>
                </span>
              )}
              <span>
                Pasante→Entrada:{" "}
                <strong className="text-slate-700">
                  {fmtPct(enters, pasantes) ?? "—"}
                </strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * KPIStrip — 4-card summary row: Visitantes, Pasantes, Conversión, Tracks.
 * SRP: only renders computed visitor/pasante metrics derived from hourly data.
 * Reused in both InicioSection and ReporteSection.
 */
"use client";

import { Users, Footprints, Target, Fingerprint } from "lucide-react";
import type { ElementType } from "react";

interface KPIStripProps {
  visitors: number;
  pasantes: number;
  conv: number | null;
  uniqueTracks: number;
  days?: number;
  loading: boolean;
  compact?: boolean;
}

interface CardDef {
  label: string;
  value: string;
  sub: string;
  accent: string;
  Icon: ElementType;
}

export function KPIStrip({ visitors, pasantes, conv, uniqueTracks, days = 1, loading, compact }: KPIStripProps) {
  const d = Math.max(1, days);

  const cards: CardDef[] = [
    {
      label: "Visitantes / día",
      value: (visitors / d).toFixed(1),
      sub: `${visitors.toLocaleString("es-PE")} total · ${d} día(s)`,
      accent: "#0EA5E9",
      Icon: Users,
    },
    {
      label: "Pasantes / día",
      value: (pasantes / d).toFixed(1),
      sub: `${pasantes.toLocaleString("es-PE")} total · ${d} día(s)`,
      accent: "#64748B",
      Icon: Footprints,
    },
    {
      label: "Conversión",
      value: conv !== null ? `${conv}%` : "—",
      sub: "Visitantes / Pasantes",
      accent: "#0D9488",
      Icon: Target,
    },
    {
      label: "Tracks únicos",
      value: uniqueTracks.toLocaleString("es-PE"),
      sub: "Personas distintas detectadas",
      accent: "#0B1222",
      Icon: Fingerprint,
    },
  ];

  const pad = compact ? "p-3.5" : "p-4";
  const numSize = compact ? "text-xl" : "text-2xl";

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {cards.map(({ label, value, sub, accent, Icon }) => (
        <div key={label} className={`panel panel-interactive ${pad}`}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {label}
            </p>
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${accent}14`, color: accent }}
            >
              <Icon size={15} />
            </span>
          </div>
          {loading ? (
            <div className="mt-3 h-7 w-20 animate-pulse rounded bg-slate-100" />
          ) : (
            <p className={`tnum mt-2 font-semibold leading-none tracking-tight text-slate-900 ${numSize}`}>
              {value}
            </p>
          )}
          <p className="mt-1.5 text-[11px] text-slate-400">{sub}</p>
        </div>
      ))}
    </div>
  );
}

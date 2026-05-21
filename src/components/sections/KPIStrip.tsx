/**
 * KPIStrip — 4-card summary row: Visitantes, Pasantes, Conversión, Tracks.
 * SRP: only renders computed visitor/pasante metrics derived from hourly data.
 * Reused in both InicioSection and ReporteSection.
 */
"use client";

interface KPIStripProps {
  visitors: number;
  pasantes: number;
  conv: number | null;
  uniqueTracks: number;
  loading: boolean;
  /** Compact variant uses smaller padding (used inside Reporte) */
  compact?: boolean;
}

interface CardDef {
  label: string;
  value: number | string | null;
  sub: string;
  border: string;
}

export function KPIStrip({ visitors, pasantes, conv, uniqueTracks, loading, compact }: KPIStripProps) {
  const cards: CardDef[] = [
    { label: "Visitantes",    value: visitors,                         sub: "Personas con intención de compra",       border: "border-l-indigo-400" },
    { label: "Pasantes",      value: pasantes,                         sub: "Personas que pasaron frente al local",   border: "border-l-slate-400"  },
    { label: "Conversión",    value: conv !== null ? `${conv}%` : "—", sub: "Visitantes / Pasantes",                  border: "border-l-[#2DD4BF]"  },
    { label: "Tracks únicos", value: uniqueTracks,                     sub: "Personas distintas detectadas",          border: "border-l-amber-400"  },
  ];

  const pad = compact ? "px-4 py-3" : "p-4";
  const numSize = compact ? "text-xl" : "text-2xl";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map(({ label, value, sub, border }) => (
        <div
          key={label}
          className={`bg-white rounded-2xl border border-slate-100 shadow-sm ${pad} border-l-4 ${border}`}
        >
          <p className="text-xs text-slate-500 font-medium">{label}</p>
          {loading ? (
            <div className="h-7 w-20 bg-slate-100 rounded animate-pulse mt-2" />
          ) : (
            <p className={`${numSize} font-bold text-slate-800 mt-1`}>
              {typeof value === "number" ? value.toLocaleString("es-PE") : value}
            </p>
          )}
          {!compact && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
        </div>
      ))}
    </div>
  );
}

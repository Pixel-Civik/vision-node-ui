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
  days?: number;
  loading: boolean;
  compact?: boolean;
}

interface CardDef {
  label: string;
  value: string;
  sub: string;
  border: string;
}

export function KPIStrip({ visitors, pasantes, conv, uniqueTracks, days = 1, loading, compact }: KPIStripProps) {
  const d = Math.max(1, days);

  const cards: CardDef[] = [
    {
      label: "Visitantes / día",
      value: (visitors / d).toFixed(1),
      sub: `${visitors.toLocaleString("es-PE")} total · ${d} día(s)`,
      border: "border-l-indigo-400",
    },
    {
      label: "Pasantes / día",
      value: (pasantes / d).toFixed(1),
      sub: `${pasantes.toLocaleString("es-PE")} total · ${d} día(s)`,
      border: "border-l-slate-400",
    },
    {
      label: "Conversión",
      value: conv !== null ? `${conv}%` : "—",
      sub: "Visitantes / Pasantes",
      border: "border-l-[#2DD4BF]",
    },
    {
      label: "Tracks únicos",
      value: uniqueTracks.toLocaleString("es-PE"),
      sub: "Personas distintas detectadas",
      border: "border-l-amber-400",
    },
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
          <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">{label}</p>
          {loading ? (
            <div className="h-7 w-20 bg-slate-100 rounded animate-pulse mt-2" />
          ) : (
            <p className={`${numSize} font-bold text-slate-800 mt-1`}>{value}</p>
          )}
          <p className="text-[11px] text-slate-400 mt-1">{sub}</p>
        </div>
      ))}
    </div>
  );
}

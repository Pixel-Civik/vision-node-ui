// Tema compartido para todas las gráficas (Recharts).
// Paleta restringida y armónica alineada con la marca (navy + teal):
// un primario teal, neutrales slate/navy, un acento ámbar y un rojo de
// alerta. Evita colores pastel sueltos que rompan la unidad visual.

export const CHART = {
  brand: "#2DD4BF",
  brandStrong: "#0D9488",
  sky: "#0EA5E9",
  cyan: "#06B6D4",
  indigo: "#4F46E5",
  indigoSoft: "#818CF8",
  emerald: "#10B981",
  emeraldSoft: "#34D399",
  amber: "#F59E0B",
  rose: "#E11D48",
  slate: "#94A3B8",
  slateSoft: "#CBD5E1",
  slateDark: "#334155",
  navy: "#0B1222",
} as const;

// Paleta para series múltiples: análogos fríos (teal → cian → sky) + navy,
// con el ámbar como único acento cálido y el slate como neutral.
export const CATEGORICAL = [
  CHART.brandStrong,
  CHART.sky,
  CHART.navy,
  CHART.amber,
  CHART.cyan,
  CHART.slate,
  CHART.rose,
  CHART.slateDark,
] as const;

// Rampa monocromática teal (embudos y escalas secuenciales), del claro al oscuro.
export const TEAL_RAMP = ["#F0FDFA", "#CCFBF1", "#99F6E4", "#5EEAD4", "#0D9488", "#0F766E"] as const;

export const GRID_COLOR = "#EEF2F6";
export const AXIS_COLOR = "#94A3B8";

export const AXIS_TICK = { fontSize: 11, fill: AXIS_COLOR } as const;

export const GRID_PROPS = {
  strokeDasharray: "3 3",
  stroke: GRID_COLOR,
  vertical: false,
} as const;

export const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: "1px solid #E2E8F0",
  boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
  fontSize: 12,
  padding: "8px 10px",
} as const;

export const TOOLTIP_LABEL_STYLE = {
  color: "#0F172A",
  fontWeight: 600,
  marginBottom: 4,
} as const;

// Clases base para el esqueleto de carga de una gráfica.
export const CHART_SKELETON_CLASS = "rounded-lg bg-slate-100 animate-pulse";

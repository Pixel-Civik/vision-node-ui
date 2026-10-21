import type { AttrsBreakdown } from "./types";

/** Totales por categoría + filas por bucket (día u hora) para exportar el perfil de visitantes. */
export interface AttrsExportTables {
  bucketLabel: string;
  /** [Categoría, Entradas, % del total, % de las etiquetadas] */
  summary: [string, number, string, string][];
  /** [Bucket, Entradas, Niños, Adultos, Sin edad, Hombres, Mujeres, Sin género] */
  perBucket: (string | number)[][];
}

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

export function buildAttrsExportTables(b: AttrsBreakdown): AttrsExportTables {
  const t = { all: 0, nino: 0, adulto: 0, noAge: 0, hombre: 0, mujer: 0, noGender: 0 };
  const buckets = new Map<string, number[]>();
  for (const r of b.rows) {
    const row = buckets.get(r.bucket) ?? [0, 0, 0, 0, 0, 0, 0];
    row[0] += r.count;
    row[r.age === "nino" ? 1 : r.age === "adulto" ? 2 : 3] += r.count;
    row[r.gender === "hombre" ? 4 : r.gender === "mujer" ? 5 : 6] += r.count;
    buckets.set(r.bucket, row);
    t.all += r.count;
    if (r.age === "nino") t.nino += r.count;
    else if (r.age === "adulto") t.adulto += r.count;
    else t.noAge += r.count;
    if (r.gender === "hombre") t.hombre += r.count;
    else if (r.gender === "mujer") t.mujer += r.count;
    else t.noGender += r.count;
  }
  const withAge = t.nino + t.adulto;
  const withGender = t.hombre + t.mujer;
  const hour = b.granularity === "hour";

  return {
    bucketLabel: hour ? "Hora" : "Fecha",
    summary: [
      ["Niños", t.nino, pct(t.nino, t.all), pct(t.nino, withAge)],
      ["Adultos", t.adulto, pct(t.adulto, t.all), pct(t.adulto, withAge)],
      ["Sin edad", t.noAge, pct(t.noAge, t.all), "—"],
      ["Hombres", t.hombre, pct(t.hombre, t.all), pct(t.hombre, withGender)],
      ["Mujeres", t.mujer, pct(t.mujer, t.all), pct(t.mujer, withGender)],
      ["Sin género", t.noGender, pct(t.noGender, t.all), "—"],
      ["Entradas (total)", t.all, t.all > 0 ? "100%" : "—", "—"],
    ],
    perBucket: [
      ...Array.from(buckets.entries())
        .sort((a, c) => a[0].localeCompare(c[0]))
        .map(([k, v]) => [hour ? `${k}:00` : k, ...v]),
      ["Total", t.all, t.nino, t.adulto, t.noAge, t.hombre, t.mujer, t.noGender],
    ],
  };
}

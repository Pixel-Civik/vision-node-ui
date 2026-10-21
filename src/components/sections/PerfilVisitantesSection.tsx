"use client";

import { useMemo } from "react";
import { Baby, Info, UserRound, Users } from "lucide-react";
import { PanelTitle } from "@/components/ui/page-header";
import { useAttrsBreakdown } from "@/hooks/useAttrsBreakdown";
import {
  AgeShare, AgeTimeSeriesChart, GenderShare, buildAgeSeries, sumTotals,
} from "@/components/charts/AttrsBreakdownCharts";
import type { FilterValues } from "@/components/filters/FilterPanel";
import type { AttrsGranularity, DashboardFilters } from "@/lib/types";
import { CHART_SKELETON_CLASS } from "@/lib/chartTheme";

interface Props {
  filters: DashboardFilters;
  filterValues: FilterValues;
  /** Espera a que el bootstrap del dashboard (rango de apertura) termine. */
  enabled: boolean;
}

const fmtN = (n: number) => n.toLocaleString("es-PE");
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

function StatTile({ icon, label, value, hint, loading }: {
  icon: React.ReactNode; label: string; value: number; hint?: string; loading: boolean;
}) {
  return (
    <div className="panel p-5">
      <div className="mb-2 flex items-center gap-2 text-slate-400">
        {icon}
        <p className="text-[10px] font-bold uppercase tracking-widest">{label}</p>
      </div>
      {loading ? (
        <div className={`h-8 w-24 ${CHART_SKELETON_CLASS}`} />
      ) : (
        <p className="text-3xl font-extrabold leading-none tracking-tight text-slate-900">{fmtN(value)}</p>
      )}
      {hint && !loading && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function PerfilVisitantesSection({ filters, filterValues, enabled }: Props) {
  // Un solo día -> por hora; varios días -> por día.
  const granularity: AttrsGranularity =
    filterValues.startDate === filterValues.endDate ? "hour" : "day";

  const { data, loading, error } = useAttrsBreakdown(filters, granularity, enabled);

  const totals = useMemo(() => sumTotals(data), [data]);
  const points = useMemo(
    () =>
      data
        ? buildAgeSeries(data, {
            startDate: filterValues.startDate,
            endDate: filterValues.endDate,
            hourMin: filterValues.hourMin,
            hourMax: filterValues.hourMax,
            dows: filterValues.dows,
          })
        : [],
    [data, filterValues.startDate, filterValues.endDate, filterValues.hourMin, filterValues.hourMax, filterValues.dows],
  );

  const busy = loading || !enabled;
  const empty = !busy && !error && totals.all === 0;
  const labeledAge = totals.nino + totals.adulto;

  return (
    <section className="space-y-5" aria-label="Perfil de visitantes">
      <div>
        <h2 className="text-base font-bold tracking-tight text-slate-900">Perfil de visitantes</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Entradas por grupo de edad y género · período y filtros seleccionados
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudo cargar el perfil de visitantes: {error}
        </div>
      )}

      <div id="export-chart-attrs-age" className="space-y-5">
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <StatTile
          icon={<Users size={14} />} label="Entradas" value={totals.all} loading={busy}
          hint="Total del período"
        />
        <StatTile
          icon={<Baby size={14} />} label="Niños" value={totals.nino} loading={busy}
          hint={labeledAge > 0 ? `${pct(totals.nino, labeledAge)}% de las entradas con edad` : undefined}
        />
        <StatTile
          icon={<UserRound size={14} />} label="Adultos" value={totals.adulto} loading={busy}
          hint={labeledAge > 0 ? `${pct(totals.adulto, labeledAge)}% de las entradas con edad` : undefined}
        />
        <StatTile
          icon={<Info size={14} />} label="Sin etiqueta" value={totals.noAge} loading={busy}
          hint={totals.all > 0 ? `${pct(totals.noAge, totals.all)}% sin edad detectada` : undefined}
        />
      </div>

      {empty ? (
        <div className="panel p-6">
          <p className="py-8 text-center text-sm text-slate-400">
            Sin entradas en el período seleccionado.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="panel p-6 lg:col-span-2">
              <PanelTitle
                title="Niños vs adultos"
                hint={
                  granularity === "hour"
                    ? "Entradas por hora, por grupo de edad"
                    : "Entradas por día, por grupo de edad"
                }
              />
              <AgeTimeSeriesChart points={points} granularity={granularity} loading={busy} />
            </div>
            <div className="panel p-6">
              <PanelTitle title="Distribución por edad" hint="Participación sobre el total de entradas" />
              <AgeShare totals={totals} loading={busy} />
            </div>
          </div>
        </>
      )}
      </div>

      {!empty && (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div id="export-chart-attrs-gender" className="panel p-6">
              <PanelTitle title="Hombres vs mujeres" hint="Participación sobre el total de entradas" />
              <GenderShare totals={totals} loading={busy} />
            </div>
            <div className="panel flex items-start gap-3 p-6 lg:col-span-2">
              <Info size={16} className="mt-0.5 shrink-0 text-slate-400" />
              <div className="space-y-1.5 text-xs leading-relaxed text-slate-500">
                <p className="text-sm font-semibold text-slate-700">Cómo leer estas gráficas</p>
                <p>
                  El contador solo asigna edad o género cuando está seguro. Las entradas en las que
                  no lo está se muestran como <span className="font-semibold text-slate-600">Sin etiqueta</span>:
                  no se reparten entre categorías ni se estiman.
                </p>
                {data?.truncated && (
                  <p className="font-medium text-amber-600">
                    Período muy grande: el conteo es parcial. Acota el rango de fechas para ver el total.
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

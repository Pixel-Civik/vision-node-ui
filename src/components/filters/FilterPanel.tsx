"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { MultiSelect } from "./MultiSelect";
import { DatePicker, type DateMode } from "./DatePicker";
import type { FilterOptions } from "@/hooks/useFilterOptions";

const DOWS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

type QuickMode = "promedio" | "hoy" | "7dias" | "mensual" | "personalizado";

export interface FilterValues {
  sites: string[];
  channels: string[];
  zones: string[];
  hourMin: number;
  hourMax: number;
  dows: number[];
  startDate: string;
  endDate: string;
}

function isoDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(d);
}

function fmtShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const M = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d} ${M[m - 1]} ${y}`;
}

// Fechas "de hoy" calculadas una sola vez al cargar el módulo. Llamar a
// `new Date()`/`Date.now()` durante el render es una función impura (rompe la
// pureza de React y dispara renders inestables); a nivel de módulo queda fuera
// del ciclo de render. Mismo patrón que ya usa page.tsx / useFilterOptions.
const TODAY        = isoDate(new Date());
const _now         = new Date();
const YESTERDAY    = isoDate(new Date(Date.now() - 86_400_000));
const AGO_7        = isoDate(new Date(Date.now() - 7 * 86_400_000));
const MONTH_START  = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-01`;
const LIMA_HOUR    = new Date(Date.now() - 5 * 3_600_000).getUTCHours();

interface Props {
  opts: FilterOptions;
  values: FilterValues;
  onChange: (patch: Partial<FilterValues>) => void;
}

export function FilterPanel({ opts, values, onChange }: Props) {
  const [datePickerMode, setDatePickerMode] = useState<DateMode>(
    values.startDate === values.endDate ? "single" : "range",
  );
  const [expanded, setExpanded] = useState(false);
  // Forces "personalizado" display when user explicitly clicks that button,
  // even if the current dates happen to match another preset (e.g. promedio).
  const [forcedPersonalizado, setForcedPersonalizado] = useState(false);

  // Derived — stays in sync with external changes (e.g. page.tsx snap to minDate).
  const mode = useMemo<QuickMode>(() => {
    if (forcedPersonalizado) return "personalizado";
    const { startDate, endDate } = values;
    if (startDate === TODAY && endDate === TODAY) return "hoy";
    if (startDate === AGO_7 && endDate === YESTERDAY) return "7dias";
    if (startDate === MONTH_START && endDate === YESTERDAY) return "mensual";
    if (!opts.loading && opts.minDate < TODAY && startDate === opts.minDate && endDate === YESTERDAY)
      return "promedio";
    return "personalizado";
  }, [forcedPersonalizado, values, opts.loading, opts.minDate]);

  function applyMode(m: QuickMode) {
    if (m === "personalizado") {
      setForcedPersonalizado(true);
      return;
    }
    setForcedPersonalizado(false);
    if (m === "promedio") {
      const min = opts.minDate < TODAY ? opts.minDate : YESTERDAY;
      onChange({ startDate: min, endDate: YESTERDAY, hourMin: 0, hourMax: 23, dows: [0,1,2,3,4,5,6] });
    } else if (m === "hoy") {
      onChange({ startDate: TODAY, endDate: TODAY, hourMin: 0, hourMax: LIMA_HOUR });
    } else if (m === "7dias") {
      onChange({ startDate: AGO_7, endDate: YESTERDAY, hourMin: 0, hourMax: 23, dows: [0,1,2,3,4,5,6] });
    } else if (m === "mensual") {
      onChange({ startDate: MONTH_START, endDate: YESTERDAY, hourMin: 0, hourMax: 23, dows: [0,1,2,3,4,5,6] });
    }
  }

  const minDate = opts.minDate < TODAY ? opts.minDate : MONTH_START;
  const maxDate = TODAY;

  type WarnType = "error" | "warning" | "info";
  const dateWarning = useMemo<{ type: WarnType; msg: string } | null>(() => {
    if (mode !== "personalizado") return null;
    if (opts.loading) return null;

    const s = values.startDate;
    const e = values.endDate;
    const realMin = opts.minDate < TODAY ? opts.minDate : null;

    if (s > e)
      return { type: "error", msg: "La fecha de inicio es posterior a la fecha fin — se ajustará automáticamente" };
    if (s > TODAY)
      return { type: "warning", msg: "El período está en el futuro — no hay datos disponibles" };
    if (realMin && e < realMin)
      return { type: "warning", msg: `Sin datos antes del ${fmtShort(realMin)} — ajusta el rango` };
    if (realMin && s < realMin)
      return { type: "info", msg: `Datos disponibles desde el ${fmtShort(realMin)}` };
    if (e >= TODAY)
      return { type: "info", msg: "Los datos de hoy están incompletos (día en curso)" };
    return null;
  }, [mode, values.startDate, values.endDate, opts.loading, opts.minDate]);

  const MODES: { id: QuickMode; label: string }[] = [
    { id: "promedio",      label: "Promedio"     },
    { id: "hoy",           label: "Hoy"          },
    { id: "7dias",         label: "7 días"        },
    { id: "mensual",       label: "Mensual"       },
    { id: "personalizado", label: "Personalizado" },
  ];

  return (
    <div className="panel overflow-hidden">
      {/* Quick-mode buttons */}
      <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => applyMode(m.id)}
            aria-pressed={mode === m.id}
            className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-200 ${
              mode === m.id
                ? "border-transparent bg-brand text-brand-foreground shadow-sm"
                : "border-slate-200 text-slate-500 hover:border-brand hover:text-brand-strong"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-end gap-4 px-5 py-4">

        {/* Promedio: muestra período y filtro por día */}
        {mode === "promedio" && (
          <>
            {!opts.loading && opts.minDate < TODAY && (
              <p className="self-center text-xs text-slate-400">
                Historial completo ·{" "}
                <span className="font-medium text-slate-600">{fmtShort(opts.minDate)}</span>
                {" → "}
                <span className="font-medium text-slate-600">ayer</span>
              </p>
            )}
            <DowPicker dows={values.dows} onChange={onChange} />
          </>
        )}

        {/* Hoy: solo slider de hora */}
        {mode === "hoy" && (
          <HourSlider hourMin={values.hourMin} hourMax={values.hourMax} onChange={onChange} />
        )}

        {/* 7 días / Mensual: filtro por día de semana */}
        {(mode === "7dias" || mode === "mensual") && (
          <DowPicker dows={values.dows} onChange={onChange} />
        )}

        {/* Personalizado: controles completos */}
        {mode === "personalizado" && (
          <>
            <DatePicker
              mode={datePickerMode}
              startDate={values.startDate}
              endDate={values.endDate}
              minDate={minDate}
              maxDate={maxDate}
              availableDates={opts.availableDates}
              onModeChange={(m) => {
                setDatePickerMode(m);
                if (m === "single" && values.startDate !== values.endDate) {
                  onChange({ endDate: values.startDate });
                }
              }}
              onChange={(start, end) => {
                setForcedPersonalizado(false);
                onChange({ startDate: start, endDate: end });
              }}
              filterWarning={dateWarning}
            />

            <div className="h-8 w-px self-center bg-slate-200" />

            <HourSlider hourMin={values.hourMin} hourMax={values.hourMax} onChange={onChange} />

            <div className="h-8 w-px self-center bg-slate-200" />

            <DowPicker dows={values.dows} onChange={onChange} />

            <button
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
            >
              <SlidersHorizontal size={13} />
              Sede / Cámara / Zona
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </>
        )}
      </div>

      {/* Filtros de dimensión — solo en Personalizado */}
      {mode === "personalizado" && expanded && (
        <div className="grid grid-cols-1 gap-4 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:grid-cols-3">
          {opts.sites.length > 0 && (
            <MultiSelect
              label="Sede"
              options={opts.sites}
              selected={values.sites}
              onChange={(v) => onChange({ sites: v })}
            />
          )}
          {opts.channels.length > 0 && (
            <MultiSelect
              label="Cámara"
              options={opts.channels}
              selected={values.channels}
              onChange={(v) => onChange({ channels: v })}
            />
          )}
          {opts.zones.length > 0 && (
            <MultiSelect
              label="Zona"
              options={opts.zones}
              selected={values.zones}
              onChange={(v) => onChange({ zones: v })}
            />
          )}
        </div>
      )}
    </div>
  );
}

function HourSlider({
  hourMin, hourMax, onChange,
}: {
  hourMin: number;
  hourMax: number;
  onChange: (patch: Partial<FilterValues>) => void;
}) {
  return (
    <div className="min-w-[180px]">
      <label className="block text-xs text-slate-500 mb-1.5 font-medium">
        Horario:{" "}
        <span className="text-slate-700">{hourMin}h – {hourMax}h</span>
      </label>
      <Slider
        min={0}
        max={23}
        step={1}
        value={[hourMin, hourMax]}
        onValueChange={(v) => {
          const [min, max] = v as [number, number];
          onChange({ hourMin: min, hourMax: max });
        }}
      />
    </div>
  );
}

function DowPicker({
  dows, onChange,
}: {
  dows: number[];
  onChange: (patch: Partial<FilterValues>) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1.5 font-medium">Días</label>
      <div className="flex gap-1">
        {DOWS.map((d, i) => (
          <Badge
            key={d}
            variant={dows.includes(i) ? "default" : "outline"}
            className="cursor-pointer text-xs select-none px-2"
            onClick={() =>
              onChange({
                dows: dows.includes(i)
                  ? dows.filter((x) => x !== i)
                  : [...dows, i],
              })
            }
          >
            {d}
          </Badge>
        ))}
      </div>
    </div>
  );
}

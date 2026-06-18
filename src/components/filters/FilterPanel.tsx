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

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

function fmtShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const M = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d} ${M[m - 1]} ${y}`;
}

interface Props {
  opts: FilterOptions;
  values: FilterValues;
  onChange: (patch: Partial<FilterValues>) => void;
}

export function FilterPanel({ opts, values, onChange }: Props) {
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

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
    if (startDate === today && endDate === today) return "hoy";
    const ago7 = isoDate(new Date(Date.now() - 7 * 86_400_000));
    if (startDate === ago7 && endDate === yesterday) return "7dias";
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    if (startDate === isoDate(monthStart) && endDate === yesterday) return "mensual";
    if (!opts.loading && opts.minDate < today && startDate === opts.minDate && endDate === today)
      return "promedio";
    return "personalizado";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedPersonalizado, values.startDate, values.endDate, opts.loading, opts.minDate]);

  function applyMode(m: QuickMode) {
    const now = new Date();
    if (m === "personalizado") {
      setForcedPersonalizado(true);
      return;
    }
    setForcedPersonalizado(false);
    if (m === "promedio") {
      const min = opts.minDate < today ? opts.minDate : today;
      onChange({ startDate: min, endDate: today, hourMin: 0, hourMax: 23, dows: [0,1,2,3,4,5,6] });
    } else if (m === "hoy") {
      onChange({ startDate: today, endDate: today });
    } else if (m === "7dias") {
      const start = isoDate(new Date(Date.now() - 7 * 86_400_000));
      onChange({ startDate: start, endDate: yesterday, hourMin: 0, hourMax: 23, dows: [0,1,2,3,4,5,6] });
    } else if (m === "mensual") {
      const start = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
      onChange({ startDate: start, endDate: yesterday, hourMin: 0, hourMax: 23, dows: [0,1,2,3,4,5,6] });
    }
  }

  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const minDate = opts.minDate < today ? opts.minDate : firstOfMonth;
  const maxDate = today;

  type WarnType = "error" | "warning" | "info";
  const dateWarning = useMemo<{ type: WarnType; msg: string } | null>(() => {
    if (mode !== "personalizado") return null;
    if (opts.loading) return null;

    const s = values.startDate;
    const e = values.endDate;
    const realMin = opts.minDate < today ? opts.minDate : null;

    if (s > e)
      return { type: "error", msg: "La fecha de inicio es posterior a la fecha fin — se ajustará automáticamente" };
    if (s > today)
      return { type: "warning", msg: "El período está en el futuro — no hay datos disponibles" };
    if (realMin && e < realMin)
      return { type: "warning", msg: `Sin datos antes del ${fmtShort(realMin)} — ajusta el rango` };
    if (realMin && s < realMin)
      return { type: "info", msg: `Datos disponibles desde el ${fmtShort(realMin)}` };
    if (e >= today)
      return { type: "info", msg: "Los datos de hoy están incompletos (día en curso)" };
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, values.startDate, values.endDate, opts.loading, opts.minDate]);

  const MODES: { id: QuickMode; label: string }[] = [
    { id: "promedio",      label: "Promedio"     },
    { id: "hoy",           label: "Hoy"          },
    { id: "7dias",         label: "7 días"        },
    { id: "mensual",       label: "Mensual"       },
    { id: "personalizado", label: "Personalizado" },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
      {/* Quick-mode buttons */}
      <div className="px-5 pt-3 pb-0 flex items-center gap-2 flex-wrap">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => applyMode(m.id)}
            className={`text-xs px-3.5 py-1.5 rounded-full border transition-all font-medium ${
              mode === m.id
                ? "bg-[#2DD4BF] border-[#2DD4BF] text-white shadow-sm"
                : "border-slate-200 text-slate-500 hover:border-[#2DD4BF] hover:text-[#2DD4BF]"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Controls row */}
      <div className="px-5 py-3 flex flex-wrap items-end gap-5">

        {/* Promedio: muestra período y filtro por día */}
        {mode === "promedio" && (
          <>
            {!opts.loading && opts.minDate < today && (
              <p className="text-xs text-slate-400 self-center">
                Historial completo ·{" "}
                <span className="text-slate-600 font-medium">{fmtShort(opts.minDate)}</span>
                {" → "}
                <span className="text-slate-600 font-medium">hoy</span>
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

            <div className="w-px h-8 bg-gray-200 self-center" />

            <HourSlider hourMin={values.hourMin} hourMax={values.hourMax} onChange={onChange} />

            <div className="w-px h-8 bg-gray-200 self-center" />

            <DowPicker dows={values.dows} onChange={onChange} />

            <button
              onClick={() => setExpanded(!expanded)}
              className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50"
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
        <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 rounded-b-xl grid grid-cols-3 gap-5">
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

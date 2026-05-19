"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import type { FilterOptions } from "@/hooks/useFilterOptions";

const DOWS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

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

function buildPresets() {
  const now = new Date();
  const today = isoDate(now);

  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const ago7 = new Date(now); ago7.setDate(now.getDate() - 6);
  const ago30 = new Date(now); ago30.setDate(now.getDate() - 29);

  // This week Mon
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));

  // This month start
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Prev month
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  return [
    { label: "Hoy",          start: today,                       end: today },
    { label: "Ayer",         start: isoDate(yesterday),          end: isoDate(yesterday) },
    { label: "7 días",       start: isoDate(ago7),               end: today },
    { label: "Esta semana",  start: isoDate(weekStart),          end: today },
    { label: "Este mes",     start: isoDate(monthStart),         end: today },
    { label: "30 días",      start: isoDate(ago30),              end: today },
    { label: "Mes anterior", start: isoDate(prevMonthStart),     end: isoDate(prevMonthEnd) },
  ];
}

function MultiSelect({
  label, options, selected, onChange,
}: {
  label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const allSelected = selected.length === options.length;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        <button
          className="text-xs text-[#2DD4BF] hover:underline"
          onClick={() => onChange(allSelected ? [] : [...options])}
        >
          {allSelected ? "Ninguno" : "Todos"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <Badge
            key={opt}
            variant={selected.includes(opt) ? "default" : "outline"}
            className="cursor-pointer text-xs select-none"
            onClick={() =>
              onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])
            }
          >
            {opt}
          </Badge>
        ))}
      </div>
    </div>
  );
}

interface Props {
  opts: FilterOptions;
  values: FilterValues;
  onChange: (patch: Partial<FilterValues>) => void;
}

export function FilterPanel({ opts, values, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const presets = buildPresets();

  const activePreset = presets.find(
    (p) => p.start === values.startDate && p.end === values.endDate,
  )?.label ?? "Personalizado";

  function applyPreset(start: string, end: string) {
    onChange({ startDate: start, endDate: end });
  }

  function handleStartDate(val: string) {
    if (!val) return;
    // If new startDate > endDate, clamp endDate to startDate (single-day)
    onChange({ startDate: val, ...(val > values.endDate ? { endDate: val } : {}) });
  }

  function handleEndDate(val: string) {
    if (!val) return;
    // If new endDate < startDate, clamp startDate to endDate (single-day)
    onChange({ endDate: val, ...(val < values.startDate ? { startDate: val } : {}) });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Preset chips row */}
      <div className="px-5 pt-3 pb-0 flex flex-wrap items-center gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p.start, p.end)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-all font-medium ${
              activePreset === p.label
                ? "bg-[#2DD4BF] border-[#2DD4BF] text-white"
                : "border-slate-200 text-slate-500 hover:border-[#2DD4BF] hover:text-[#2DD4BF]"
            }`}
          >
            {p.label}
          </button>
        ))}
        {activePreset === "Personalizado" && (
          <span className="text-xs px-2.5 py-1 rounded-full border border-slate-300 text-slate-400 font-medium">
            Personalizado
          </span>
        )}
      </div>

      {/* Main row */}
      <div className="px-5 py-3 flex flex-wrap items-end gap-5">
        {/* Date inputs */}
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-medium">Desde</label>
            <input
              type="date"
              value={values.startDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => handleStartDate(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2DD4BF]/30 bg-gray-50 cursor-pointer"
            />
          </div>
          <span className="text-slate-400 pb-2 text-sm">→</span>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-medium">Hasta</label>
            <input
              type="date"
              value={values.endDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => handleEndDate(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2DD4BF]/30 bg-gray-50 cursor-pointer"
            />
          </div>
        </div>

        <div className="w-px h-8 bg-gray-200 self-center" />

        {/* Hour slider */}
        <div className="min-w-[180px]">
          <label className="block text-xs text-slate-500 mb-1.5 font-medium">
            Horario:{" "}
            <span className="text-slate-700">{values.hourMin}h – {values.hourMax}h</span>
          </label>
          <Slider
            min={0}
            max={23}
            step={1}
            value={[values.hourMin, values.hourMax]}
            onValueChange={(v) => {
              const [min, max] = v as [number, number];
              onChange({ hourMin: min, hourMax: max });
            }}
          />
        </div>

        <div className="w-px h-8 bg-gray-200 self-center" />

        {/* Days of week */}
        <div>
          <label className="block text-xs text-slate-500 mb-1.5 font-medium">Días</label>
          <div className="flex gap-1">
            {DOWS.map((d, i) => (
              <Badge
                key={d}
                variant={values.dows.includes(i) ? "default" : "outline"}
                className="cursor-pointer text-xs select-none px-2"
                onClick={() =>
                  onChange({
                    dows: values.dows.includes(i)
                      ? values.dows.filter((x) => x !== i)
                      : [...values.dows, i],
                  })
                }
              >
                {d}
              </Badge>
            ))}
          </div>
        </div>

        {/* Expand */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50"
        >
          <SlidersHorizontal size={13} />
          Sede / Cámara / Zona
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* Expandable */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 grid grid-cols-3 gap-5">
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

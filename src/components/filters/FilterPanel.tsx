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

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const allSelected = selected.length === options.length;
  function toggle(opt: string) {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        <button
          className="text-xs text-blue-500 hover:underline"
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
            onClick={() => toggle(opt)}
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

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Main row — always visible */}
      <div className="px-5 py-4 flex flex-wrap items-end gap-5">
        {/* Date range */}
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-medium">Desde</label>
            <input
              type="date"
              value={values.startDate}
              min={opts.minDate}
              max={values.endDate}
              onChange={(e) => onChange({ startDate: e.target.value })}
              className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-medium">Hasta</label>
            <input
              type="date"
              value={values.endDate}
              min={values.startDate}
              max={opts.maxDate}
              onChange={(e) => onChange({ endDate: e.target.value })}
              className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-gray-50"
            />
          </div>
        </div>

        <div className="w-px h-8 bg-gray-200 self-center" />

        {/* Hour range */}
        <div className="min-w-[180px]">
          <label className="block text-xs text-slate-500 mb-1.5 font-medium">
            Horario: <span className="text-slate-700">{values.hourMin}h – {values.hourMax}h</span>
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

        {/* Expand button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50"
        >
          <SlidersHorizontal size={13} />
          Sede / Cámara / Zona
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* Expandable section */}
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

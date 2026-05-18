"use client";

import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import type { FilterOptions } from "@/hooks/useFilterOptions";

const DOWS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

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
    onChange(
      selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</label>
        <button
          className="text-xs text-blue-500 hover:underline"
          onClick={() => onChange(allSelected ? [] : [...options])}
        >
          {allSelected ? "Ninguno" : "Todos"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
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

export interface SidebarFilters {
  sites: string[];
  channels: string[];
  zones: string[];
  hourMin: number;
  hourMax: number;
  dows: number[];
  metricMode: "Eventos" | "Personas";
  startDate: string;
  endDate: string;
}

interface Props {
  opts: FilterOptions;
  filters: SidebarFilters;
  onChange: (patch: Partial<SidebarFilters>) => void;
  onRefresh: () => void;
  loading: boolean;
}

export function Sidebar({ opts, filters, onChange, onRefresh, loading }: Props) {
  return (
    <aside className="w-60 shrink-0 border-r border-gray-200 bg-white h-screen overflow-y-auto flex flex-col">
      <div className="px-4 py-4 border-b border-gray-100">
        <h1 className="text-base font-semibold text-gray-800 leading-tight">Vision Node</h1>
        <p className="text-xs text-gray-400 mt-0.5">Dashboard de tráfico</p>
      </div>

      <div className="flex-1 px-4 py-4 space-y-5 overflow-y-auto">
        {/* Período */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Período</label>
          <div className="space-y-1.5">
            <div>
              <span className="text-xs text-gray-400">Inicio</span>
              <input
                type="date"
                value={filters.startDate}
                min={opts.minDate}
                max={filters.endDate}
                onChange={(e) => onChange({ startDate: e.target.value })}
                className="mt-0.5 w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <span className="text-xs text-gray-400">Fin</span>
              <input
                type="date"
                value={filters.endDate}
                min={filters.startDate}
                max={opts.maxDate}
                onChange={(e) => onChange({ endDate: e.target.value })}
                className="mt-0.5 w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Sede */}
        {opts.sites.length > 0 && (
          <MultiSelect
            label="Sede"
            options={opts.sites}
            selected={filters.sites}
            onChange={(v) => onChange({ sites: v })}
          />
        )}

        {/* Cámara */}
        {opts.channels.length > 0 && (
          <MultiSelect
            label="Cámara"
            options={opts.channels}
            selected={filters.channels}
            onChange={(v) => onChange({ channels: v })}
          />
        )}

        {/* Zona */}
        {opts.zones.length > 0 && (
          <MultiSelect
            label="Zona"
            options={opts.zones}
            selected={filters.zones}
            onChange={(v) => onChange({ zones: v })}
          />
        )}

        <Separator />

        {/* Rango horario */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Rango horario
            </label>
            <span className="text-xs text-gray-400">
              {filters.hourMin}h – {filters.hourMax}h
            </span>
          </div>
          <Slider
            min={0}
            max={23}
            step={1}
            value={[filters.hourMin, filters.hourMax]}
            onValueChange={(v) => {
              const [min, max] = v as [number, number];
              onChange({ hourMin: min, hourMax: max });
            }}
            className="mt-1"
          />
        </div>

        {/* Días de semana */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Días de semana
          </label>
          <div className="flex flex-wrap gap-1.5">
            {DOWS.map((d, i) => (
              <Badge
                key={d}
                variant={filters.dows.includes(i) ? "default" : "outline"}
                className="cursor-pointer text-xs select-none"
                onClick={() =>
                  onChange({
                    dows: filters.dows.includes(i)
                      ? filters.dows.filter((x) => x !== i)
                      : [...filters.dows, i],
                  })
                }
              >
                {d}
              </Badge>
            ))}
          </div>
        </div>

        <Separator />

        {/* Unidad */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Unidad de análisis
          </label>
          <Select
            value={filters.metricMode}
            onValueChange={(v) => onChange({ metricMode: v as "Eventos" | "Personas" })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Eventos">Eventos</SelectItem>
              <SelectItem value="Personas">Personas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-100">
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {loading ? "Actualizando..." : "Actualizar datos"}
        </button>
      </div>
    </aside>
  );
}

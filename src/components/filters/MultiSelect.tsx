/**
 * MultiSelect — reusable badge-based multi-option selector.
 * SRP: renders a labeled group of toggleable badges.
 * ISP: minimal props — only what the component actually needs.
 */
"use client";

import { Badge } from "@/components/ui/badge";

interface MultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}

export function MultiSelect({ label, options, selected, onChange }: MultiSelectProps) {
  const allSelected = selected.length === options.length;

  function toggle(opt: string) {
    onChange(
      selected.includes(opt)
        ? selected.filter((s) => s !== opt)
        : [...selected, opt],
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {label}
        </span>
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
            onClick={() => toggle(opt)}
          >
            {opt}
          </Badge>
        ))}
      </div>
    </div>
  );
}

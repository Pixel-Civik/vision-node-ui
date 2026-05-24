"use client";

import { useState, useRef, useEffect } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar, CalendarRange, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

export type DateMode = "single" | "range";

interface DatePickerProps {
  mode: DateMode;
  startDate: string;          // YYYY-MM-DD
  endDate: string;            // YYYY-MM-DD (= startDate in single mode)
  minDate: string;            // first date with data
  maxDate: string;            // today
  availableDates: Set<string>; // dates with at least one event — others are disabled
  onModeChange: (m: DateMode) => void;
  onChange: (start: string, end: string) => void;
}

// Local date (avoids UTC timezone shift)
function localDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtSingle(iso: string) {
  return format(localDate(iso), "d 'de' MMMM yyyy", { locale: es });
}

function fmtRange(start: string, end: string) {
  if (start === end) return fmtSingle(start);
  const s = localDate(start);
  const e = localDate(end);
  // Same month/year: "1 – 15 mayo 2026"; different: "28 abr – 3 may 2026"
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${format(s, "d", { locale: es })} – ${format(e, "d MMM yyyy", { locale: es })}`;
  }
  return `${format(s, "d MMM", { locale: es })} – ${format(e, "d MMM yyyy", { locale: es })}`;
}

export function DatePicker({
  mode, startDate, endDate, minDate, maxDate, availableDates,
  onModeChange, onChange,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click (use capture so it works even inside portals)
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const min = localDate(minDate);
  const max = localDate(maxDate);
  const startD = localDate(startDate);
  const endD   = localDate(endDate);

  // Days with events get a dot indicator; ALL days in min-max are selectable
  const hasData = availableDates.size > 0
    ? (day: Date) => availableDates.has(toIso(day))
    : () => false;

  const label = mode === "single" ? fmtSingle(startDate) : fmtRange(startDate, endDate);

  function handleSingleSelect(day: Date | undefined) {
    if (!day) return;
    const iso = toIso(day);
    onChange(iso, iso);
    setOpen(false);
  }

  function handleRangeSelect(range: DateRange | undefined) {
    if (!range?.from) return;
    const s = toIso(range.from);
    const e = range.to ? toIso(range.to) : s;
    onChange(s, e);
    if (range.to) setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      {/* Mode toggle — only signals the mode change; parent handles date adjustments */}
      <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 w-fit mb-2">
        <ModeBtn
          active={mode === "single"}
          icon={<Calendar size={11} />}
          label="Fecha"
          onClick={() => onModeChange("single")}
        />
        <ModeBtn
          active={mode === "range"}
          icon={<CalendarRange size={11} />}
          label="Rango"
          onClick={() => onModeChange("range")}
        />
      </div>

      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 text-xs border rounded-xl px-3 py-2 bg-white transition-all w-full max-w-[220px] justify-between ${
          open
            ? "border-[#2DD4BF] ring-2 ring-[#2DD4BF]/20 shadow-sm"
            : "border-gray-200 hover:border-[#2DD4BF]/50 hover:shadow-sm"
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Calendar size={13} className="text-[#2DD4BF] shrink-0" />
          <span className="text-slate-700 font-medium truncate">{label}</span>
        </span>
        <ChevronDown
          size={12}
          className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Popover calendar */}
      {open && (
        <div className="absolute z-50 mt-2 left-0 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4">
          {mode === "single" ? (
            <DayPicker
              mode="single"
              selected={startD}
              onSelect={handleSingleSelect}
              defaultMonth={startD}
              disabled={[{ before: min }, { after: max }]}
              modifiers={{ has_data: hasData }}
              modifiersClassNames={{ has_data: "rdp-has-data" }}
              locale={es}
              showOutsideDays={false}
              components={{
                Chevron: ({ orientation }) =>
                  orientation === "left"
                    ? <ChevronLeft size={15} />
                    : <ChevronRight size={15} />,
              }}
            />
          ) : (
            <DayPicker
              mode="range"
              selected={{ from: startD, to: endD }}
              onSelect={handleRangeSelect}
              defaultMonth={startD}
              disabled={[{ before: min }, { after: max }]}
              modifiers={{ has_data: hasData }}
              modifiersClassNames={{ has_data: "rdp-has-data" }}
              locale={es}
              showOutsideDays={false}
              numberOfMonths={2}
              components={{
                Chevron: ({ orientation }) =>
                  orientation === "left"
                    ? <ChevronLeft size={15} />
                    : <ChevronRight size={15} />,
              }}
            />
          )}

          {/* Data availability note */}
          <p className="text-[10px] text-slate-400 mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2DD4BF] shrink-0" />
            Datos desde{" "}
            <span className="font-medium text-slate-500">
              {format(min, "d MMM yyyy", { locale: es })}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

function ModeBtn({
  active, icon, label, onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md transition-all font-medium ${
        active
          ? "bg-white text-slate-800 shadow-sm"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

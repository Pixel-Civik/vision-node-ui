"use client"

import { useState, useEffect, useRef } from "react"
import { format, parse, isValid } from "date-fns"
import { es } from "date-fns/locale"
import { Calendar as CalendarIcon, CalendarRange, AlertTriangle, Info } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export type DateMode = "single" | "range"

interface DatePickerProps {
  mode: DateMode
  startDate: string
  endDate: string
  minDate: string
  maxDate: string
  availableDates: Set<string>
  onModeChange: (m: DateMode) => void
  onChange: (start: string, end: string) => void
  /** Aviso externo (del panel de filtros) sobre el rango activo */
  filterWarning?: { type: "error" | "warning" | "info"; msg: string } | null
}

// ── helpers ────────────────────────────────────────────────────────────────────

function isoToLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function isoToDisplay(iso: string): string {
  try {
    const d = isoToLocal(iso)
    return isValid(d) ? format(d, "dd/MM/yyyy") : ""
  } catch { return "" }
}

function displayToIso(display: string): string | null {
  if (display.length !== 10) return null
  try {
    const d = parse(display, "dd/MM/yyyy", new Date())
    return isValid(d) ? dateToIso(d) : null
  } catch { return null }
}

function fmtShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  const M = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]
  return `${d} ${M[m - 1]} ${y}`
}

/** Auto-inserta barras y auto-prefija dígitos imposibles */
function autoSlash(raw: string): string {
  let digits = raw.replace(/\D/g, "").slice(0, 8)
  // Día: primer dígito > 3 → "0X"
  if (digits.length >= 1 && Number(digits[0]) > 3)
    digits = ("0" + digits).slice(0, 8)
  // Mes: primer dígito del mes > 1 → "0X"
  if (digits.length >= 3 && Number(digits[2]) > 1)
    digits = (digits.slice(0, 2) + "0" + digits.slice(2)).slice(0, 8)

  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

// ── Tooltip posicionado debajo del campo ──────────────────────────────────────

function FieldTooltip({ msg, type }: { msg: string; type: "error" | "warning" | "info" }) {
  const colors = {
    error:   { bg: "bg-red-700",   icon: <AlertTriangle size={11} className="shrink-0 mt-0.5 text-red-200" /> },
    warning: { bg: "bg-amber-600", icon: <AlertTriangle size={11} className="shrink-0 mt-0.5 text-amber-100" /> },
    info:    { bg: "bg-slate-700", icon: <Info size={11} className="shrink-0 mt-0.5 text-slate-200" /> },
  }
  const { bg, icon } = colors[type]
  return (
    <div className="absolute top-full left-0 mt-1 z-[100] max-w-[260px] pointer-events-none">
      {/* flecha */}
      <div className={`ml-4 w-2.5 h-2.5 rotate-45 rounded-[2px] ${bg}`} style={{ marginBottom: "-5px" }} />
      <div className={`${bg} text-white rounded-lg px-3 py-2 text-[11px] shadow-xl leading-snug flex items-start gap-1.5`}>
        {icon}
        <span>{msg}</span>
      </div>
    </div>
  )
}

// ── componente principal ───────────────────────────────────────────────────────

export function DatePicker({
  mode, startDate, endDate, minDate, maxDate,
  onModeChange, onChange, filterWarning,
}: DatePickerProps) {
  const [openStart, setOpenStart] = useState(false)
  const [openEnd,   setOpenEnd]   = useState(false)

  const [startInput, setStartInput] = useState(isoToDisplay(startDate))
  const [endInput,   setEndInput]   = useState(isoToDisplay(endDate))

  const [startOk, setStartOk] = useState(true)
  const [endOk,   setEndOk]   = useState(true)

  // Mensaje de aviso de entrada (tipeo inválido/fuera de rango)
  const [inputWarn, setInputWarn] = useState<{ type: "error"|"warning"|"info"; msg: string } | null>(null)
  const warnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function showWarn(type: "error"|"warning"|"info", msg: string) {
    clearTimeout(warnTimer.current)
    setInputWarn({ type, msg })
    warnTimer.current = setTimeout(() => setInputWarn(null), 4000)
  }
  function clearWarn() {
    clearTimeout(warnTimer.current)
    setInputWarn(null)
  }

  useEffect(() => { setStartInput(isoToDisplay(startDate)); setStartOk(true) }, [startDate])
  useEffect(() => { setEndInput(isoToDisplay(endDate));     setEndOk(true)   }, [endDate])
  // Limpia el aviso de entrada cuando llega un aviso del filtro
  useEffect(() => { if (filterWarning) clearWarn() }, [filterWarning])

  const minD = isoToLocal(minDate)
  const maxD = isoToLocal(maxDate)

  function validateIso(iso: string): boolean {
    return iso >= minDate && iso <= maxDate
  }

  function handleStartTyping(raw: string) {
    const formatted = autoSlash(raw)
    setStartInput(formatted)
    const iso = displayToIso(formatted)
    if (!iso) { if (formatted.length === 10) { setStartOk(false); showWarn("error", "Fecha inválida") } return }

    if (!validateIso(iso)) {
      setStartOk(false)
      if (iso > maxDate)
        showWarn("warning", `Fecha en el futuro — último dato: ${fmtShort(maxDate)}`)
      else
        showWarn("warning", `Sin datos antes del ${fmtShort(minDate)}`)
      return
    }

    setStartOk(true)
    clearWarn()
    if (mode === "single") {
      onChange(iso, iso)
    } else {
      onChange(iso, iso > endDate ? iso : endDate)
    }
  }

  function handleEndTyping(raw: string) {
    const formatted = autoSlash(raw)
    setEndInput(formatted)
    const iso = displayToIso(formatted)
    if (!iso) { if (formatted.length === 10) { setEndOk(false); showWarn("error", "Fecha inválida") } return }

    if (!validateIso(iso)) {
      setEndOk(false)
      if (iso > maxDate)
        showWarn("warning", `Fecha en el futuro — último dato: ${fmtShort(maxDate)}`)
      else
        showWarn("warning", `Sin datos antes del ${fmtShort(minDate)}`)
      return
    }

    setEndOk(true)
    clearWarn()
    onChange(iso < startDate ? iso : startDate, iso)
  }

  function handleRangeSelect(range: DateRange | undefined, close: () => void) {
    if (!range?.from) return
    const s = dateToIso(range.from)
    const e = range.to ? dateToIso(range.to) : s
    onChange(s, e)
    if (range.to) close()
  }

  // El aviso activo: prioridad al de entrada (tipeo), luego al del filtro
  const activeWarn = inputWarn ?? filterWarning ?? null

  const inputCls = "text-slate-700 font-medium bg-transparent border-none outline-none text-xs"
  const boxCls = cn(
    "flex items-center gap-2 border rounded-xl px-3 py-2 bg-white text-xs transition-all",
    "hover:border-[#2DD4BF]/50 focus-within:border-[#2DD4BF] focus-within:ring-2 focus-within:ring-[#2DD4BF]/20",
  )
  const errBorder = "border-red-400 hover:border-red-400 focus-within:border-red-400 focus-within:ring-red-200"
  const okBorder  = "border-gray-200"

  return (
    <div className="flex flex-col gap-2">
      {/* ── Selector de modo ── */}
      <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 w-fit">
        <ModeBtn active={mode === "single"} icon={<CalendarIcon size={11} />} label="Fecha" onClick={() => onModeChange("single")} />
        <ModeBtn active={mode === "range"}  icon={<CalendarRange size={11} />} label="Rango" onClick={() => onModeChange("range")} />
      </div>

      {/* ── Campo fecha con tooltip relativo ── */}
      <div className="relative w-fit">

        {/* Modo fecha única */}
        {mode === "single" && (
          <div className={cn(boxCls, startOk ? okBorder : errBorder)}>
            <input
              value={startInput}
              onChange={(e) => handleStartTyping(e.target.value)}
              placeholder="dd/mm/aaaa"
              maxLength={10}
              className={cn(inputCls, "w-[94px]")}
            />
            <Popover open={openStart} onOpenChange={setOpenStart}>
              <PopoverTrigger render={<button type="button" className="shrink-0 hover:opacity-70 transition-opacity" />}>
                <CalendarIcon size={13} className="text-[#2DD4BF]" />
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={isoToLocal(startDate)}
                  onSelect={(day) => { if (!day) return; const iso = dateToIso(day); onChange(iso, iso); setOpenStart(false) }}
                  defaultMonth={isoToLocal(startDate)}
                  disabled={[{ before: minD }, { after: maxD }]}
                  locale={es}
                  captionLayout="dropdown"
                  startMonth={minD}
                  endMonth={maxD}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Modo rango */}
        {mode === "range" && (
          <div className={cn(boxCls, (!startOk || !endOk) ? errBorder : okBorder)}>
            <span className="text-slate-400 text-[10px] shrink-0">De</span>
            <input
              value={startInput}
              onChange={(e) => handleStartTyping(e.target.value)}
              placeholder="dd/mm/aaaa"
              maxLength={10}
              className={cn(inputCls, "w-[88px]")}
            />
            <Popover open={openStart} onOpenChange={setOpenStart}>
              <PopoverTrigger render={<button type="button" className="shrink-0 hover:opacity-70 transition-opacity" />}>
                <CalendarIcon size={12} className="text-[#2DD4BF]" />
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={{ from: isoToLocal(startDate), to: isoToLocal(endDate) }}
                  onSelect={(r) => handleRangeSelect(r, () => setOpenStart(false))}
                  defaultMonth={isoToLocal(startDate)}
                  disabled={[{ before: minD }, { after: maxD }]}
                  locale={es}
                  captionLayout="dropdown"
                  startMonth={minD}
                  endMonth={maxD}
                  numberOfMonths={1}
                />
              </PopoverContent>
            </Popover>

            <span className="text-slate-300 shrink-0">→</span>

            <span className="text-slate-400 text-[10px] shrink-0">Hasta</span>
            <input
              value={endInput}
              onChange={(e) => handleEndTyping(e.target.value)}
              placeholder="dd/mm/aaaa"
              maxLength={10}
              className={cn(inputCls, "w-[88px]")}
            />
            <Popover open={openEnd} onOpenChange={setOpenEnd}>
              <PopoverTrigger render={<button type="button" className="shrink-0 hover:opacity-70 transition-opacity" />}>
                <CalendarIcon size={12} className="text-[#2DD4BF]" />
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={{ from: isoToLocal(startDate), to: isoToLocal(endDate) }}
                  onSelect={(r) => handleRangeSelect(r, () => setOpenEnd(false))}
                  defaultMonth={isoToLocal(endDate)}
                  disabled={[{ before: minD }, { after: maxD }]}
                  locale={es}
                  captionLayout="dropdown"
                  startMonth={minD}
                  endMonth={maxD}
                  numberOfMonths={1}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Tooltip posicionado debajo del campo */}
        {activeWarn && <FieldTooltip type={activeWarn.type} msg={activeWarn.msg} />}
      </div>
    </div>
  )
}

// ── ModeBtn ────────────────────────────────────────────────────────────────────

function ModeBtn({ active, icon, label, onClick }: {
  active: boolean; icon: React.ReactNode; label: string; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md transition-all font-medium",
        active ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700",
      )}
    >
      {icon}{label}
    </button>
  )
}

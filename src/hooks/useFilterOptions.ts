"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchFilterOptions, fetchDataDays, fetchDefaultRange } from "@/lib/api";
import type { DefaultRange } from "@/lib/types";

export interface FilterOptions {
  sites: string[];
  channels: string[];
  zones: string[];
  minDate: string;              // primer día con datos (Lima, YYYY-MM-DD)
  maxDate: string;              // último día con datos  (Lima, YYYY-MM-DD)
  availableDates: Set<string>;  // días que REALMENTE tienen datos
  defaultRange: DefaultRange | null;  // rango de apertura decidido por la BD
  loading: boolean;
}

const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

const EMPTY: Omit<FilterOptions, "loading"> = {
  sites: [], channels: [], zones: [],
  minDate: TODAY, maxDate: TODAY,
  availableDates: new Set<string>(),
  defaultRange: null,
};

/**
 * Opciones de filtro + días con datos + rango de apertura.
 *
 * Cambios respecto a la versión anterior:
 *
 *  - `availableDates` viene de dashboard_data_days, no de un bucle en JS que
 *    asumía que TODOS los días entre minDate y ayer tenían datos. Con el corte
 *    de servicio esa suposición pintaba puntos en el calendario para días
 *    vacíos.
 *  - `defaultRange` lo decide la BD (mes en curso, o el último mes con datos)
 *    en vez del "snap" a todo el histórico que hacía page.tsx.
 *  - La caché manual en sessionStorage se reemplaza por la de TanStack Query.
 *    Aquella se invalidaba a mano subiendo el número de versión de la clave y
 *    podía servir datos rancios indefinidamente dentro de una sesión.
 */
export function useFilterOptions(): FilterOptions {
  const opts = useQuery({
    queryKey: ["filter-options"],
    queryFn: ({ signal }) => fetchFilterOptions(signal),
    staleTime: 10 * 60_000,   // catálogos: cambian poco
  });

  const range = useQuery({
    queryKey: ["default-range"],
    queryFn: ({ signal }) => fetchDefaultRange(signal),
    staleTime: 5 * 60_000,
  });

  const days = useQuery({
    queryKey: ["data-days"],
    queryFn: ({ signal }) => fetchDataDays(undefined, undefined, signal),
    staleTime: 10 * 60_000,
  });

  if (!opts.data) {
    return { ...EMPTY, defaultRange: range.data ?? null, loading: opts.isPending };
  }

  return {
    sites:          opts.data.sites,
    channels:       opts.data.channels,
    zones:          opts.data.zones,
    minDate:        opts.data.minDate,
    maxDate:        opts.data.maxDate,
    availableDates: new Set(days.data ?? []),
    defaultRange:   range.data ?? null,
    // El rango de apertura es obligatorio antes de consultar: sin él page.tsx
    // dispararía una consulta con fechas provisionales y luego otra con las
    // reales — la doble carga que ya existía antes.
    loading:        opts.isPending || range.isPending,
  };
}

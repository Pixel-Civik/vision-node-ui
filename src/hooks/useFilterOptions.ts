"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchDashboardBootstrap } from "@/lib/api";
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
  const bootstrap = useQuery({
    queryKey: ["dashboard-bootstrap"],
    queryFn: ({ signal }) => fetchDashboardBootstrap(signal),
    staleTime: 10 * 60_000,
  });

  if (!bootstrap.data) {
    return { ...EMPTY, loading: bootstrap.isPending };
  }

  const data = bootstrap.data;

  return {
    sites:          data.sites ?? [],
    channels:       data.channels ?? [],
    zones:          data.zones ?? [],
    minDate:        data.min_date ?? TODAY,
    maxDate:        data.max_date ?? TODAY,
    availableDates: new Set(data.available_dates ?? []),
    defaultRange:   data.default_range ?? null,
    // El rango de apertura es obligatorio antes de consultar: sin él page.tsx
    // dispararía una consulta con fechas provisionales y luego otra con las
    // reales — la doble carga que ya existía antes.
    loading:        bootstrap.isPending,
  };
}

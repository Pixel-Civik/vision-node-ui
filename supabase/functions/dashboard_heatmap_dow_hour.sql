-- ============================================================
-- dashboard_heatmap_dow_hour
-- Devuelve el PROMEDIO de entradas por día de semana y hora Lima.
-- Para cada celda (dow, hour): total_entradas / n_días_distintos_de_ese_dow.
-- Convenio DOW: Lun=0 … Dom=6.
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION public.dashboard_heatmap_dow_hour(
  p_start_ts  timestamptz,
  p_end_ts    timestamptz,
  p_sites     text[]  DEFAULT NULL,
  p_channels  text[]  DEFAULT NULL,
  p_zones     text[]  DEFAULT NULL,
  p_hour_min  int     DEFAULT 0,
  p_hour_max  int     DEFAULT 23,
  p_dows      int[]   DEFAULT NULL
)
RETURNS TABLE(dow int, hour int, count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH
  -- Cuántos días distintos de cada DOW existen en el rango (sobre TODOS los eventos,
  -- sin filtrar sede/cámara/zona para no subcontar días con datos parciales).
  dow_days AS (
    SELECT
      ((EXTRACT(DOW FROM (time AT TIME ZONE 'America/Lima'))::int - 1 + 7) % 7) AS dow,
      COUNT(DISTINCT (time AT TIME ZONE 'America/Lima')::date)::int              AS n_days
    FROM tracking_logs_view
    WHERE time BETWEEN p_start_ts AND p_end_ts
    GROUP BY 1
  ),
  -- Total acumulado de entradas por (dow, hour) con todos los filtros aplicados
  totals AS (
    SELECT
      ((EXTRACT(DOW FROM (time AT TIME ZONE 'America/Lima'))::int - 1 + 7) % 7) AS dow,
      EXTRACT(HOUR FROM (time AT TIME ZONE 'America/Lima'))::int                  AS hour,
      COUNT(*)::int                                                                AS total
    FROM tracking_logs_view
    WHERE
      time BETWEEN p_start_ts AND p_end_ts
      AND event = 'enter'
      AND (p_sites    IS NULL OR site    = ANY(p_sites))
      AND (p_channels IS NULL OR channel = ANY(p_channels))
      AND (p_zones    IS NULL OR zone    = ANY(p_zones))
      AND EXTRACT(HOUR FROM (time AT TIME ZONE 'America/Lima'))
          BETWEEN p_hour_min AND p_hour_max
      AND (
        p_dows IS NULL
        OR ((EXTRACT(DOW FROM (time AT TIME ZONE 'America/Lima'))::int - 1 + 7) % 7)
           = ANY(p_dows)
      )
    GROUP BY 1, 2
  )
  SELECT
    t.dow,
    t.hour,
    ROUND(t.total::numeric / GREATEST(d.n_days, 1))::int AS count
  FROM totals t
  JOIN dow_days d ON d.dow = t.dow
  ORDER BY t.dow, t.hour
$$;

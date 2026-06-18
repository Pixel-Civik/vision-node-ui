-- ============================================================
-- dashboard_hourly_avg
-- Igual que dashboard_hourly_totals pero devuelve el promedio
-- por día (total ÷ días distintos del período).
-- Para períodos de 1 día el resultado es idéntico al total.
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION public.dashboard_hourly_avg(
  p_start_ts  timestamptz,
  p_end_ts    timestamptz,
  p_sites     text[]  DEFAULT NULL,
  p_channels  text[]  DEFAULT NULL,
  p_zones     text[]  DEFAULT NULL,
  p_hour_min  int     DEFAULT 0,
  p_hour_max  int     DEFAULT 23,
  p_dows      int[]   DEFAULT NULL
)
RETURNS TABLE(hour int, event_type text, count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH filtered AS (
    SELECT
      (time AT TIME ZONE 'America/Lima')::date                              AS day_lima,
      EXTRACT(HOUR FROM (time AT TIME ZONE 'America/Lima'))::int            AS hour_lima,
      event                                                                  AS event_type
    FROM tracking_logs_view
    WHERE
      time BETWEEN p_start_ts AND p_end_ts
      AND event IN ('enter', 'exit', 'visitor', 'pasante')
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
  ),
  n_days AS (
    SELECT GREATEST(COUNT(DISTINCT day_lima), 1)::int AS v FROM filtered
  ),
  totals AS (
    SELECT hour_lima AS hour, event_type, COUNT(*)::int AS total
    FROM filtered
    GROUP BY hour_lima, event_type
  )
  SELECT
    t.hour,
    t.event_type,
    ROUND(t.total::numeric / n.v)::int AS count
  FROM totals t, n_days n
  ORDER BY t.hour, t.event_type
$$;

-- ============================================================
-- dashboard_hourly_totals
-- Devuelve conteos de eventos agrupados por hora del día (zona Lima).
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION public.dashboard_hourly_totals(
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
  SELECT
    EXTRACT(HOUR FROM (time AT TIME ZONE 'America/Lima'))::int   AS hour,
    event                                                         AS event_type,
    COUNT(*)::int                                                 AS count
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
  GROUP BY hour, event_type
  ORDER BY hour, event_type
$$;

-- ============================================================
-- dashboard_tiz_zone_stats
-- Reemplaza el fetch de 50 000 filas crudas en fetchTIZKpis.
-- Devuelve avg / mediana / p90 de dwell_sec por zona, server-side.
-- ============================================================

CREATE OR REPLACE FUNCTION dashboard_tiz_zone_stats(
  p_start_ts  timestamptz,
  p_end_ts    timestamptz,
  p_sites     text[]  DEFAULT NULL,
  p_channels  text[]  DEFAULT NULL,
  p_zones     text[]  DEFAULT NULL,
  p_hour_min  int     DEFAULT 0,
  p_hour_max  int     DEFAULT 23,
  p_dows      int[]   DEFAULT NULL
)
RETURNS TABLE(
  zone      text,
  count     bigint,
  avg_s     numeric,
  median_s  numeric,
  p90_s     numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COALESCE(zone, 'sin zona')                                       AS zone,
    COUNT(*)                                                         AS count,
    ROUND(AVG(dwell_sec)::numeric, 2)                                AS avg_s,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dwell_sec)::numeric  AS median_s,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY dwell_sec)::numeric  AS p90_s
  FROM tracking_logs_view
  WHERE
    time BETWEEN p_start_ts AND p_end_ts
    AND event = 'visit'
    AND dwell_sec IS NOT NULL
    AND (p_sites    IS NULL OR site    = ANY(p_sites))
    AND (p_channels IS NULL OR channel = ANY(p_channels))
    AND (p_zones    IS NULL OR zone    = ANY(p_zones))
    AND EXTRACT(HOUR FROM (time AT TIME ZONE 'America/Lima'))
        BETWEEN p_hour_min AND p_hour_max
    AND (
      p_dows IS NULL
      OR ((EXTRACT(DOW FROM (time AT TIME ZONE 'America/Lima'))::int - 1 + 7) % 7) = ANY(p_dows)
    )
  GROUP BY COALESCE(zone, 'sin zona')
  ORDER BY count DESC
$$;

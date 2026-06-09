-- ============================================================
-- dashboard_daily_totals
-- Reemplaza el fetch de hasta 100 000 filas crudas en fetchDailyTotals.
-- Devuelve enters y exits agrupados por día (hora Lima).
-- ============================================================

CREATE OR REPLACE FUNCTION dashboard_daily_totals(
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
  date    text,
  enters  bigint,
  exits   bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    to_char(
      (time AT TIME ZONE 'America/Lima')::date,
      'YYYY-MM-DD'
    )                                                   AS date,
    COUNT(*) FILTER (WHERE event = 'enter')             AS enters,
    COUNT(*) FILTER (WHERE event = 'exit')              AS exits
  FROM tracking_logs_view
  WHERE
    time BETWEEN p_start_ts AND p_end_ts
    AND event IN ('enter', 'exit')
    AND (p_sites    IS NULL OR site    = ANY(p_sites))
    AND (p_channels IS NULL OR channel = ANY(p_channels))
    AND (p_zones    IS NULL OR zone    = ANY(p_zones))
    AND EXTRACT(HOUR FROM (time AT TIME ZONE 'America/Lima'))
        BETWEEN p_hour_min AND p_hour_max
    AND (
      p_dows IS NULL
      OR ((EXTRACT(DOW FROM (time AT TIME ZONE 'America/Lima'))::int - 1 + 7) % 7) = ANY(p_dows)
    )
  GROUP BY to_char((time AT TIME ZONE 'America/Lima')::date, 'YYYY-MM-DD')
  ORDER BY 1
$$;

-- ============================================================
-- dashboard_daily_trend
-- Reemplaza el fetch masivo de filas crudas por una agregación
-- server-side. Devuelve una fila por día con enters + pasantes.
-- ============================================================

CREATE OR REPLACE FUNCTION dashboard_daily_trend(
  p_start_ts  timestamptz,
  p_end_ts    timestamptz,
  p_sites     text[]  DEFAULT NULL,
  p_channels  text[]  DEFAULT NULL,
  p_zones     text[]  DEFAULT NULL,
  p_hour_min  int     DEFAULT 0,
  p_hour_max  int     DEFAULT 23,
  p_dows      int[]   DEFAULT NULL   -- 0=Lun … 6=Dom  (igual que el filtro)
)
RETURNS TABLE(
  date      text,
  enters    bigint,
  pasantes  bigint,
  conv      numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    to_char(
      (time AT TIME ZONE 'America/Lima')::date,
      'YYYY-MM-DD'
    )                                                         AS date,
    COUNT(*) FILTER (WHERE event = 'enter')                  AS enters,
    COUNT(*) FILTER (WHERE event = 'pasante')                AS pasantes,
    ROUND(
      COUNT(*) FILTER (WHERE event = 'enter')::numeric
      / NULLIF(COUNT(*) FILTER (WHERE event = 'pasante'), 0)
      * 100,
      1
    )                                                         AS conv
  FROM tracking_logs_view
  WHERE
    time BETWEEN p_start_ts AND p_end_ts
    AND event IN ('enter', 'pasante')
    -- Filtro de sede
    AND (p_sites    IS NULL OR site    = ANY(p_sites))
    -- Filtro de cámara
    AND (p_channels IS NULL OR channel = ANY(p_channels))
    -- Filtro de zona
    AND (p_zones    IS NULL OR zone    = ANY(p_zones))
    -- Filtro de hora (Lima local)
    AND EXTRACT(HOUR FROM (time AT TIME ZONE 'America/Lima'))
        BETWEEN p_hour_min AND p_hour_max
    -- Filtro de día de semana
    -- Postgres: 0=Dom,1=Lun…6=Sáb  →  convertir a 0=Lun…6=Dom del filtro:
    --   dow_filtro = (pg_dow - 1 + 7) % 7
    AND (
      p_dows IS NULL
      OR ((EXTRACT(DOW FROM (time AT TIME ZONE 'America/Lima'))::int - 1 + 7) % 7)
         = ANY(p_dows)
    )
  GROUP BY 1
  ORDER BY 1;
$$;

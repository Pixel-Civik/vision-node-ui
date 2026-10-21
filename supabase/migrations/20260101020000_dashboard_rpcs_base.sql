-- ============================================================================
-- RPC del dashboard · promovidas desde supabase/functions/
-- ============================================================================
-- Estas 8 funciones no estaban en ninguna migración. Un proyecto creado desde
-- migrations/ arrancaba sin ellas y el dashboard quedaba inservible.
--
-- Todas dependen únicamente de public.tracking_logs_view, creada en la
-- baseline 20260101000000, por eso se aplican inmediatamente después.
--
-- NO se promueven dashboard_filter_options ni dashboard_gender_age: los
-- archivos sueltos son versiones ANTIGUAS. Las vigentes ya están en
-- 20260829_database_io_optimization.sql, que se aplica después de este archivo
-- y por tanto gana. Lo mismo con dashboard_default_range, dashboard_ref_period
-- y dashboard_compare, que viven en dashboard_v7_server_logic.sql pero cuya
-- versión vigente está en 20260829.
--
-- Todas son SECURITY DEFINER: leen events saltándose RLS. En Postgres el
-- EXECUTE de una función se concede a PUBLIC por defecto, así que cualquiera
-- con la anon key puede invocarlas. Ver optional/anon_read_paridad_produccion.sql.
-- ============================================================================


-- ─── dashboard_daily_totals ───────────────────────────────────────────────
-- origen: supabase/functions/dashboard_daily_totals.sql

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


-- ─── dashboard_hourly_totals ──────────────────────────────────────────────
-- origen: supabase/functions/dashboard_hourly_totals.sql

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


-- ─── dashboard_daily_trend ────────────────────────────────────────────────
-- origen: supabase/functions/dashboard_daily_trend.sql

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


-- ─── dashboard_hourly_avg ─────────────────────────────────────────────────
-- origen: supabase/functions/dashboard_hourly_avg.sql

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


-- ─── dashboard_tiz_zone_stats ─────────────────────────────────────────────
-- origen: supabase/functions/dashboard_tiz_zone_stats.sql

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


-- ─── dashboard_heatmap_dow_hour ───────────────────────────────────────────
-- origen: supabase/functions/dashboard_heatmap_dow_hour.sql

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


-- ─── dashboard_data_days ──────────────────────────────────────────────────
-- origen: supabase/functions/dashboard_v7_server_logic.sql (bloque extraído)

CREATE OR REPLACE FUNCTION public.dashboard_data_days(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE(day text, events bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET statement_timeout TO '20s'
SET plan_cache_mode TO 'force_custom_plan'
AS $function$
  SELECT
    to_char((time AT TIME ZONE 'America/Lima')::date, 'YYYY-MM-DD') AS day,
    COUNT(*)::bigint                                                AS events
  FROM public.events
  WHERE (p_from IS NULL OR time >=  (p_from::timestamp        AT TIME ZONE 'America/Lima'))
    AND (p_to   IS NULL OR time <  ((p_to + 1)::timestamp     AT TIME ZONE 'America/Lima'))
  GROUP BY 1
  ORDER BY 1;
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. dashboard_default_range — qué rango abre el dashboard
--
-- Regla: el MES en curso. Si el mes en curso todavía no tiene ningún dato
-- (sistema apagado), cae al último mes que sí tuvo. Así nunca abre vacío ni
-- arrastra todo el histórico.
--
-- Sustituye el "snap" de page.tsx:71-81 que abría en minDate..maxDate, o sea
-- los 170k eventos completos, causa raíz de los timeouts de carga.
-- ────────────────────────────────────────────────────────────────────────────


-- ─── dashboard_overview ───────────────────────────────────────────────────
-- origen: supabase/functions/dashboard_v7_server_logic.sql (bloque extraído)

CREATE OR REPLACE FUNCTION public.dashboard_overview(
  p_start_ts timestamptz,
  p_end_ts   timestamptz,
  p_sites    text[] DEFAULT NULL,
  p_channels text[] DEFAULT NULL,
  p_zones    text[] DEFAULT NULL,
  p_hour_min int    DEFAULT 0,
  p_hour_max int    DEFAULT 23,
  p_dows     int[]  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET statement_timeout TO '30s'
-- Sin esto Postgres cachea un plan genérico tras 5 llamadas: como no conoce el
-- ancho real del rango, estima pocas filas y elige un nested loop que reescanea
-- sites/cameras/event_types una vez POR FILA (medido: 408k buffers vs 17k).
-- Forzar plan a medida hace que replanifique con los parámetros reales.
SET plan_cache_mode TO 'force_custom_plan'
AS $function$
  WITH graw AS (
    -- Grano mínimo sobre events. Colapsa ~117k filas en ~2k, así que todos los
    -- agregados de abajo trabajan en memoria y las dimensiones se unen una sola
    -- vez al final, contra ese resultado chico.
    SELECT
      (e.time AT TIME ZONE 'America/Lima')::date                              AS local_date,
      (extract(isodow FROM (e.time AT TIME ZONE 'America/Lima'))::int - 1)    AS dow,
      extract(hour FROM (e.time AT TIME ZONE 'America/Lima'))::int            AS hour,
      e.event_type_id,
      e.camera_id,
      e.zone,
      COUNT(*)::bigint                                                        AS n
    FROM public.events e
    WHERE e.time >= p_start_ts
      AND e.time <= p_end_ts
      AND (p_sites    IS NULL OR e.site_id   IN (SELECT id FROM public.sites   WHERE name    = ANY(p_sites)))
      AND (p_channels IS NULL OR e.camera_id IN (SELECT id FROM public.cameras WHERE channel = ANY(p_channels)))
      AND (p_zones    IS NULL OR e.zone      = ANY(p_zones))
      AND (p_hour_min IS NULL OR extract(hour FROM (e.time AT TIME ZONE 'America/Lima'))::int
           BETWEEN p_hour_min AND p_hour_max)
      AND (p_dows IS NULL OR
           (extract(isodow FROM (e.time AT TIME ZONE 'America/Lima'))::int - 1) = ANY(p_dows))
    GROUP BY 1, 2, 3, 4, 5, 6
  ), g AS (
    SELECT
      gr.local_date, gr.dow, gr.hour, gr.zone, gr.n,
      dashboard_event_norm(et.code) AS event_type,
      cam.channel
    FROM graw gr
    JOIN      public.event_types et  ON et.id  = gr.event_type_id
    LEFT JOIN public.cameras     cam ON cam.id = gr.camera_id
  ), ut AS (
    -- Tracks únicos: no se puede derivar del grano, va en pasada angosta.
    -- Solo enter/exit, igual que dashboard_kpi_enter_exit — contar todos los
    -- tipos inflaría el número.
    SELECT COUNT(DISTINCT e.track_id)::bigint AS n
    FROM public.events e
    WHERE e.time >= p_start_ts
      AND e.time <= p_end_ts
      AND e.event_type_id IN (SELECT id FROM public.event_types WHERE dashboard_event_norm(code) IN ('enter','exit'))
      AND (p_sites    IS NULL OR e.site_id   IN (SELECT id FROM public.sites   WHERE name    = ANY(p_sites)))
      AND (p_channels IS NULL OR e.camera_id IN (SELECT id FROM public.cameras WHERE channel = ANY(p_channels)))
      AND (p_zones    IS NULL OR e.zone      = ANY(p_zones))
      AND (p_hour_min IS NULL OR extract(hour FROM (e.time AT TIME ZONE 'America/Lima'))::int
           BETWEEN p_hour_min AND p_hour_max)
      AND (p_dows IS NULL OR
           (extract(isodow FROM (e.time AT TIME ZONE 'America/Lima'))::int - 1) = ANY(p_dows))
  ), nd AS (
    SELECT GREATEST(COUNT(DISTINCT local_date), 1)::int AS days FROM g
  ), kpi AS (
    SELECT
      COALESCE(SUM(n) FILTER (WHERE event_type = 'enter'),   0)::bigint AS enters,
      COALESCE(SUM(n) FILTER (WHERE event_type = 'exit'),    0)::bigint AS exits,
      COALESCE(SUM(n) FILTER (WHERE event_type = 'visitor'), 0)::bigint AS visitors,
      COALESCE(SUM(n) FILTER (WHERE event_type = 'pasante'), 0)::bigint AS pasantes,
      (SELECT n FROM ut)                                                AS unique_tracks
    FROM g
  ), hourly AS (
    SELECT hour, event_type, SUM(n)::int AS count
    FROM g
    WHERE event_type IN ('enter','exit','visitor','pasante')
    GROUP BY 1, 2
  ), hourly_avg AS (
    SELECT hour, event_type,
           ROUND(count::numeric / (SELECT days FROM nd))::int AS count
    FROM hourly
  ), conv AS (
    -- Conversión sobre el promedio diario, igual que computeConversionFromHourly(hourlyAvg)
    SELECT
      hour,
      COALESCE(SUM(count) FILTER (WHERE event_type = 'pasante'), 0)::int AS pasantes,
      COALESCE(SUM(count) FILTER (WHERE event_type = 'visitor'), 0)::int AS visitors,
      COALESCE(SUM(count) FILTER (WHERE event_type = 'enter'),   0)::int AS enters
    FROM hourly_avg
    WHERE event_type IN ('enter','visitor','pasante')
    GROUP BY 1
  ), zones AS (
    SELECT zone, event_type, SUM(n)::bigint AS count
    FROM g WHERE zone IS NOT NULL
    GROUP BY 1, 2
  ), channels AS (
    SELECT channel, event_type, SUM(n)::bigint AS count
    FROM g WHERE channel IS NOT NULL
    GROUP BY 1, 2
  ), dow_days AS (
    SELECT dow, COUNT(DISTINCT local_date)::int AS n_days
    FROM g GROUP BY 1
  ), heat AS (
    SELECT
      t.dow, t.hour,
      ROUND(t.total::numeric / GREATEST(d.n_days, 1))::int AS count
    FROM (
      SELECT dow, hour, SUM(n)::int AS total
      FROM g WHERE event_type = 'enter'
      GROUP BY 1, 2
    ) t
    JOIN dow_days d ON d.dow = t.dow
  ), tiz AS (
    -- Percentiles: requieren las filas crudas, así que va en pasada aparte.
    SELECT
      COALESCE(e.zone, 'sin zona')                                       AS zone,
      COUNT(*)::bigint                                                   AS count,
      ROUND(AVG(e.dwell_sec)::numeric, 2)                                AS avg_s,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY e.dwell_sec)::numeric  AS median_s,
      PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY e.dwell_sec)::numeric  AS p90_s
    FROM public.events e
    WHERE e.time >= p_start_ts
      AND e.time <= p_end_ts
      AND e.event_type_id IN (SELECT id FROM public.event_types WHERE dashboard_event_norm(code) = 'visit')
      AND e.dwell_sec IS NOT NULL
      AND (p_sites    IS NULL OR e.site_id   IN (SELECT id FROM public.sites   WHERE name    = ANY(p_sites)))
      AND (p_channels IS NULL OR e.camera_id IN (SELECT id FROM public.cameras WHERE channel = ANY(p_channels)))
      AND (p_zones    IS NULL OR e.zone      = ANY(p_zones))
      AND (p_hour_min IS NULL OR extract(hour FROM (e.time AT TIME ZONE 'America/Lima'))::int
           BETWEEN p_hour_min AND p_hour_max)
      AND (p_dows IS NULL OR
           (extract(isodow FROM (e.time AT TIME ZONE 'America/Lima'))::int - 1) = ANY(p_dows))
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'enters',         k.enters,
      'exits',          k.exits,
      'net',            k.enters - k.exits,
      'unique_tracks',  k.unique_tracks,
      'days',           (SELECT days FROM nd),
      'enters_per_day', ROUND(k.enters::numeric / (SELECT days FROM nd), 1),
      'exits_per_day',  ROUND(k.exits::numeric  / (SELECT days FROM nd), 1)
    ),
    'totals', jsonb_build_object(
      'visitors', k.visitors,
      'pasantes', k.pasantes,
      'conv', CASE WHEN k.pasantes > 0
                   THEN ROUND(k.visitors::numeric / k.pasantes * 100, 1)
                   ELSE NULL END
    ),
    'hourly', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('hour', hour, 'event_type', event_type, 'count', count)
                       ORDER BY hour, event_type) FROM hourly), '[]'::jsonb),
    'hourly_avg', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('hour', hour, 'event_type', event_type, 'count', count)
                       ORDER BY hour, event_type) FROM hourly_avg), '[]'::jsonb),
    'conversion', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'hour', hour, 'pasantes', pasantes, 'visitors', visitors, 'enters', enters,
               'conv_enter_pct',   CASE WHEN pasantes > 0 THEN ROUND(enters::numeric   / pasantes * 100, 1) ELSE 0 END,
               'conv_visitor_pct', CASE WHEN pasantes > 0 THEN ROUND(visitors::numeric / pasantes * 100, 1) ELSE 0 END
             ) ORDER BY hour) FROM conv), '[]'::jsonb),
    'zones', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('zone', zone, 'event_type', event_type, 'count', count)
                       ORDER BY count DESC) FROM zones), '[]'::jsonb),
    'channels', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('channel', channel, 'event_type', event_type, 'count', count)
                       ORDER BY count DESC) FROM channels), '[]'::jsonb),
    'heatmap', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('dow', dow, 'hour', hour, 'count', count)
                       ORDER BY dow, hour) FROM heat), '[]'::jsonb),
    'tiz', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('zone', zone, 'count', count, 'avg_s', avg_s,
                                          'median_s', median_s, 'p90_s', p90_s)
                       ORDER BY count DESC) FROM tiz), '[]'::jsonb)
  )
  FROM kpi k;
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- 5. dashboard_compare — comparación actual vs referencia, con deltas
--
-- Resuelve el período de referencia con dashboard_ref_period (salta huecos) y
-- devuelve los deltas ya calculados. Sustituye pctDelta y todo el useMemo de
-- useComparisonData.ts:99-114.
--
-- Los totales se comparan además normalizados POR DÍA CON DATOS (per_day), que
-- es lo correcto cuando el período actual y el de referencia no tienen la
-- misma cantidad de días operativos — el caso normal cuando hay un corte.
-- ────────────────────────────────────────────────────────────────────────────


notify pgrst, 'reload schema';

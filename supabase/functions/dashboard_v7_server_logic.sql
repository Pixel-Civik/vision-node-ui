-- ============================================================================
-- dashboard_v7_server_logic.sql
--
-- Mueve a la base de datos la lógica que estaba calculándose en el frontend:
--
--   frontend antes                          →  ahora en SQL
--   ─────────────────────────────────────────────────────────────────────────
--   page.tsx: snap a minDate..maxDate       →  dashboard_default_range()
--   useFilterOptions: bucle de días en JS   →  dashboard_data_days()
--   useComparisonData: restar 86.400.000 ms →  dashboard_ref_period()
--   api.ts: computeConversionFromHourly     →  dashboard_overview() -> conversion
--   useDashboard: hourly / days             →  dashboard_overview() -> hourly_avg
--   page.tsx: totals visitors/pasantes      →  dashboard_overview() -> totals
--   useComparisonData: pctDelta             →  dashboard_compare()
--
-- Además dashboard_overview() reemplaza 6 RPCs en serie por UNA sola pasada
-- sobre los datos filtrados.
--
-- Todo es aditivo: no modifica tablas ni las funciones existentes.
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. dashboard_data_days — días que realmente tienen datos
--
-- Reemplaza el bucle día-a-día de useFilterOptions.ts, que asumía que TODO el
-- rango minDate..ayer tenía datos. Con un corte de servicio de por medio esa
-- suposición es falsa: pintaba puntos en el calendario para días vacíos.
-- ────────────────────────────────────────────────────────────────────────────
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
CREATE OR REPLACE FUNCTION public.dashboard_default_range()
RETURNS TABLE(
  start_date      text,
  end_date        text,
  month           text,   -- YYYY-MM; el nombre del mes lo formatea el cliente
                          -- con Intl (el lc_time del servidor es inglés)
  last_data_date  text,
  has_today       boolean,
  is_current_month boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET statement_timeout TO '15s'
AS $function$
  WITH t AS (
    SELECT (now() AT TIME ZONE 'America/Lima')::date AS today
  ), last_ev AS (
    SELECT COALESCE(
             MAX((time AT TIME ZONE 'America/Lima')::date),
             (SELECT today FROM t)
           ) AS d
    FROM public.events
  ), anchor AS (
    -- Ancla = mes en curso si tiene datos; si no, el mes del último dato.
    SELECT CASE
             WHEN (SELECT d FROM last_ev) >= date_trunc('month', (SELECT today FROM t))::date
               THEN date_trunc('month', (SELECT today FROM t))::date
             ELSE date_trunc('month', (SELECT d FROM last_ev))::date
           END AS m
  )
  SELECT
    to_char((SELECT m FROM anchor), 'YYYY-MM-DD'),
    to_char(
      LEAST(
        ((SELECT m FROM anchor) + INTERVAL '1 month' - INTERVAL '1 day')::date,
        (SELECT today FROM t)
      ),
      'YYYY-MM-DD'
    ),
    to_char((SELECT m FROM anchor), 'YYYY-MM'),
    to_char((SELECT d FROM last_ev), 'YYYY-MM-DD'),
    ((SELECT d FROM last_ev) = (SELECT today FROM t)),
    ((SELECT m FROM anchor) = date_trunc('month', (SELECT today FROM t))::date);
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. dashboard_ref_period — período de referencia SALTANDO huecos
--
-- El frontend restaba 86.400.000 ms a ciegas (useComparisonData.ts:15-23).
-- Con un corte de servicio "el día anterior" cae en un día vacío, la
-- referencia da 0 y el delta sale null. Acá la referencia se elige sobre los
-- días que REALMENTE tienen datos.
--
--   prev-day    → último día con datos antes del período actual
--   prev-period → los N días con datos anteriores (N = días con datos del
--                 período actual) — comparación de periodos equivalentes
--   same-dow    → último día con datos, antes del período, del mismo día
--                 de la semana
--   prev-month  → mes calendario anterior que tenga datos
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dashboard_ref_period(
  p_start_ts timestamptz,
  p_end_ts   timestamptz,
  p_mode     text DEFAULT 'prev-period'
)
RETURNS TABLE(
  ref_start_ts timestamptz,
  ref_end_ts   timestamptz,
  ref_start    text,
  ref_end      text,
  ref_days     int,
  cur_days     int,
  ref_label    text,
  found        boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET statement_timeout TO '20s'
SET plan_cache_mode TO 'force_custom_plan'
AS $function$
  WITH days AS (
    SELECT DISTINCT (time AT TIME ZONE 'America/Lima')::date AS d
    FROM public.events
  ), cur AS (
    SELECT
      MIN(d)          AS d0,
      MAX(d)          AS d1,
      COUNT(*)::int   AS n
    FROM days
    WHERE d BETWEEN (p_start_ts AT TIME ZONE 'America/Lima')::date
                AND (p_end_ts   AT TIME ZONE 'America/Lima')::date
  ), prev AS (
    SELECT d FROM days, cur
    WHERE cur.d0 IS NOT NULL
      AND d < cur.d0
      AND CASE p_mode
            WHEN 'same-dow'   THEN extract(isodow FROM d) = extract(isodow FROM cur.d0)
            WHEN 'prev-month' THEN date_trunc('month', d) = (
                                     SELECT MAX(date_trunc('month', d2))
                                     FROM days d2x(d2)
                                     WHERE d2 < date_trunc('month', cur.d0)::date
                                   )
            ELSE true
          END
    ORDER BY d DESC
    LIMIT CASE p_mode
            WHEN 'prev-day'    THEN 1
            WHEN 'same-dow'    THEN 1
            WHEN 'prev-month'  THEN 400
            ELSE (SELECT GREATEST(n, 1) FROM cur)
          END
  ), agg AS (
    SELECT MIN(d) AS r0, MAX(d) AS r1, COUNT(*)::int AS rn FROM prev
  )
  SELECT
    (agg.r0::timestamp                            AT TIME ZONE 'America/Lima'),
    ((agg.r1 + 1)::timestamp - INTERVAL '1 second') AT TIME ZONE 'America/Lima',
    to_char(agg.r0, 'YYYY-MM-DD'),
    to_char(agg.r1, 'YYYY-MM-DD'),
    COALESCE(agg.rn, 0),
    COALESCE((SELECT n FROM cur), 0),
    CASE
      WHEN agg.r0 IS NULL      THEN 'sin período de referencia'
      WHEN agg.r0 = agg.r1     THEN to_char(agg.r0, 'DD/MM/YYYY')
      ELSE to_char(agg.r0, 'DD/MM') || ' – ' || to_char(agg.r1, 'DD/MM/YYYY')
    END,
    (agg.r0 IS NOT NULL)
  FROM agg;
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- 4. dashboard_overview — TODO el dashboard en una sola pasada
--
-- Antes: 6 RPCs en serie (kpis, hourly, zone, channel, heatmap, tiz), cada uno
-- reescaneando el mismo rango, cada uno con hasta 3 reintentos.
--
-- Estrategia: NO materializar las filas crudas. Un CTE ancho con 120k filas
-- excede work_mem, se derrama a disco y cada agregado que lo consume vuelve a
-- leer el archivo temporal (medido: 236 MB de temp I/O, 3,3 s). En su lugar se
-- agrega primero al grano mínimo (`g`: fecha × dow × hora × evento × canal ×
-- zona), que colapsa 120k filas en unos cientos y cabe en memoria. Todos los
-- agregados salen de ahí. Solo unique_tracks y los percentiles de TIZ
-- necesitan las filas crudas, y van en dos pasadas angostas aparte.
--
-- Incluye lo que el frontend calculaba a mano:
--   totals      (page.tsx:115-123)
--   hourly_avg  (useDashboard.ts:94-96)
--   conversion  (api.ts:50-70, sobre hourly_avg — mismo criterio que antes)
-- ────────────────────────────────────────────────────────────────────────────
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
CREATE OR REPLACE FUNCTION public.dashboard_compare(
  p_start_ts timestamptz,
  p_end_ts   timestamptz,
  p_mode     text   DEFAULT 'prev-period',
  p_sites    text[] DEFAULT NULL,
  p_channels text[] DEFAULT NULL,
  p_zones    text[] DEFAULT NULL,
  p_hour_min int    DEFAULT 0,
  p_hour_max int    DEFAULT 23,
  p_dows     int[]  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET statement_timeout TO '30s'
AS $function$
DECLARE
  r          record;
  cur_json   jsonb;
  ref_json   jsonb;
  c_ent numeric; c_pas numeric; c_days numeric;
  r_ent numeric; r_pas numeric; r_days numeric;
  c_conv numeric; r_conv numeric;
BEGIN
  SELECT * INTO r
  FROM public.dashboard_ref_period(p_start_ts, p_end_ts, p_mode);

  cur_json := public.dashboard_overview(
    p_start_ts, p_end_ts, p_sites, p_channels, p_zones, p_hour_min, p_hour_max, p_dows);

  IF r.found THEN
    ref_json := public.dashboard_overview(
      r.ref_start_ts, r.ref_end_ts, p_sites, p_channels, p_zones, p_hour_min, p_hour_max, p_dows);
  ELSE
    ref_json := NULL;
  END IF;

  c_ent  := (cur_json #>> '{kpis,enters}')::numeric;
  c_pas  := (cur_json #>> '{totals,pasantes}')::numeric;
  c_days := GREATEST((cur_json #>> '{kpis,days}')::numeric, 1);

  r_ent  := COALESCE((ref_json #>> '{kpis,enters}')::numeric, 0);
  r_pas  := COALESCE((ref_json #>> '{totals,pasantes}')::numeric, 0);
  r_days := GREATEST(COALESCE((ref_json #>> '{kpis,days}')::numeric, 1), 1);

  c_conv := CASE WHEN c_pas > 0 THEN c_ent / c_pas END;
  r_conv := CASE WHEN r_pas > 0 THEN r_ent / r_pas END;

  RETURN jsonb_build_object(
    'mode', p_mode,
    'ref', jsonb_build_object(
      'found',      COALESCE(r.found, false),
      'start_date', r.ref_start,
      'end_date',   r.ref_end,
      'label',      r.ref_label,
      'days',       COALESCE(r.ref_days, 0)
    ),
    'current',   cur_json,
    'reference', COALESCE(ref_json, 'null'::jsonb),
    'deltas', jsonb_build_object(
      -- % sobre el total del período
      'enters',       CASE WHEN r_ent > 0 THEN ROUND((c_ent - r_ent) / r_ent * 100, 1) END,
      'pasantes',     CASE WHEN r_pas > 0 THEN ROUND((c_pas - r_pas) / r_pas * 100, 1) END,
      -- % sobre el promedio por día con datos: comparable aunque los períodos
      -- tengan distinta cantidad de días operativos
      'enters_per_day', CASE WHEN r_ent > 0
        THEN ROUND(((c_ent / c_days) - (r_ent / r_days)) / (r_ent / r_days) * 100, 1) END,
      'pasantes_per_day', CASE WHEN r_pas > 0
        THEN ROUND(((c_pas / c_days) - (r_pas / r_days)) / (r_pas / r_days) * 100, 1) END,
      -- conversión en puntos porcentuales
      'conv_pp', CASE WHEN c_conv IS NOT NULL AND r_conv IS NOT NULL
        THEN ROUND((c_conv - r_conv) * 100, 2) END
    )
  );
END;
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- Verificación rápida
-- ────────────────────────────────────────────────────────────────────────────
-- SELECT * FROM dashboard_default_range();
-- SELECT * FROM dashboard_ref_period(now() - interval '30 days', now(), 'prev-period');
-- SELECT jsonb_pretty(dashboard_overview(now() - interval '7 days', now()));

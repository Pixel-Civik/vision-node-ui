-- Reduce the dashboard read amplification that saturated the project's disk I/O.
-- This migration is idempotent so it can be reapplied safely.

-- The data-freshness Realtime hook is disabled in the current frontend. Keeping
-- the high-volume events table in the publication still makes Realtime decode
-- every insert even with no events subscriber. Alerts remain published.
-- Re-add public.events before enabling useDataFreshnessAlert again.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'events'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.events;
  END IF;
END
$$;

-- The alerts UI always scopes production evidence through this JSON predicate.
-- Partial indexes keep that filter small while also satisfying its two hot paths:
-- exact counts by status and the newest-first evidence list.
CREATE INDEX IF NOT EXISTS shoplifting_alerts_evidence_status_occurred_idx
  ON public.shoplifting_alerts (status, occurred_at DESC)
  WHERE metadata @> '{"evidence_generation":"h264-faststart-v1"}'::jsonb;

CREATE INDEX IF NOT EXISTS shoplifting_alerts_evidence_occurred_idx
  ON public.shoplifting_alerts (occurred_at DESC)
  WHERE metadata @> '{"evidence_generation":"h264-faststart-v1"}'::jsonb;

-- Calendar RPCs group and compare by the Lima-local date. Without this expression
-- index PostgreSQL has to revisit the full events heap for every dashboard load.
CREATE INDEX IF NOT EXISTS idx_events_local_day
  ON public.events ((("time" AT TIME ZONE 'America/Lima')::date));

-- Keep the exact filter semantics (only catalogs represented in events), but use
-- indexed existence checks and independent small aggregates. The previous query
-- performed three DISTINCT sorts over tracking_logs_view in a single scan and
-- spilled thousands of temporary blocks.
CREATE OR REPLACE FUNCTION public.dashboard_filter_options()
RETURNS TABLE(
  sites     text[],
  channels  text[],
  zones     text[],
  min_date  text,
  max_date  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET statement_timeout TO '10s'
AS $$
  WITH RECURSIVE zone_values(zone) AS (
    -- PostgreSQL does not have a native loose index scan. Jump to the next
    -- distinct value so two zones require only a few B-tree probes instead of
    -- walking every events row in idx_events_zone.
    SELECT MIN(e.zone)
    FROM public.events e
    WHERE e.zone IS NOT NULL

    UNION ALL

    SELECT (
      SELECT MIN(e.zone)
      FROM public.events e
      WHERE e.zone > z.zone
    )
    FROM zone_values z
    WHERE z.zone IS NOT NULL
  ), site_options AS (
    SELECT COALESCE(array_agg(s.name ORDER BY s.name), ARRAY[]::text[]) AS values
    FROM public.sites s
    WHERE EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.site_id = s.id
    )
  ), channel_options AS (
    SELECT COALESCE(array_agg(c.channel ORDER BY c.channel), ARRAY[]::text[]) AS values
    FROM public.cameras c
    WHERE EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.camera_id = c.id
    )
  ), zone_options AS (
    SELECT COALESCE(
      array_agg(z.zone ORDER BY z.zone) FILTER (WHERE z.zone IS NOT NULL),
      ARRAY[]::text[]
    ) AS values
    FROM zone_values z
  ), bounds AS (
    SELECT
      (SELECT e."time" FROM public.events e ORDER BY e."time" ASC  LIMIT 1) AS min_time,
      (SELECT e."time" FROM public.events e ORDER BY e."time" DESC LIMIT 1) AS max_time
  )
  SELECT
    s.values,
    c.values,
    z.values,
    to_char(b.min_time AT TIME ZONE 'America/Lima', 'YYYY-MM-DD'),
    to_char(b.max_time AT TIME ZONE 'America/Lima', 'YYYY-MM-DD')
  FROM site_options s
  CROSS JOIN channel_options c
  CROSS JOIN zone_options z
  CROSS JOIN bounds b;
$$;

-- MAX(time AT TIME ZONE ...) prevented the existing time index from answering
-- the query. MAX(time) first is equivalent and becomes a one-row index lookup.
CREATE OR REPLACE FUNCTION public.dashboard_default_range()
RETURNS TABLE(
  start_date       text,
  end_date         text,
  month            text,
  last_data_date   text,
  has_today        boolean,
  is_current_month boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET statement_timeout TO '5s'
AS $$
  WITH t AS (
    SELECT (now() AT TIME ZONE 'America/Lima')::date AS today
  ), last_ev AS (
    SELECT COALESCE(
             ((MAX(e."time")) AT TIME ZONE 'America/Lima')::date,
             (SELECT today FROM t)
           ) AS d
    FROM public.events e
  ), anchor AS (
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
$$;

-- Reference-period selection needs only the days that exist, not every event.
-- Walk the local-day B-tree one distinct value at a time (currently 53 probes)
-- instead of sorting/deduplicating more than 300k rows on every comparison.
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
STABLE
SECURITY DEFINER
SET statement_timeout TO '5s'
SET plan_cache_mode TO 'force_custom_plan'
AS $$
  WITH RECURSIVE days(d) AS (
    SELECT MIN((e."time" AT TIME ZONE 'America/Lima')::date)
    FROM public.events e

    UNION ALL

    SELECT (
      SELECT MIN((e."time" AT TIME ZONE 'America/Lima')::date)
      FROM public.events e
      WHERE (e."time" AT TIME ZONE 'America/Lima')::date > days.d
    )
    FROM days
    WHERE days.d IS NOT NULL
  ), valid_days AS MATERIALIZED (
    SELECT d
    FROM days
    WHERE d IS NOT NULL
  ), cur AS (
    SELECT MIN(d) AS d0, MAX(d) AS d1, COUNT(*)::int AS n
    FROM valid_days
    WHERE d BETWEEN (p_start_ts AT TIME ZONE 'America/Lima')::date
                AND (p_end_ts   AT TIME ZONE 'America/Lima')::date
  ), prev AS (
    SELECT d
    FROM valid_days, cur
    WHERE cur.d0 IS NOT NULL
      AND d < cur.d0
      AND CASE p_mode
            WHEN 'same-dow' THEN
              extract(isodow FROM d) = extract(isodow FROM cur.d0)
            WHEN 'prev-month' THEN
              date_trunc('month', d) = (
                SELECT MAX(date_trunc('month', vd.d))
                FROM valid_days vd
                WHERE vd.d < date_trunc('month', cur.d0)::date
              )
            ELSE true
          END
    ORDER BY d DESC
    LIMIT CASE p_mode
            WHEN 'prev-day'   THEN 1
            WHEN 'same-dow'   THEN 1
            WHEN 'prev-month' THEN 400
            ELSE (SELECT GREATEST(n, 1) FROM cur)
          END
  ), agg AS (
    SELECT MIN(d) AS r0, MAX(d) AS r1, COUNT(*)::int AS rn
    FROM prev
  )
  SELECT
    (agg.r0::timestamp AT TIME ZONE 'America/Lima'),
    ((agg.r1 + 1)::timestamp - INTERVAL '1 second') AT TIME ZONE 'America/Lima',
    to_char(agg.r0, 'YYYY-MM-DD'),
    to_char(agg.r1, 'YYYY-MM-DD'),
    COALESCE(agg.rn, 0),
    COALESCE((SELECT n FROM cur), 0),
    CASE
      WHEN agg.r0 IS NULL  THEN 'sin período de referencia'
      WHEN agg.r0 = agg.r1 THEN to_char(agg.r0, 'DD/MM/YYYY')
      ELSE to_char(agg.r0, 'DD/MM') || ' – ' || to_char(agg.r1, 'DD/MM/YYYY')
    END,
    (agg.r0 IS NOT NULL)
  FROM agg;
$$;

-- Comparison panels consume KPIs, totals and hourly series. Building two full
-- dashboard_overview payloads also calculated zones, heatmaps and TIZ
-- percentiles that the comparison UI never reads. Materialize one narrow,
-- filtered pass per period and derive only the required comparison payload.
CREATE OR REPLACE FUNCTION public.dashboard_comparison_period(
  p_start_ts timestamptz,
  p_end_ts   timestamptz,
  p_sites    text[] DEFAULT NULL,
  p_channels text[] DEFAULT NULL,
  p_zones    text[] DEFAULT NULL,
  p_hour_min int DEFAULT 0,
  p_hour_max int DEFAULT 23,
  p_dows     int[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET statement_timeout TO '20s'
SET plan_cache_mode TO 'force_custom_plan'
AS $$
  WITH base AS MATERIALIZED (
    SELECT
      (e."time" AT TIME ZONE 'America/Lima')::date AS local_date,
      extract(hour FROM (e."time" AT TIME ZONE 'America/Lima'))::int AS hour,
      public.dashboard_event_norm(et.code) AS event_type,
      e.track_id
    FROM public.events e
    JOIN public.event_types et ON et.id = e.event_type_id
    WHERE e."time" >= p_start_ts
      AND e."time" <= p_end_ts
      AND (p_sites IS NULL OR e.site_id IN (
        SELECT s.id FROM public.sites s WHERE s.name = ANY(p_sites)
      ))
      AND (p_channels IS NULL OR e.camera_id IN (
        SELECT c.id FROM public.cameras c WHERE c.channel = ANY(p_channels)
      ))
      AND (p_zones IS NULL OR e.zone = ANY(p_zones))
      AND (p_hour_min IS NULL OR
        extract(hour FROM (e."time" AT TIME ZONE 'America/Lima'))::int
          BETWEEN p_hour_min AND p_hour_max)
      AND (p_dows IS NULL OR
        (extract(isodow FROM (e."time" AT TIME ZONE 'America/Lima'))::int - 1)
          = ANY(p_dows))
  ), nd AS (
    SELECT GREATEST(COUNT(DISTINCT local_date), 1)::int AS days
    FROM base
  ), kpi AS (
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'enter')::bigint AS enters,
      COUNT(*) FILTER (WHERE event_type = 'exit')::bigint AS exits,
      COUNT(*) FILTER (WHERE event_type = 'visitor')::bigint AS visitors,
      COUNT(*) FILTER (WHERE event_type = 'pasante')::bigint AS pasantes,
      COUNT(DISTINCT track_id) FILTER (
        WHERE event_type IN ('enter', 'exit')
      )::bigint AS unique_tracks
    FROM base
  ), hourly AS (
    SELECT hour, event_type, COUNT(*)::int AS count
    FROM base
    WHERE event_type IN ('enter', 'exit', 'visitor', 'pasante')
    GROUP BY hour, event_type
  ), hourly_avg AS (
    SELECT
      h.hour,
      h.event_type,
      ROUND(h.count::numeric / (SELECT days FROM nd))::int AS count
    FROM hourly h
  ), conv AS (
    SELECT
      h.hour,
      COALESCE(SUM(h.count) FILTER (WHERE h.event_type = 'pasante'), 0)::int AS pasantes,
      COALESCE(SUM(h.count) FILTER (WHERE h.event_type = 'visitor'), 0)::int AS visitors,
      COALESCE(SUM(h.count) FILTER (WHERE h.event_type = 'enter'), 0)::int AS enters
    FROM hourly_avg h
    GROUP BY h.hour
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'enters', k.enters,
      'exits', k.exits,
      'net', k.enters - k.exits,
      'unique_tracks', k.unique_tracks,
      'days', (SELECT days FROM nd),
      'enters_per_day', ROUND(k.enters::numeric / (SELECT days FROM nd), 1),
      'exits_per_day', ROUND(k.exits::numeric / (SELECT days FROM nd), 1)
    ),
    'totals', jsonb_build_object(
      'visitors', k.visitors,
      'pasantes', k.pasantes,
      'conv', CASE WHEN k.pasantes > 0
        THEN ROUND(k.visitors::numeric / k.pasantes * 100, 1)
        ELSE NULL
      END
    ),
    'hourly', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'hour', h.hour, 'event_type', h.event_type, 'count', h.count
      ) ORDER BY h.hour, h.event_type)
      FROM hourly h
    ), '[]'::jsonb),
    'hourly_avg', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'hour', h.hour, 'event_type', h.event_type, 'count', h.count
      ) ORDER BY h.hour, h.event_type)
      FROM hourly_avg h
    ), '[]'::jsonb),
    'conversion', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'hour', c.hour,
        'pasantes', c.pasantes,
        'visitors', c.visitors,
        'enters', c.enters,
        'conv_enter_pct', CASE WHEN c.pasantes > 0
          THEN ROUND(c.enters::numeric / c.pasantes * 100, 1) ELSE 0 END,
        'conv_visitor_pct', CASE WHEN c.pasantes > 0
          THEN ROUND(c.visitors::numeric / c.pasantes * 100, 1) ELSE 0 END
      ) ORDER BY c.hour)
      FROM conv c
    ), '[]'::jsonb),
    'zones', '[]'::jsonb,
    'channels', '[]'::jsonb,
    'heatmap', '[]'::jsonb,
    'tiz', '[]'::jsonb
  )
  FROM kpi k;
$$;

REVOKE ALL ON FUNCTION public.dashboard_comparison_period(
  timestamptz, timestamptz, text[], text[], text[], int, int, int[]
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.dashboard_compare(
  p_start_ts timestamptz,
  p_end_ts   timestamptz,
  p_mode     text DEFAULT 'prev-period',
  p_sites    text[] DEFAULT NULL,
  p_channels text[] DEFAULT NULL,
  p_zones    text[] DEFAULT NULL,
  p_hour_min int DEFAULT 0,
  p_hour_max int DEFAULT 23,
  p_dows     int[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET statement_timeout TO '30s'
AS $$
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

  cur_json := public.dashboard_comparison_period(
    p_start_ts, p_end_ts, p_sites, p_channels, p_zones,
    p_hour_min, p_hour_max, p_dows);

  IF r.found THEN
    ref_json := public.dashboard_comparison_period(
      r.ref_start_ts, r.ref_end_ts, p_sites, p_channels, p_zones,
      p_hour_min, p_hour_max, p_dows);
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
      'found', COALESCE(r.found, false),
      'start_date', r.ref_start,
      'end_date', r.ref_end,
      'label', r.ref_label,
      'days', COALESCE(r.ref_days, 0)
    ),
    'current', cur_json,
    'reference', COALESCE(ref_json, 'null'::jsonb),
    'deltas', jsonb_build_object(
      'enters', CASE WHEN r_ent > 0
        THEN ROUND((c_ent - r_ent) / r_ent * 100, 1) END,
      'pasantes', CASE WHEN r_pas > 0
        THEN ROUND((c_pas - r_pas) / r_pas * 100, 1) END,
      'enters_per_day', CASE WHEN r_ent > 0
        THEN ROUND(((c_ent / c_days) - (r_ent / r_days)) /
                   (r_ent / r_days) * 100, 1) END,
      'pasantes_per_day', CASE WHEN r_pas > 0
        THEN ROUND(((c_pas / c_days) - (r_pas / r_days)) /
                   (r_pas / r_days) * 100, 1) END,
      'conv_pp', CASE WHEN c_conv IS NOT NULL AND r_conv IS NOT NULL
        THEN ROUND((c_conv - r_conv) * 100, 2) END
    )
  );
END;
$$;

-- Produce gender and age in one filtered events pass. The previous UNION ALL
-- expanded tracking_logs_view twice, doubling joins and buffer traffic.
CREATE OR REPLACE FUNCTION public.dashboard_gender_age(
  p_start_ts    timestamptz,
  p_end_ts      timestamptz,
  p_event_types text[]
)
RETURNS TABLE(
  dimension text,
  value     text,
  count     bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET statement_timeout TO '10s'
SET plan_cache_mode TO 'force_custom_plan'
AS $$
  WITH filtered AS MATERIALIZED (
    SELECT e.gender, e.age
    FROM public.events e
    WHERE e."time" BETWEEN p_start_ts AND p_end_ts
      AND e.event_type_id IN (
        SELECT et.id
        FROM public.event_types et
        WHERE et.code = ANY(p_event_types)
      )
  )
  SELECT v.dimension, v.value, COUNT(*)::bigint
  FROM filtered f
  CROSS JOIN LATERAL (
    VALUES
      ('gender'::text, f.gender),
      ('age'::text,    f.age)
  ) AS v(dimension, value)
  WHERE v.value IS NOT NULL
    AND (v.dimension <> 'gender' OR v.value <> 'genero_no_detectado')
    AND (v.dimension <> 'age'    OR v.value <> 'edad_no_detectada')
  GROUP BY v.dimension, v.value
  ORDER BY v.dimension, COUNT(*) DESC;
$$;

ANALYZE public.events;
ANALYZE public.shoplifting_alerts;

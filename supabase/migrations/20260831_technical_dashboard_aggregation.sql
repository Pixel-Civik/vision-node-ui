-- El panel técnico descargaba hasta 1.000.000 de eventos crudos, ejecutaba una
-- RPC por cada día y volvía a transferir 2.000 filas cada dos minutos. Estas
-- funciones devuelven únicamente agregados y dos eventos lógicos por cámara.

CREATE INDEX IF NOT EXISTS idx_events_camera_time_desc
  ON public.events (camera_id, "time" DESC)
  INCLUDE (event_type_id);

CREATE OR REPLACE FUNCTION public.dashboard_technical_health(
  p_start_ts timestamptz,
  p_end_ts   timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
SET statement_timeout TO '20s'
SET plan_cache_mode TO 'force_custom_plan'
AS $$
  WITH bounds AS (
    SELECT
      (p_start_ts AT TIME ZONE 'America/Lima')::date AS start_date,
      (p_end_ts   AT TIME ZONE 'America/Lima')::date AS end_date
  ), days AS (
    SELECT d::date AS local_date
    FROM bounds b
    CROSS JOIN LATERAL generate_series(b.start_date, b.end_date, INTERVAL '1 day') d
  ), graw AS MATERIALIZED (
    SELECT
      (e."time" AT TIME ZONE 'America/Lima')::date AS local_date,
      extract(hour FROM (e."time" AT TIME ZONE 'America/Lima'))::int AS hour,
      e.camera_id,
      e.event_type_id,
      COUNT(*)::bigint AS n,
      MAX(e."time") AS last_seen
    FROM public.events e
    WHERE e."time" >= p_start_ts
      AND e."time" <= p_end_ts
      AND extract(hour FROM (e."time" AT TIME ZONE 'America/Lima'))::int
          BETWEEN 7 AND 23
    GROUP BY 1, 2, 3, 4
  ), g AS MATERIALIZED (
    SELECT
      gr.local_date,
      gr.hour,
      gr.n,
      gr.last_seen,
      COALESCE(c.channel, gr.camera_id::text) AS channel,
      COALESCE(NULLIF(c.name, ''), c.channel, gr.camera_id::text) AS camera_name,
      public.dashboard_event_norm(et.code) AS event_type
    FROM graw gr
    JOIN public.event_types et ON et.id = gr.event_type_id
    LEFT JOIN public.cameras c ON c.id = gr.camera_id
  ), daily_counts AS (
    SELECT local_date, COUNT(DISTINCT hour)::int AS online_hours
    FROM g
    GROUP BY local_date
  ), daily AS (
    SELECT
      d.local_date,
      COALESCE(dc.online_hours, 0)::int AS online_hours
    FROM days d
    LEFT JOIN daily_counts dc USING (local_date)
  ), hourly AS (
    SELECT local_date, hour, SUM(n)::bigint AS count
    FROM g
    GROUP BY local_date, hour
  ), ordered AS (
    SELECT
      local_date,
      "time",
      lag("time") OVER (PARTITION BY local_date ORDER BY "time") AS previous_time
    FROM (
      SELECT
        (e."time" AT TIME ZONE 'America/Lima')::date AS local_date,
        e."time"
      FROM public.events e
      WHERE e."time" >= p_start_ts
        AND e."time" <= p_end_ts
        AND extract(hour FROM (e."time" AT TIME ZONE 'America/Lima'))::int
            BETWEEN 7 AND 23
    ) raw_events
  ), gaps AS (
    SELECT
      local_date,
      previous_time AS from_time,
      "time" AS to_time,
      ROUND(extract(epoch FROM ("time" - previous_time)) / 60.0)::int AS duration_min
    FROM ordered
    WHERE previous_time IS NOT NULL
      AND "time" - previous_time >= INTERVAL '30 minutes'
  ), system_hours AS (
    SELECT COUNT(DISTINCT (local_date, hour))::int AS n
    FROM g
  ), cameras AS (
    SELECT
      channel,
      MAX(camera_name) AS camera_name,
      MAX(last_seen) AS last_seen,
      SUM(n)::bigint AS total_events,
      COALESCE(SUM(n) FILTER (WHERE event_type = 'enter'), 0)::bigint AS enter_events,
      COALESCE(SUM(n) FILTER (WHERE event_type = 'pasante'), 0)::bigint AS pasante_events,
      COUNT(DISTINCT (local_date, hour))::int AS online_hours
    FROM g
    WHERE channel IS NOT NULL
    GROUP BY channel
  )
  SELECT jsonb_build_object(
    'daily', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', to_char(local_date, 'YYYY-MM-DD'),
        'onlineHours', online_hours,
        'expectedHours', 17,
        'pct', ROUND(online_hours::numeric / 17 * 100)::int
      ) ORDER BY local_date)
      FROM daily
    ), '[]'::jsonb),
    'hourly', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', to_char(local_date, 'YYYY-MM-DD'),
        'hour', hour,
        'count', count
      ) ORDER BY local_date, hour)
      FROM hourly
    ), '[]'::jsonb),
    'gaps', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', to_char(local_date, 'YYYY-MM-DD'),
        'fromIso', from_time,
        'toIso', to_time,
        'fromLabel', to_char(from_time AT TIME ZONE 'America/Lima', 'HH24:MI'),
        'toLabel', to_char(to_time AT TIME ZONE 'America/Lima', 'HH24:MI'),
        'durationMin', duration_min
      ) ORDER BY local_date, from_time)
      FROM gaps
    ), '[]'::jsonb),
    'cameras', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'channel', c.channel,
        'cameraName', c.camera_name,
        'lastSeen', c.last_seen,
        'totalEvents', c.total_events,
        'enterEvents', c.enter_events,
        'pasanteEvents', c.pasante_events,
        'pct', CASE WHEN sh.n > 0
          THEN ROUND(c.online_hours::numeric / sh.n * 100)::int ELSE 0 END
      ) ORDER BY c.channel)
      FROM cameras c
      CROSS JOIN system_hours sh
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.dashboard_technical_health(timestamptz, timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_technical_health(timestamptz, timestamptz)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_camera_last_events()
RETURNS TABLE(
  channel     text,
  camera_name text,
  last_time   timestamptz,
  last_type   text,
  prev_time   timestamptz,
  prev_type   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
SET statement_timeout TO '5s'
AS $$
  SELECT
    c.channel,
    COALESCE(NULLIF(c.name, ''), c.channel),
    recent.last_time,
    recent.last_type,
    recent.prev_time,
    recent.prev_type
  FROM public.cameras c
  JOIN LATERAL (
    SELECT
      MAX(r."time") FILTER (WHERE r.rn = 1) AS last_time,
      MAX(r.event_type) FILTER (WHERE r.rn = 1) AS last_type,
      MAX(r."time") FILTER (WHERE r.rn = 2) AS prev_time,
      MAX(r.event_type) FILTER (WHERE r.rn = 2) AS prev_type
    FROM (
      SELECT
        e."time",
        public.dashboard_event_norm(et.code) AS event_type,
        row_number() OVER (ORDER BY e."time" DESC) AS rn
      FROM public.events e
      JOIN public.event_types et ON et.id = e.event_type_id
      WHERE e.camera_id = c.id
      ORDER BY e."time" DESC
      LIMIT 2
    ) r
  ) recent ON recent.last_time IS NOT NULL
  WHERE c.active IS DISTINCT FROM false
  ORDER BY recent.last_time DESC;
$$;

REVOKE ALL ON FUNCTION public.dashboard_camera_last_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_camera_last_events()
  TO anon, authenticated;

ANALYZE public.events;

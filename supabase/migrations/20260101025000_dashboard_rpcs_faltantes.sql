-- ============================================================================
-- 4 RPC más que solo existían en producción
-- ============================================================================
-- Detectadas el 2026-09-13 comparando src/lib/api.ts contra el repo. El UI
-- invoca 18 funciones dashboard_*; el repo definía 15.
--
--   dashboard_kpi_enter_exit    src/lib/api.ts:69  EN USO (TendenciasTab -> ReporteSection)
--   dashboard_breakdown_zone    src/lib/api.ts:84  exportada, sin llamador hoy
--   dashboard_breakdown_channel src/lib/api.ts:88  exportada, sin llamador hoy
--   dashboard_local_ts          documentada en README.md, expuesta en producción
--
-- Sin este archivo, un proyecto nuevo levantado desde migrations/ arranca con
-- la pestaña de Tendencias rota. Mismo patrón que dashboard_event_norm.
--
-- PROCEDENCIA — reconstrucción verificada, no inventada:
--  1. Se capturó el contrato real llamando a cada función viva vía PostgREST.
--  2. Se comprobó que dashboard_kpi_enter_exit devuelve EXACTAMENTE el bloque
--     'kpis' de dashboard_overview y que dashboard_breakdown_zone devuelve
--     EXACTAMENTE su bloque 'zones', con los mismos parámetros:
--       overview.kpis  = {days 11, enters 9186, exits 6699, net 2487,
--                         unique_tracks 15103, enters_per_day 835.1, exits_per_day 609.0}
--       kpi_enter_exit = {días 11, enters 9186, exits 6699, net 2487,
--                         unique_tracks 15103, enters_per_day 835.0909…, exits_per_day 609.0}
--     Única diferencia: overview redondea a 1 decimal, la RPC no.
--       overview.zones = breakdown_zone = [{out_zone,pasante,37816},
--                         {in_zone,visitor,9266},{in_zone,enter,9186},{out_zone,exit,6699}]
--  3. Por eso el cuerpo de abajo se deriva de los CTE de dashboard_overview,
--     que sí está versionado, en vez de escribirse desde cero.
--
-- [PROBADO] dashboard_local_ts('2026-09-11T23:29:42.489302-05:00')
--           -> '2026-09-11T23:29:42.489302' (timestamp sin zona) = at time zone 'America/Lima'.
-- [INFERIDO] la volatilidad STABLE y el SECURITY DEFINER: se copian del resto
--           de la familia dashboard_*. Que producción las exponga a anon por
--           PostgREST es consistente con SECURITY DEFINER.
-- ============================================================================

-- ─── dashboard_local_ts ────────────────────────────────────────────────────
create or replace function public.dashboard_local_ts(p_time timestamptz)
returns timestamp
language sql
immutable
as $$
  select p_time at time zone 'America/Lima'
$$;

comment on function public.dashboard_local_ts(timestamptz) is
  'Convierte un timestamptz a hora local de Lima (UTC-5, sin horario de verano).';

-- ─── dashboard_kpi_enter_exit ──────────────────────────────────────────────
create or replace function public.dashboard_kpi_enter_exit(
  p_start_ts timestamptz,
  p_end_ts   timestamptz,
  p_sites    text[] default null,
  p_channels text[] default null,
  p_zones    text[] default null,
  p_hour_min int    default 0,
  p_hour_max int    default 23,
  p_dows     int[]  default null
)
returns table(
  enters         bigint,
  exits          bigint,
  net            bigint,
  unique_tracks  bigint,
  days           int,
  enters_per_day numeric,
  exits_per_day  numeric
)
language sql
stable security definer
set statement_timeout to '30s'
set plan_cache_mode to 'force_custom_plan'
as $$
  with g as (
    select
      (e.time at time zone 'America/Lima')::date       as local_date,
      dashboard_event_norm(et.code)                    as event_type,
      count(*)::bigint                                 as n
    from public.events e
    join public.event_types et on et.id = e.event_type_id
    where e.time >= p_start_ts
      and e.time <= p_end_ts
      and (p_sites    is null or e.site_id   in (select id from public.sites   where name    = any(p_sites)))
      and (p_channels is null or e.camera_id in (select id from public.cameras where channel = any(p_channels)))
      and (p_zones    is null or e.zone      = any(p_zones))
      and (p_hour_min is null or extract(hour from (e.time at time zone 'America/Lima'))::int
           between p_hour_min and p_hour_max)
      and (p_dows is null or
           (extract(isodow from (e.time at time zone 'America/Lima'))::int - 1) = any(p_dows))
    group by 1, 2
  ), ut as (
    -- Solo enter/exit: contar todos los tipos inflaría unique_tracks.
    -- Idéntico al CTE 'ut' de dashboard_overview.
    select count(distinct e.track_id)::bigint as n
    from public.events e
    where e.time >= p_start_ts
      and e.time <= p_end_ts
      and e.event_type_id in (select id from public.event_types where dashboard_event_norm(code) in ('enter','exit'))
      and (p_sites    is null or e.site_id   in (select id from public.sites   where name    = any(p_sites)))
      and (p_channels is null or e.camera_id in (select id from public.cameras where channel = any(p_channels)))
      and (p_zones    is null or e.zone      = any(p_zones))
      and (p_hour_min is null or extract(hour from (e.time at time zone 'America/Lima'))::int
           between p_hour_min and p_hour_max)
      and (p_dows is null or
           (extract(isodow from (e.time at time zone 'America/Lima'))::int - 1) = any(p_dows))
  ), nd as (
    select greatest(count(distinct local_date), 1)::int as days from g
  ), k as (
    select
      coalesce(sum(n) filter (where event_type = 'enter'), 0)::bigint as enters,
      coalesce(sum(n) filter (where event_type = 'exit'),  0)::bigint as exits
    from g
  )
  select
    k.enters,
    k.exits,
    (k.enters - k.exits)::bigint              as net,
    (select n from ut)                        as unique_tracks,
    nd.days,
    (k.enters::numeric / nd.days)             as enters_per_day,
    (k.exits::numeric  / nd.days)             as exits_per_day
  from k, nd
$$;

-- ─── dashboard_breakdown_zone ──────────────────────────────────────────────
create or replace function public.dashboard_breakdown_zone(
  p_start_ts timestamptz,
  p_end_ts   timestamptz,
  p_sites    text[] default null,
  p_channels text[] default null,
  p_zones    text[] default null,
  p_hour_min int    default 0,
  p_hour_max int    default 23,
  p_dows     int[]  default null
)
returns table(zone text, event_type text, count bigint)
language sql
stable security definer
set statement_timeout to '30s'
set plan_cache_mode to 'force_custom_plan'
as $$
  select e.zone,
         dashboard_event_norm(et.code) as event_type,
         count(*)::bigint              as count
  from public.events e
  join public.event_types et on et.id = e.event_type_id
  where e.time >= p_start_ts
    and e.time <= p_end_ts
    and e.zone is not null
    and (p_sites    is null or e.site_id   in (select id from public.sites   where name    = any(p_sites)))
    and (p_channels is null or e.camera_id in (select id from public.cameras where channel = any(p_channels)))
    and (p_zones    is null or e.zone      = any(p_zones))
    and (p_hour_min is null or extract(hour from (e.time at time zone 'America/Lima'))::int
         between p_hour_min and p_hour_max)
    and (p_dows is null or
         (extract(isodow from (e.time at time zone 'America/Lima'))::int - 1) = any(p_dows))
  group by 1, 2
  order by 3 desc
$$;

-- ─── dashboard_breakdown_channel ───────────────────────────────────────────
create or replace function public.dashboard_breakdown_channel(
  p_start_ts timestamptz,
  p_end_ts   timestamptz,
  p_sites    text[] default null,
  p_channels text[] default null,
  p_zones    text[] default null,
  p_hour_min int    default 0,
  p_hour_max int    default 23,
  p_dows     int[]  default null
)
returns table(channel text, event_type text, count bigint)
language sql
stable security definer
set statement_timeout to '30s'
set plan_cache_mode to 'force_custom_plan'
as $$
  select cam.channel,
         dashboard_event_norm(et.code) as event_type,
         count(*)::bigint              as count
  from public.events e
  join      public.event_types et  on et.id  = e.event_type_id
  left join public.cameras     cam on cam.id = e.camera_id
  where e.time >= p_start_ts
    and e.time <= p_end_ts
    and cam.channel is not null
    and (p_sites    is null or e.site_id   in (select id from public.sites   where name    = any(p_sites)))
    and (p_channels is null or e.camera_id in (select id from public.cameras where channel = any(p_channels)))
    and (p_zones    is null or e.zone      = any(p_zones))
    and (p_hour_min is null or extract(hour from (e.time at time zone 'America/Lima'))::int
         between p_hour_min and p_hour_max)
    and (p_dows is null or
         (extract(isodow from (e.time at time zone 'America/Lima'))::int - 1) = any(p_dows))
  group by 1, 2
  order by 3 desc
$$;

notify pgrst, 'reload schema';

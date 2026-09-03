-- El navegador descargaba hasta 5.000 eventos de permanencia sólo para
-- calcular cuatro KPIs y seis barras. PostgreSQL devuelve ahora 1 objeto.

create or replace function public.dashboard_tiz_distribution(
  p_start_ts timestamptz,
  p_end_ts timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
set statement_timeout = '10s'
set plan_cache_mode = 'force_custom_plan'
as $$
  with base as materialized (
    select e.dwell_sec::double precision as dwell_sec
    from public.events e
    where e.time >= p_start_ts
      and e.time <= p_end_ts
      and e.dwell_sec is not null
      and e.event_type_id in (
        select et.id
        from public.event_types et
        where public.dashboard_event_norm(et.code) = 'visit'
      )
  ), stats as (
    select
      count(*)::bigint as total,
      coalesce(avg(dwell_sec), 0)::double precision as avg_s,
      coalesce(
        percentile_cont(0.5) within group (order by dwell_sec), 0
      )::double precision as median_s,
      coalesce(
        percentile_cont(0.9) within group (order by dwell_sec), 0
      )::double precision as p90_s,
      count(*) filter (where dwell_sec < 30)::bigint as b0,
      count(*) filter (where dwell_sec >= 30 and dwell_sec < 60)::bigint as b1,
      count(*) filter (where dwell_sec >= 60 and dwell_sec < 120)::bigint as b2,
      count(*) filter (where dwell_sec >= 120 and dwell_sec < 300)::bigint as b3,
      count(*) filter (where dwell_sec >= 300 and dwell_sec < 600)::bigint as b4,
      count(*) filter (where dwell_sec >= 600)::bigint as b5
    from base
  )
  select jsonb_build_object(
    'total', total,
    'avg_s', avg_s,
    'median_s', median_s,
    'p90_s', p90_s,
    'buckets', jsonb_build_array(
      jsonb_build_object('range', '<30s', 'count', b0),
      jsonb_build_object('range', '30-60s', 'count', b1),
      jsonb_build_object('range', '1-2min', 'count', b2),
      jsonb_build_object('range', '2-5min', 'count', b3),
      jsonb_build_object('range', '5-10min', 'count', b4),
      jsonb_build_object('range', '>10min', 'count', b5)
    )
  )
  from stats;
$$;

revoke all on function public.dashboard_tiz_distribution(
  timestamptz, timestamptz
) from public;
grant execute on function public.dashboard_tiz_distribution(
  timestamptz, timestamptz
) to anon, authenticated;

comment on function public.dashboard_tiz_distribution(
  timestamptz, timestamptz
) is 'Returns TIZ KPIs and histogram server-side instead of transferring raw events.';

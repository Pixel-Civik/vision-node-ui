-- Additive analytics APIs: deploy this migration before the new dashboard.
-- Existing RPCs remain available to the previous dashboard during rollout.
begin;
create schema if not exists lens_private;
revoke all on schema lens_private from public, anon, authenticated;

create or replace function lens_private.dashboard_filtered_events(p_start_ts timestamptz, p_end_ts timestamptz,
  p_sites text[] default null, p_channels text[] default null,
  p_zones text[] default null, p_hour_min int default 0,
  p_hour_max int default 23, p_dows int[] default null)
returns table(event_type text, gender text, age text, dwell_sec numeric)
language sql stable security invoker
set search_path = ''
as $$
  select public.dashboard_event_norm(et.code), e.gender, e.age, e.dwell_sec
  from public.events e join public.event_types et on et.id = e.event_type_id
  where e.time between p_start_ts and p_end_ts
    and (p_sites is null or e.site_id in (select s.id from public.sites s where s.name = any(p_sites)))
    and (p_channels is null or e.camera_id in (select c.id from public.cameras c where c.channel = any(p_channels)))
    and (p_zones is null or e.zone = any(p_zones))
    and (p_hour_min is null or extract(hour from e.time at time zone 'America/Lima')::int between p_hour_min and p_hour_max)
    and (p_dows is null or (extract(isodow from e.time at time zone 'America/Lima')::int - 1) = any(p_dows));
$$;
revoke all on function lens_private.dashboard_filtered_events(timestamptz,timestamptz,text[],text[],text[],int,int,int[]) from public, anon, authenticated;

create or replace function public.dashboard_gender_age_filtered(
  p_start_ts timestamptz, p_end_ts timestamptz,
  p_sites text[] default null, p_channels text[] default null,
  p_zones text[] default null, p_hour_min int default 0,
  p_hour_max int default 23, p_dows int[] default null, p_event_types text[] default array['enter']::text[]
)
returns table(dimension text, value text, count bigint)
language sql stable security definer
set search_path = '' set statement_timeout = '20s'
as $$
  with filtered as materialized (
    select * from lens_private.dashboard_filtered_events(p_start_ts,p_end_ts,p_sites,p_channels,p_zones,p_hour_min,p_hour_max,p_dows) f
    where f.event_type = any(p_event_types)
  )
  select v.dimension, v.value, count(*)
  from filtered f cross join lateral (values ('gender'::text, f.gender), ('age'::text, f.age)) v(dimension,value)
  where v.value is not null
    and (v.dimension <> 'gender' or v.value <> 'genero_no_detectado')
    and (v.dimension <> 'age' or v.value <> 'edad_no_detectada')
  group by v.dimension,v.value order by v.dimension,count(*) desc;
$$;
revoke all on function public.dashboard_gender_age_filtered(timestamptz,timestamptz,text[],text[],text[],int,int,int[],text[]) from public;
grant execute on function public.dashboard_gender_age_filtered(timestamptz,timestamptz,text[],text[],text[],int,int,int[],text[]) to anon, authenticated, service_role;

create or replace function public.dashboard_tiz_distribution(p_start_ts timestamptz, p_end_ts timestamptz,
  p_sites text[] default null, p_channels text[] default null,
  p_zones text[] default null, p_hour_min int default 0,
  p_hour_max int default 23, p_dows int[] default null)
returns jsonb language sql stable security definer
set search_path = '' set statement_timeout = '20s'
as $$
  with filtered as materialized (
    select f.dwell_sec from lens_private.dashboard_filtered_events(p_start_ts,p_end_ts,p_sites,p_channels,p_zones,p_hour_min,p_hour_max,p_dows) f
    where f.event_type = 'visit' and f.dwell_sec is not null and f.dwell_sec >= 0
  ), buckets(ord,label,lo,hi) as (
    values (1,'<30s',0,30),(2,'30-60s',30,60),(3,'1-2min',60,120),
           (4,'2-5min',120,300),(5,'5-10min',300,600),(6,'≥10min',600,null)
  )
  select jsonb_build_object(
    'count', count(*), 'avg_s', coalesce(avg(f.dwell_sec),0),
    'median_s', coalesce(percentile_cont(0.5) within group (order by f.dwell_sec),0),
    'p90_s', coalesce(percentile_cont(0.9) within group (order by f.dwell_sec),0),
    'buckets', (select jsonb_agg(jsonb_build_object('label',b.label,'count',b.n) order by b.ord)
      from (select b.ord,b.label,count(d.dwell_sec) n from buckets b left join filtered d
        on d.dwell_sec >= b.lo and (b.hi is null or d.dwell_sec < b.hi)
        group by b.ord,b.label) b)
  ) from filtered f;
$$;
revoke all on function public.dashboard_tiz_distribution(timestamptz,timestamptz,text[],text[],text[],int,int,int[]) from public;
grant execute on function public.dashboard_tiz_distribution(timestamptz,timestamptz,text[],text[],text[],int,int,int[]) to anon, authenticated, service_role;

create or replace function public.dashboard_freshness()
returns jsonb language sql stable security definer
set search_path = '' set statement_timeout = '5s'
as $$
  select jsonb_build_object('last_event_at', (select max(e.time) from public.events e), 'queried_at', statement_timestamp());
$$;
revoke all on function public.dashboard_freshness() from public;
grant execute on function public.dashboard_freshness() to anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;

-- Consolida las tres consultas iniciales del frontend en un único round-trip.
-- Las funciones internas ya usan búsquedas indexadas/agrupadas y esta envoltura
-- evita abrirlas concurrentemente cuando la instancia está bajo presión.

create or replace function public.dashboard_bootstrap()
returns jsonb
language sql
stable
security definer
set search_path = ''
set statement_timeout = '15s'
as $$
  with options as (
    select * from public.dashboard_filter_options() limit 1
  ), default_range as (
    select * from public.dashboard_default_range() limit 1
  ), available_dates as (
    select coalesce(jsonb_agg(d.day order by d.day), '[]'::jsonb) as dates
    from public.dashboard_data_days(null::date, null::date) d
  )
  select jsonb_build_object(
    'sites', coalesce(o.sites, array[]::text[]),
    'channels', coalesce(o.channels, array[]::text[]),
    'zones', coalesce(o.zones, array[]::text[]),
    'min_date', o.min_date,
    'max_date', o.max_date,
    'default_range', to_jsonb(r),
    'available_dates', d.dates
  )
  from options o
  cross join default_range r
  cross join available_dates d;
$$;

revoke all on function public.dashboard_bootstrap() from public;
grant execute on function public.dashboard_bootstrap() to anon, authenticated;

comment on function public.dashboard_bootstrap() is
  'Returns filters, default date range and available dates in one request.';

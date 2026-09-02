-- Historial para las gráficas del panel técnico y alertas separadas por causa.
-- La ausencia de personas no se usa como señal de salud de shoplifting: el
-- Jetson se vigila por heartbeat + estado real del servicio/cámaras.

alter table public.edge_nodes
  add column if not exists service_status_changed_at timestamptz not null default now(),
  add column if not exists service_alert_after_sec integer not null default 300;

create or replace function public.track_edge_service_status_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.service_status_changed_at := coalesce(new.service_status_changed_at, now());
  elsif new.service_status is distinct from old.service_status then
    new.service_status_changed_at := now();
  else
    new.service_status_changed_at := old.service_status_changed_at;
  end if;
  return new;
end;
$$;

drop trigger if exists edge_nodes_track_service_status on public.edge_nodes;
create trigger edge_nodes_track_service_status
before insert or update of service_status on public.edge_nodes
for each row execute function public.track_edge_service_status_change();

alter table public.edge_node_alerts
  drop constraint if exists edge_node_alerts_alert_type_check;
alter table public.edge_node_alerts
  add constraint edge_node_alerts_alert_type_check
  check (alert_type in ('node_offline', 'tracking_stale', 'service_unhealthy'));

create or replace function public.dashboard_edge_nodes()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'server_time', now(),
    'nodes', coalesce(jsonb_agg(to_jsonb(q) order by q.site, q.display_name), '[]'::jsonb)
  )
  from (
    select
      n.node_id, n.site, n.display_name, n.node_kind, n.service_name,
      case
        when now() - n.last_seen_at > make_interval(secs => n.offline_after_sec) then 'offline'
        when now() - n.last_seen_at > make_interval(secs => n.heartbeat_warn_sec)
          or n.service_status in ('degraded', 'error', 'stopped')
          or coalesce(n.cpu_pct, 0) >= 95
          or coalesce(n.memory_pct, 0) >= 95
          or coalesce(n.disk_pct, 0) >= 90
          or coalesce(n.cpu_temp_c, 0) >= 90
          or coalesce(n.gpu_temp_c, 0) >= 90 then 'degraded'
        else 'online'
      end as status,
      n.service_status, n.service_status_changed_at,
      greatest(0, extract(epoch from (now() - n.service_status_changed_at)) / 60)::integer as service_status_age_min,
      n.reported_at, n.last_seen_at,
      greatest(0, extract(epoch from (now() - n.last_seen_at)))::integer as heartbeat_age_sec,
      n.last_tracking_at,
      case when n.last_tracking_at is null then null else
        greatest(0, extract(epoch from (now() - n.last_tracking_at)) / 60)::integer end as tracking_age_min,
      case
        when not n.tracking_enabled then 'disabled'
        when n.last_tracking_at is null then 'waiting'
        when now() - n.last_tracking_at > make_interval(secs => n.tracking_stale_sec) then 'stale'
        else 'active'
      end as tracking_status,
      n.cpu_pct, n.memory_pct, n.memory_used_bytes, n.memory_total_bytes,
      n.disk_pct, n.disk_used_bytes, n.disk_total_bytes,
      n.gpu_pct, n.gpu_memory_pct, n.cpu_temp_c, n.gpu_temp_c, n.uptime_sec,
      n.upload_pending, n.upload_oldest_min, n.dropped_events,
      n.hostname, n.platform, n.version, n.cameras, n.services, n.metadata
    from public.edge_nodes n
  ) q;
$$;

revoke all on function public.dashboard_edge_nodes() from public;
grant execute on function public.dashboard_edge_nodes() to anon, authenticated, service_role;

-- Una respuesta compacta: estado actual + hasta 24 h de muestras de 5 min.
create or replace function public.dashboard_edge_fleet(p_hours integer default 24)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'server_time', now(),
    'nodes', coalesce(public.dashboard_edge_nodes()->'nodes', '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(to_jsonb(h) order by h.sampled_at, h.node_id)
      from (
        select
          m.node_id,
          m.sampled_at,
          m.service_status,
          round(m.cpu_pct::numeric, 1)::double precision as cpu_pct,
          round(m.memory_pct::numeric, 1)::double precision as memory_pct,
          round(m.disk_pct::numeric, 1)::double precision as disk_pct,
          round(m.gpu_pct::numeric, 1)::double precision as gpu_pct,
          round(m.cpu_temp_c::numeric, 1)::double precision as cpu_temp_c,
          round(m.gpu_temp_c::numeric, 1)::double precision as gpu_temp_c,
          m.upload_pending
        from public.edge_node_metrics m
        where m.sampled_at >= now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 24), 168)))
        order by m.sampled_at, m.node_id
      ) h
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.dashboard_edge_fleet(integer) from public;
grant execute on function public.dashboard_edge_fleet(integer) to anon, authenticated, service_role;

drop function if exists public.edge_node_alert_states();
create function public.edge_node_alert_states()
returns table (
  node_id text, site text, display_name text, service_name text,
  service_status text, alert_type text, active boolean,
  age_min integer, last_signal_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- 1. La máquina completa dejó de enviar heartbeat.
  select n.node_id, n.site, n.display_name, n.service_name, n.service_status,
    'node_offline'::text,
    now() - n.last_seen_at > make_interval(secs => n.offline_after_sec),
    greatest(0, extract(epoch from now() - n.last_seen_at) / 60)::integer,
    n.last_seen_at
  from public.edge_nodes n
  where n.alerts_enabled

  union all

  -- 2. El proceso sigue reportando, pero tracking no genera IDs por 30 min.
  -- Solo aplica al N100/people-tracking; no se interpreta falta de personas
  -- como caída del detector de shoplifting.
  select n.node_id, n.site, n.display_name, n.service_name, n.service_status,
    'tracking_stale'::text,
    n.tracking_enabled
      and n.service_name = 'people-tracking'
      and n.service_status in ('running', 'scheduled', 'healthy')
      and now() - n.last_seen_at <= make_interval(secs => n.offline_after_sec)
      and (now() at time zone 'America/Lima')::time >= n.operating_start
      and (now() at time zone 'America/Lima')::time < n.operating_end
      and now() - coalesce(n.last_tracking_at, n.created_at) > make_interval(secs => n.tracking_stale_sec),
    greatest(0, extract(epoch from now() - coalesce(n.last_tracking_at, n.created_at)) / 60)::integer,
    coalesce(n.last_tracking_at, n.created_at)
  from public.edge_nodes n
  where n.alerts_enabled and n.tracking_enabled and n.service_name = 'people-tracking'

  union all

  -- 3. La máquina responde pero su servicio (tracking o shoplifting) lleva
  -- varios minutos degradado/detenido. La espera evita avisos por reinicios.
  select n.node_id, n.site, n.display_name, n.service_name, n.service_status,
    'service_unhealthy'::text,
    now() - n.last_seen_at <= make_interval(secs => n.offline_after_sec)
      and n.service_status not in ('running', 'scheduled', 'healthy', 'starting')
      and now() - n.service_status_changed_at > make_interval(secs => n.service_alert_after_sec),
    greatest(0, extract(epoch from now() - n.service_status_changed_at) / 60)::integer,
    n.service_status_changed_at
  from public.edge_nodes n
  where n.alerts_enabled;
$$;

revoke all on function public.edge_node_alert_states() from public, anon, authenticated;
grant execute on function public.edge_node_alert_states() to service_role;


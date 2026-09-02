-- Métricas y alertas por cámara sin crear una tabla de alta frecuencia.
-- Los estados de cada cámara ya viajan dentro del JSON de cada muestra de 5 min;
-- esta migración los expande al consultar y conserva bajo el IO en Supabase Free.

alter table public.edge_node_alerts
  add column if not exists alert_key text not null default 'node';

update public.edge_node_alerts
set alert_key = case alert_type
  when 'tracking_stale' then 'tracking'
  when 'service_unhealthy' then 'service'
  else 'node'
end
where alert_key = 'node' and alert_type <> 'node_offline';

alter table public.edge_node_alerts
  drop constraint if exists edge_node_alerts_alert_type_check;
alter table public.edge_node_alerts
  add constraint edge_node_alerts_alert_type_check
  check (alert_type in (
    'node_offline', 'tracking_stale', 'service_unhealthy', 'camera_unhealthy'
  ));

drop index if exists public.edge_node_alerts_one_open_idx;
create unique index edge_node_alerts_one_open_idx
  on public.edge_node_alerts (node_id, alert_type, alert_key)
  where resolved_at is null;

create index if not exists edge_nodes_site_service_idx
  on public.edge_nodes (site, service_name);

-- Respuesta del panel técnico con filtros y downsampling automático. A 1-2 días
-- mantiene muestras de 5 min; para ventanas mayores agrega a 30/60 min.
create or replace function public.dashboard_edge_fleet_filtered(
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_sites text[] default null,
  p_cameras text[] default null,
  p_detection_types text[] default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with params as (
    select
      greatest(coalesce(p_start, now() - interval '24 hours'), now() - interval '30 days') as ts_start,
      least(coalesce(p_end, now()), now()) as ts_end,
      case
        when least(coalesce(p_end, now()), now())
          - greatest(coalesce(p_start, now() - interval '24 hours'), now() - interval '30 days')
          > interval '7 days' then interval '1 hour'
        when least(coalesce(p_end, now()), now())
          - greatest(coalesce(p_start, now() - interval '24 hours'), now() - interval '30 days')
          > interval '2 days' then interval '30 minutes'
        else interval '5 minutes'
      end as bucket
  ), filtered_nodes as (
    select n.*
    from public.edge_nodes n
    where (coalesce(cardinality(p_sites), 0) = 0 or n.site = any(p_sites))
      and (coalesce(cardinality(p_detection_types), 0) = 0 or n.service_name = any(p_detection_types))
      and (
        coalesce(cardinality(p_cameras), 0) = 0
        or exists (
          select 1 from jsonb_object_keys(n.cameras) camera_id
          where camera_id = any(p_cameras)
        )
      )
  ), current_nodes as (
    select node
    from jsonb_array_elements(
      coalesce(public.dashboard_edge_nodes()->'nodes', '[]'::jsonb)
    ) node
    where exists (
      select 1 from filtered_nodes n where n.node_id = node->>'node_id'
    )
  ), resource_history as (
    select
      m.node_id,
      date_bin(p.bucket, m.sampled_at, timestamptz '2000-01-01') as sampled_at,
      max(m.service_status) as service_status,
      round(avg(m.cpu_pct)::numeric, 1)::double precision as cpu_pct,
      round(avg(m.memory_pct)::numeric, 1)::double precision as memory_pct,
      round(avg(m.disk_pct)::numeric, 1)::double precision as disk_pct,
      round(avg(m.gpu_pct)::numeric, 1)::double precision as gpu_pct,
      round(avg(m.cpu_temp_c)::numeric, 1)::double precision as cpu_temp_c,
      round(avg(m.gpu_temp_c)::numeric, 1)::double precision as gpu_temp_c,
      max(m.upload_pending) as upload_pending
    from public.edge_node_metrics m
    join filtered_nodes n on n.node_id = m.node_id
    cross join params p
    where m.sampled_at between p.ts_start and p.ts_end
    group by m.node_id, date_bin(p.bucket, m.sampled_at, timestamptz '2000-01-01')
  ), camera_history as (
    select
      m.node_id, n.site, n.service_name, camera.key as camera_id,
      date_bin(p.bucket, m.sampled_at, timestamptz '2000-01-01') as sampled_at,
      round(avg(nullif(camera.value->>'processed_fps', '')::double precision)::numeric, 2)::double precision as fps,
      round(avg(coalesce(nullif(camera.value->>'videos_last_hour', '')::double precision, 0))::numeric, 1)::double precision as videos_last_hour,
      max(coalesce(nullif(camera.value->>'errors_total', '')::bigint, 0)) as errors_total,
      max(nullif(camera.value->>'last_connection_at', '')::timestamptz) as last_connection_at
    from public.edge_node_metrics m
    join filtered_nodes n on n.node_id = m.node_id
    cross join params p
    cross join lateral jsonb_each(m.cameras) camera
    where m.sampled_at between p.ts_start and p.ts_end
      and (coalesce(cardinality(p_cameras), 0) = 0 or camera.key = any(p_cameras))
    group by m.node_id, n.site, n.service_name, camera.key,
      date_bin(p.bucket, m.sampled_at, timestamptz '2000-01-01')
  )
  select jsonb_build_object(
    'server_time', now(),
    'range_start', (select ts_start from params),
    'range_end', (select ts_end from params),
    'nodes', coalesce((
      select jsonb_agg(node order by node->>'site', node->>'display_name')
      from current_nodes
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(to_jsonb(h) order by h.sampled_at, h.node_id)
      from resource_history h
    ), '[]'::jsonb),
    'camera_history', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.sampled_at, c.node_id, c.camera_id)
      from camera_history c
    ), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.opened_at desc)
      from (
        select a.id, a.node_id, a.alert_type, a.alert_key, a.opened_at,
          a.last_notified_at, a.last_age_min, a.notification_count, a.details
        from public.edge_node_alerts a
        join filtered_nodes n on n.node_id = a.node_id
        where a.resolved_at is null
          and (
            coalesce(cardinality(p_cameras), 0) = 0
            or a.alert_key = 'node'
            or a.alert_key = any(p_cameras)
          )
      ) a
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.dashboard_edge_fleet_filtered(
  timestamptz, timestamptz, text[], text[], text[]
) from public;
grant execute on function public.dashboard_edge_fleet_filtered(
  timestamptz, timestamptz, text[], text[], text[]
) to anon, authenticated, service_role;

drop function if exists public.edge_node_alert_states();
create function public.edge_node_alert_states()
returns table (
  node_id text, site text, display_name text, service_name text,
  service_status text, alert_type text, alert_key text, camera_id text,
  active boolean, age_min integer, last_signal_at timestamptz, details jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- 1. Equipo completo sin heartbeat.
  select n.node_id, n.site, n.display_name, n.service_name, n.service_status,
    'node_offline'::text, 'node'::text, null::text,
    now() - n.last_seen_at > make_interval(secs => n.offline_after_sec),
    greatest(0, extract(epoch from now() - n.last_seen_at) / 60)::integer,
    n.last_seen_at,
    jsonb_build_object('service_status', n.service_status)
  from public.edge_nodes n
  where n.alerts_enabled

  union all

  -- 2. N100 vivo, pero sin IDs nuevos en horario operativo.
  select n.node_id, n.site, n.display_name, n.service_name, n.service_status,
    'tracking_stale'::text, 'tracking'::text, null::text,
    n.tracking_enabled
      and n.service_name = 'people-tracking'
      and n.service_status in ('running', 'scheduled', 'healthy')
      and now() - n.last_seen_at <= make_interval(secs => n.offline_after_sec)
      and (now() at time zone 'America/Lima')::time >= n.operating_start
      and (now() at time zone 'America/Lima')::time < n.operating_end
      and now() - coalesce(n.last_tracking_at, n.created_at) > make_interval(secs => n.tracking_stale_sec),
    greatest(0, extract(epoch from now() - coalesce(n.last_tracking_at, n.created_at)) / 60)::integer,
    coalesce(n.last_tracking_at, n.created_at),
    jsonb_build_object('tracking_status', 'stale')
  from public.edge_nodes n
  where n.alerts_enabled and n.tracking_enabled and n.service_name = 'people-tracking'

  union all

  -- 3. Proceso principal degradado o detenido durante más de 5 min.
  select n.node_id, n.site, n.display_name, n.service_name, n.service_status,
    'service_unhealthy'::text, 'service'::text, null::text,
    now() - n.last_seen_at <= make_interval(secs => n.offline_after_sec)
      and n.service_status not in ('running', 'scheduled', 'healthy')
      and now() - n.service_status_changed_at > make_interval(secs => n.service_alert_after_sec),
    greatest(0, extract(epoch from now() - n.service_status_changed_at) / 60)::integer,
    n.service_status_changed_at,
    jsonb_build_object('service_status', n.service_status)
  from public.edge_nodes n
  where n.alerts_enabled

  union all

  -- 4. Cámara individual sin frames o con estado de error. Sólo se activa
  -- cuando el nodo ya publica `last_connection_at`, evitando falsos avisos de
  -- agentes antiguos durante el despliegue gradual.
  select n.node_id, n.site, n.display_name, n.service_name, n.service_status,
    'camera_unhealthy'::text, camera.key, camera.key,
    now() - n.last_seen_at <= make_interval(secs => n.offline_after_sec)
      and n.service_status not in ('scheduled')
      and coalesce(camera.value->>'status', 'unknown') <> 'scheduled'
      and (now() at time zone 'America/Lima')::time >= n.operating_start
      and (now() at time zone 'America/Lima')::time < n.operating_end
      and (
        coalesce((camera.value->>'connected')::boolean, true) = false
        or coalesce(camera.value->>'status', 'unknown') in ('error', 'stopped', 'degraded')
        or now() - nullif(camera.value->>'last_connection_at', '')::timestamptz
          > make_interval(secs => n.service_alert_after_sec)
      ),
    greatest(0, extract(epoch from (
      now() - nullif(camera.value->>'last_connection_at', '')::timestamptz
    )) / 60)::integer,
    nullif(camera.value->>'last_connection_at', '')::timestamptz,
    jsonb_build_object(
      'camera_id', camera.key,
      'camera_status', camera.value->>'status',
      'fps', camera.value->>'processed_fps',
      'errors_total', camera.value->>'errors_total',
      'last_error', camera.value->>'last_error'
    )
  from public.edge_nodes n
  cross join lateral jsonb_each(n.cameras) camera
  where n.alerts_enabled
    and nullif(camera.value->>'last_connection_at', '') is not null;
$$;

revoke all on function public.edge_node_alert_states() from public, anon, authenticated;
grant execute on function public.edge_node_alert_states() to service_role;

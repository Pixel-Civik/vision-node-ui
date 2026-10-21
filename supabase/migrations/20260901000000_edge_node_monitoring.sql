-- Monitoreo de mini-PC/Jetson independiente de la presencia de clientes.
-- Un heartbeat reemplaza el estado actual cada 30 s; el histórico se limita a
-- una muestra cada 5 min para proteger CPU/IO de la capa gratuita.

create table if not exists public.edge_nodes (
  node_id text primary key check (length(node_id) between 2 and 100),
  site text not null default 'unknown',
  display_name text not null,
  node_kind text not null default 'mini-pc',
  service_name text not null default 'vision-node',
  service_status text not null default 'starting',
  reported_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_tracking_at timestamptz,
  tracking_enabled boolean not null default true,
  cpu_pct double precision,
  memory_pct double precision,
  memory_used_bytes bigint,
  memory_total_bytes bigint,
  disk_pct double precision,
  disk_used_bytes bigint,
  disk_total_bytes bigint,
  gpu_pct double precision,
  gpu_memory_pct double precision,
  cpu_temp_c double precision,
  gpu_temp_c double precision,
  uptime_sec bigint,
  upload_pending integer not null default 0,
  upload_oldest_min double precision,
  dropped_events bigint not null default 0,
  hostname text,
  platform text,
  version text,
  cameras jsonb not null default '{}'::jsonb,
  services jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  heartbeat_warn_sec integer not null default 120,
  offline_after_sec integer not null default 1800,
  tracking_stale_sec integer not null default 1800,
  operating_start time not null default '07:00',
  operating_end time not null default '23:00',
  alerts_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint edge_nodes_percentages check (
    (cpu_pct is null or cpu_pct between 0 and 100) and
    (memory_pct is null or memory_pct between 0 and 100) and
    (disk_pct is null or disk_pct between 0 and 100) and
    (gpu_pct is null or gpu_pct between 0 and 100) and
    (gpu_memory_pct is null or gpu_memory_pct between 0 and 100)
  )
);

create table if not exists public.edge_node_metrics (
  id bigint generated always as identity primary key,
  node_id text not null references public.edge_nodes(node_id) on delete cascade,
  sampled_at timestamptz not null default now(),
  service_status text not null,
  cpu_pct double precision,
  memory_pct double precision,
  disk_pct double precision,
  gpu_pct double precision,
  cpu_temp_c double precision,
  gpu_temp_c double precision,
  upload_pending integer not null default 0,
  last_tracking_at timestamptz,
  cameras jsonb not null default '{}'::jsonb
);

create index if not exists edge_node_metrics_node_sample_idx
  on public.edge_node_metrics (node_id, sampled_at desc);

create table if not exists public.edge_node_alerts (
  id bigint generated always as identity primary key,
  node_id text not null references public.edge_nodes(node_id) on delete cascade,
  alert_type text not null check (alert_type in ('node_offline', 'tracking_stale')),
  opened_at timestamptz not null default now(),
  last_notified_at timestamptz,
  resolved_at timestamptz,
  last_age_min integer,
  notification_count integer not null default 0,
  details jsonb not null default '{}'::jsonb
);

create unique index if not exists edge_node_alerts_one_open_idx
  on public.edge_node_alerts (node_id, alert_type)
  where resolved_at is null;

alter table public.edge_nodes enable row level security;
alter table public.edge_node_metrics enable row level security;
alter table public.edge_node_alerts enable row level security;

revoke all on public.edge_nodes from anon, authenticated;
revoke all on public.edge_node_metrics from anon, authenticated;
revoke all on public.edge_node_alerts from anon, authenticated;

create or replace function public.ingest_edge_telemetry(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_node_id text := nullif(trim(p_payload->>'node_id'), '');
  v_now timestamptz := now();
  v_history_sampled boolean := false;
begin
  if v_node_id is null or length(v_node_id) > 100 then
    raise exception 'invalid node_id';
  end if;

  insert into public.edge_nodes (
    node_id, site, display_name, node_kind, service_name, service_status,
    reported_at, last_seen_at, last_tracking_at, tracking_enabled,
    cpu_pct, memory_pct, memory_used_bytes, memory_total_bytes,
    disk_pct, disk_used_bytes, disk_total_bytes, gpu_pct, gpu_memory_pct,
    cpu_temp_c, gpu_temp_c, uptime_sec, upload_pending, upload_oldest_min,
    dropped_events, hostname, platform, version, cameras, services, metadata,
    updated_at
  ) values (
    v_node_id,
    coalesce(nullif(p_payload->>'site', ''), 'unknown'),
    coalesce(nullif(p_payload->>'display_name', ''), v_node_id),
    coalesce(nullif(p_payload->>'node_kind', ''), 'mini-pc'),
    coalesce(nullif(p_payload->>'service_name', ''), 'vision-node'),
    coalesce(nullif(p_payload->>'service_status', ''), 'unknown'),
    coalesce(nullif(p_payload->>'reported_at', '')::timestamptz, v_now),
    v_now,
    nullif(p_payload->>'last_tracking_at', '')::timestamptz,
    coalesce(nullif(p_payload->>'tracking_enabled', '')::boolean, true),
    nullif(p_payload->>'cpu_pct', '')::double precision,
    nullif(p_payload->>'memory_pct', '')::double precision,
    nullif(p_payload->>'memory_used_bytes', '')::bigint,
    nullif(p_payload->>'memory_total_bytes', '')::bigint,
    nullif(p_payload->>'disk_pct', '')::double precision,
    nullif(p_payload->>'disk_used_bytes', '')::bigint,
    nullif(p_payload->>'disk_total_bytes', '')::bigint,
    nullif(p_payload->>'gpu_pct', '')::double precision,
    nullif(p_payload->>'gpu_memory_pct', '')::double precision,
    nullif(p_payload->>'cpu_temp_c', '')::double precision,
    nullif(p_payload->>'gpu_temp_c', '')::double precision,
    nullif(p_payload->>'uptime_sec', '')::bigint,
    coalesce(nullif(p_payload->>'upload_pending', '')::integer, 0),
    nullif(p_payload->>'upload_oldest_min', '')::double precision,
    coalesce(nullif(p_payload->>'dropped_events', '')::bigint, 0),
    nullif(p_payload->>'hostname', ''),
    nullif(p_payload->>'platform', ''),
    nullif(p_payload->>'version', ''),
    coalesce(p_payload->'cameras', '{}'::jsonb),
    coalesce(p_payload->'services', '{}'::jsonb),
    coalesce(p_payload->'metadata', '{}'::jsonb),
    v_now
  )
  on conflict (node_id) do update set
    site = excluded.site,
    display_name = excluded.display_name,
    node_kind = excluded.node_kind,
    service_name = excluded.service_name,
    service_status = excluded.service_status,
    reported_at = excluded.reported_at,
    last_seen_at = v_now,
    last_tracking_at = coalesce(excluded.last_tracking_at, edge_nodes.last_tracking_at),
    tracking_enabled = excluded.tracking_enabled,
    cpu_pct = excluded.cpu_pct,
    memory_pct = excluded.memory_pct,
    memory_used_bytes = excluded.memory_used_bytes,
    memory_total_bytes = excluded.memory_total_bytes,
    disk_pct = excluded.disk_pct,
    disk_used_bytes = excluded.disk_used_bytes,
    disk_total_bytes = excluded.disk_total_bytes,
    gpu_pct = excluded.gpu_pct,
    gpu_memory_pct = excluded.gpu_memory_pct,
    cpu_temp_c = excluded.cpu_temp_c,
    gpu_temp_c = excluded.gpu_temp_c,
    uptime_sec = excluded.uptime_sec,
    upload_pending = excluded.upload_pending,
    upload_oldest_min = excluded.upload_oldest_min,
    dropped_events = excluded.dropped_events,
    hostname = excluded.hostname,
    platform = excluded.platform,
    version = excluded.version,
    cameras = excluded.cameras,
    services = excluded.services,
    metadata = excluded.metadata,
    updated_at = v_now;

  if not exists (
    select 1 from public.edge_node_metrics
    where node_id = v_node_id and sampled_at >= v_now - interval '5 minutes'
  ) then
    insert into public.edge_node_metrics (
      node_id, sampled_at, service_status, cpu_pct, memory_pct, disk_pct,
      gpu_pct, cpu_temp_c, gpu_temp_c, upload_pending, last_tracking_at, cameras
    )
    select node_id, v_now, service_status, cpu_pct, memory_pct, disk_pct,
      gpu_pct, cpu_temp_c, gpu_temp_c, upload_pending, last_tracking_at, cameras
    from public.edge_nodes where node_id = v_node_id;
    v_history_sampled := true;
  end if;

  return jsonb_build_object(
    'accepted', true, 'node_id', v_node_id,
    'server_time', v_now, 'history_sampled', v_history_sampled
  );
end;
$$;

revoke all on function public.ingest_edge_telemetry(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_edge_telemetry(jsonb) to service_role;

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
      n.service_status,
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

create or replace function public.edge_node_alert_states()
returns table (
  node_id text, site text, display_name text, alert_type text,
  active boolean, age_min integer, last_signal_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select n.node_id, n.site, n.display_name, 'node_offline'::text,
    now() - n.last_seen_at > make_interval(secs => n.offline_after_sec),
    greatest(0, extract(epoch from now() - n.last_seen_at) / 60)::integer,
    n.last_seen_at
  from public.edge_nodes n
  where n.alerts_enabled
  union all
  select n.node_id, n.site, n.display_name, 'tracking_stale'::text,
    n.tracking_enabled
      and now() - n.last_seen_at <= make_interval(secs => n.offline_after_sec)
      and (now() at time zone 'America/Lima')::time >= n.operating_start
      and (now() at time zone 'America/Lima')::time < n.operating_end
      and now() - coalesce(n.last_tracking_at, n.created_at) > make_interval(secs => n.tracking_stale_sec),
    greatest(0, extract(epoch from now() - coalesce(n.last_tracking_at, n.created_at)) / 60)::integer,
    coalesce(n.last_tracking_at, n.created_at)
  from public.edge_nodes n
  where n.alerts_enabled and n.tracking_enabled;
$$;

revoke all on function public.edge_node_alert_states() from public, anon, authenticated;
grant execute on function public.edge_node_alert_states() to service_role;

create or replace function public.prune_edge_node_metrics(p_keep_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_deleted integer;
begin
  delete from public.edge_node_metrics
  where sampled_at < now() - make_interval(days => greatest(7, least(p_keep_days, 90)));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_edge_node_metrics(integer) from public, anon, authenticated;
grant execute on function public.prune_edge_node_metrics(integer) to service_role;

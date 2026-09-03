-- Unifica la retención máxima de datos operativos en tres meses. Las tablas de
-- catálogo (sedes, cámaras y tipos) y el estado actual de cada nodo se conservan.

create or replace function public.prune_operational_data(
  p_keep_months integer default 3,
  p_batch_size integer default 20000
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cutoff timestamptz;
  v_events_deleted integer := 0;
  v_alerts_deleted integer := 0;
  v_node_metrics_deleted integer := 0;
  v_node_alerts_deleted integer := 0;
  v_alert_log_deleted integer := 0;
  v_keepalive_deleted integer := 0;
  v_more_events boolean := false;
  v_more_alerts boolean := false;
begin
  if p_keep_months < 1 or p_keep_months > 120 then
    raise exception using errcode = '22023',
      message = 'p_keep_months debe estar entre 1 y 120';
  end if;
  if p_batch_size < 1 or p_batch_size > 50000 then
    raise exception using errcode = '22023',
      message = 'p_batch_size debe estar entre 1 y 50000';
  end if;

  v_cutoff := clock_timestamp() - make_interval(months => p_keep_months);

  with expired as materialized (
    select id from public.events where time < v_cutoff
    order by time, id limit p_batch_size for update skip locked
  ), deleted as (
    delete from public.events target using expired
    where target.id = expired.id returning target.id
  ) select count(*)::integer into v_events_deleted from deleted;

  with expired as materialized (
    select id from public.shoplifting_alerts where occurred_at < v_cutoff
    order by occurred_at, id limit p_batch_size for update skip locked
  ), deleted as (
    delete from public.shoplifting_alerts target using expired
    where target.id = expired.id returning target.id
  ) select count(*)::integer into v_alerts_deleted from deleted;

  -- El panel técnico normalmente conserva sólo 30 días, pero este límite de
  -- seguridad garantiza que nunca supere tres meses si la función secundaria falla.
  with expired as materialized (
    select id from public.edge_node_metrics where sampled_at < v_cutoff
    order by sampled_at, id limit p_batch_size for update skip locked
  ), deleted as (
    delete from public.edge_node_metrics target using expired
    where target.id = expired.id returning target.id
  ) select count(*)::integer into v_node_metrics_deleted from deleted;

  -- Nunca se elimina una incidencia todavía abierta.
  with expired as materialized (
    select id from public.edge_node_alerts
    where resolved_at is not null and resolved_at < v_cutoff
    order by resolved_at, id limit p_batch_size for update skip locked
  ), deleted as (
    delete from public.edge_node_alerts target using expired
    where target.id = expired.id returning target.id
  ) select count(*)::integer into v_node_alerts_deleted from deleted;

  with expired as materialized (
    select id from public.alert_log where sent_at < v_cutoff
    order by sent_at, id limit p_batch_size for update skip locked
  ), deleted as (
    delete from public.alert_log target using expired
    where target.id = expired.id returning target.id
  ) select count(*)::integer into v_alert_log_deleted from deleted;

  with expired as materialized (
    select id from public.keepalive where ping_at < v_cutoff
    order by ping_at, id limit p_batch_size for update skip locked
  ), deleted as (
    delete from public.keepalive target using expired
    where target.id = expired.id returning target.id
  ) select count(*)::integer into v_keepalive_deleted from deleted;

  select exists(select 1 from public.events where time < v_cutoff)
    into v_more_events;
  select exists(
    select 1 from public.shoplifting_alerts where occurred_at < v_cutoff
  ) into v_more_alerts;

  return jsonb_build_object(
    'cutoff', v_cutoff,
    'events_deleted', v_events_deleted,
    'shoplifting_alerts_deleted', v_alerts_deleted,
    'edge_node_metrics_deleted', v_node_metrics_deleted,
    'edge_node_alerts_deleted', v_node_alerts_deleted,
    'alert_log_deleted', v_alert_log_deleted,
    'keepalive_deleted', v_keepalive_deleted,
    'more_expired_events', v_more_events,
    'more_expired_shoplifting_alerts', v_more_alerts
  );
end;
$$;

revoke all on function public.prune_operational_data(integer, integer)
  from public, anon, authenticated;
grant execute on function public.prune_operational_data(integer, integer)
  to service_role;

comment on function public.prune_operational_data(integer, integer) is
  'Deletes bounded batches of operational data older than three calendar months; open incidents are protected.';

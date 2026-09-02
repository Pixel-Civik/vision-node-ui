-- Keep only the latest three calendar months of operational tracking and
-- shoplifting records. Deletion is deliberately bounded to avoid a large WAL
-- and Disk IO spike on the Supabase free tier.

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
  v_more_events boolean := false;
  v_more_alerts boolean := false;
begin
  if p_keep_months < 1 or p_keep_months > 120 then
    raise exception using
      errcode = '22023',
      message = 'p_keep_months debe estar entre 1 y 120';
  end if;
  if p_batch_size < 1 or p_batch_size > 50000 then
    raise exception using
      errcode = '22023',
      message = 'p_batch_size debe estar entre 1 y 50000';
  end if;

  v_cutoff := clock_timestamp() - make_interval(months => p_keep_months);

  with expired as materialized (
    select e.id
      from public.events e
     where e.time < v_cutoff
     order by e.time, e.id
     limit p_batch_size
     for update skip locked
  ), deleted as (
    delete from public.events e
     using expired x
     where e.id = x.id
     returning e.id
  )
  select count(*)::integer into v_events_deleted from deleted;

  with expired as materialized (
    select a.id
      from public.shoplifting_alerts a
     where a.occurred_at < v_cutoff
     order by a.occurred_at, a.id
     limit p_batch_size
     for update skip locked
  ), deleted as (
    delete from public.shoplifting_alerts a
     using expired x
     where a.id = x.id
     returning a.id
  )
  select count(*)::integer into v_alerts_deleted from deleted;

  -- shoplifting_alert_reviews is removed by its ON DELETE CASCADE FK.
  select exists(select 1 from public.events where time < v_cutoff)
    into v_more_events;
  select exists(
    select 1 from public.shoplifting_alerts where occurred_at < v_cutoff
  ) into v_more_alerts;

  return jsonb_build_object(
    'cutoff', v_cutoff,
    'events_deleted', v_events_deleted,
    'shoplifting_alerts_deleted', v_alerts_deleted,
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
  'Deletes bounded batches of tracking events and shoplifting alerts older than a calendar-month cutoff.';

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job
     where jobname = 'pixel-civik-operational-retention-3-months'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'pixel-civik-operational-retention-3-months',
    '17 * * * *',
    'select public.prune_operational_data(3, 20000);'
  );
end;
$$;

-- ============================================================================
-- OPCIONAL · Job de pg_cron que dispara la Edge Function check-freshness
-- ============================================================================
-- Reemplaza a functions/cron_setup.sql, que traía la clave JWT escrita en el
-- archivo y versionada en GitHub. Aquí se lee de la configuración de la base
-- en lugar de estar incrustada.
--
-- Requisitos previos (Dashboard → Database → Extensions): pg_cron y pg_net.
-- Y desplegar la función: supabase functions deploy check-freshness
--
-- Guardar antes el secreto, una sola vez, fuera del control de versiones:
--   alter database postgres set app.settings.freshness_token = '<service_role o key dedicada>';
--   alter database postgres set app.settings.project_url     = 'https://<ref>.supabase.co';
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('check-data-freshness')
where exists (select 1 from cron.job where jobname = 'check-data-freshness');

select cron.schedule(
  'check-data-freshness',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url     := current_setting('app.settings.project_url') || '/functions/v1/check-freshness',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.freshness_token')
    ),
    body    := '{}'::jsonb
  );
  $job$
);

-- ============================================================================
-- Job de pg_cron que dispara la Edge Function check-freshness
-- ============================================================================
-- Reemplaza a functions/cron_setup.sql, que traía la clave JWT escrita en el
-- archivo y versionada en GitHub.
--
-- El secreto se guarda en Supabase Vault, no en el archivo ni en la definición
-- del job. `alter database ... set app.settings.*` NO sirve en Supabase: el rol
-- postgres no tiene permiso para definir parámetros propios (probado el
-- 2026-09-14: "permission denied to set parameter").
--
-- Requisitos: extensiones pg_cron y pg_net (las habilita
-- 20260101005000_extensions.sql) y la función desplegada:
--     supabase functions deploy check-freshness
--
-- El token solo autoriza INVOCAR la función. La función usa internamente su
-- propio SUPABASE_SERVICE_ROLE_KEY, que la plataforma le inyecta, así que aquí
-- basta la anon key.
--
-- Guardar el secreto una vez (no versionar el valor):
--     select vault.create_secret('<anon key>', 'freshness_token', 'Invoca check-freshness');
--
-- Para enviar correos hay que cargar además, en Edge Functions -> Secrets:
--     RESEND_API_KEY, ALERT_FROM_EMAIL, ALERT_TO_EMAIL
-- Sin ellos la función corre igual y registra 'email_not_configured'; no falla.
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
    url     := 'https://jtdnfockogskhuoturht.supabase.co/functions/v1/check-freshness',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'freshness_token'
      )
    ),
    body    := '{}'::jsonb
  );
  $job$
);

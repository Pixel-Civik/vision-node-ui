-- ============================================================
-- 2. pg_cron — dispara la Edge Function cada 5 minutos
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ANTES: activar extensiones pg_cron y pg_net en
--        Database → Extensions
-- ============================================================

-- Llamada HTTP a la Edge Function cada 5 minutos
SELECT cron.schedule(
  'check-data-freshness',           -- nombre del job (único)
  '*/5 * * * *',                    -- cada 5 minutos
  $$
  SELECT net.http_post(
    url     := 'https://xpubdazwixxdckiunhvt.supabase.co/functions/v1/check-freshness',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwdWJkYXp3aXh4ZGNraXVuaHZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTc0NzksImV4cCI6MjA4ODgzMzQ3OX0.BcJaPndbNGsc9l4B7bNHeJvABQKwUtnXkywlbFrnEFs'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Para verificar que quedó registrado:
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'check-data-freshness';

-- Para ver el historial de ejecuciones:
-- SELECT start_time, end_time, status, return_message
-- FROM cron.job_run_details
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'check-data-freshness')
-- ORDER BY start_time DESC LIMIT 10;

-- Para eliminar el job si necesitas recrearlo:
-- SELECT cron.unschedule('check-data-freshness');

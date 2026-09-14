-- ============================================================================
-- Extensiones requeridas · prerequisito no declarado en el repositorio
-- ============================================================================
-- 20260902190000_operational_data_retention.sql y
-- 20260903123000_unified_operational_retention.sql usan cron.schedule() y
-- cron.unschedule() sin que ninguna migración habilite pg_cron. En un proyecto
-- nuevo eso falla con: relation "cron.job" does not exist.
-- Hasta ahora el prerequisito solo estaba escrito como comentario en
-- functions/cron_setup.sql ("ANTES: activar extensiones en el Dashboard"), es
-- decir dependía de que alguien recordara hacerlo a mano.
-- Detectado al aplicar las migraciones en un Postgres limpio (2026-09-12).
--
-- pg_net lo necesita optional/cron_check_freshness.sql para net.http_post().
-- pgcrypto ya lo habilita 20260819000000_shoplifting_alerts.sql.
--
-- NOTA: pg_cron y pg_net las provee la plataforma Supabase; no existen en un
-- Postgres vanilla, así que esta migración no se puede validar en Docker.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

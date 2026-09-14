-- ============================================================================
-- Cerrar la fuga de RLS a través de tracking_logs_view
-- ============================================================================
-- El baseline habilita RLS en public.events, y con la anon key la tabla
-- devuelve 0 filas, como se pretendía. Pero las vistas de Postgres se ejecutan
-- con los privilegios de su DUEÑO, no del invocador, así que tracking_logs_view
-- —creada por postgres— saltea por completo esa RLS.
--
-- Medido el 2026-09-14 con la anon key pública del proyecto:
--     select desde public.events            ->        0 filas
--     select desde tracking_logs_view       ->  260,801 filas
--
-- Es decir: el histórico completo de tracking peatonal, con track_id, gender,
-- age y zone, quedaba legible por cualquiera que tuviera la anon key — que por
-- diseño viaja en el bundle del navegador. Es exactamente la superficie que
-- C-04 describe, sobreviviendo a la migración por una puerta lateral.
--
-- security_invoker hace que la vista evalúe la RLS del rol que la consulta.
-- Requiere Postgres 15+; el proyecto corre 17.
--
-- No afecta al dashboard: todas las RPC son SECURITY DEFINER, así que al
-- consultar la vista el invocador es su dueño y conservan acceso completo.
--
-- Consumidores directos de la vista desde el cliente al momento de este cambio:
--   · src/hooks/useDataFreshnessAlert.ts — YA DESACTIVADO (page.tsx:116)
--   · src/lib/api.ts fetchTIZDirect      — devuelve vacío igualmente, porque
--     filtra por dwell_sec not null y en producción dwell_sec es 100% NULL con
--     cero eventos time_in_zone. Debe migrarse a la RPC dashboard_tiz_zone_stats
--     antes de que empiecen a generarse eventos de permanencia en zona.
-- ============================================================================

alter view public.tracking_logs_view set (security_invoker = on);

notify pgrst, 'reload schema';

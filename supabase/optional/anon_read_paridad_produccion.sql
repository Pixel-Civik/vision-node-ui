-- ============================================================================
-- OPCIONAL · Paridad funcional con producción para el rol `anon`
-- ============================================================================
-- NO está en migrations/ a propósito: aplicarlo es una decisión, no un paso.
--
-- La baseline deja RLS habilitado y sin policies, o sea cerrado. Eso es lo
-- correcto por defecto, pero el UI actual usa la anon key para leer el
-- dashboard, así que en un proyecto nuevo el dashboard saldría vacío hasta
-- aplicar esto.
--
-- Antes de aplicarlo, leer C-04 en AUDITORIA_LENS.md. Lo que se comprobó el
-- 2026-09-12 contra producción con la anon key:
--   · events            -> 262,485 filas legibles anónimamente
--   · tracking_logs_view-> las mismas, con track_id, gender, age, zone
-- Como la anon key viaja en el bundle del navegador (NEXT_PUBLIC_*, y además
-- está hardcodeada en src/lib/supabase.ts), cualquiera que abra la web puede
-- volcar el histórico completo de tracking de personas. Eso es el hallazgo P1.
--
-- Esto reproduce la CONDUCTA observada, no una copia del DDL original: las
-- policies reales de producción no son legibles sin acceso de Owner.
--
-- ALTERNATIVA RECOMENDADA en lugar de este archivo: dejar RLS cerrado y que el
-- dashboard consuma solo las RPC (todas son SECURITY DEFINER, así que leen
-- events sin necesidad de estos grants). Eso reduce la superficie de "todo el
-- histórico" a "solo los agregados que cada RPC devuelve".
-- ============================================================================

-- Catálogos: bajo riesgo, son metadatos de configuración.
grant usage on schema public to anon;
grant select on public.sites          to anon;
grant select on public.cameras        to anon;
grant select on public.event_types    to anon;
grant select on public.event_groups   to anon;
grant select on public.person_classes to anon;

create policy "anon lee sites"          on public.sites          for select to anon using (true);
create policy "anon lee cameras"        on public.cameras        for select to anon using (true);
create policy "anon lee event_types"    on public.event_types    for select to anon using (true);
create policy "anon lee event_groups"   on public.event_groups   for select to anon using (true);
create policy "anon lee person_classes" on public.person_classes for select to anon using (true);

-- ─── A PARTIR DE AQUÍ ES LA SUPERFICIE DE C-04 ─────────────────────────────
-- Descomentar solo si se acepta conscientemente exponer el histórico completo
-- de eventos a cualquier portador de la anon key.
--
-- grant select on public.events             to anon;
-- grant select on public.tracking_logs_view to anon;
-- create policy "anon lee events" on public.events for select to anon using (true);

notify pgrst, 'reload schema';

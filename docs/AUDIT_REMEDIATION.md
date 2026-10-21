# Remediación del 25 de septiembre de 2026

Los hallazgos H2 (autorización de evidencia) y H3 (identidad/autorización de revisión) quedan **DEFERRED_BY_USER**. No se introduce login, cuentas, tablas de operadores, ni cambios de acceso. El dashboard y el acceso a alertas conservan su contrato actual. Este cambio no cierra esos dos defectos ni certifica la seguridad del control de evidencia.

H6 usa un único contrato de filtros (`src/lib/dashboard-filters.ts`) para claves de caché y payload: rango, sede, cámara, zona, horas de cada día y días de semana (lunes=0). El histograma TIZ es una agregación exacta SQL con población, media, mediana, p90 y seis buckets; no descarga ni recorta 5000 filas. H7 expone el error del rango/catálogos, permite `Reintentar` y vuelve a consultar al refrescar; un error del contador no se convierte en cero. Se muestran separadamente último evento y momento de consulta, sin deducir salud de cámara a partir de actividad comercial.

Orden de rollout:

1. Aplicar `supabase/migrations/20260926005339_dashboard_filter_contract_and_distribution.sql` a la base confirmada de Lens. Es aditiva: conserva las APIs anteriores y los datos. Nuevas funciones agregadas públicas: `dashboard_gender_age_filtered`, `dashboard_tiz_distribution`, `dashboard_freshness`. El helper de filas está en un esquema privado sin grants públicos. No hay cambios de autorización de alertas.
2. Desplegar frontend. Si la migración falta, las consultas muestran errores y no sustituyen silenciosamente resultados por cero. Rollback de frontend conserva compatibilidad con la base migrada; no borrar datos ni funciones anteriores.
3. Verificar filtros con datos conocidos y diferencia evento/consulta. `supabase/tests/analytics_contract.sql` se ejecuta SOLO en una base PostgreSQL aislada con el esquema de Lens: dos sedes/cámaras, días/horas/zonas y 6001 registros TIZ; todos los fixtures se revierten. No ejecutar fixtures en producción.

Gate local: `npm ci`, `npm run check`, `npm audit --omit=dev`. Build requiere configuración Supabase; CI usa únicamente un JWT sintético y una URL `.invalid`, sin consultas a producción. Las pruebas Vitest cubren contrato RPC, cambios de filtro/caché, fracaso y recuperación del bootstrap, errores analíticos y escritura/lectura real de Excel.

Next y eslint-config-next se actualizan a 16.3.6. SheetJS (`xlsx`) se elimina y los dos flujos de exportación usan ExcelJS; se retira el CLI `shadcn` del runtime. Su stylesheet 4.7.0 de 95 líneas se conserva byte por byte en `src/styles/vendor/shadcn-tailwind.css` con su licencia MIT, para no cambiar la apariencia ni incluir el árbol de dependencias del CLI. Los overrides de UUID a 11.1.1 se limitan a ExcelJS y Gaxios, que usan `require('uuid').v4()`; la API CommonJS se verifica en tests. Lockfile versionado. No cambian modelos, pesos, cámaras habilitadas, retención ni se atribuyen métricas de exactitud.

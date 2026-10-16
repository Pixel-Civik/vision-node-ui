/**
 * providers.tsx — Frontera de cliente para TanStack Query.
 *
 * Reemplaza los hooks de fetching hechos a mano (withRetry + flags `cancelled`
 * + sessionStorage). Lo que antes había que escribir a mano y venía fallando:
 *
 *   - Reintentos: eran secuenciales y bloqueaban la cadena entera. Ahora con
 *     backoff exponencial y sin bloquear otras consultas.
 *   - Cancelación: el flag `cancelled` solo descartaba el resultado, la query
 *     seguía corriendo en el servidor. Ahora se propaga AbortSignal de verdad.
 *   - Deduplicación: dos componentes pidiendo el mismo rango disparaban dos
 *     consultas. Ahora comparten una sola.
 *   - Caché: volver a un filtro ya visto re-consultaba todo. Ahora es
 *     instantáneo y revalida en segundo plano.
 */
"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  // useState (no una constante de módulo) para que cada montaje del árbol tenga
  // su propio cliente y no se comparta caché entre sesiones en SSR.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Los datos de conteo llegan en lotes; 60 s evita re-consultar en
            // cada cambio de sección mientras se sigue notando "en vivo".
            staleTime: 60_000,
            gcTime: 15 * 60_000,
            // Un par de reintentos con backoff (no una tormenta): un RPC que
            // responde lento o un fallo transitorio de red se recupera solo en
            // vez de dejar la vista en error. TanStack deduplica, así que no
            // se multiplican las consultas.
            retry: 2,
            retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            // Al cambiar de filtro mantiene los datos previos en pantalla en
            // vez de vaciarla: se acabó el parpadeo a "sin datos".
            placeholderData: <T,>(prev: T) => prev,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delay={0}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

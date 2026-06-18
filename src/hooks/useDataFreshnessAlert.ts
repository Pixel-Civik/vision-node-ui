"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

const CHECK_MS = 60 * 1000;      // evaluar cada 1 min
const STALE_MS = 20 * 60 * 1000; // 20 min sin eventos → alerta
const TOAST_ID = "data-freshness";

// Lima = UTC-5, sin DST.
// Usar UTC aritmético directo para evitar dependencia del timezone del cliente.
const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;

function limaHM(): { h: number; m: number } {
  const d = new Date(Date.now() - LIMA_OFFSET_MS);
  return { h: d.getUTCHours(), m: d.getUTCMinutes() };
}

function isWithinOperatingHours(): boolean {
  const { h } = limaHM();
  if (h < 7)   return false; // antes de 7 AM
  if (h >= 21) return false; // desde las 9 PM en adelante
  return true;
}

// Retorna el timestamp UTC correspondiente a las 7:00 AM Lima del día de hoy.
function todayOpenUTC(): Date {
  const limaNow = new Date(Date.now() - LIMA_OFFSET_MS);
  // Midnight Lima en UTC + 7h = 7 AM Lima en UTC = 7+5 = 12:00 UTC
  return new Date(
    Date.UTC(limaNow.getUTCFullYear(), limaNow.getUTCMonth(), limaNow.getUTCDate(), 12, 0, 0)
  );
}

async function fetchLastEventTime(): Promise<Date | null> {
  try {
    const { data } = await supabase
      .from("tracking_logs_view")
      .select("time")
      .order("time", { ascending: false })
      .limit(1)
      .single();
    return data?.time ? new Date(data.time as string) : null;
  } catch {
    return null;
  }
}

export function useDataFreshnessAlert() {
  const lastSeen = useRef<Date | null>(null);

  useEffect(() => {
    function evaluate() {
      if (!isWithinOperatingHours()) {
        toast.dismiss(TOAST_ID);
        return;
      }

      // Referencia = max(último evento conocido, apertura de hoy a las 7 AM).
      // Esto evita alertar al inicio del día solo porque el último evento fue anoche.
      const open = todayOpenUTC();
      const ref  = lastSeen.current && lastSeen.current > open
        ? lastSeen.current
        : open;

      const ageMs = Date.now() - ref.getTime();

      if (ageMs > STALE_MS) {
        const mins      = Math.round(ageMs / 60_000);
        const sinceOpen = !lastSeen.current || lastSeen.current <= open;
        toast.error("Sin ingreso de datos recientes", {
          id: TOAST_ID,
          description: sinceOpen
            ? `Sin eventos desde apertura (${mins} min). Verificar el sistema.`
            : `Último evento hace ${mins} min. Verificar cámaras o conexión.`,
          duration: Infinity,
          dismissible: false,
        });
      } else {
        toast.dismiss(TOAST_ID);
      }
    }

    // Bootstrap: obtener último evento desde DB
    fetchLastEventTime().then((t) => {
      if (t) lastSeen.current = t;
      evaluate();
    });

    // Realtime: cada INSERT resetea el timer al instante
    const channel = supabase
      .channel("data-freshness-watch")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events" },
        () => {
          lastSeen.current = new Date();
          evaluate();
        }
      )
      .subscribe();

    // Chequeo local cada 1 min
    const timer = setInterval(evaluate, CHECK_MS);

    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, []);
}

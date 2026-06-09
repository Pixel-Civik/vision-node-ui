"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

const CHECK_MS   = 60 * 1000;      // evaluación local cada 1 min (sin DB)
const STALE_MS   = 20 * 60 * 1000; // 20 min sin eventos → alerta
const HOUR_START = 7;               // 7 AM Lima
const HOUR_END   = 23;              // 11 PM Lima
const TOAST_ID   = "data-freshness";

function limaHour(): number {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Lima" })
  ).getHours();
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
      const hour = limaHour();

      // Fuera del horario operativo → limpiar alerta y no hacer nada
      if (hour < HOUR_START || hour >= HOUR_END) {
        toast.dismiss(TOAST_ID);
        return;
      }

      const ageMs = lastSeen.current
        ? Date.now() - lastSeen.current.getTime()
        : Infinity;

      if (ageMs > STALE_MS) {
        const mins = Number.isFinite(ageMs) ? Math.round(ageMs / 60_000) : null;
        toast.warning("Sin ingreso de datos recientes", {
          id: TOAST_ID,
          description: mins
            ? `Último evento hace ${mins} min. Verificar cámaras o conexión.`
            : "No se detectan eventos hoy. Verificar el sistema de captura.",
          duration: Infinity,
          dismissible: false,
        });
      } else {
        toast.dismiss(TOAST_ID);
      }
    }

    // 1. Bootstrap: obtener el último timestamp desde DB y evaluar de inmediato
    fetchLastEventTime().then((t) => {
      if (t) lastSeen.current = t;
      evaluate();
    });

    // 2. Realtime: cada INSERT en events resetea el timer al instante
    //    (requiere Realtime habilitado en la tabla events desde el dashboard de Supabase)
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

    // 3. Chequeo local cada 1 min — sin tocar la DB
    const timer = setInterval(evaluate, CHECK_MS);

    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, []);
}

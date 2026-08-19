"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle, Camera, CheckCircle2, Clock3, Eye, Filter,
  LoaderCircle, Play, RefreshCw, ShieldAlert, ShieldCheck, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { updateShopliftingAlert, useShopliftingAlerts } from "@/hooks/useShopliftingAlerts";
import type { ShopliftingAlert, ShopliftingAlertStatus } from "@/lib/types";

type FilterStatus = "all" | ShopliftingAlertStatus;

const STATUS_META: Record<ShopliftingAlertStatus, { label: string; className: string }> = {
  new: { label: "Sin revisar", className: "bg-red-100 text-red-700" },
  confirmed: { label: "Confirmada", className: "bg-amber-100 text-amber-700" },
  dismissed: { label: "Descartada", className: "bg-emerald-100 text-emerald-700" },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(new Date(value));
}

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "ahora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

function riskLabel(score: number) {
  if (score >= 0.85) return "Riesgo alto";
  if (score >= 0.70) return "Riesgo elevado";
  return "Revisión necesaria";
}

export function AlertasSection() {
  const { data: alerts = [], isLoading, isFetching, error, refetch } = useShopliftingAlerts();
  const [camera, setCamera] = useState("all");
  const [status, setStatus] = useState<FilterStatus>("all");
  const [selected, setSelected] = useState<ShopliftingAlert | null>(null);
  const [saving, setSaving] = useState(false);

  const cameras = useMemo(
    () => [...new Set(alerts.map((alert) => alert.camera_id))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [alerts]
  );
  const visible = useMemo(
    () => alerts.filter((alert) =>
      (camera === "all" || alert.camera_id === camera) &&
      (status === "all" || alert.status === status)
    ),
    [alerts, camera, status]
  );
  const newCount = alerts.filter((alert) => alert.status === "new").length;
  const confirmedCount = alerts.filter((alert) => alert.status === "confirmed").length;
  const dismissedCount = alerts.filter((alert) => alert.status === "dismissed").length;

  async function review(nextStatus: "confirmed" | "dismissed") {
    if (!selected) return;
    setSaving(true);
    try {
      await updateShopliftingAlert(selected.id, nextStatus);
      toast.success(nextStatus === "confirmed" ? "Alerta confirmada" : "Falso positivo descartado");
      setSelected(null);
      await refetch();
    } catch (reviewError) {
      toast.error(reviewError instanceof Error ? reviewError.message : "No se pudo guardar la revisión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-5 md:px-8 md:py-7 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="relative inline-flex size-9 items-center justify-center rounded-xl bg-red-600 shadow-lg shadow-red-200">
              <ShieldAlert size={19} className="text-white" />
              {newCount > 0 && <span className="absolute -right-1 -top-1 size-3 rounded-full bg-red-400 ring-2 ring-white animate-pulse" />}
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Alertas sospechosas</h1>
              <p className="text-sm text-slate-500">Evidencia detectada por las cámaras · hora Perú</p>
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={() => void refetch()} disabled={isFetching} className="text-slate-600">
          <RefreshCw className={isFetching ? "animate-spin" : ""} />
          Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Sin revisar", value: newCount, icon: AlertTriangle, cls: "border-red-200 bg-red-50 text-red-700" },
          { label: "Confirmadas", value: confirmedCount, icon: ShieldCheck, cls: "border-amber-200 bg-amber-50 text-amber-700" },
          { label: "Descartadas", value: dismissedCount, icon: CheckCircle2, cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
          { label: "Cámaras", value: cameras.length, icon: Camera, cls: "border-slate-200 bg-white text-slate-700" },
        ].map(({ label, value, icon: Icon, cls }) => (
          <div key={label} className={`rounded-2xl border p-4 shadow-sm ${cls}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider opacity-75">{label}</p>
              <Icon size={16} />
            </div>
            <p className="mt-2 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <span className="flex items-center gap-1.5 px-2 text-xs font-semibold text-slate-500"><Filter size={13} /> Filtrar</span>
        <select
          value={camera}
          onChange={(event) => setCamera(event.target.value)}
          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
          aria-label="Filtrar por cámara"
        >
          <option value="all">Todas las cámaras</option>
          {cameras.map((id) => <option key={id} value={id}>Cámara {id}</option>)}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as FilterStatus)}
          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
          aria-label="Filtrar por estado"
        >
          <option value="all">Todos los estados</option>
          <option value="new">Sin revisar</option>
          <option value="confirmed">Confirmadas</option>
          <option value="dismissed">Descartadas</option>
        </select>
        <span className="ml-auto px-2 text-xs text-slate-400">{visible.length} resultado(s)</span>
      </div>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-72 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          <AlertTriangle size={18} />
          <div><p className="font-semibold">No se pudieron cargar las alertas</p><p className="text-xs opacity-80">{error.message}</p></div>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <ShieldCheck size={32} className="mx-auto text-emerald-400" />
          <p className="mt-3 font-semibold text-slate-700">No hay alertas con estos filtros</p>
          <p className="mt-1 text-sm text-slate-400">Las nuevas detecciones aparecerán aquí automáticamente.</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((alert) => {
            const statusMeta = STATUS_META[alert.status];
            return (
              <article
                key={alert.id}
                className={`group overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${alert.status === "new" ? "border-red-200 ring-1 ring-red-100" : "border-slate-100"}`}
              >
                <button className="relative block aspect-video w-full overflow-hidden bg-slate-900 text-left" onClick={() => setSelected(alert)}>
                  {alert.thumbnail_url ? (
                    // Signed URLs expire and are intentionally rendered without Next's image cache.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={alert.thumbnail_url} alt={`Alerta cámara ${alert.camera_id}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-slate-500"><Camera size={36} /></span>
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
                  <span className="absolute left-3 top-3 rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white shadow">SOSPECHOSO</span>
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                    <span className="flex size-11 items-center justify-center rounded-full bg-white/90 text-red-600 shadow-lg"><Play size={19} fill="currentColor" /></span>
                  </span>
                  <span className="absolute bottom-3 left-3 right-3 flex items-end justify-between text-white">
                    <span><span className="block text-sm font-bold">{alert.camera_name || `Cámara ${alert.camera_id}`}</span><span className="text-[11px] text-white/75">Canal {alert.camera_id}</span></span>
                    <span className="rounded-lg bg-black/45 px-2 py-1 text-xs font-bold">{Math.round(alert.risk_score * 100)}%</span>
                  </span>
                </button>
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="text-sm font-bold text-slate-800">{riskLabel(alert.risk_score)}</p><p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400"><Clock3 size={11} /> {formatDate(alert.occurred_at)} · {relativeTime(alert.occurred_at)}</p></div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${statusMeta.className}`}>{statusMeta.label}</span>
                  </div>
                  <div className="flex min-h-6 flex-wrap gap-1.5">
                    {(alert.risk_reasons.length ? alert.risk_reasons : ["comportamiento_sospechoso"]).slice(0, 3).map((reason) => (
                      <span key={reason} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{reason.replaceAll("_", " ")}</span>
                    ))}
                  </div>
                  <Button variant="outline" className="w-full border-slate-200 text-slate-700" onClick={() => setSelected(alert)}><Eye /> Revisar evidencia</Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && !saving && setSelected(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-4xl">
          {selected && (
            <>
              <div className="overflow-hidden rounded-t-xl bg-black">
                {selected.video_url ? (
                  <video src={selected.video_url} poster={selected.thumbnail_url ?? undefined} controls autoPlay className="max-h-[62vh] w-full bg-black" />
                ) : (
                  <div className="flex aspect-video items-center justify-center text-slate-400"><Camera size={40} /></div>
                )}
              </div>
              <DialogHeader className="px-5 pt-1">
                <div className="flex items-center justify-between gap-3 pr-8">
                  <DialogTitle className="flex items-center gap-2 text-lg text-slate-900"><AlertTriangle size={18} className="text-red-600" /> {selected.camera_name || `Cámara ${selected.camera_id}`}</DialogTitle>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_META[selected.status].className}`}>{STATUS_META[selected.status].label}</span>
                </div>
                <DialogDescription>{formatDate(selected.occurred_at)} · riesgo {Math.round(selected.risk_score * 100)}% · {selected.duration_sec ? `${selected.duration_sec.toFixed(1)} s` : "duración no disponible"}</DialogDescription>
              </DialogHeader>
              <div className="px-5 pb-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Señales detectadas</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(selected.risk_reasons.length ? selected.risk_reasons : ["comportamiento_sospechoso"]).map((reason) => <span key={reason} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">{reason.replaceAll("_", " ")}</span>)}
                </div>
              </div>
              <DialogFooter className="mx-0 mb-0 px-5">
                <Button variant="outline" disabled={saving} onClick={() => void review("dismissed")} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"><XCircle /> Descartar falso positivo</Button>
                <Button disabled={saving} onClick={() => void review("confirmed")} className="bg-red-600 text-white hover:bg-red-700">{saving ? <LoaderCircle className="animate-spin" /> : <ShieldAlert />} Confirmar sospechoso</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

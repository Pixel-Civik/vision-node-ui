"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle, Camera, CheckCircle2, Clock3, Eye, Filter,
  ChevronLeft, ChevronRight, Film, LoaderCircle, LogIn, Play, RefreshCw,
  ShieldAlert, ShieldCheck, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { getShopliftingVideoUrl, updateShopliftingAlert, useShopliftingAlerts } from "@/hooks/useShopliftingAlerts";
import { supabase } from "@/lib/supabase";
import type { ShopliftingAlert, ShopliftingAlertStatus } from "@/lib/types";

type FilterStatus = "all" | ShopliftingAlertStatus;
const ALERTS_PER_PAGE = 24;

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

function alertDelay(alert: ShopliftingAlert): number | null {
  const latency = alert.metadata?.event_latency;
  if (!latency || typeof latency !== "object") return null;
  const value = (latency as Record<string, unknown>).decision_delay_sec;
  return typeof value === "number" ? value : null;
}

function paginationPages(currentPage: number, totalPages: number): Array<number | string> {
  const candidates = [1, currentPage - 1, currentPage, currentPage + 1, totalPages]
    .filter((page) => page >= 1 && page <= totalPages);
  const pages = [...new Set(candidates)].sort((a, b) => a - b);
  const result: Array<number | string> = [];
  pages.forEach((page, index) => {
    const previous = pages[index - 1];
    if (previous && page - previous > 1) result.push(`gap-${previous}-${page}`);
    result.push(page);
  });
  return result;
}

export function AlertasSection() {
  const { data: alerts = [], isLoading, isFetching, error, refetch } = useShopliftingAlerts();
  const [camera, setCamera] = useState("all");
  const [status, setStatus] = useState<FilterStatus>("all");
  const [selected, setSelected] = useState<ShopliftingAlert | null>(null);
  const [saving, setSaving] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

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
  const totalPages = Math.max(1, Math.ceil(visible.length / ALERTS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * ALERTS_PER_PAGE;
  const displayed = visible.slice(pageStart, pageStart + ALERTS_PER_PAGE);
  const pageItems = paginationPages(safePage, totalPages);

  async function review(nextStatus: "confirmed" | "dismissed") {
    if (!selected) return;
    setSaving(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setAuthNeeded(true);
        throw new Error("Inicia sesión como operador para clasificar la alerta");
      }
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

  async function openVideo() {
    if (!selected) return;
    setVideoLoading(true);
    try {
      setVideoUrl(await getShopliftingVideoUrl(
        selected.id,
        selected.camera_id,
        selected.occurred_at,
      ));
    } catch (videoError) {
      const message = videoError instanceof Error ? videoError.message : "Video no disponible";
      toast.error(message);
    } finally {
      setVideoLoading(false);
    }
  }

  async function signIn() {
    if (!email || !password) return;
    setVideoLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setVideoLoading(false);
    if (signInError) {
      toast.error(`No se pudo iniciar sesión: ${signInError.message}`);
      return;
    }
    setPassword("");
    setAuthNeeded(false);
    toast.success("Sesión de operador iniciada");
    await openVideo();
  }

  function selectAlert(alert: ShopliftingAlert) {
    setSelected(alert);
    setVideoUrl(null);
    setAuthNeeded(false);
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
              <p className="text-sm text-slate-500">Historial de evidencias por cámara · hora Perú</p>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="w-full border-slate-200 bg-white text-slate-600 shadow-sm sm:w-auto"
        >
          <RefreshCw className={isFetching ? "animate-spin" : ""} />
          Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
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

      <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex items-center gap-2 px-1 lg:pb-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <Filter size={14} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Filtros</p>
              <p className="text-[11px] text-slate-400">Acota las alertas visibles</p>
            </div>
          </div>

          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="px-1 text-[11px] font-semibold text-slate-500">Cámara</span>
              <Select value={camera} onValueChange={(value) => {
                setCamera(value ?? "all");
                setCurrentPage(1);
              }}>
                <SelectTrigger
                  aria-label="Filtrar por cámara"
                  className="h-11 w-full rounded-xl border-slate-200 bg-slate-50/70 px-3 text-slate-700 shadow-none hover:bg-slate-50 focus-visible:border-red-300 focus-visible:ring-red-100"
                >
                  <SelectValue>
                    <Camera className={camera === "all" ? "text-slate-400" : "text-red-500"} />
                    {camera === "all" ? "Todas las cámaras" : `Cámara ${camera}`}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start" className="rounded-xl p-1 shadow-xl">
                  <SelectGroup>
                    <SelectLabel>Cámaras disponibles</SelectLabel>
                    <SelectItem value="all" className="py-2.5">
                      <Camera className="text-slate-400" /> Todas las cámaras
                    </SelectItem>
                    {cameras.map((id) => (
                      <SelectItem key={id} value={id} className="py-2.5">
                        <Camera className="text-red-500" /> Cámara {id}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>

            <label className="grid gap-1.5">
              <span className="px-1 text-[11px] font-semibold text-slate-500">Clasificación</span>
              <Select value={status} onValueChange={(value) => {
                setStatus((value ?? "all") as FilterStatus);
                setCurrentPage(1);
              }}>
                <SelectTrigger
                  aria-label="Filtrar por estado"
                  className="h-11 w-full rounded-xl border-slate-200 bg-slate-50/70 px-3 text-slate-700 shadow-none hover:bg-slate-50 focus-visible:border-red-300 focus-visible:ring-red-100"
                >
                  <SelectValue>
                    {status === "new" ? <AlertTriangle className="text-red-500" />
                      : status === "confirmed" ? <ShieldAlert className="text-amber-500" />
                      : status === "dismissed" ? <CheckCircle2 className="text-emerald-500" />
                      : <Filter className="text-slate-400" />}
                    {status === "all" ? "Todos los estados" : STATUS_META[status].label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start" className="rounded-xl p-1 shadow-xl">
                  <SelectGroup>
                    <SelectLabel>Estado de revisión</SelectLabel>
                    <SelectItem value="all" className="py-2.5">
                      <Filter className="text-slate-400" /> Todos los estados
                    </SelectItem>
                    <SelectItem value="new" className="py-2.5">
                      <AlertTriangle className="text-red-500" /> Sin revisar
                    </SelectItem>
                    <SelectItem value="confirmed" className="py-2.5">
                      <ShieldAlert className="text-amber-500" /> Confirmadas
                    </SelectItem>
                    <SelectItem value="dismissed" className="py-2.5">
                      <CheckCircle2 className="text-emerald-500" /> Descartadas
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 lg:min-w-32 lg:justify-center">
            <span className="text-xs text-slate-500 lg:hidden">Resultados visibles</span>
            <span className="text-sm font-bold text-slate-700">{visible.length} <span className="font-normal text-slate-400">resultado(s)</span></span>
          </div>
        </div>
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
          {displayed.map((alert) => {
            const statusMeta = STATUS_META[alert.status];
            return (
              <article
                key={alert.id}
                className={`group overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${alert.status === "new" ? "border-red-200 ring-1 ring-red-100" : "border-slate-100"}`}
              >
                <button className="relative block aspect-video w-full overflow-hidden bg-slate-900 text-left" onClick={() => selectAlert(alert)}>
                  {alert.thumbnail_url ? (
                    // Signed URLs expire and are intentionally rendered without Next's image cache.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={alert.thumbnail_url} alt={`Alerta cámara ${alert.camera_id}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                  ) : (
                    <span className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                      {alert.video_status === "ready" ? <Film size={36} /> : <Camera size={36} />}
                      <span className="text-[11px] font-semibold">
                        {alert.video_status === "ready" ? "Video privado disponible" : "Sin vista previa"}
                      </span>
                    </span>
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
                  <span className="absolute left-3 top-3 rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white shadow">SOSPECHOSO</span>
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                    <span className="flex size-11 items-center justify-center rounded-full bg-white/90 text-red-600 shadow-lg"><Eye size={19} /></span>
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
                  <p className={`flex items-center gap-1.5 text-[11px] font-semibold ${alert.video_status === "ready" ? "text-emerald-600" : "text-slate-400"}`}>
                    <Film size={12} />
                    {alert.video_status === "ready" ? "MP4 listo para revisión" : alert.video_status === "pending" ? "MP4 subiendo" : "Sin MP4 asociado"}
                  </p>
                  <Button variant="outline" className="w-full border-slate-200 text-slate-700" onClick={() => selectAlert(alert)}><Eye /> Ver evidencia</Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {visible.length > 0 && (
        <div
          data-testid="alerts-pagination"
          className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:flex-row sm:px-4"
        >
          <p className="text-xs text-slate-500">
            Mostrando <span className="font-bold text-slate-700">{pageStart + 1}–{Math.min(pageStart + ALERTS_PER_PAGE, visible.length)}</span> de {visible.length}
          </p>
          <nav aria-label="Paginación de alertas" className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Página anterior"
              disabled={safePage === 1}
              onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
              className="border-slate-200 px-2 sm:px-3"
            >
              <ChevronLeft /> <span className="hidden sm:inline">Anterior</span>
            </Button>

            <div className="hidden items-center gap-1 sm:flex">
              {pageItems.map((item) => typeof item === "number" ? (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={item === safePage ? "default" : "outline"}
                  aria-label={`Página ${item}`}
                  aria-current={item === safePage ? "page" : undefined}
                  onClick={() => setCurrentPage(item)}
                  className={item === safePage ? "min-w-9 bg-red-600 text-white hover:bg-red-700" : "min-w-9 border-slate-200"}
                >
                  {item}
                </Button>
              ) : (
                <span key={item} aria-hidden="true" className="px-1 text-slate-400">…</span>
              ))}
            </div>

            <span className="min-w-24 text-center text-xs font-semibold text-slate-600 sm:hidden">
              Página {safePage} de {totalPages}
            </span>

            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Página siguiente"
              disabled={safePage === totalPages}
              onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
              className="border-slate-200 px-2 sm:px-3"
            >
              <span className="hidden sm:inline">Siguiente</span> <ChevronRight />
            </Button>
          </nav>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && !saving && setSelected(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-4xl">
          {selected && (
            <>
              <div className="overflow-hidden rounded-t-xl bg-black">
                {videoUrl ? (
                  <video src={videoUrl} controls autoPlay playsInline className="max-h-[68vh] w-full object-contain" />
                ) : selected.thumbnail_url ? (
                  // Signed image URL intentionally bypasses Next's persistent cache.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.thumbnail_url} alt={`Alerta cámara ${selected.camera_id}`} className="max-h-[68vh] w-full object-contain" />
                ) : (
                  <div className="flex aspect-video items-center justify-center text-slate-400"><Camera size={40} /></div>
                )}
              </div>
              <DialogHeader className="px-5 pt-1">
                <div className="flex items-center justify-between gap-3 pr-8">
                  <DialogTitle className="flex items-center gap-2 text-lg text-slate-900"><AlertTriangle size={18} className="text-red-600" /> {selected.camera_name || `Cámara ${selected.camera_id}`}</DialogTitle>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_META[selected.status].className}`}>{STATUS_META[selected.status].label}</span>
                </div>
                <DialogDescription>
                  {formatDate(selected.occurred_at)} · riesgo {Math.round(selected.risk_score * 100)}%
                  {alertDelay(selected) !== null ? ` · decisión en ${alertDelay(selected)!.toFixed(3)} s` : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="px-5 pb-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Señales detectadas</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(selected.risk_reasons.length ? selected.risk_reasons : ["comportamiento_sospechoso"]).map((reason) => <span key={reason} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">{reason.replaceAll("_", " ")}</span>)}
                </div>
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><Film size={14} /> Video GCS protegido</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {selected.video_status === "ready" ? "Visualización pública de solo lectura mediante enlace temporal de 5 minutos"
                          : selected.video_status === "pending" ? "Subida en proceso"
                          : selected.video_status === "failed" ? "La subida falló; el original permanece en Jetson"
                          : "Esta alerta aún no tiene video cloud"}
                      </p>
                    </div>
                    {selected.video_status === "ready" && (
                      <Button size="sm" disabled={videoLoading} onClick={() => void openVideo()} className="bg-slate-900 text-white hover:bg-slate-800">
                        {videoLoading ? <LoaderCircle className="animate-spin" /> : <Play />} Reproducir
                      </Button>
                    )}
                  </div>
                  {authNeeded && (
                    <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 sm:grid-cols-[1fr_1fr_auto]">
                      <p className="text-[11px] text-slate-500 sm:col-span-3">Inicia sesión únicamente para clasificar la alerta.</p>
                      <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Correo operador" autoComplete="username" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-red-300" />
                      <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Contraseña" autoComplete="current-password" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-red-300" />
                      <Button size="sm" disabled={videoLoading || !email || !password} onClick={() => void signIn()}><LogIn /> Ingresar</Button>
                    </div>
                  )}
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

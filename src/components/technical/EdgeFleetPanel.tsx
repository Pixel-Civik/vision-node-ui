"use client";

import {
  Activity, AlertTriangle, Camera, CheckCircle2, Clock3, Cpu, Database,
  HardDrive, MemoryStick, RefreshCw, Server, Thermometer, Wifi, WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  useEdgeFleet, type EdgeMetricSample, type EdgeNode, type EdgeStatus,
} from "@/hooks/useEdgeFleet";

const STATUS: Record<EdgeStatus, { label: string; dot: string; badge: string; border: string }> = {
  online: {
    label: "En línea", dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200", border: "border-t-emerald-400",
  },
  degraded: {
    label: "Degradado", dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700 border-amber-200", border: "border-t-amber-400",
  },
  offline: {
    label: "Fuera de servicio", dot: "bg-red-500",
    badge: "bg-red-50 text-red-700 border-red-200", border: "border-t-red-400",
  },
};

const CHART_LINES = [
  { key: "cpu_pct", label: "CPU", color: "#14b8a6" },
  { key: "gpu_pct", label: "GPU", color: "#8b5cf6" },
  { key: "memory_pct", label: "RAM", color: "#3b82f6" },
  { key: "disk_pct", label: "Disco", color: "#f59e0b" },
] as const;

function bytes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let result = value;
  let index = 0;
  while (result >= 1024 && index < units.length - 1) { result /= 1024; index += 1; }
  return `${result.toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
}

function duration(seconds: number | null): string {
  if (seconds === null) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
}

function age(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function hourLabel(value: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value));
}

function Meter({ label, value, icon, detail }: {
  label: string; value: number | null; icon: ReactNode; detail?: string;
}) {
  const pct = value ?? 0;
  const color = pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-teal-500";
  return (
    <div className="min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-slate-600">{icon}{label}</span>
        <span className="font-bold tabular-nums text-slate-800">
          {value === null ? "N/D" : `${value.toFixed(1)}%`}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar"
        aria-label={label} aria-valuenow={value ?? undefined} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-all ${value === null ? "bg-slate-300" : color}`}
          style={{ width: `${value === null ? 0 : Math.max(1, Math.min(100, pct))}%` }} />
      </div>
      {detail && <p className="mt-1.5 truncate text-[10px] text-slate-400">{detail}</p>}
    </div>
  );
}

function ResourceChart({ samples, node }: { samples: EdgeMetricSample[]; node: EdgeNode }) {
  const availableLines = CHART_LINES.filter(({ key }) =>
    key !== "gpu_pct" || node.gpu_pct !== null || samples.some((sample) => sample.gpu_pct !== null));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold text-slate-700">Uso de recursos</h4>
          <p className="text-[10px] text-slate-400">Historial de las últimas 24 horas · muestras cada 5 min</p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {availableLines.map((line) => (
            <span key={line.key} className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className="size-2 rounded-full" style={{ backgroundColor: line.color }} />{line.label}
            </span>
          ))}
        </div>
      </div>
      {samples.length < 2 ? (
        <div className="flex h-40 items-center justify-center rounded-lg bg-slate-50 text-center text-xs text-slate-400">
          Recopilando historial para la gráfica…
        </div>
      ) : (
        <div className="h-44 w-full min-w-0 sm:h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={samples} margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
              <defs>
                {availableLines.map((line) => (
                  <linearGradient key={line.key} id={`${node.node_id}-${line.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={line.color} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={line.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="sampled_at" tickFormatter={hourLabel} minTickGap={34}
                tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(value) => `${value}%`}
                tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip labelFormatter={(value) => hourLabel(String(value))}
                formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
                contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 11 }} />
              {availableLines.map((line) => (
                <Area key={line.key} type="monotone" dataKey={line.key} name={line.label}
                  stroke={line.color} strokeWidth={2} fill={`url(#${node.node_id}-${line.key})`}
                  connectNulls dot={false} isAnimationActive={false} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function NodeCard({ node, samples }: { node: EdgeNode; samples: EdgeMetricSample[] }) {
  const status = STATUS[node.status];
  const cameras = Object.entries(node.cameras ?? {});
  const isShoplifting = node.service_name === "shoplifting";
  const trackingBad = !isShoplifting && node.tracking_status === "stale";

  return (
    <article className={`min-w-0 overflow-hidden rounded-2xl border border-t-4 border-slate-200 bg-white shadow-sm ${status.border}`}>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="flex min-w-0 gap-3">
          <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${isShoplifting ? "bg-violet-950 text-violet-300" : "bg-slate-900 text-teal-300"}`}>
            <Server size={21} />
          </div>
          <div className="min-w-0">
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {isShoplifting ? "Panel Jetson · IA" : "Panel mini-PC · Tracking"}
            </p>
            <h3 className="truncate text-base font-bold text-slate-900 sm:text-lg">{node.display_name}</h3>
            <p className="truncate text-xs text-slate-500">{node.site} · {node.node_id}</p>
          </div>
        </div>
        <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${status.badge}`}>
          <span className={`size-2 rounded-full ${status.dot}`} />{status.label}
        </span>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-2.5">
          <Meter label="CPU" value={node.cpu_pct} icon={<Cpu size={13} />}
            detail={node.cpu_temp_c === null ? undefined : `${node.cpu_temp_c.toFixed(1)} °C`} />
          <Meter label="GPU" value={node.gpu_pct} icon={<Activity size={13} />}
            detail={node.gpu_temp_c === null ? undefined : `${node.gpu_temp_c.toFixed(1)} °C`} />
          <Meter label="RAM" value={node.memory_pct} icon={<MemoryStick size={13} />}
            detail={`${bytes(node.memory_used_bytes)} / ${bytes(node.memory_total_bytes)}`} />
          <Meter label="Disco" value={node.disk_pct} icon={<HardDrive size={13} />}
            detail={`${bytes(node.disk_used_bytes)} / ${bytes(node.disk_total_bytes)}`} />
        </div>

        <ResourceChart samples={samples} node={node} />

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-slate-50 p-2.5">
            <p className="text-slate-400">Último heartbeat</p>
            <p className="mt-0.5 font-semibold text-slate-700">hace {age(node.heartbeat_age_sec)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-2.5">
            <p className="text-slate-400">Uptime del host</p>
            <p className="mt-0.5 font-semibold text-slate-700">{duration(node.uptime_sec)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-2.5">
            <p className="text-slate-400">Cola de subida</p>
            <p className={`mt-0.5 font-semibold ${node.upload_pending > 0 ? "text-amber-700" : "text-slate-700"}`}>
              {node.upload_pending} pendiente(s)
            </p>
          </div>
          <div className={`rounded-lg p-2.5 ${trackingBad ? "bg-red-50" : "bg-slate-50"}`}>
            <p className={trackingBad ? "text-red-500" : "text-slate-400"}>
              {isShoplifting ? "Motor shoplifting" : "Tracking ID"}
            </p>
            <p className={`mt-0.5 font-semibold ${trackingBad ? "text-red-700" : "text-slate-700"}`}>
              {isShoplifting
                ? node.service_status
                : node.tracking_status === "active" ? `visto hace ${node.tracking_age_min ?? 0} min`
                : node.tracking_status === "stale" ? `sin detectar ${node.tracking_age_min ?? 0} min`
                : node.tracking_status === "disabled" ? "desactivado" : "esperando primera detección"}
            </p>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <Camera size={13} /> Cámaras ({cameras.length})
          </div>
          {cameras.length === 0 ? (
            <p className="text-xs text-slate-400">El nodo aún no reporta cámaras.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {cameras.map(([id, camera]) => {
                const cameraOk = ["running", "healthy", "scheduled"].includes(camera.status ?? "");
                const fps = camera.processed_fps ?? camera.fps;
                return (
                  <div key={id} className={`min-w-0 rounded-lg border px-2.5 py-2 text-xs ${cameraOk ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">Cámara {id}</span>
                      <span className={`size-2 shrink-0 rounded-full ${cameraOk ? "bg-emerald-500" : "bg-amber-500"}`} />
                    </div>
                    <p className="mt-0.5 truncate text-[10px] opacity-80">
                      {camera.status ?? "sin estado"}{fps !== undefined ? ` · ${Number(fps).toFixed(1)} FPS` : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1"><Database size={11} /> {node.service_name}: {node.service_status}</span>
          <span className="flex items-center gap-1"><Thermometer size={11} /> CPU {node.cpu_temp_c ?? "—"}° · GPU {node.gpu_temp_c ?? "—"}°</span>
          <span className="flex items-center gap-1"><Clock3 size={11} /> versión {node.version ?? "N/D"}</span>
        </div>
      </div>
    </article>
  );
}

export function EdgeFleetPanel() {
  const fleet = useEdgeFleet();
  const nodes = fleet.data.nodes;
  const online = nodes.filter((node) => node.status === "online").length;
  const degraded = nodes.filter((node) => node.status === "degraded").length;
  const offline = nodes.filter((node) => node.status === "offline").length;
  const alerts = nodes.filter((node) =>
    node.status !== "online" || (node.service_name === "people-tracking" && node.tracking_status === "stale")).length;
  const cards: Array<[string, number, ReactNode, string]> = [
    ["Equipos", nodes.length, <Server key="total" size={17} />, "text-slate-700 bg-slate-100"],
    ["En línea", online, <Wifi key="online" size={17} />, "text-emerald-700 bg-emerald-100"],
    ["Degradados", degraded, <AlertTriangle key="degraded" size={17} />, "text-amber-700 bg-amber-100"],
    ["Fuera", offline, <WifiOff key="offline" size={17} />, "text-red-700 bg-red-100"],
    ["Atención", alerts, <Activity key="alerts" size={17} />, "text-indigo-700 bg-indigo-100"],
  ];

  return (
    <section className="min-w-0 space-y-4" aria-labelledby="edge-fleet-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="edge-fleet-title" className="text-sm font-semibold uppercase tracking-widest text-slate-600">
            Infraestructura en tiempo real
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Panel independiente por equipo · heartbeat cada 30 s · alerta offline a los 30 min
          </p>
        </div>
        <button type="button" onClick={() => fleet.refresh()} disabled={fleet.refreshing}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={13} className={fleet.refreshing ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
        {cards.map(([title, value, icon, cls]) => (
          <div key={title} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${cls}`}>{icon}</span>
            <div className="min-w-0"><p className="truncate text-[11px] text-slate-500">{title}</p><p className="text-xl font-bold leading-tight text-slate-900">{value}</p></div>
          </div>
        ))}
      </div>

      <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-100/70 p-3 text-xs text-slate-600 sm:grid-cols-3">
        <span className="flex items-center gap-2"><WifiOff size={13} className="text-red-500" /> Equipo sin heartbeat: 30 min</span>
        <span className="flex items-center gap-2"><AlertTriangle size={13} className="text-amber-500" /> Servicio degradado: 5 min</span>
        <span className="flex items-center gap-2"><CheckCircle2 size={13} className="text-emerald-500" /> Revisión automática: cada 5 min</span>
      </div>

      {fleet.error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><span className="font-semibold">No se pudo leer la telemetría.</span> {fleet.error}</div>}
      {fleet.loading && <div className="grid gap-4 xl:grid-cols-2">{[0, 1].map((item) => <div key={item} className="h-[34rem] animate-pulse rounded-2xl bg-slate-100" />)}</div>}
      {!fleet.loading && !fleet.error && nodes.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Server className="mx-auto text-slate-300" size={32} />
          <p className="mt-3 font-semibold text-slate-700">Aún no hay mini-PC reportando</p>
          <p className="mt-1 text-xs text-slate-500">Activa EDGE_TELEMETRY_ENABLED=1 y usa un EDGE_NODE_ID único.</p>
        </div>
      )}
      {nodes.length > 0 && (
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
          {nodes.map((node) => (
            <NodeCard key={node.node_id} node={node}
              samples={fleet.data.history.filter((sample) => sample.node_id === node.node_id)} />
          ))}
        </div>
      )}
    </section>
  );
}

"use client";

import {
  Activity, AlertTriangle, Camera, Clock3, Cpu, Database,
  HardDrive, MemoryStick, RefreshCw, Server, Thermometer, Wifi, WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEdgeFleet, type EdgeNode, type EdgeStatus } from "@/hooks/useEdgeFleet";

const STATUS: Record<EdgeStatus, { label: string; dot: string; badge: string }> = {
  online: { label: "En línea", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  degraded: { label: "Degradado", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  offline: { label: "Fuera de servicio", dot: "bg-red-500", badge: "bg-red-50 text-red-700 border-red-200" },
};

function bytes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let result = value; let index = 0;
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

function Meter({ label, value, icon, detail }: { label: string; value: number | null; icon: ReactNode; detail?: string }) {
  const pct = value ?? 0;
  const color = pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-teal-500";
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="flex items-center gap-1.5 font-medium text-slate-600">{icon}{label}</span>
        <span className="font-bold text-slate-800">{value === null ? "N/D" : `${value.toFixed(1)}%`}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 overflow-hidden" role="progressbar" aria-label={label} aria-valuenow={value ?? undefined} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-all ${value === null ? "bg-slate-300" : color}`} style={{ width: `${value === null ? 0 : Math.max(1, Math.min(100, pct))}%` }} />
      </div>
      {detail && <p className="text-[10px] text-slate-400 mt-1.5 truncate">{detail}</p>}
    </div>
  );
}

function NodeCard({ node }: { node: EdgeNode }) {
  const status = STATUS[node.status];
  const cameras = Object.entries(node.cameras ?? {});
  const trackingBad = node.tracking_status === "stale";
  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="p-4 md:p-5 border-b border-slate-100 flex flex-wrap gap-3 items-start justify-between">
        <div className="flex gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-teal-300 flex items-center justify-center shrink-0"><Server size={20} /></div>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 truncate">{node.display_name}</h3>
            <p className="text-xs text-slate-500 truncate">{node.site} · {node.node_id} · {node.node_kind}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${status.badge}`}>
          <span className={`w-2 h-2 rounded-full ${status.dot}`} />{status.label}
        </span>
      </div>

      <div className="p-4 md:p-5 space-y-4">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
          <Meter label="CPU" value={node.cpu_pct} icon={<Cpu size={13} />} detail={node.cpu_temp_c === null ? undefined : `${node.cpu_temp_c.toFixed(1)} °C`} />
          <Meter label="GPU" value={node.gpu_pct} icon={<Activity size={13} />} detail={node.gpu_temp_c === null ? undefined : `${node.gpu_temp_c.toFixed(1)} °C`} />
          <Meter label="RAM" value={node.memory_pct} icon={<MemoryStick size={13} />} detail={`${bytes(node.memory_used_bytes)} / ${bytes(node.memory_total_bytes)}`} />
          <Meter label="Disco" value={node.disk_pct} icon={<HardDrive size={13} />} detail={`${bytes(node.disk_used_bytes)} / ${bytes(node.disk_total_bytes)}`} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-slate-400">Último heartbeat</p><p className="font-semibold text-slate-700 mt-0.5">hace {age(node.heartbeat_age_sec)}</p></div>
          <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-slate-400">Uptime del host</p><p className="font-semibold text-slate-700 mt-0.5">{duration(node.uptime_sec)}</p></div>
          <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-slate-400">Cola de subida</p><p className={`font-semibold mt-0.5 ${node.upload_pending > 0 ? "text-amber-700" : "text-slate-700"}`}>{node.upload_pending} pendiente(s)</p></div>
          <div className={`rounded-lg p-2.5 ${trackingBad ? "bg-red-50" : "bg-slate-50"}`}><p className={trackingBad ? "text-red-500" : "text-slate-400"}>Tracking ID</p><p className={`font-semibold mt-0.5 ${trackingBad ? "text-red-700" : "text-slate-700"}`}>{node.tracking_status === "active" ? `visto hace ${node.tracking_age_min ?? 0} min` : node.tracking_status === "stale" ? `sin detectar ${node.tracking_age_min ?? 0} min` : node.tracking_status === "disabled" ? "desactivado" : "esperando primera detección"}</p></div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-2"><Camera size={13} /> Cámaras ({cameras.length})</div>
          {cameras.length === 0 ? <p className="text-xs text-slate-400">El nodo aún no reporta cámaras.</p> : (
            <div className="flex flex-wrap gap-2">{cameras.map(([id, camera]) => {
              const cameraOk = ["running", "healthy", "scheduled"].includes(camera.status ?? "");
              const fps = camera.processed_fps ?? camera.fps;
              return <span key={id} className={`rounded-lg border px-2.5 py-1.5 text-xs ${cameraOk ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                Cam {id}: {camera.status ?? "sin estado"}{fps !== undefined ? ` · ${Number(fps).toFixed(1)} FPS` : ""}
              </span>;
            })}</div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] text-slate-400">
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
  const alerts = nodes.filter((node) => node.status !== "online" || node.tracking_status === "stale").length;
  const cards: Array<[string, number, ReactNode, string]> = [
    ["Equipos", nodes.length, <Server key="total" size={17} />, "text-slate-700 bg-slate-100"],
    ["En línea", online, <Wifi key="online" size={17} />, "text-emerald-700 bg-emerald-100"],
    ["Degradados", degraded, <AlertTriangle key="degraded" size={17} />, "text-amber-700 bg-amber-100"],
    ["Fuera", offline, <WifiOff key="offline" size={17} />, "text-red-700 bg-red-100"],
    ["Requieren atención", alerts, <Activity key="alerts" size={17} />, "text-indigo-700 bg-indigo-100"],
  ];

  return (
    <section className="space-y-4" aria-labelledby="edge-fleet-title">
      <div className="flex items-start justify-between gap-3">
        <div><h2 id="edge-fleet-title" className="text-sm font-semibold text-slate-600 uppercase tracking-widest">Infraestructura en tiempo real</h2><p className="text-xs text-slate-500 mt-1">Heartbeat cada 30 s · fuera de servicio después de 30 min</p></div>
        <button type="button" onClick={() => fleet.refresh()} disabled={fleet.refreshing} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={13} className={fleet.refreshing ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {cards.map(([title, value, icon, cls]) => <div key={title} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm flex items-center gap-3"><span className={`w-9 h-9 rounded-lg flex items-center justify-center ${cls}`}>{icon}</span><div><p className="text-[11px] text-slate-500">{title}</p><p className="text-xl font-bold text-slate-900 leading-tight">{value}</p></div></div>)}
      </div>

      {fleet.error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><span className="font-semibold">No se pudo leer la telemetría.</span> {fleet.error}</div>}
      {fleet.loading && <div className="grid lg:grid-cols-2 gap-4">{[0, 1].map((item) => <div key={item} className="h-72 rounded-2xl bg-slate-100 animate-pulse" />)}</div>}
      {!fleet.loading && !fleet.error && nodes.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><Server className="mx-auto text-slate-300" size={32} /><p className="mt-3 font-semibold text-slate-700">Aún no hay mini-PC reportando</p><p className="text-xs text-slate-500 mt-1">Despliega el servicio con EDGE_TELEMETRY_ENABLED=1 y un EDGE_NODE_ID único.</p></div>}
      {nodes.length > 0 && <div className="grid 2xl:grid-cols-2 gap-4">{nodes.map((node) => <NodeCard key={node.node_id} node={node} />)}</div>}
    </section>
  );
}

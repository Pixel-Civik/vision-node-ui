import { createClient } from "jsr:@supabase/supabase-js@2";

type AlertType = "node_offline" | "tracking_stale" | "service_unhealthy" | "camera_unhealthy";
type AlertState = {
  node_id: string; site: string; display_name: string; service_name: string;
  service_status: string; alert_type: AlertType; alert_key: string;
  camera_id: string | null; active: boolean; age_min: number;
  last_signal_at: string; details: Record<string, unknown>;
};

const REMINDER_MIN = Math.max(15, Number(Deno.env.get("EDGE_ALERT_REMINDER_MIN") ?? "30"));
const label = (state: AlertState) => {
  if (state.alert_type === "node_offline") {
    return state.service_name === "shoplifting"
      ? "Jetson o Shoplifting sin heartbeat"
      : "Mini-PC o Tracking sin heartbeat";
  }
  if (state.alert_type === "tracking_stale") return "Tracking sin IDs nuevos";
  if (state.alert_type === "camera_unhealthy") {
    return `Cámara ${state.camera_id ?? state.alert_key} sin procesamiento`;
  }
  return state.service_name === "shoplifting"
    ? "Shoplifting degradado o detenido"
    : "Tracking degradado o detenido";
};

async function sendEmail(apiKey: string, from: string, to: string[], state: AlertState, reminder: boolean) {
  const title = label(state);
  const subject = `${reminder ? "🔴 RECORDATORIO" : "⚠️ ALERTA"} — ${title}: ${state.display_name}`;
  const lastSignal = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima", dateStyle: "short", timeStyle: "medium",
  }).format(new Date(state.last_signal_at));
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to, subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a">
        <h2 style="color:#b91c1c">${title}</h2>
        <p>El monitor técnico detectó una condición que requiere revisión.</p>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Equipo</td><td style="padding:8px;background:#f8fafc">${state.display_name}</td></tr>
          <tr><td style="padding:8px;font-weight:bold">Nodo / sede</td><td style="padding:8px">${state.node_id} · ${state.site}</td></tr>
          <tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Servicio</td><td style="padding:8px;background:#f8fafc">${state.service_name} · ${state.service_status}</td></tr>
          ${state.camera_id ? `<tr><td style="padding:8px;font-weight:bold">Cámara</td><td style="padding:8px">${state.camera_id}</td></tr>` : ""}
          <tr><td style="padding:8px;font-weight:bold">Duración del problema</td><td style="padding:8px">${state.age_min} min</td></tr>
          <tr><td style="padding:8px;font-weight:bold">Última señal</td><td style="padding:8px">${lastSignal}</td></tr>
        </table>
        <p style="font-size:12px;color:#64748b;margin-top:18px">Pixel Civik · Monitoreo automático de infraestructura</p>
      </div>`,
    }),
  });
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("ALERT_FROM_EMAIL");
  const recipients = (Deno.env.get("ALERT_TO_EMAIL") ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: "missing_supabase_secrets" }, { status: 500 });
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: states, error: statesError } = await sb.rpc("edge_node_alert_states");
  if (statesError) return Response.json({ error: "alert_states_failed", detail: statesError.message }, { status: 500 });
  const { data: openRows, error: openError } = await sb.from("edge_node_alerts")
    .select("id,node_id,alert_type,alert_key,last_notified_at,notification_count").is("resolved_at", null);
  if (openError) return Response.json({ error: "open_alerts_failed", detail: openError.message }, { status: 500 });
  const openByKey = new Map((openRows ?? []).map((row) => [
    `${row.node_id}:${row.alert_type}:${row.alert_key}`, row,
  ]));
  const stateKeys = new Set(((states ?? []) as AlertState[]).map((state) =>
    `${state.node_id}:${state.alert_type}:${state.alert_key}`));
  const actions: Array<Record<string, unknown>> = [];

  for (const state of (states ?? []) as AlertState[]) {
    const stateKey = `${state.node_id}:${state.alert_type}:${state.alert_key}`;
    const open = openByKey.get(stateKey);
    if (!state.active) {
      if (open) {
        await sb.from("edge_node_alerts").update({ resolved_at: new Date().toISOString(), last_age_min: state.age_min }).eq("id", open.id);
        actions.push({ node_id: state.node_id, type: state.alert_type, key: state.alert_key, action: "resolved" });
      }
      continue;
    }
    const sinceNotification = open?.last_notified_at
      ? (Date.now() - new Date(open.last_notified_at).getTime()) / 60_000
      : Number.POSITIVE_INFINITY;
    if (open && sinceNotification < REMINDER_MIN) {
      actions.push({ node_id: state.node_id, type: state.alert_type, key: state.alert_key, action: "cooldown" });
      continue;
    }
    if (!resendKey || !fromEmail || recipients.length === 0) {
      actions.push({ node_id: state.node_id, type: state.alert_type, key: state.alert_key, action: "email_not_configured" });
      continue;
    }
    const mail = await sendEmail(resendKey, fromEmail, recipients, state, Boolean(open));
    if (!mail.ok) {
      actions.push({ node_id: state.node_id, type: state.alert_type, key: state.alert_key, action: "email_failed", status: mail.status });
      continue;
    }
    const now = new Date().toISOString();
    if (open) {
      await sb.from("edge_node_alerts").update({ last_notified_at: now, last_age_min: state.age_min,
        notification_count: Number(open.notification_count ?? 0) + 1 }).eq("id", open.id);
    } else {
      await sb.from("edge_node_alerts").insert({ node_id: state.node_id, alert_type: state.alert_type,
        alert_key: state.alert_key,
        last_notified_at: now, last_age_min: state.age_min, notification_count: 1,
        details: { site: state.site, display_name: state.display_name, ...state.details } });
    }
    actions.push({ node_id: state.node_id, type: state.alert_type, key: state.alert_key, action: open ? "reminded" : "opened" });
  }
  // Si se retira una cámara o se deshabilita un monitor, su estado deja de
  // existir en la RPC. Resolver esa incidencia evita dejarla abierta para siempre.
  for (const open of openRows ?? []) {
    const key = `${open.node_id}:${open.alert_type}:${open.alert_key}`;
    if (!stateKeys.has(key)) {
      await sb.from("edge_node_alerts").update({ resolved_at: new Date().toISOString() }).eq("id", open.id);
      actions.push({ node_id: open.node_id, type: open.alert_type, key: open.alert_key, action: "resolved_removed_monitor" });
    }
  }
  await sb.rpc("prune_edge_node_metrics", { p_keep_days: 30 });
  return Response.json({ checked: (states ?? []).length, actions });
});

import { createClient } from "jsr:@supabase/supabase-js@2";

const STALE_MIN = 20; // minutos sin datos para primera alerta
const REMIND_MIN = 15; // minutos entre recordatorios mientras sigue sin datos
const LIMA_OFFSET = 5 * 60 * 60 * 1000; // UTC-5, sin DST

function limaHM() {
  const d = new Date(Date.now() - LIMA_OFFSET);
  return { h: d.getUTCHours(), m: d.getUTCMinutes() };
}

function isOperatingHours(): boolean {
  const { h } = limaHM();
  if (h < 7)  return false; // antes de 7 AM
  if (h >= 21) return false; // desde las 9 PM en adelante
  return true;
}

// Retorna las 7 AM Lima de hoy en UTC (Lima = UTC-5, 7AM Lima = 12:00 UTC)
function todayOpenUTC(): Date {
  const limaNow = new Date(Date.now() - LIMA_OFFSET);
  return new Date(Date.UTC(
    limaNow.getUTCFullYear(),
    limaNow.getUTCMonth(),
    limaNow.getUTCDate(),
    12, 0, 0,
  ));
}

async function sendEmail(
  apiKey: string,
  from: string,
  to: string[],
  ageMin: number,
  ultimoEvento: string,
  horaLima: string,
  isReminder: boolean,
) {
  const subject = isReminder
    ? `🔴 RECORDATORIO — Pixel Civik sin datos hace ${ageMin} min`
    : `⚠️ Pixel Civik — Sin datos hace ${ageMin} min`;

  const titulo = isReminder
    ? "🔴 Recordatorio: Siguen sin ingresar datos"
    : "⚠️ Sin ingreso de datos recientes";

  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto">
          <h2 style="color:#b91c1c">${titulo}</h2>
          <p>No se han detectado eventos en el sistema por <strong>${ageMin} minutos</strong>.</p>
          <table style="border-collapse:collapse;width:100%">
            <tr>
              <td style="padding:6px 12px;background:#fef2f2;font-weight:bold">Último evento</td>
              <td style="padding:6px 12px;background:#fef2f2">${ultimoEvento}</td>
            </tr>
            <tr>
              <td style="padding:6px 12px;font-weight:bold">Hora actual Lima</td>
              <td style="padding:6px 12px">${horaLima}</td>
            </tr>
            <tr>
              <td style="padding:6px 12px;background:#fef2f2;font-weight:bold">Minutos sin datos</td>
              <td style="padding:6px 12px;background:#fef2f2">${ageMin} min</td>
            </tr>
          </table>
          <p style="margin-top:16px">Por favor verificar el estado de las cámaras y la conexión.</p>
          <p style="color:#6b7280;font-size:12px">— Sistema de alertas Pixel Civik</p>
        </div>
      `,
    }),
  });
}

Deno.serve(async () => {
  if (!isOperatingHours()) {
    return new Response(JSON.stringify({ skip: "outside operating hours" }), {
      status: 200,
    });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Último evento registrado
  const { data: lastRow } = await sb
    .from("events")
    .select("time")
    .order("time", { ascending: false })
    .limit(1)
    .single();

  if (!lastRow?.time) {
    return new Response(JSON.stringify({ skip: "no events found" }), {
      status: 200,
    });
  }

  // Referencia = max(último evento, apertura de hoy a las 7 AM)
  // Evita falsas alertas al inicio del día por datos de la noche anterior
  const lastEventDate = new Date(lastRow.time);
  const opStart       = todayOpenUTC();
  const ref           = lastEventDate > opStart ? lastEventDate : opStart;
  const ageMs         = Date.now() - ref.getTime();
  const ageMin        = Math.round(ageMs / 60_000);

  // 2. Alerta abierta (no resuelta) — incluye last_notified_at para calcular recordatorio
  const { data: openAlert } = await sb
    .from("alert_log")
    .select("id, last_notified_at")
    .eq("alert_type", "data_stale")
    .is("resolved_at", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .single();

  console.log(
    `[CHECK] Último evento hace ${ageMin} min — ${ageMin > STALE_MIN ? "STALE" : "OK"}`,
  );

  const toEmails = Deno.env
    .get("ALERT_TO_EMAIL")!
    .split(",")
    .map((e) => e.trim());
  const fromEmail = Deno.env.get("ALERT_FROM_EMAIL")!;
  const apiKey = Deno.env.get("RESEND_API_KEY")!;

  const horaLima = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date());

  const ultimoEvento = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(lastRow.time));

  if (ageMin > STALE_MIN) {
    if (openAlert) {
      // Verificar si ya pasaron 15 min desde el último envío
      const minsSinceNotif =
        (Date.now() - new Date(openAlert.last_notified_at).getTime()) / 60_000;

      if (minsSinceNotif < REMIND_MIN) {
        const next = Math.round(REMIND_MIN - minsSinceNotif);
        console.log(`[SKIP] Recordatorio en ${next} min`);
        return new Response(
          JSON.stringify({ action: "reminder_pending", next_in_min: next }),
          { status: 200 },
        );
      }

      // Pasaron 15 min y siguen sin datos → enviar recordatorio
      console.log(`[EMAIL] Enviando recordatorio a: ${toEmails.join(", ")}`);
      const res = await sendEmail(
        apiKey,
        fromEmail,
        toEmails,
        ageMin,
        ultimoEvento,
        horaLima,
        true,
      );

      if (!res.ok) {
        const err = await res.text();
        return new Response(
          JSON.stringify({ error: "resend_failed", detail: err }),
          { status: 500 },
        );
      }

      await sb
        .from("alert_log")
        .update({ last_notified_at: new Date().toISOString() })
        .eq("id", openAlert.id);

      console.log(`[EMAIL] Recordatorio enviado — ${ageMin} min sin datos`);
      return new Response(
        JSON.stringify({
          action: "reminder_sent",
          minutes: ageMin,
          to: toEmails,
        }),
        { status: 200 },
      );
    }

    // Primera alerta
    console.log(`[EMAIL] Enviando primera alerta a: ${toEmails.join(", ")}`);
    const res = await sendEmail(
      apiKey,
      fromEmail,
      toEmails,
      ageMin,
      ultimoEvento,
      horaLima,
      false,
    );

    if (!res.ok) {
      const err = await res.text();
      return new Response(
        JSON.stringify({ error: "resend_failed", detail: err }),
        { status: 500 },
      );
    }

    await sb.from("alert_log").insert({
      alert_type: "data_stale",
      minutes_stale: ageMin,
      last_notified_at: new Date().toISOString(),
    });

    console.log(`[EMAIL] Primera alerta enviada — ${ageMin} min sin datos`);
    return new Response(
      JSON.stringify({ action: "alert_sent", minutes: ageMin, to: toEmails }),
      { status: 200 },
    );
  }

  // Datos frescos — resolver alerta abierta si existía
  if (openAlert) {
    await sb
      .from("alert_log")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", openAlert.id);

    console.log(`[OK] Alerta resuelta — datos volvieron`);
    return new Response(JSON.stringify({ action: "alert_resolved" }), {
      status: 200,
    });
  }

  console.log(`[OK] Datos frescos — sin alerta`);
  return new Response(JSON.stringify({ action: "ok", minutes: ageMin }), {
    status: 200,
  });
});

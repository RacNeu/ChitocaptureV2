// ChitoCapture ingest: devices and the plant gateway POST furnace readings here (24/7, no browser
// needed). The function stores them, applies the alert rules and sends Telegram messages.
//
// POST /functions/v1/ingest
//   headers: x-ingest-key: <key from table app_config, key 'ingest_key'>
//   body: { "site": "demo", "readings": [{ "furnace": "IF3", "kw": 30500, "hz": 210, "bathC": 1540,
//           "waterInC": 32.1, "waterOutC": 48.6, "flowM3h": 410, "leakMA": 3.2, "phase": "melting" }] }
// Telegram (optional): set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Supabase → Edge Functions → Secrets.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

type Reading = { furnace: string; at?: string; phase?: string; kw?: number; hz?: number; bathC?: number | null; waterInC?: number; waterOutC?: number; flowM3h?: number; leakMA?: number };
type Hit = { rule: string; level: "warn" | "alarm"; title: string; detail: string; action: string };

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-ingest-key, x-source, authorization, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const TAP_AIM = 1620;

/** Same fixed limits as the app (src/live/feed.ts). */
function check(r: Reading): Hit[] {
  const hits: Hit[] = [];
  const f = r.furnace;
  if (r.flowM3h !== undefined && r.flowM3h < 300) hits.push({ rule: "flow", level: "alarm", title: `${f} coil water flow low`, detail: `Flow ${Math.round(r.flowM3h)} m³/h (min 300)${r.waterOutC !== undefined ? ` · outlet ${r.waterOutC} °C` : ""}`, action: "Check coil cooling pumps, filters and hoses; cut power until flow is back." });
  if (r.waterOutC !== undefined && r.waterOutC > 55) hits.push({ rule: "outlet", level: "alarm", title: `${f} coil water outlet hot`, detail: `Outlet ${r.waterOutC} °C (max 55)`, action: "Reduce power and check cooling-tower temperature and flow." });
  else if (r.waterOutC !== undefined && r.waterInC !== undefined && r.waterOutC - r.waterInC > 20) hits.push({ rule: "dt", level: "warn", title: `${f} coil water ΔT high`, detail: `ΔT ${(r.waterOutC - r.waterInC).toFixed(1)} °C (warn above 20)`, action: "Watch the coil water; check flow and the heat exchanger." });
  if (r.leakMA !== undefined && r.leakMA > 25) hits.push({ rule: "leak", level: "alarm", title: `${f} earth leakage high`, detail: `${r.leakMA} mA (alarm above 25 mA)`, action: "Stop melting and inspect the lining: metal may be close to the coil." });
  else if (r.leakMA !== undefined && r.leakMA > 15) hits.push({ rule: "leak", level: "warn", title: `${f} earth leakage rising`, detail: `${r.leakMA} mA (warn above 15 mA)`, action: "Plan a lining inspection; watch the trend." });
  if (r.bathC !== undefined && r.bathC !== null && r.bathC > TAP_AIM + 30) hits.push({ rule: "bath", level: "warn", title: `${f} bath over tap aim`, detail: `${r.bathC} °C, ${r.bathC - TAP_AIM} °C over the ${TAP_AIM} °C aim`, action: "Lower power or tap now: every °C over aim costs energy." });
  return hits;
}

async function telegram(text: string): Promise<"sent" | "not-configured" | "failed"> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN"), chat = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chat) return "not-configured";
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }) });
    return r.ok ? "sent" : "failed";
  } catch { return "failed"; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method-not-allowed" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { data: cfg } = await db.from("app_config").select("value").eq("key", "ingest_key").single();
  if (!cfg || req.headers.get("x-ingest-key") !== cfg.value) return json({ error: "unauthorised" }, 401);

  let body: { site?: string; readings?: Reading[] } & Reading;
  try { body = await req.json(); } catch { return json({ error: "bad-json" }, 400); }
  const site = (body.site ?? "demo").toString().slice(0, 60);
  const readings = (Array.isArray(body.readings) ? body.readings : body.furnace ? [body] : []).slice(0, 200).filter((r) => typeof r.furnace === "string" && r.furnace.length <= 20);
  if (!readings.length) return json({ error: "no-readings" }, 400);

  const { error } = await db.from("readings").insert(readings.map((r) => ({
    site, furnace: r.furnace, at: r.at ?? new Date().toISOString(), phase: r.phase ?? null,
    kw: r.kw ?? null, hz: r.hz ?? null, bath_c: r.bathC ?? null, water_in_c: r.waterInC ?? null, water_out_c: r.waterOutC ?? null, flow_m3h: r.flowM3h ?? null, leak_ma: r.leakMA ?? null,
    source: req.headers.get("x-source") === "simulator" ? "simulator" : "device",
  })));
  if (error) return json({ error: "store-failed", detail: error.message }, 500);

  // Alerts: raise each rule once per furnace, escalate warn → alarm, clear when the reading is clean.
  const raised: string[] = [];
  const latest = new Map<string, Reading>();
  for (const r of readings) latest.set(r.furnace, r);
  for (const [furnace, r] of latest) {
    const hits = check(r);
    const { data: open } = await db.from("alerts").select("id, rule, level, raised_at").eq("site", site).eq("furnace", furnace).is("cleared_at", null);
    for (const h of hits) {
      const existing = open?.find((a) => a.rule === h.rule);
      if (existing && !(existing.level === "warn" && h.level === "alarm")) continue;
      const text = `${h.level === "alarm" ? "🚨 ALARM" : "⚠️ WARNING"} · ${h.title}\n${h.detail}\nTime ${new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" })} · ${site}\n➡️ ${h.action}`;
      const status = await telegram(text);
      if (existing) await db.from("alerts").update({ level: h.level, title: h.title, detail: h.detail, telegram: status }).eq("id", existing.id);
      else await db.from("alerts").insert({ site, furnace, rule: h.rule, level: h.level, title: h.title, detail: h.detail, action: h.action, telegram: status });
      raised.push(h.title);
    }
    // Clear open alerts whose condition is gone (after at least 3 minutes, so a flapping signal doesn't re-alert).
    const stale = (open ?? []).filter((a) => !hits.some((h) => h.rule === a.rule) && Date.now() - Date.parse(a.raised_at) > 3 * 60_000);
    if (stale.length) await db.from("alerts").update({ cleared_at: new Date().toISOString() }).in("id", stale.map((a) => a.id));
  }
  return json({ stored: readings.length, raised });
});

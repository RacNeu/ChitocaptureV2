// ChitoCapture ingest: devices and the plant gateway POST furnace readings here (24/7, no browser
// needed). The function stores them, applies the alert rules and sends Telegram messages.
//
// POST /functions/v1/ingest
//   headers: x-ingest-key: <key>
//   body: { "site": "plant-1", "readings": [{ "furnace": "IF3", "kw": 30500, "hz": 210, "bathC": 1540,
//           "waterInC": 32.1, "waterOutC": 48.6, "flowM3h": 410, "leakMA": 3.2, "phase": "melting" }] }
//
// Two kinds of key, both in table app_config (readable only by this function):
//   ingest_key       DEVICE key: real sensors and gateways. Never put it in the website.
//   demo_ingest_key  DEMO key: the website's test publisher. It is public by nature (it ships in the
//                    browser), so it is fenced in: site is forced to "demo", furnaces IF1–IF4 only,
//                    small batches, a per-minute cap, a Telegram cap per hour, and demo data is deleted
//                    after 24 hours.
// Telegram (optional): set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Supabase → Edge Functions → Secrets.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

type Reading = { furnace: string; at: string; phase: string | null; kw: number | null; hz: number | null; bathC: number | null; waterInC: number | null; waterOutC: number | null; flowM3h: number | null; leakMA: number | null };
type Hit = { rule: string; level: "warn" | "alarm"; title: string; detail: string; action: string };

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-ingest-key, x-source, authorization, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const TAP_AIM = 1620;

/** Limits for the public demo key. */
const DEMO = { maxBatch: 24, perMinute: 360, telegramPerHour: 10, keepHours: 24 };
const PHASES = new Set(["charging", "melting", "superheat", "holding", "tapping", "idle"]);

/** A finite number inside a plausible range, else null (stops junk and absurd values). */
const num = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 100) / 100 : null;

function clean(raw: Record<string, unknown>, demo: boolean): Reading | null {
  const furnace = typeof raw.furnace === "string" ? raw.furnace : "";
  if (demo ? !/^IF[1-4]$/.test(furnace) : !/^[A-Za-z0-9_-]{1,20}$/.test(furnace)) return null;
  const at = typeof raw.at === "string" && !Number.isNaN(Date.parse(raw.at)) ? new Date(raw.at).toISOString() : new Date().toISOString();
  return {
    furnace, at,
    phase: typeof raw.phase === "string" && PHASES.has(raw.phase) ? raw.phase : null,
    kw: num(raw.kw, 0, 200_000), hz: num(raw.hz, 0, 10_000), bathC: num(raw.bathC, 0, 2_200),
    waterInC: num(raw.waterInC, -10, 150), waterOutC: num(raw.waterOutC, -10, 150), flowM3h: num(raw.flowM3h, 0, 10_000), leakMA: num(raw.leakMA, 0, 10_000),
  };
}

/** Same fixed limits as the app (src/live/feed.ts). */
function check(r: Reading): Hit[] {
  const hits: Hit[] = [];
  const f = r.furnace;
  if (r.flowM3h !== null && r.flowM3h < 300) hits.push({ rule: "flow", level: "alarm", title: `${f} coil water flow low`, detail: `Flow ${Math.round(r.flowM3h)} m³/h (min 300)${r.waterOutC !== null ? ` · outlet ${r.waterOutC} °C` : ""}`, action: "Check coil cooling pumps, filters and hoses; cut power until flow is back." });
  if (r.waterOutC !== null && r.waterOutC > 55) hits.push({ rule: "outlet", level: "alarm", title: `${f} coil water outlet hot`, detail: `Outlet ${r.waterOutC} °C (max 55)`, action: "Reduce power and check cooling-tower temperature and flow." });
  else if (r.waterOutC !== null && r.waterInC !== null && r.waterOutC - r.waterInC > 20) hits.push({ rule: "dt", level: "warn", title: `${f} coil water ΔT high`, detail: `ΔT ${(r.waterOutC - r.waterInC).toFixed(1)} °C (warn above 20)`, action: "Watch the coil water; check flow and the heat exchanger." });
  if (r.leakMA !== null && r.leakMA > 25) hits.push({ rule: "leak", level: "alarm", title: `${f} earth leakage high`, detail: `${r.leakMA} mA (alarm above 25 mA)`, action: "Stop melting and inspect the lining: metal may be close to the coil." });
  else if (r.leakMA !== null && r.leakMA > 15) hits.push({ rule: "leak", level: "warn", title: `${f} earth leakage rising`, detail: `${r.leakMA} mA (warn above 15 mA)`, action: "Plan a lining inspection; watch the trend." });
  if (r.bathC !== null && r.bathC > TAP_AIM + 30) hits.push({ rule: "bath", level: "warn", title: `${f} bath over tap aim`, detail: `${r.bathC} °C, ${Math.round(r.bathC - TAP_AIM)} °C over the ${TAP_AIM} °C aim`, action: "Lower power or tap now: every °C over aim costs energy." });
  return hits;
}

/**
 * People to tag, from Edge Function secrets (same rule as api/telegram.ts):
 *   TELEGRAM_MENTIONS on every alert, TELEGRAM_MENTIONS_ALARM also on alarms.
 * Only real Telegram usernames (@ + 5–32 letters, digits or _) are kept.
 */
function mentions(level: "warn" | "alarm"): string {
  const pick = (v?: string) => (v ?? "").split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^@[A-Za-z0-9_]{5,32}$/.test(s));
  const names = [...pick(Deno.env.get("TELEGRAM_MENTIONS")), ...(level === "alarm" ? pick(Deno.env.get("TELEGRAM_MENTIONS_ALARM")) : [])];
  return [...new Set(names)].join(" ");
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

  const key = req.headers.get("x-ingest-key") ?? "";
  const { data: keys } = await db.from("app_config").select("key, value").in("key", ["ingest_key", "demo_ingest_key"]);
  const deviceKey = keys?.find((k) => k.key === "ingest_key")?.value, demoKey = keys?.find((k) => k.key === "demo_ingest_key")?.value;
  const demo = !!demoKey && key === demoKey;
  if (!key || (!demo && key !== deviceKey)) return json({ error: "unauthorised" }, 401);

  let body: { site?: unknown; readings?: unknown } & Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad-json" }, 400); }
  const site = demo ? "demo" : typeof body.site === "string" && /^[A-Za-z0-9 _.-]{1,60}$/.test(body.site) ? body.site : null;
  if (!site) return json({ error: "bad-site" }, 400);
  const raw = Array.isArray(body.readings) ? body.readings : body.furnace ? [body] : [];
  if (raw.length > (demo ? DEMO.maxBatch : 200)) return json({ error: "batch-too-large" }, 413);
  const readings = raw.flatMap((r) => { const c = r && typeof r === "object" ? clean(r as Record<string, unknown>, demo) : null; return c ? [c] : []; });
  if (!readings.length) return json({ error: "no-readings" }, 400);

  if (demo) {
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await db.from("readings").select("id", { count: "exact", head: true }).eq("site", "demo").gte("received_at", since);
    if ((count ?? 0) + readings.length > DEMO.perMinute) return json({ error: "rate-limited" }, 429);
    // Keep the demo tables small: drop demo data older than a day (now and then).
    if (Math.random() < 0.05) {
      const old = new Date(Date.now() - DEMO.keepHours * 3_600_000).toISOString();
      await db.from("readings").delete().eq("site", "demo").lt("received_at", old);
      await db.from("alerts").delete().eq("site", "demo").lt("raised_at", old);
    }
  }

  const { error } = await db.from("readings").insert(readings.map((r) => ({
    site, furnace: r.furnace, at: r.at, phase: r.phase,
    kw: r.kw, hz: r.hz, bath_c: r.bathC, water_in_c: r.waterInC, water_out_c: r.waterOutC, flow_m3h: r.flowM3h, leak_ma: r.leakMA,
    source: demo ? "simulator" : req.headers.get("x-source") === "simulator" ? "simulator" : "device",
  })));
  if (error) return json({ error: "store-failed" }, 500);

  // Demo alerts may reach Telegram only a few times an hour, so the public demo key can't flood the group.
  let demoTelegramLeft = Infinity;
  if (demo) {
    const { count } = await db.from("alerts").select("id", { count: "exact", head: true }).eq("site", "demo").eq("telegram", "sent").gte("raised_at", new Date(Date.now() - 3_600_000).toISOString());
    demoTelegramLeft = DEMO.telegramPerHour - (count ?? 0);
  }

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
      const clock = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" });
      const text = `${demo ? "🧪 DEMO (simulated plant)\n" : ""}${h.level === "alarm" ? "🚨 ALARM" : "⚠️ WARNING"} · ${h.title}\n${h.detail}\nTime ${clock} · ${site}\n➡️ ${h.action}${mentions(h.level) ? `\n👷 ${mentions(h.level)}` : ""}`;
      const status = demoTelegramLeft > 0 ? await telegram(text) : "rate-limited";
      if (status === "sent") demoTelegramLeft -= 1;
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

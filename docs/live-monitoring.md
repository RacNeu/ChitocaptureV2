# Live monitoring and Telegram alerts: how it works

For the melt shop (induction furnaces + ladle furnace).

## What is built and running

| Part | Status | Where |
|---|---|---|
| Database (readings, alerts) | **Live** on Supabase project `chitocapture` (Singapore, free tier) | migration in Supabase; tables `readings`, `alerts`, private `app_config` |
| 24/7 ingest + alert service | **Live**: Supabase Edge Function `ingest` stores readings, applies the alert rules, sends Telegram | `supabase/functions/ingest/index.ts` |
| App reading cloud data in real time | **Built**: Supabase Realtime pushes new readings and alerts to the app | `src/live/sources.ts`, `src/live/store.ts` |
| Test publisher | **Built**: the simulated plant plays the devices and sends readings through Supabase | Settings → Live data & alerts |
| ESP32 sensor node | **Example sketch** (flow + two temperature probes → ingest function) | `firmware/esp32_furnace/esp32_furnace.ino` |
| Telegram | **Ready**: sends as soon as a bot token is added (see below); until then shown as a preview | edge function + `api/telegram.ts` |

## The path

```
ESP32 sensors / PLC gateway ──► Supabase ingest function (24/7) ──► readings + alerts tables ──► app (Realtime)
                                                            └──► Telegram bot ──► plant group chat
```

One path does everything: it stores history, checks alerts 24/7 without anyone watching the app, and
shows readings live.

## Using it in the app

Settings → **Live data & alerts**:
1. *Where live readings come from*: Simulation or **Supabase cloud**.
2. *Test publisher*: switch on **Send to Supabase ingest**, then choose **Supabase cloud**
   as the source. Readings now make the full round trip: browser → ingest function → database →
   Realtime → app. Inject a demo fault and the alert is raised **by the server**.
3. Melt shop → Furnace HMI → **Live feed** shows the same source.

## Keys and where they go (never in the code, never in chat)

| Key | Where | Purpose |
|---|---|---|
Anything starting with `VITE_` is built into the website and anyone can read it. Only public values go there.

| Key | Where | Vercel type | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env.local` (git-ignored) and Vercel env | Config | App reads live data. Public by design: the browser roles can only read `readings` and `alerts` |
| `VITE_DEMO_INGEST_KEY` | same | Config | The test publisher's **demo** key. Public by design, so the ingest function fences it in: site forced to `demo`, furnaces IF1–IF4 only, ≤ 24 readings per request, ≤ 360 readings a minute, ≤ 10 Telegram messages an hour, demo data deleted after 24 h |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | **Supabase → Edge Functions → Secrets** (24/7 alerts) and Vercel env (the app's "Send test") | Secret | Telegram alerts |
| `TELEGRAM_MENTIONS`, `TELEGRAM_MENTIONS_ALARM` (optional) | same two places as the bot token | Config | People to tag, as Telegram @usernames separated by spaces or commas. `TELEGRAM_MENTIONS` is tagged on every message; `TELEGRAM_MENTIONS_ALARM` is added on alarms only (not warnings). Anything that isn't a valid @username is ignored |
| `ANTHROPIC_API_KEY` | Vercel env | Secret | Claude in the chat and the simulator's Explain |
| `ALLOWED_ORIGINS` (optional) | Vercel env | Config | Extra web addresses allowed to call `/api/chat` and `/api/telegram`, comma-separated (e.g. a custom domain). The deployment's own address is always allowed |

**The device key** (real sensors and gateways) is in the Supabase table `app_config`, row `ingest_key`,
readable only by the server. It is **never** put in the website. To see it for flashing an ESP32:
Supabase → SQL Editor → `select value from app_config where key = 'ingest_key';`. To rotate it:
`update app_config set value = encode(extensions.gen_random_bytes(24), 'hex') where key = 'ingest_key';`
and re-flash the devices. The demo key (row `demo_ingest_key`) rotates the same way; then update
`VITE_DEMO_INGEST_KEY` in `.env.local` and Vercel.

### How the public routes are protected

- **Database:** row-level security on every table; the browser roles have no write permission at all, and no access to `app_config`.
- **`/api/telegram`:** never sends free text. The browser sends a message kind (`test`, or an alert's furnace, rule and level) and the server writes the words from fixed templates. Same-site only, 6 a minute per visitor, 30 an hour per running copy of the function.
- **`/api/chat`:** same-site only, 8 questions a minute and 100 a day per visitor. Also set a monthly spend limit in the Anthropic Console: it is the hard cap.
- **Limits that remain:** a determined script can fake the "same site" header, and per-visitor counts reset when Vercel starts a new copy of a function. The Telegram caps and the Anthropic spend limit are the backstops.

### Telegram in 4 steps
1. In Telegram, message **@BotFather** → `/newbot` → copy the token.
2. Create a group, add the bot, send any message in the group.
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy the group's `chat.id` (negative number).
4. Supabase dashboard → project `chitocapture` → Edge Functions → **Secrets**: add `TELEGRAM_BOT_TOKEN`
   and `TELEGRAM_CHAT_ID`. The next alert is delivered (the app shows ✓✓ in the Telegram preview).
5. Optional, to tag people: add `TELEGRAM_MENTIONS` (e.g. `@aiman_eng @meiling_sus`) and, for alarms only,
   `TELEGRAM_MENTIONS_ALARM` (e.g. `@plant_manager`), in Supabase secrets and in Vercel (then redeploy Vercel).
   Each message ends with a `👷 @…` line, and Telegram notifies everyone named there. Only people with a
   Telegram username can be tagged this way; they must be members of the group.

## Device message format

```json
POST https://<project-ref>.supabase.co/functions/v1/ingest
x-ingest-key: <device key>
{ "site": "demo", "readings": [ { "furnace": "IF3", "kw": 30500, "hz": 210, "bathC": 1540,
  "waterInC": 32.1, "waterOutC": 48.6, "flowM3h": 410, "leakMA": 3.2, "phase": "melting" } ] }
```

## Alert rules (example set points; the furnace maker's values replace them)

- Coil water flow < 300 m³/h → **alarm**
- Coil water outlet > 55 °C → **alarm**; ΔT > 20 °C → warning
- Earth leakage > 15 mA → warning; > 25 mA → **alarm**
- Bath > tap aim + 30 °C → warning
- In the app (simulation source) also: unusual reading for this furnace (median ± 4 robust σ)

Each alert is raised once, can escalate warning → alarm, and clears after the reading is normal again
(after at least 3 minutes).

## Still to do for a real plant

- A gateway that reads the furnace PLC (OPC UA / Modbus TCP) and posts to the ingest function.
- One key per device, and a retention job (e.g. keep 90 days of 1-second data, longer of 1-minute averages).
- Telegram alerts support operators; they never replace the furnace's hard-wired protections.

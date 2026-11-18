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
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env.local` (git-ignored) and Vercel → Settings → Environment Variables | App reads live data (read-only: the tables only allow SELECT) |
| `VITE_INGEST_KEY` | same | Only for the in-app test publisher demo. Real devices keep their own copy; for production give each device its own key and remove this from the browser |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | **Supabase → Edge Functions → Secrets** (for 24/7 alerts) and Vercel env (for the app's "Send test") | Telegram alerts |
| `ANTHROPIC_API_KEY` | Vercel env | Claude in the chat and the simulator's Explain |

The device ingest key is stored in the Supabase table `app_config` (row `ingest_key`), readable only by
the server. To rotate it: update that row and the devices.

### Telegram in 4 steps
1. In Telegram, message **@BotFather** → `/newbot` → copy the token.
2. Create a group, add the bot, send any message in the group.
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy the group's `chat.id` (negative number).
4. Supabase dashboard → project `chitocapture` → Edge Functions → **Secrets**: add `TELEGRAM_BOT_TOKEN`
   and `TELEGRAM_CHAT_ID`. The next alert is delivered (the app shows ✓✓ in the Telegram preview).

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

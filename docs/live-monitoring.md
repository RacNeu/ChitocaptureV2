# Live monitoring and Telegram alerts: how it works

For the melt shop (induction furnaces + ladle furnace). The app already contains the full path, with
the plant side **simulated** so it can be demonstrated without hardware.

## The path

```
Sensors + furnace PLC ──► Plant gateway ──► MQTT broker ──► ChitoCapture app (live HMI, Data feeds)
                                                     ├────► Database (history, reports, replay)
                                                     └────► 24/7 alert service ──► Telegram bot ──► plant group chat
```

| Step | What it is | Real products | In the demo |
|---|---|---|---|
| Measure | Furnace PLC: power, frequency, bath °C, set points. Extra sensors: coil-water flow and in/out temperature, lining earth-leakage current | The furnace maker's PLC; ESP32 + flow meter, PT100 probes, current transformer | Simulated by `src/live/feed.ts` using the heat physics in `src/model/furnaceSim.ts` |
| Collect | A small PC on the plant network reads the PLC and sensors every second | Node-RED or a Python script; OPC UA or Modbus TCP to the PLC | Simulated |
| Transport | Publishes each signal to an MQTT topic over TLS, e.g. `plant/IF3/coil/flow` | HiveMQ Cloud or EMQX Cloud (both have free tiers) | Simulated in the browser |
| Show | The app subscribes over secure WebSocket (`wss://`) and updates the HMI live | `mqtt.js` in the browser | **Live feed** mode in Melt shop → Furnace HMI, and Settings → Data feeds |
| Keep | Readings stored for history, reports and the learned energy factors | Supabase (Postgres) or a time-series database | Not connected |
| Alert | A service runs 24/7, applies the rules, and sends Telegram messages, even with no browser open | A Vercel cron/edge function or a small worker subscribed to MQTT | Rules and messages are the real ones; they run in the browser in the demo |
| Notify | Telegram Bot API `sendMessage` to the plant group | Bot from @BotFather | `api/telegram.ts` sends for real once a token is set; otherwise the app shows a preview |

## Alert rules (example set points; the furnace maker's values replace them)

- Coil water flow < 300 m³/h → **alarm** (pump trip, blockage or leak)
- Coil water outlet > 55 °C → **alarm**; ΔT > 20 °C → warning
- Earth leakage > 15 mA → warning; > 25 mA → **alarm** (metal getting close to the coil through a worn lining)
- Bath > tap aim + 30 °C → warning (energy waste, lining wear)
- Unusual reading: 3 readings in a row outside the furnace's own normal band (median ± 4 robust σ over the last hour, melting and idle judged separately)

Each alert is sent **once**, can escalate from warning to alarm, and clears after the reading has been
normal for 3 minutes, so a flapping signal does not flood the chat.

## To make it real

1. Create a Telegram bot with @BotFather, add it to the plant group, and note the group's chat ID.
2. In Vercel → Project → Settings → Environment Variables set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
   and optionally `ALERT_API_KEY` (then send it as the `x-alert-key` header). Redeploy.
3. Create an MQTT broker account and a gateway (Node-RED is quickest) that reads the PLC and sensors and
   publishes to `plant/<furnace>/<signal>`.
4. Replace the simulated feed with an MQTT subscription that produces the same `LiveReading` objects;
   the HMI, alert engine and Telegram messages stay unchanged.
5. Move the alert engine into the 24/7 service so alerts do not depend on an open browser.

## Safety note

Telegram alerts support the operators; they never replace the furnace's own hard-wired protections
(coil-water interlocks, ground-fault trip). The app reads data and sends messages; it does not control
the furnace.

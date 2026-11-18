/*
 * ChitoCapture furnace sensor node (ESP32)
 *
 * Reads induction-furnace coil cooling water and sends it to ChitoCapture every 5 seconds:
 *   - coil water flow: hall-effect flow meter on FLOW_PIN (pulses per litre: FLOW_K)
 *   - water in / out temperature: two DS18B20 probes on ONE_WIRE_PIN
 * Optional extras (wire them the same way): furnace kW from the power meter's Modbus output,
 * lining earth-leakage from the furnace's ground-fault detector analogue output.
 *
 * Sends by HTTPS POST to the Supabase ingest function, which stores readings, checks the alert rules
 * and sends Telegram messages 24/7; the app shows them live.
 *
 * Libraries: OneWire, DallasTemperature, ArduinoJson.
 * Fill in the settings below. Never commit real passwords or keys.
 */
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

// ---------- Settings ----------
const char* WIFI_SSID = "your-wifi";
const char* WIFI_PASS = "your-password";
const char* FURNACE   = "IF3";
const char* SITE      = "demo";
const char* INGEST_URL = "https://<project-ref>.supabase.co/functions/v1/ingest";
const char* INGEST_KEY = "<device key: Supabase SQL editor, select value from app_config where key = 'ingest_key'>";  // never the demo key
const int FLOW_PIN = 27, ONE_WIRE_PIN = 4;
const float FLOW_K = 7.5;                  // pulses per second per (L/min) for a YF-type meter; calibrate
// ------------------------------

volatile unsigned long pulses = 0;
void IRAM_ATTR onPulse() { pulses++; }
OneWire oneWire(ONE_WIRE_PIN);
DallasTemperature probes(&oneWire);

void setup() {
  Serial.begin(115200);
  pinMode(FLOW_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_PIN), onPulse, FALLING);
  probes.begin();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print('.'); }
  Serial.println("\nWi-Fi connected");
}

String readingJson() {
  static unsigned long last = millis();
  unsigned long now = millis(), dt = now - last; last = now;
  noInterrupts(); unsigned long n = pulses; pulses = 0; interrupts();
  float lpm = (n / (dt / 1000.0)) / FLOW_K;          // litres per minute
  probes.requestTemperatures();
  JsonDocument doc;
  doc["furnace"] = FURNACE;
  doc["flowM3h"] = lpm * 60.0 / 1000.0;               // m³/h
  doc["waterInC"] = probes.getTempCByIndex(0);
  doc["waterOutC"] = probes.getTempCByIndex(1);
  String out; serializeJson(doc, out);
  return out;
}

void sendIngest(const String& reading) {
  WiFiClientSecure tls; tls.setInsecure();            // for a demo; pin the certificate in production
  HTTPClient http;
  http.begin(tls, INGEST_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-ingest-key", INGEST_KEY);
  int code = http.POST(String("{\"site\":\"") + SITE + "\",\"readings\":[" + reading + "]}");
  Serial.printf("ingest %d %s\n", code, http.getString().c_str());
  http.end();
}

void loop() {
  String reading = readingJson();
  Serial.println(reading);
  sendIngest(reading);
  delay(5000);
}

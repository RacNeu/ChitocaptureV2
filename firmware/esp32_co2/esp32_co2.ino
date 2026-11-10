/*
  ChitoCapture CO2 sensor firmware for ESP32 + Sensirion SCD41 (or SCD40).

  Prints one JSON line per reading at 115200 baud. The ChitoCapture app reads it over USB
  with the browser's Web Serial API (Chrome or Edge): Sensors -> "Connect USB sensor".

  Modes
    SINGLE  one sensor            -> {"co2":612,"temp":24.1,"rh":55.2}
    RIG     two sensors (capture  -> {"co2_in":5012,"co2_out":830,"temp":24.1,"rh":40.3}
            column inlet/outlet)

  Wiring (3.3 V logic)
    Sensor A (single, or column INLET):  SDA -> GPIO21, SCL -> GPIO22, VDD -> 3V3, GND -> GND
    Sensor B (column OUTLET, RIG only):  SDA -> GPIO25, SCL -> GPIO26, VDD -> 3V3, GND -> GND
    Every SCD4x has the same I2C address (0x62), so the two sensors need two I2C buses.

  Library: "Sensirion I2C SCD4x" (Arduino Library Manager), version 1.x.
  Board:   "ESP32 Dev Module" from the esp32 board package.

  Note: this sketch has not been compiled against a specific library release. If a function
  name differs in your installed version, check the library's bundled example.
  The SCD41 is specified for 400-5000 ppm. For higher CO2 levels in a capture rig, use a
  high-range NDIR sensor and print the same JSON keys.
*/

#include <Arduino.h>
#include <Wire.h>
#include <SensirionI2cScd4x.h>

#define RIG_MODE false        // set to true when two sensors are fitted (capture column)

SensirionI2cScd4x sensorA;
SensirionI2cScd4x sensorB;
TwoWire busB = TwoWire(1);

static void startSensor(SensirionI2cScd4x &sensor, TwoWire &bus) {
  sensor.begin(bus, SCD41_I2C_ADDR_62);
  sensor.wakeUp();
  sensor.stopPeriodicMeasurement();
  sensor.reinit();
  sensor.startPeriodicMeasurement();   // a new reading every 5 seconds
}

static bool readSensor(SensirionI2cScd4x &sensor, uint16_t &co2, float &temp, float &rh) {
  bool ready = false;
  if (sensor.getDataReadyStatus(ready) != 0 || !ready) return false;
  return sensor.readMeasurement(co2, temp, rh) == 0 && co2 > 0;
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  startSensor(sensorA, Wire);
  if (RIG_MODE) {
    busB.begin(25, 26);
    startSensor(sensorB, busB);
  }
  Serial.println("ChitoCapture sensor ready");   // ignored by the app (not a reading)
}

void loop() {
  uint16_t co2A = 0, co2B = 0;
  float tA = 0, rhA = 0, tB = 0, rhB = 0;
  bool okA = readSensor(sensorA, co2A, tA, rhA);

  if (!RIG_MODE) {
    if (okA) Serial.printf("{\"co2\":%u,\"temp\":%.1f,\"rh\":%.1f}\n", co2A, tA, rhA);
  } else {
    bool okB = readSensor(sensorB, co2B, tB, rhB);
    if (okA && okB) Serial.printf("{\"co2_in\":%u,\"co2_out\":%u,\"temp\":%.1f,\"rh\":%.1f}\n", co2A, co2B, tA, rhA);
  }
  delay(500);
}

# ESP32 CO₂ sensor for ChitoCapture

1. Install the **esp32** board package and the **Sensirion I2C SCD4x** library in the Arduino IDE.
2. Wire the sensor(s) as described at the top of `esp32_co2.ino`.
3. For the chitosan capture column, set `RIG_MODE` to `true` and fit one sensor before the column and one after it.
4. Upload, close the Arduino Serial Monitor (only one program can use the port), then open ChitoCapture in Chrome or Edge → **Sensors → Connect USB sensor**.

Any board that prints lines like `{"co2": 612}` or `{"co2_in": 5100, "co2_out": 820}` at 115200 baud works. An Arduino Uno with a different CO₂ sensor is fine too.

**Safety:** vent the column outlet, keep CO₂ cylinders small and supervised, and use gloves and goggles with amine chemicals.

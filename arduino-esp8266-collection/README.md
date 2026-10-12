# ESP8266 / hardware-specific sketches

Archived sketches from the old [Arduino-Collection](https://github.com/sudtanj/Arduino-Collection) repo.

These target ESP8266 / NodeMCU boards, which [Wokwi](https://wokwi.com/arduino) can't simulate, so this folder has no
`wokwi.toml` and is skipped by CI and the showcase site.

| Folder | What it does |
| --- | --- |
| `esp8266-wifi-connect` | Connects to a Wi-Fi network and prints the IP address |
| `esp8266-wifi-ap-sensor-server` | Runs a Wi-Fi access point + HTTP server that serves sensor JSON |
| `esp8266-ultrasonic-ap-server` | Same access point setup, reading an ultrasonic distance sensor |
| `esp8266-sensor-node-gateway-v1` | Child/gateway sensor node that reports to a central ESP over HTTP (older) |
| `esp8266-sensor-node-gateway-v2` | Newer version of the above |
| `esp8266-icare-json-draft` | Early iCare JSON sketch using the ArduinoJson v5 API (see `arduino-icare-json-sensor` for the v6 version) |
| `esp8266-max30100-thingspeak` | MAX30100 heart-rate / SpO2 sensor, reported to ThingSpeak (Wi-Fi and API values are random examples) |

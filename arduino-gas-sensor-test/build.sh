#!/usr/bin/env bash
# Compiles the sketch for the Arduino Uno so Wokwi can simulate it.
set -euo pipefail
cd "$(dirname "$0")"
arduino-cli core update-index
arduino-cli core install arduino:avr
arduino-cli compile --fqbn arduino:avr:uno --output-dir build sketch

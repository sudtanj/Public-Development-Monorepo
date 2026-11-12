# Public Development Monorepo

A monorepo collecting my smaller projects that aren't big enough to deserve a repository of their own.

Each project lives in its own top-level folder, so they stay independent while sharing a single home.

## Arduino showcase

Every `arduino-*` folder is a [Wokwi](https://wokwi.com/arduino) project (Arduino Uno). A GitHub workflow
(`.github/workflows/arduino-wokwi.yml`) compiles each one and runs its `scenario.test.yaml` in the Wokwi simulator.

| Project | What it does | Circuit |
| --- | --- | --- |
| [`arduino-analog-read`](arduino-analog-read) | Reads a potentiometer on `A0` and prints it over serial | Uno + potentiometer |
| [`arduino-icare-sensor`](arduino-icare-sensor) | Sends sensor data as JSON for the iCare PHR app | Uno + potentiometer |
| [`arduino-icare-json-sensor`](arduino-icare-json-sensor) | Same, using ArduinoJson to build the payload | Uno + potentiometer |
| [`arduino-smoke-sensor`](arduino-smoke-sensor) | Streams MQ-2 gas/smoke readings from `A5` | Uno + gas sensor |
| [`arduino-gas-sensor-test`](arduino-gas-sensor-test) | Gas sensor test on `A0` | Uno + gas sensor |
| [`arduino-ultrasonic-hcsr04`](arduino-ultrasonic-hcsr04) | Measures distance with an HC-SR04 (cm / inches) | Uno + HC-SR04 |

[`arduino-esp8266-collection`](arduino-esp8266-collection) holds older ESP8266 sketches that Wokwi can't simulate.



### Play in the browser

**[▶ Open the interactive showcase](https://sudtanj.github.io/Public-Development-Monorepo/)** - each project runs live on GitHub Pages (avr8js simulator): drag the sensor slider and watch the serial monitor. GitHub READMEs cannot run scripts, so the playable version lives on that page.

### Try it on Wokwi

- **In the browser:** open <https://wokwi.com/projects/new/arduino-uno>, then paste a project's `sketch/sketch.ino` and `diagram.json` into the editor.
- **In VS Code:** install the [Wokwi extension](https://marketplace.visualstudio.com/items?itemName=Wokwi.wokwi-vscode), run `./build.sh` in the project folder, then run *Wokwi: Start Simulator*.

### Project layout

```
arduino-<name>/
├── sketch/sketch.ino     # the code
├── diagram.json          # the Wokwi circuit
├── wokwi.toml            # points Wokwi at the compiled firmware
├── build.sh              # compiles with arduino-cli (Uno)
└── scenario.test.yaml    # pass/fail check used by CI
```

The showcase site is built by `.github/workflows/pages.yml` from `site/` and each project's compiled firmware.

Folders without a `wokwi.toml` are ignored by CI. The workflow needs a `WOKWI_CLI_TOKEN` repository secret
(create one at <https://wokwi.com/dashboard/ci>).

## C++

[`cpp-battleship`](cpp-battleship) is a console Battleship prototype. `.github/workflows/cpp.yml` compiles it and plays
a full game through stdin. The showcase has a
**[▶ playable browser version](https://sudtanj.github.io/Public-Development-Monorepo/cpp-battleship/)** that models
the program line by line and shows the same terminal output.

## Tour search

[`tour-aggregator`](tour-aggregator) scrapes group tour packages from Avia Travel, Obaja Tour and Golden Rama daily into a
**[searchable page](https://sudtanj.github.io/Public-Development-Monorepo/tours/)** on the showcase.

## Thunkable and App Inventor apps

These are 2017 Android projects saved as `.aia` exports:

| Folder | Projects |
| --- | --- |
| [`thunkable`](thunkable) | Thunkable Classic apps: CamVision and a QR code generator |
| [`appinventor-ihealth`](appinventor-ihealth) | MIT App Inventor: a live airflow graph from the iHealth sensor API |

`.github/workflows/aia.yml` validates the archives and publishes them as a downloadable artifact.

**[▶ Play them in the showcase](https://sudtanj.github.io/Public-Development-Monorepo/)**: the player at
`site/aia/` draws each app's screen from the `.aia` and runs the app's blocks in the browser.
See each folder's README for how to open the projects in App Inventor.

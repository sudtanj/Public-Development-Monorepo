import {
  CPU, avrInstruction, AVRTimer, timer0Config, timer1Config, timer2Config,
  AVRIOPort, portBConfig, portCConfig, portDConfig, AVRUSART, usart0Config,
  AVRADC, adcConfig,
} from 'https://esm.sh/avr8js@0.21.1';
import 'https://esm.sh/@wokwi/elements@1.9.2';

const CPU_HZ = 16_000_000;
const $ = (id) => document.getElementById(id);
const name = new URLSearchParams(location.search).get('p');

function parseHex(text) {
  const bytes = new Uint8Array(0x8000);
  for (const line of text.split(/\r?\n/)) {
    if (line[0] !== ':') continue;
    const len = parseInt(line.substr(1, 2), 16);
    const addr = parseInt(line.substr(3, 4), 16);
    if (parseInt(line.substr(7, 2), 16) !== 0) continue;
    for (let i = 0; i < len; i++) bytes[addr + i] = parseInt(line.substr(9 + i * 2, 2), 16);
  }
  return new Uint16Array(bytes.buffer);
}

// Wires of the form [ "sensor:PIN", "uno:PIN", ... ] -> { PIN: "unoPin" } for a part id.
function pinsOf(diagram, id) {
  const map = {};
  for (const [a, b] of diagram.connections) {
    for (const [x, y] of [[a, b], [b, a]]) {
      if (x.startsWith(id + ':') && y.startsWith('uno:')) map[x.split(':')[1]] = y.split(':')[1];
    }
  }
  return map;
}

async function main() {
  if (!/^arduino-[a-z0-9-]+$/.test(name ?? '')) throw new Error('Unknown project');
  const base = `projects/${name}/`;
  const [hex, diagram] = await Promise.all([
    fetch(base + 'sketch.hex').then((r) => r.text()),
    fetch(base + 'diagram.json').then((r) => r.json()),
  ]);
  $('title').textContent = name.replace('arduino-', '').replaceAll('-', ' ');
  $('src').href = `https://github.com/sudtanj/Public-Development-Monorepo/tree/main/${name}`;
  $('reset').onclick = () => location.reload();

  const cpu = new CPU(parseHex(hex));
  new AVRTimer(cpu, timer0Config);
  new AVRTimer(cpu, timer1Config);
  new AVRTimer(cpu, timer2Config);
  const portB = new AVRIOPort(cpu, portBConfig);
  new AVRIOPort(cpu, portCConfig);
  const portD = new AVRIOPort(cpu, portDConfig);
  const adc = new AVRADC(cpu, adcConfig);
  const usart = new AVRUSART(cpu, usart0Config, CPU_HZ);

  const serial = $('serial');
  usart.onByteTransmit = (b) => {
    serial.textContent = (serial.textContent + String.fromCharCode(b)).slice(-4000);
    serial.scrollTop = serial.scrollHeight;
  };

  // digital pin number -> [port, bit]
  const digital = (pin) => (pin < 8 ? [portD, pin] : [portB, pin - 8]);

  const part = diagram.parts.find((p) => p.id !== 'uno');
  let sensorEl;
  let rotDeg = 0;
  const pins = pinsOf(diagram, part.id);
  const slider = $('slider');
  const out = $('value');

  if (part.type === 'wokwi-hc-sr04') {
    sensorEl = document.createElement('wokwi-hc-sr04');
    $('label').textContent = 'Distance (cm)';
    Object.assign(slider, { min: 2, max: 400, value: 100 });
    const [trigPort, trigBit] = digital(Number(pins.TRIG));
    const [echoPort, echoBit] = digital(Number(pins.ECHO));
    trigPort.addListener((value, old) => {
      if ((old >> trigBit) & 1 && !((value >> trigBit) & 1)) {
        const width = Math.round(Number(slider.value) * 58 * (CPU_HZ / 1e6));
        cpu.addClockEvent(() => {
          echoPort.setPin(echoBit, true);
          cpu.addClockEvent(() => echoPort.setPin(echoBit, false), width);
        }, 500 * (CPU_HZ / 1e6) / 16);
      }
    });
    slider.oninput = () => (out.textContent = `${slider.value} cm`);
  } else {
    const isGas = part.type === 'wokwi-gas-sensor';
    sensorEl = document.createElement(isGas ? 'wokwi-gas-sensor' : 'wokwi-potentiometer');
    rotDeg = isGas ? 90 : 0;
    $('label').textContent = isGas ? 'Gas level (analog volts)' : 'Potentiometer (analog volts)';
    Object.assign(slider, { min: 0, max: 5, step: 0.05, value: 2.5 });
    const channel = Number((pins.SIG ?? pins.AOUT).replace('A', ''));
    slider.oninput = () => {
      adc.channelValues[channel] = Number(slider.value);
      out.textContent = `${Number(slider.value).toFixed(2)} V`;
    };
  }
  slider.oninput();
  await layoutCircuit(diagram, part, sensorEl, rotDeg);

  const CYCLES_PER_FRAME = CPU_HZ / 60;
  (function frame() {
    for (let i = 0; i < CYCLES_PER_FRAME; ) {
      const before = cpu.cycles;
      avrInstruction(cpu);
      cpu.tick();
      i += cpu.cycles - before;
    }
    requestAnimationFrame(frame);
  })();
}


// ---- Breadboard + jumper cable layout -------------------------------------
const PITCH = 10;
const BB = { x: 330, y: 160, cols: 20, firstCol: 6 };
const UNO_POS = { x: 10, y: 90 };
const holeX = (col) => BB.x + 30 + col * PITCH;
const holeY = (row) => BB.y + 30 + row * PITCH; // rows 0-4 top half (a-e)
const NS = 'http://www.w3.org/2000/svg';

function breadboardSvg() {
  const h = 200;
  const w = 60 + (BB.cols - 1) * PITCH + 10;
  let holes = '';
  for (let c = 0; c < BB.cols; c++) {
    for (let r = 0; r < 5; r++) {
      holes += `<rect x="${30 + c * PITCH - 2}" y="${30 + r * PITCH - 2}" width="4" height="4" rx="1"/>`;
      holes += `<rect x="${30 + c * PITCH - 2}" y="${120 + r * PITCH - 2}" width="4" height="4" rx="1"/>`;
    }
  }
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'bb');
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.style.left = `${BB.x}px`;
  svg.style.top = `${BB.y}px`;
  svg.innerHTML = `
    <rect width="${w}" height="${h}" rx="6" fill="#e9e5d6" stroke="#c9c3ad"/>
    <rect x="0" y="${h / 2 - 5}" width="${w}" height="10" fill="#d2ccb4"/>
    <line x1="8" y1="8" x2="${w - 8}" y2="8" stroke="#d33" stroke-width="2"/>
    <line x1="8" y1="${h - 8}" x2="${w - 8}" y2="${h - 8}" stroke="#36c" stroke-width="2"/>
    <g fill="#444">${holes}</g>`;
  return svg;
}

async function layoutCircuit(diagram, part, sensor, rotDeg) {
  const stage = $('stage');
  const uno = $('uno');
  await Promise.all([customElements.whenDefined('wokwi-arduino-uno'), customElements.whenDefined(part.type)]);

  uno.style.left = `${UNO_POS.x}px`;
  uno.style.top = `${UNO_POS.y}px`;
  stage.insertBefore(breadboardSvg(), uno);

  // Rotate the sensor's pins around its origin, then seat the left-most pin in a breadboard hole.
  const th = (rotDeg * Math.PI) / 180;
  const rot = (p) => ({ x: p.x * Math.cos(th) - p.y * Math.sin(th), y: p.x * Math.sin(th) + p.y * Math.cos(th) });
  const pins = Object.fromEntries(sensor.pinInfo.map((p) => [p.name, rot(p)]));
  const minX = Math.min(...Object.values(pins).map((p) => p.x));
  const seatRow = 1;
  const anchorY = Object.values(pins)[0].y;
  const left = holeX(BB.firstCol) - minX;
  const top = holeY(seatRow) - anchorY;
  sensor.classList.add('sensor');
  sensor.style.left = `${left}px`;
  sensor.style.top = `${top}px`;
  sensor.style.transform = `rotate(${rotDeg}deg)`;
  stage.appendChild(sensor);

  // One jumper per wire: Uno header pin -> hole in the same column as the sensor pin.
  const wires = document.createElementNS(NS, 'svg');
  wires.setAttribute('class', 'wires');
  const unoPins = Object.fromEntries(uno.pinInfo.map((p) => [p.name, p]));
  let paths = '';
  for (const [a, b, color] of diagram.connections) {
    const [u, s] = a.startsWith('uno:') ? [a, b] : [b, a];
    const up = unoPins[u.split(':')[1]];
    const sp = pins[s.split(':')[1]];
    if (!up || !sp) continue;
    const col = BB.firstCol + Math.round((sp.x - minX) / PITCH);
    const x1 = UNO_POS.x + up.x, y1 = UNO_POS.y + up.y;
    const x2 = holeX(col), y2 = holeY(3);
    const c = { red: '#d33', black: '#222', green: '#2a2', blue: '#26c' }[color] ?? color ?? '#888';
    const dy = y1 < UNO_POS.y + 60 ? -50 : 50; // header on top edge vs bottom edge
    paths += `<path d="M${x1} ${y1} C${x1} ${y1 + dy} ${x2} ${y2 + 60} ${x2} ${y2}" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/>` +
      `<circle cx="${x1}" cy="${y1}" r="3.5" fill="${c}"/><circle cx="${x2}" cy="${y2}" r="3.5" fill="${c}"/>`;
  }
  wires.innerHTML = paths;
  stage.appendChild(wires);

  // Scale the fixed-size board down on narrow screens.
  const fit = () => {
    const s = Math.min(1, $("wrap").clientWidth / 640);
    stage.style.transform = `scale(${s})`;
    $("wrap").style.height = `${380 * s}px`;
  };
  fit();
  addEventListener("resize", fit);
}

main().catch((e) => ($("error").textContent = `Could not start the simulation: ${e.message}`));

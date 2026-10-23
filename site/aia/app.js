import { unzipSync, strFromU8 } from 'https://esm.sh/fflate@0.8.2';

const $ = id => document.getElementById(id);
const SCREEN_W = 320, SCREEN_H = 568;

// collapse repeats so a polling Clock doesn't flood the log
const logLines = [];
let lastMsg = '', repeats = 0;
function log(msg) {
  if (msg === lastMsg) logLines[logLines.length - 1] = `${msg} (×${++repeats + 1})`;
  else { logLines.push(msg); lastMsg = msg; repeats = 0; }
  if (logLines.length > 200) logLines.shift();
  $('log').textContent = logLines.join('\n');
  $('log').scrollTop = 1e9;
}

// ---- reading the .aia (a zip of designer .scm, blocks .bky and assets)

const project = new URLSearchParams(location.search).get('p') ?? '';
let files;

function asset(v) {
  const data = files['assets/' + v];
  return data ? URL.createObjectURL(new Blob([data])) : v;
}

// App Inventor colors are &HAARRGGBB
function color(v) {
  const hex = String(v).replace('&H', '').padStart(8, '0');
  return `#${hex.slice(2)}${hex.slice(0, 2)}`;
}

// App Inventor shows lists as "(a b c)" when they're used as text
function toText(v) {
  if (Array.isArray(v)) return `(${v.map(toText).join(' ')})`;
  return String(v);
}

// ---- designer: draw the screen

const comps = {};      // component name -> { name, type, props, el, parentRow }
const nonVisible = [];
const ALIGN_H = { 1: 'flex-start', 2: 'flex-end', 3: 'center' };
const ALIGN_V = { 1: 'flex-start', 2: 'center', 3: 'flex-end' };

// -1 automatic, -2 fill parent, -10xx xx% of the screen, otherwise pixels
function applySize(c) {
  const { el, props, parentRow } = c;
  for (const [v, css, total] of [[props.Width, 'width', SCREEN_W], [props.Height, 'height', SCREEN_H]]) {
    const n = Number(v);
    if (v == null || n === -1) continue;
    if (n === -2) {
      if ((css === 'width') === parentRow) el.style.flex = '1 1 0';
      else el.style.alignSelf = 'stretch';
    } else {
      el.style[css] = n <= -1000 ? `${(-n - 1000) * total / 100}px` : `${n}px`;
    }
  }
}

function scheduleClock(c) {
  clearInterval(c.timer);
  const enabled = c.props.TimerEnabled !== 'False' && c.props.TimerEnabled !== false;
  c.timer = enabled ? setInterval(() => fire(c.name, 'Timer'), Number(c.props.TimerInterval ?? 1000)) : null;
}

function apply(c, prop, v) {
  c.props[prop] = v;
  const el = c.el;
  if (c.type === 'Form') {
    switch (prop) {
      case 'Title': $('titlebar').textContent = v; break;
      case 'TitleVisible': $('titlebar').hidden = v === 'False'; break;
      case 'ShowStatusBar': $('status').hidden = v === 'False'; break;
      case 'PrimaryColor': $('titlebar').style.background = color(v); break;
      case 'BackgroundColor': el.style.background = color(v); break;
      case 'BackgroundImage': el.style.backgroundImage = `url("${asset(v)}")`; break;
      case 'AlignHorizontal': el.style.alignItems = ALIGN_H[v]; break;
      case 'AlignVertical': el.style.justifyContent = ALIGN_V[v]; break;
    }
    return;
  }
  if (c.type === 'Clock' && (prop === 'TimerEnabled' || prop === 'TimerInterval') && 'timer' in c) {
    scheduleClock(c);
  }
  if (!el) return;
  const row = c.type === 'HorizontalArrangement';
  switch (prop) {
    case 'Text': if (c.type.endsWith('TextBox')) el.value = v; else el.textContent = toText(v); break;
    case 'Hint': el.placeholder = v; break;
    case 'BackgroundColor': el.style.background = color(v); break;
    case 'TextColor': el.style.color = color(v); break;
    case 'FontSize': el.style.fontSize = `${v}px`; break;
    case 'FontBold': el.style.fontWeight = v === 'True' ? 'bold' : ''; break;
    case 'FontItalic': el.style.fontStyle = v === 'True' ? 'italic' : ''; break;
    case 'FontTypeface': el.style.fontFamily = { 1: 'sans-serif', 2: 'serif', 3: 'monospace' }[v] ?? ''; break;
    case 'TextAlignment': el.style.textAlign = ['left', 'center', 'right'][v]; break;
    case 'Shape': el.style.borderRadius = { 1: '12px', 3: '50%' }[v] ?? ''; break;
    case 'Picture': case 'BackgroundImage': if (el.localName === 'img') el.src = asset(v); break;
    case 'Visible': el.style.display = v === 'False' ? 'none' : ''; break;
    case 'Width': case 'Height': applySize(c); break;
    case 'AlignHorizontal': el.style[row ? 'justifyContent' : 'alignItems'] = ALIGN_H[v]; break;
    case 'AlignVertical': el.style[row ? 'alignItems' : 'justifyContent'] = ALIGN_V[v]; break;
  }
}

function getProp(compName, prop) {
  const c = comps[compName];
  if (!c) return '';
  if (prop === 'Text' && c.type.endsWith('TextBox')) return c.el.value;
  return c.props[prop] ?? '';
}

function pickImage(capture, done) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  if (capture) input.capture = 'environment';
  input.onchange = () => input.files[0] && done(URL.createObjectURL(input.files[0]));
  input.click();
}

function render(def, parent, parentRow) {
  const type = def.$Type, c = { name: def.$Name, type, props: {}, el: null, parentRow };
  comps[def.$Name] = c;
  let el;
  switch (type) {
    case 'Label': el = document.createElement('div'); break;
    case 'Button': case 'ImagePicker': el = document.createElement('button'); break;
    case 'TextBox': case 'PasswordTextBox':
      el = document.createElement(def.MultiLine === 'True' ? 'textarea' : 'input');
      if (type === 'PasswordTextBox') el.type = 'password';
      break;
    case 'Image': case 'Canvas':
      el = document.createElement('img');
      el.alt = '';
      el.className = type.toLowerCase();
      break;
    case 'WebViewer':
      el = document.createElement('div');
      el.className = 'webviewer';
      break;
    case 'HorizontalArrangement': case 'VerticalArrangement':
      el = document.createElement('div');
      el.className = type === 'HorizontalArrangement' ? 'row' : 'col';
      break;
    default: nonVisible.push(`${def.$Name} (${type})`);
  }
  if (el) {
    c.el = el;
    el.title = def.$Name;
    parent.append(el);
  }
  for (const [k, v] of Object.entries(def)) if (!k.startsWith('$') && k !== 'Uuid') apply(c, k, v);

  if (type === 'Clock') scheduleClock(c);
  if (type === 'Button') el.onclick = () => fire(def.$Name, 'Click');
  if (type === 'ImagePicker') el.onclick = () => {
    fire(def.$Name, 'BeforePicking');
    pickImage(false, url => { c.props.Selection = url; fire(def.$Name, 'AfterPicking'); });
  };
  for (const child of def.$Components ?? []) render(child, el, type === 'HorizontalArrangement');
}

// ---- blocks: a small interpreter for the .bky XML

const kids = (el, tag) => [...el.children].filter(c => c.localName === tag);
const kid = (el, tag, n) => kids(el, tag).find(c => n == null || c.getAttribute('name') === n);
const field = (b, n) => kid(b, 'field', n)?.textContent ?? '';
const mut = b => kid(b, 'mutation');
const attr = (b, n) => mut(b)?.getAttribute(n);
const inner = (b, tag, n) => { const w = kid(b, tag, n); return w && kid(w, 'block'); };
const varName = b => mut(b) && kid(mut(b), 'eventparam')?.getAttribute('name') || field(b, 'VAR');

const globals = {}, handlers = {};

function fire(compName, event, params = {}) {
  const b = handlers[`${compName}.${event}`];
  if (!b) return;
  if (event !== 'Timer') log(`▶ when ${compName}.${event}`);
  try {
    run(inner(b, 'statement', 'DO'), params);
  } catch (e) {
    log(`✖ ${e.message}`);
  }
}

function run(b, env) {
  for (; b; b = inner(b, 'next')) exec(b, env);
}

function exec(b, env) {
  const value = n => evaluate(inner(b, 'value', n), env);
  switch (b.getAttribute('type')) {
    case 'controls_if': {
      const elseifs = Number(attr(b, 'elseif') ?? 0);
      for (let i = 0; i <= elseifs; i++) {
        if (truthy(value('IF' + i))) return run(inner(b, 'statement', 'DO' + i), env);
      }
      if (attr(b, 'else') === '1') run(inner(b, 'statement', 'ELSE'), env);
      return;
    }
    case 'controls_forEach':
      for (const item of asList(value('LIST'))) {
        run(inner(b, 'statement', 'DO'), Object.assign(Object.create(env), { [field(b, 'VAR')]: item }));
      }
      return;
    case 'lexical_variable_set': return setVar(field(b, 'VAR'), value('VALUE'), env);
    case 'component_set_get':
      if (attr(b, 'set_or_get') === 'set') {
        const v = value('VALUE');
        return apply(comps[attr(b, 'instance_name')], attr(b, 'property_name'), v);
      }
      return;
    case 'lists_add_items': {
      const list = asList(value('LIST'));
      for (let i = 0; i < Number(attr(b, 'items')); i++) list.push(value('ITEM' + i));
      return;
    }
    case 'lists_remove_item': {
      const list = asList(value('LIST'));
      list.splice(listIndex(list, value('INDEX'), 'Remove list item'), 1);
      return;
    }
    case 'controls_eval_but_ignore': value('VALUE'); return;
    default: evaluate(b, env);
  }
}

const truthy = v => v === true || v === 'true';

function asList(v) {
  if (!Array.isArray(v)) throw new Error(`Expected a list but got "${toText(v)}"`);
  return v;
}

// App Inventor lists are 1-based
function listIndex(list, i, what) {
  const n = Number(i);
  if (!(n >= 1 && n <= list.length)) {
    throw new Error(`${what}: Attempt to get item number ${toText(i)} of a list of length ${list.length}`);
  }
  return n - 1;
}

function setVar(n, v, env) {
  if (n.startsWith('global ')) globals[n.slice(7)] = v;
  else env[n] = v;
}

function getVar(n, env) {
  return n.startsWith('global ') ? globals[n.slice(7)] ?? '' : env[n] ?? '';
}

const COMPARE = {
  EQ: (a, b) => a == b, NEQ: (a, b) => a != b,
  LT: (a, b) => a < b, LTE: (a, b) => a <= b, GT: (a, b) => a > b, GTE: (a, b) => a >= b,
};

function evaluate(b, env) {
  if (!b) return '';
  const value = n => evaluate(inner(b, 'value', n), env);
  const items = prefix => {
    const out = [];
    for (let i = 0; i < Number(attr(b, 'items')); i++) out.push(value(prefix + i));
    return out;
  };
  const type = b.getAttribute('type');
  switch (type) {
    case 'text': return field(b, 'TEXT');
    case 'math_number': return Number(field(b, 'NUM'));
    case 'logic_boolean': return field(b, 'BOOL') === 'TRUE';
    case 'logic_negate': return !truthy(value('BOOL'));
    case 'logic_compare': return COMPARE[field(b, 'OP')](value('A'), value('B'));
    case 'math_compare': return COMPARE[field(b, 'OP')](Number(value('A')), Number(value('B')));
    case 'math_add': return items('NUM').reduce((s, v) => s + Number(v), 0);
    case 'math_multiply': return items('NUM').reduce((s, v) => s * Number(v), 1);
    case 'math_subtract': return Number(value('A')) - Number(value('B'));
    case 'math_division': return Number(value('A')) / Number(value('B'));
    case 'math_random_int': {
      const lo = Math.ceil(value('FROM')), hi = Math.floor(value('TO'));
      return lo + Math.floor(Math.random() * (hi - lo + 1));
    }
    case 'text_join': return items('ADD').map(toText).join('');
    case 'text_isEmpty': return toText(value('VALUE')).length === 0;
    case 'text_split_at_spaces': return toText(value('TEXT')).trim().split(/\s+/).filter(Boolean);
    case 'text_replace_all':
      return toText(value('TEXT')).replaceAll(toText(value('SEGMENT')), toText(value('REPLACEMENT')));
    case 'lists_create_with': return items('ADD');
    case 'lists_length': return asList(value('LIST')).length;
    case 'lists_is_empty': return asList(value('LIST')).length === 0;
    case 'lists_select_item': {
      const list = asList(value('LIST'));
      return list[listIndex(list, value('NUM'), 'Select list item')];
    }
    case 'lexical_variable_get': return getVar(varName(b), env);
    case 'component_component_block': return attr(b, 'instance_name');
    case 'component_set_get': return getProp(attr(b, 'instance_name'), attr(b, 'property_name'));
    case 'component_method': {
      const args = [];
      for (let i = 0; kid(b, 'value', 'ARG' + i); i++) args.push(value('ARG' + i));
      return call(attr(b, 'component_type'), attr(b, 'instance_name'), attr(b, 'method_name'), args);
    }
    default:
      log(`⚠ the "${type}" block isn't supported by this player`);
      return '';
  }
}

const pad2 = n => String(n).padStart(2, '0');

// Java SimpleDateFormat subset, used by Clock.FormatDateTime
function formatDate(d, pattern) {
  const parts = {
    yyyy: d.getFullYear(), MM: pad2(d.getMonth() + 1), dd: pad2(d.getDate()),
    HH: pad2(d.getHours()), hh: pad2(d.getHours() % 12 || 12),
    mm: pad2(d.getMinutes()), ss: pad2(d.getSeconds()), a: d.getHours() < 12 ? 'AM' : 'PM',
  };
  return pattern.replace(/yyyy|MM|dd|HH|hh|mm|ss|a/g, m => parts[m]);
}

// Web.JsonTextDecode turns objects into lists of [key, value] pairs with the keys sorted
function decodeJson(v) {
  if (Array.isArray(v)) return v.map(decodeJson);
  if (v && typeof v === 'object') return Object.keys(v).sort().map(k => [k, decodeJson(v[k])]);
  return v ?? 'null';
}

// Plain-http APIs without CORS can't be reached from the HTTPS showcase, so these hosts get a stand-in
// that answers in the same format.
const SIMULATED = {
  'ihealth.sepdek.net': () => {
    const timeStamp = formatDate(new Date(), 'yyyyMMddHHmmss');
    const jitter = (base, spread) => (base + (Math.random() - 0.5) * spread).toFixed(2);
    const sensors = [
      ['Airflow', jitter(15, 30), '%'], ['Body temperature', jitter(36.5, 0.6), 'deg.C'],
      ['Oxygen saturation', jitter(98.4, 0.8), '%'], ['Heart rate', jitter(68, 4), 'bpm'],
    ];
    return JSON.stringify({ healthData: sensors.map(([sensor, value, metric]) => ({ sensor, value, metric, timeStamp })) });
  },
};
const simulatedNoted = new Set();

async function webGet(compName) {
  const url = getProp(compName, 'Url');
  let responseCode, responseType, responseContent;
  try {
    const res = await fetch(url);
    responseCode = res.status;
    responseType = res.headers.get('content-type') ?? '';
    responseContent = await res.text();
  } catch {
    const host = URL.canParse(url) ? new URL(url).hostname : '';
    if (!SIMULATED[host]) {
      log(`✖ ${compName}.Get couldn't reach ${url} from the browser`);
      return;
    }
    if (!simulatedNoted.has(host)) {
      simulatedNoted.add(host);
      log(`ℹ ${host} can't be called from this HTTPS page, so ${compName} gets simulated data in the same format`);
    }
    [responseCode, responseType, responseContent] = [200, 'application/json', SIMULATED[host]()];
  }
  fire(compName, 'GotText', { url, responseCode, responseType, responseContent });
}

// ChartMaker draws with Google Charts inside a WebViewer; this draws the same line graph as SVG
function drawLineGraph(chartTitle, hAxisTitle, vAxisTitle, labels, rows, webViewer) {
  const el = comps[webViewer]?.el;
  if (!el) throw new Error(`drawLineGraph: ${toText(webViewer)} is not a WebViewer`);
  const W = 300, H = 260, L = 46, R = 10, T = 30, B = 40;
  const data = asList(rows).map(r => asList(r).map(Number));
  const xs = data.map(r => r[0]), ys = data.flatMap(r => r.slice(1));
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(0, ...ys), Math.max(...ys) || 1];
  const px = x => L + (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)) * (W - L - R);
  const py = y => H - B - (y - y0) / (y1 - y0) * (H - T - B);

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const add = (tag, attrs, text) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    svg.append(n);
  };
  add('text', { x: W / 2, y: 18, 'text-anchor': 'middle', 'font-weight': 'bold' }, toText(chartTitle));
  for (let i = 0; i <= 4; i++) {
    const y = y0 + (y1 - y0) * i / 4;
    add('line', { x1: L, x2: W - R, y1: py(y), y2: py(y), stroke: '#e5e5e5' });
    add('text', { x: L - 4, y: py(y) + 4, 'text-anchor': 'end', 'font-size': 10 }, +y.toFixed(1));
  }
  for (const x of [x0, x1]) add('text', { x: px(x), y: H - B + 14, 'text-anchor': 'middle', 'font-size': 10 }, x);
  add('text', { x: (L + W - R) / 2, y: H - 8, 'text-anchor': 'middle', 'font-size': 11 }, toText(hAxisTitle));
  add('text', { x: 12, y: (T + H - B) / 2, 'text-anchor': 'middle', 'font-size': 11,
    transform: `rotate(-90 12 ${(T + H - B) / 2})` }, toText(vAxisTitle));
  const palette = ['#3366cc', '#dc3912', '#ff9900', '#109618'];
  asList(labels).forEach((label, s) => {
    const points = data.filter(r => Number.isFinite(r[s + 1])).map(r => `${px(r[0])},${py(r[s + 1])}`).join(' ');
    add('polyline', { points, fill: 'none', stroke: palette[s % 4], 'stroke-width': 2 });
    add('text', { x: W - R, y: T + 4 + s * 14, 'text-anchor': 'end', 'font-size': 10, fill: palette[s % 4] }, toText(label));
  });
  el.replaceChildren(svg);
}

const tinyDb = new Map();

const METHODS = {
  'Notifier.ShowMessageDialog': (c, message, title) => {
    log(`💬 ${toText(message)}`);
    alert(title ? `${title}\n\n${toText(message)}` : toText(message));
  },
  'Notifier.ShowAlert': (c, notice) => { log(`💬 ${toText(notice)}`); alert(toText(notice)); },
  'Web.UriEncode': (c, s) => encodeURIComponent(s),
  'Web.Get': c => { webGet(c); },
  'Web.JsonTextDecode': (c, s) => decodeJson(JSON.parse(s)),
  'TinyDB.StoreValue': (c, tag, v) => { tinyDb.set(`${c}/${tag}`, v); },
  'TinyDB.GetValue': (c, tag, fallback) => tinyDb.has(`${c}/${tag}`) ? tinyDb.get(`${c}/${tag}`) : fallback,
  'Clock.Now': () => new Date(),
  'Clock.SystemTime': () => Date.now(),
  'Clock.FormatDateTime': (c, d, pattern) => formatDate(d instanceof Date ? d : new Date(), pattern),
  'Canvas.SaveAs': (c, path) => {
    log(`💾 ${c} saved as ${path} (simulated: right-click the image to save it)`);
    return path;
  },
  'BarcodeScanner.DoScan': c => {
    const result = prompt('There is no barcode scanner in the browser. Type what the scanned code contains:');
    if (result != null) setTimeout(() => fire(c, 'AfterScan', { result }));
  },
  'Camera.TakePicture': c => pickImage(true, image => fire(c, 'AfterPicture', { image })),
  'ChartMaker.drawLineGraph': (c, ...args) => drawLineGraph(...args),
};

function call(type, compName, method, args) {
  const fn = METHODS[`${type}.${method}`];
  if (fn) return fn(compName, ...args) ?? '';
  log(`⚠ ${compName}.${method}() needs the phone or a cloud service that's gone, skipped`);
  return '';
}

// ---- blocks as readable code

const OPS = { EQ: '=', NEQ: '≠', LT: '<', LTE: '≤', GT: '>', GTE: '≥' };

function expr(b) {
  if (!b) return '∅';
  const value = n => expr(inner(b, 'value', n));
  const items = prefix => {
    const out = [];
    for (let i = 0; i < Number(attr(b, 'items')); i++) out.push(value(prefix + i));
    return out;
  };
  const type = b.getAttribute('type');
  switch (type) {
    case 'text': return JSON.stringify(field(b, 'TEXT'));
    case 'math_number': return field(b, 'NUM');
    case 'logic_boolean': return field(b, 'BOOL').toLowerCase();
    case 'logic_negate': return `not ${value('BOOL')}`;
    case 'logic_compare': case 'math_compare': return `${value('A')} ${OPS[field(b, 'OP')]} ${value('B')}`;
    case 'math_add': return `(${items('NUM').join(' + ')})`;
    case 'math_multiply': return `(${items('NUM').join(' × ')})`;
    case 'math_subtract': return `(${value('A')} - ${value('B')})`;
    case 'math_division': return `(${value('A')} / ${value('B')})`;
    case 'math_random_int': return `random integer from ${value('FROM')} to ${value('TO')}`;
    case 'text_join': return `join(${items('ADD').join(', ')})`;
    case 'text_isEmpty': return `is empty ${value('VALUE')}`;
    case 'text_split_at_spaces': return `split at spaces ${value('TEXT')}`;
    case 'text_replace_all': return `replace all ${value('SEGMENT')} in ${value('TEXT')} with ${value('REPLACEMENT')}`;
    case 'lists_create_with': return `[${items('ADD').join(', ')}]`;
    case 'lists_length': return `length of ${value('LIST')}`;
    case 'lists_is_empty': return `is list empty ${value('LIST')}`;
    case 'lists_select_item': return `${value('LIST')}[${value('NUM')}]`;
    case 'lexical_variable_get': return varName(b);
    case 'component_component_block': return attr(b, 'instance_name');
    case 'component_set_get': return `${attr(b, 'instance_name')}.${attr(b, 'property_name')}`;
    case 'component_method': {
      const args = [];
      for (let i = 0; kid(b, 'value', 'ARG' + i); i++) args.push(value('ARG' + i));
      return `call ${attr(b, 'instance_name')}.${attr(b, 'method_name')}(${args.join(', ')})`;
    }
    default: return `[${type}]`;
  }
}

function stmts(b, depth) {
  let out = '';
  for (; b; b = inner(b, 'next')) {
    const comment = kid(b, 'comment');
    if (comment) out += `${'  '.repeat(depth)}// ${comment.textContent.trim()}\n`;
    out += stmt(b, depth);
  }
  return out;
}

function stmt(b, depth) {
  const pad = '  '.repeat(depth);
  const value = n => expr(inner(b, 'value', n));
  switch (b.getAttribute('type')) {
    case 'controls_if': {
      let out = '';
      for (let i = 0; i <= Number(attr(b, 'elseif') ?? 0); i++) {
        out += `${pad}${i ? 'else if' : 'if'} ${value('IF' + i)}\n${stmts(inner(b, 'statement', 'DO' + i), depth + 1)}`;
      }
      if (attr(b, 'else') === '1') out += `${pad}else\n${stmts(inner(b, 'statement', 'ELSE'), depth + 1)}`;
      return out;
    }
    case 'controls_forEach':
      return `${pad}for each ${field(b, 'VAR')} in ${value('LIST')}\n${stmts(inner(b, 'statement', 'DO'), depth + 1)}`;
    case 'lexical_variable_set': return `${pad}set ${field(b, 'VAR')} to ${value('VALUE')}\n`;
    case 'component_set_get':
      if (attr(b, 'set_or_get') === 'set') {
        return `${pad}set ${attr(b, 'instance_name')}.${attr(b, 'property_name')} to ${value('VALUE')}\n`;
      }
      return `${pad}${expr(b)}\n`;
    case 'lists_add_items': {
      const added = [];
      for (let i = 0; i < Number(attr(b, 'items')); i++) added.push(value('ITEM' + i));
      return `${pad}add ${added.join(', ')} to ${value('LIST')}\n`;
    }
    case 'lists_remove_item': return `${pad}remove ${value('LIST')}[${value('INDEX')}]\n`;
    case 'controls_eval_but_ignore': return `${pad}evaluate but ignore ${value('VALUE')}\n`;
    default: return `${pad}${expr(b)}\n`;
  }
}

// ---- start

try {
  if (!/^[\w-]+\/[\w-]+$/.test(project)) throw new Error('No project selected. Pick one from the project list.');
  const name = project.split('/')[1];
  $('download').href = `${project}.aia`;
  $('src').href = `https://github.com/sudtanj/Public-Development-Monorepo/tree/main/${project.split('/')[0]}`;

  const res = await fetch(`${project}.aia`);
  if (!res.ok) throw new Error(`Couldn't load ${name}.aia (${res.status})`);
  files = unzipSync(new Uint8Array(await res.arrayBuffer()));

  const paths = Object.keys(files);
  const scmPath = paths.find(p => p.endsWith('/Screen1.scm')) ?? paths.find(p => p.endsWith('.scm'));
  // .scm is a JSON object wrapped in "#|\n$JSON\n ... \n|#"
  const scm = JSON.parse(strFromU8(files[scmPath]).replace(/^\s*#\|\s*\$JSON/, '').replace(/\|#\s*$/, ''));
  const form = scm.Properties;

  document.title = `${form.AppName ?? name} - App Inventor player`;
  $('title').textContent = form.AppName ?? name;
  $('status').textContent = formatDate(new Date(), 'HH:mm');

  // parse the blocks before drawing so Clock timers that start during render find their handlers
  const bky = files[scmPath.replace(/\.scm$/, '.bky')];
  const top = bky ? kids(new DOMParser().parseFromString(strFromU8(bky), 'text/xml').documentElement, 'block') : [];
  const code = [];
  for (const b of top) {
    if (b.getAttribute('disabled') === 'true') continue;
    const type = b.getAttribute('type');
    if (type === 'global_declaration') {
      globals[field(b, 'NAME')] = evaluate(inner(b, 'value', 'VALUE'), {});
      code.push(`initialize global ${field(b, 'NAME')} to ${expr(inner(b, 'value', 'VALUE'))}\n`);
    } else if (type === 'component_event') {
      const event = `${attr(b, 'instance_name')}.${attr(b, 'event_name')}`;
      handlers[event] = b;
      code.push(`when ${event}\n${stmts(inner(b, 'statement', 'DO'), 1)}`);
    } else {
      code.push(`${expr(b)}\n`);
    }
  }
  $('blocks').textContent = code.join('\n') || 'This screen has no blocks.';

  const screen = { name: form.$Name, type: 'Form', props: {}, el: $('screen') };
  comps[form.$Name] = screen;
  apply(screen, 'Title', form.$Name);
  for (const [k, v] of Object.entries(form)) if (!k.startsWith('$') && k !== 'Uuid') apply(screen, k, v);
  for (const child of form.$Components ?? []) render(child, $('screen'), false);
  $('nonvisible').textContent = nonVisible.join(', ') || 'none';

  fire(form.$Name, 'Initialize');
  log('Ready.');
} catch (e) {
  $('error').textContent = e.message;
}

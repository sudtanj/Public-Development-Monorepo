import { unzipSync, strFromU8 } from 'https://esm.sh/fflate@0.8.2';

const $ = id => document.getElementById(id);
const SCREEN_W = 320, SCREEN_H = 568;

const log = msg => { $('log').textContent += msg + '\n'; $('log').scrollTop = 1e9; };

// ---- reading the .aia (a zip of designer .scm, blocks .bky and assets)

const name = new URLSearchParams(location.search).get('p') ?? '';
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

// ---- designer: draw the screen

const comps = {};      // component name -> { type, props, el, parentRow }
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
  if (!el) return;
  const row = c.type === 'HorizontalArrangement';
  switch (prop) {
    case 'Text': if (c.type.endsWith('TextBox')) el.value = v; else el.textContent = v; break;
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
  const type = def.$Type, c = { type, props: {}, el: null, parentRow };
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
  log(`▶ when ${compName}.${event}`);
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
    case 'lexical_variable_set': return setVar(field(b, 'VAR'), value('VALUE'), env);
    case 'component_set_get':
      if (attr(b, 'set_or_get') === 'set') {
        const v = value('VALUE');
        return apply(comps[attr(b, 'instance_name')], attr(b, 'property_name'), v);
      }
      return;
    case 'controls_eval_but_ignore': value('VALUE'); return;
    default: evaluate(b, env);
  }
}

const truthy = v => v === true || v === 'true';

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
  const type = b.getAttribute('type');
  switch (type) {
    case 'text': return field(b, 'TEXT');
    case 'math_number': return Number(field(b, 'NUM'));
    case 'logic_boolean': return field(b, 'BOOL') === 'TRUE';
    case 'logic_negate': return !truthy(value('BOOL'));
    case 'logic_compare': return COMPARE[field(b, 'OP')](value('A'), value('B'));
    case 'math_random_int': {
      const lo = Math.ceil(value('FROM')), hi = Math.floor(value('TO'));
      return lo + Math.floor(Math.random() * (hi - lo + 1));
    }
    case 'text_join': {
      let s = '';
      for (let i = 0; i < Number(attr(b, 'items')); i++) s += value('ADD' + i);
      return s;
    }
    case 'text_isEmpty': return String(value('VALUE')).length === 0;
    case 'lexical_variable_get': return getVar(varName(b), env);
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

const METHODS = {
  'Notifier.ShowMessageDialog': (c, message, title) => {
    log(`💬 ${message}`);
    alert(title ? `${title}\n\n${message}` : message);
  },
  'Notifier.ShowAlert': (c, notice) => { log(`💬 ${notice}`); alert(notice); },
  'Web.UriEncode': (c, s) => encodeURIComponent(s),
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
};

function call(type, compName, method, args) {
  const fn = METHODS[`${type}.${method}`];
  if (fn) return fn(compName, ...args) ?? '';
  log(`⚠ ${compName}.${method}() needs the phone or a Thunkable cloud service, skipped`);
  return '';
}

// ---- blocks as readable code

const OPS = { EQ: '=', NEQ: '≠', LT: '<', LTE: '≤', GT: '>', GTE: '≥' };

function expr(b) {
  if (!b) return '∅';
  const value = n => expr(inner(b, 'value', n));
  const type = b.getAttribute('type');
  switch (type) {
    case 'text': return JSON.stringify(field(b, 'TEXT'));
    case 'math_number': return field(b, 'NUM');
    case 'logic_boolean': return field(b, 'BOOL').toLowerCase();
    case 'logic_negate': return `not ${value('BOOL')}`;
    case 'logic_compare': return `${value('A')} ${OPS[field(b, 'OP')]} ${value('B')}`;
    case 'math_random_int': return `random integer from ${value('FROM')} to ${value('TO')}`;
    case 'text_join': {
      const items = [];
      for (let i = 0; i < Number(attr(b, 'items')); i++) items.push(value('ADD' + i));
      return `join(${items.join(', ')})`;
    }
    case 'text_isEmpty': return `is empty ${value('VALUE')}`;
    case 'lexical_variable_get': return varName(b);
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
    case 'lexical_variable_set': return `${pad}set ${field(b, 'VAR')} to ${value('VALUE')}\n`;
    case 'component_set_get':
      if (attr(b, 'set_or_get') === 'set') {
        return `${pad}set ${attr(b, 'instance_name')}.${attr(b, 'property_name')} to ${value('VALUE')}\n`;
      }
      return `${pad}${expr(b)}\n`;
    case 'controls_eval_but_ignore': return `${pad}evaluate but ignore ${value('VALUE')}\n`;
    default: return `${pad}${expr(b)}\n`;
  }
}

// ---- start

try {
  if (!/^[\w-]+$/.test(name)) throw new Error('No project selected. Pick one from the project list.');
  $('download').href = `${name}.aia`;
  $('src').href = 'https://github.com/sudtanj/Public-Development-Monorepo/tree/main/thunkable';

  const res = await fetch(`${name}.aia`);
  if (!res.ok) throw new Error(`Couldn't load ${name}.aia (${res.status})`);
  files = unzipSync(new Uint8Array(await res.arrayBuffer()));

  const paths = Object.keys(files);
  const scmPath = paths.find(p => p.endsWith('/Screen1.scm')) ?? paths.find(p => p.endsWith('.scm'));
  // .scm is a JSON object wrapped in "#|\n$JSON\n ... \n|#"
  const scm = JSON.parse(strFromU8(files[scmPath]).replace(/^\s*#\|\s*\$JSON/, '').replace(/\|#\s*$/, ''));
  const form = scm.Properties;

  document.title = `${form.AppName ?? name} - Thunkable app player`;
  $('title').textContent = form.AppName ?? name;
  $('status').textContent = formatDate(new Date(), 'HH:mm');

  const screen = { type: 'Form', props: {}, el: $('screen') };
  comps[form.$Name] = screen;
  apply(screen, 'Title', form.$Name);
  for (const [k, v] of Object.entries(form)) if (!k.startsWith('$') && k !== 'Uuid') apply(screen, k, v);
  for (const child of form.$Components ?? []) render(child, $('screen'), false);
  $('nonvisible').textContent = nonVisible.join(', ') || 'none';

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

  fire(form.$Name, 'Initialize');
  log('Ready: tap the buttons on the phone.');
} catch (e) {
  $('error').textContent = e.message;
}

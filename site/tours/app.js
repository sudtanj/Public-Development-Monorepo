const PAGE_SIZE = 48;
const SKELETON_COUNT = 8;
const DEFAULT_SORT = 'departure';
const $ = (id) => document.getElementById(id);
const [q, destination, month, price, days, sort] = ['q', 'destination', 'month', 'price', 'days', 'sort'].map($);

let tours = [];
let matches = [];
let shown = 0;
let loaded = false;

function el(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// Our own place index: operators label regions differently ("China | Hong Kong | Macau | Taiwan", "Eropa", "All Asia"),
// so a place matches any tour whose title or operator label mentions one of its words. A term naming another place pulls in all of its words.
const PLACES = {
  Asia: ['asia', 'East Asia', 'Southeast Asia', 'Central Asia', 'India', 'Nepal', 'Bhutan'],
  'East Asia': ['China', 'Hong Kong', 'Macau', 'Taiwan', 'Japan', 'Korea'],
  'Southeast Asia': ['south east asia', 'southeast asia', 'Vietnam', 'Thailand', 'Singapore', 'Malaysia'],
  'Central Asia': ['central asia', 'Uzbekistan', 'Kazakhstan'],
  China: ['china', 'tiongkok', 'cina'],
  'Hong Kong': ['hong kong', 'hongkong'],
  Macau: ['macau', 'macao'],
  Taiwan: ['taiwan'],
  Japan: ['japan', 'jepang'],
  Korea: ['korea'],
  Vietnam: ['vietnam', 'saigon', 'hanoi'],
  Thailand: ['thailand', 'bangkok', 'pattaya'],
  Singapore: ['singapore'],
  Malaysia: ['malaysia'],
  India: ['india'],
  Nepal: ['nepal'],
  Bhutan: ['bhutan'],
  Uzbekistan: ['uzbekistan'],
  Kazakhstan: ['kazakhstan'],
  Europe: ['europe', 'eropa', 'Switzerland', 'United Kingdom', 'Italy', 'France', 'Spain', 'Portugal', 'Germany', 'Austria', 'Scandinavia', 'Russia', 'Greece'],
  Switzerland: ['switzerland', 'swiss'],
  'United Kingdom': ['united kingdom', 'uk', 'england', 'scotland', 'london'],
  Italy: ['italy', 'dolomites'],
  France: ['france', 'paris'],
  Spain: ['spain'],
  Portugal: ['portugal'],
  Germany: ['germany'],
  Austria: ['austria', 'hallstatt'],
  Scandinavia: ['scandinavia', 'norway', 'finland', 'sweden', 'denmark', 'iceland'],
  Russia: ['russia'],
  Greece: ['greece'],
  'Middle East': ['middle east', 'timur tengah', 'Turkey', 'dubai', 'uae', 'jordan'],
  Turkey: ['turkey', 'turkiye', 'turki'],
  Africa: ['africa', 'afrika', 'Egypt', 'Morocco', 'tunisia'],
  Egypt: ['egypt', 'mesir'],
  Morocco: ['morocco'],
  Oceania: ['oceania', 'Australia', 'New Zealand'],
  Australia: ['australia', 'sydney', 'melbourne'],
  'New Zealand': ['new zealand', 'hobbiton'],
  America: ['america', 'amerika', 'USA', 'Canada'],
  USA: ['usa', 'united states'],
  Canada: ['canada'],
};
const REGIONS = new Set(['Asia', 'East Asia', 'Southeast Asia', 'Central Asia', 'Europe', 'Middle East', 'Africa', 'Oceania', 'America']);
const placeTerms = (name) => PLACES[name].flatMap((term) => (PLACES[term] ? placeTerms(term) : [term]));
const PLACE_PATTERNS = Object.keys(PLACES).map((name) => [name, new RegExp(`\\b(${placeTerms(name).join('|')})\\b`)]);

const isHttps = (u) => typeof u === 'string' && u.startsWith('https://');
const formatDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const formatMonth = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const formatPrice = (n) => `Rp ${n.toLocaleString('id-ID')}`;
const formatCount = (n) => n.toLocaleString('id-ID');

// Operators list titles in all caps; keep short words and anything with digits (UAE, 4WD) as written.
const LOWER_WORDS = new Set(['and', 'the', 'of', 'with', 'in', 'to', 'at', 'on', 'for', 'by']);
function tidyTitle(title) {
  if (title !== title.toUpperCase()) return title;
  return title.split(' ').map((word, i) => {
    const lower = word.toLowerCase();
    if (LOWER_WORDS.has(lower)) return i === 0 ? lower.replace(/\p{L}/u, (c) => c.toUpperCase()) : lower;
    if (word.length <= 3 || /\d/.test(word)) return word;
    return lower.replace(/\p{L}/u, (c) => c.toUpperCase());
  }).join(' ');
}

// Avia lists IATA codes ("GA", "GA&SQ;"), Golden Rama lists names in capitals; show names either way. Unknown codes stay as written.
const AIRLINES = {
  GA: 'Garuda Indonesia', SQ: 'Singapore Airlines', CA: 'Air China', EK: 'Emirates', MH: 'Malaysia Airlines',
  MF: 'Xiamen Airlines', QF: 'Qantas', CZ: 'China Southern Airlines', QR: 'Qatar Airways', BR: 'EVA Air',
  HO: 'Juneyao Air', JL: 'Japan Airlines', JAL: 'Japan Airlines', CX: 'Cathay Pacific', TK: 'Turkish Airlines',
  VN: 'Vietnam Airlines', EY: 'Etihad Airways', NH: 'All Nippon Airways', ANA: 'All Nippon Airways', TW: "T'way Air",
  PR: 'Philippine Airlines', HU: 'Hainan Airlines', KE: 'Korean Air', OZ: 'Asiana Airlines', TG: 'Thai Airways',
  MU: 'China Eastern Airlines', CI: 'China Airlines', TR: 'Scoot', JQ: 'Jetstar', ID: 'Batik Air', QZ: 'AirAsia',
  D7: 'AirAsia X', '7C': 'Jeju Air', LJ: 'Jin Air', NZ: 'Air New Zealand', SV: 'Saudia', WY: 'Oman Air',
  ET: 'Ethiopian Airlines', UL: 'SriLankan Airlines', AI: 'Air India', LH: 'Lufthansa', KL: 'KLM', AF: 'Air France',
  BA: 'British Airways', '3U': 'Sichuan Airlines', ZH: 'Shenzhen Airlines', MS: 'EgyptAir',
};
function airlineName(airline) {
  if (/^[A-Z0-9]{2,3}([^A-Za-z0-9]+[A-Z0-9]{2,3})*[^A-Za-z0-9]*$/.test(airline)) {
    return airline.match(/[A-Z0-9]{2,3}/g).map((code) => AIRLINES[code] ?? code).join(' & ');
  }
  return airline === airline.toUpperCase() ? airline.toLowerCase().replace(/(^|[\s.])\p{L}/gu, (c) => c.toUpperCase()) : airline;
}

function fillSelect(select, values, label = (v) => v) {
  for (const v of values) select.append(el('option', label(v), { value: v }));
}

function fillPlaces(list) {
  const counts = new Map();
  for (const t of list) for (const name of t.places) counts.set(name, (counts.get(name) ?? 0) + 1);
  const group = (label, regions) => {
    const names = [...counts.keys()].filter((name) => REGIONS.has(name) === regions).sort();
    const node = el('optgroup', null, { label });
    for (const name of names) node.append(el('option', `${name} (${formatCount(counts.get(name))})`, { value: name }));
    return node;
  };
  destination.append(group('Regions', true), group('Countries', false));
}

function setSelect(select, value) {
  select.value = value;
  if (select.selectedIndex < 0) select.selectedIndex = 0;
}

const sourceInputs = () => [...$('sources').querySelectorAll('input')];
const selectedSource = () => sourceInputs().find((i) => i.checked)?.value ?? '';

function fillSources(names, counts) {
  const options = [['', 'All', tours.length], ...names.map((n) => [n, n, counts.get(n)])];
  $('sources').append(...options.map(([value, label, count], i) => {
    const input = el('input', null, { type: 'radio', name: 'source', value });
    if (i === 0) input.checked = true;
    const face = el('span', label);
    face.append(el('small', formatCount(count)));
    const wrap = el('label', null, { class: 'chip-opt' });
    wrap.append(input, face);
    return wrap;
  }));
}

function card(t) {
  const li = el('li', null, { class: 'card' });

  const media = el('div', null, { class: 'media' });
  media.append(el('span', 'Photo unavailable', { class: 'ph' }));
  if (isHttps(t.image)) {
    const img = el('img', null, { src: t.image, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => img.remove(), { once: true });
    media.append(img);
  }
  media.append(el('span', t.source, { class: 'badge' }));

  const body = el('div', null, { class: 'body' });
  if (t.destination) body.append(el('span', t.destination, { class: 'chip' }));

  const title = tidyTitle(t.title);
  const heading = el('h3', null, { class: 'title' });
  if (isHttps(t.url)) {
    const link = el('a', title, { href: t.url, target: '_blank', rel: 'noopener' });
    link.append(el('span', `, ${t.source}, opens in a new tab`, { class: 'sr' }));
    heading.append(link);
  } else {
    heading.textContent = title;
  }
  body.append(heading);

  const facts = el('dl', null, { class: 'facts' });
  const rows = [
    ['Departure', t.departure && formatDate(t.departure)],
    ['Duration', t.days && `${t.days} days`],
    ['Airline', t.airline && airlineName(t.airline)],
  ];
  for (const [name, value] of rows) {
    const group = el('div');
    group.append(el('dt', name), el('dd', value || 'Not listed', value ? {} : { class: 'na' }));
    facts.append(group);
  }
  body.append(facts);

  const foot = el('div', null, { class: 'foot' });
  const priceBox = el('div');
  if (t.price == null) {
    priceBox.append(el('span', 'Price not listed', { class: 'price na' }));
  } else {
    priceBox.append(el('span', 'From', { class: 'from' }), el('span', formatPrice(t.price), { class: 'price' }));
  }
  foot.append(priceBox);
  if (isHttps(t.url)) foot.append(el('span', 'View →', { class: 'go', 'aria-hidden': 'true' }));
  body.append(foot);

  li.append(media, body);
  return li;
}

function showSkeleton() {
  const items = Array.from({ length: SKELETON_COUNT }, () => {
    const li = el('li', null, { class: 'card skeleton', 'aria-hidden': 'true' });
    const body = el('div', null, { class: 'body' });
    body.append(el('div', null, { class: 'line short' }), el('div', null, { class: 'line tall' }), el('div', null, { class: 'line' }));
    li.append(el('div', null, { class: 'media' }), body);
    return li;
  });
  $('results').replaceChildren(...items);
  $('results').setAttribute('aria-busy', 'true');
}

// Missing values sort last so incomplete listings never crowd out priced ones.
const sorters = {
  departure: (a, b) => (a.departure ?? '9999').localeCompare(b.departure ?? '9999'),
  price: (a, b) => (a.price ?? 1e15) - (b.price ?? 1e15),
  days: (a, b) => (a.days ?? 1e3) - (b.days ?? 1e3),
};

function activeFilters() {
  const advanced = [destination.value, month.value, price.value, days.value].filter(Boolean).length;
  return { advanced, any: advanced + (q.value.trim() ? 1 : 0) + (selectedSource() ? 1 : 0) };
}

const URL_FIELDS = {
  q: () => q.value.trim(),
  source: selectedSource,
  dest: () => destination.value,
  month: () => month.value,
  price: () => price.value,
  days: () => days.value,
  sort: () => (sort.value === DEFAULT_SORT ? '' : sort.value),
};

function writeUrl() {
  const params = new URLSearchParams();
  for (const [key, read] of Object.entries(URL_FIELDS)) {
    const value = read();
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
}

function readUrl() {
  const params = new URLSearchParams(location.search);
  q.value = params.get('q') ?? '';
  setSelect(destination, params.get('dest') ?? '');
  setSelect(month, params.get('month') ?? '');
  setSelect(sort, params.get('sort') ?? DEFAULT_SORT);
  price.value = params.get('price') ?? '';
  days.value = params.get('days') ?? '';
  const wanted = params.get('source') ?? '';
  const inputs = sourceInputs();
  (inputs.find((i) => i.value === wanted) ?? inputs[0]).checked = true;
  if (activeFilters().advanced) setAdvancedOpen(true);
}

function clearFilters() {
  q.value = '';
  setSelect(destination, '');
  setSelect(month, '');
  price.value = '';
  days.value = '';
  sourceInputs()[0].checked = true;
  applyFilters();
  q.focus();
}

function setAdvancedOpen(open) {
  $('toggle').setAttribute('aria-expanded', String(open));
  $('advanced').classList.toggle('open', open);
}

function applyFilters() {
  if (!loaded) return;
  const needle = q.value.trim().toLowerCase();
  const wantedSource = selectedSource();
  const maxPrice = Math.round(Number(price.value) * 1e6);
  const maxDays = Number(days.value);
  matches = tours.filter((t) =>
    (!needle || t.haystack.includes(needle)) &&
    (!wantedSource || t.source === wantedSource) &&
    (!destination.value || t.places.has(destination.value)) &&
    (!month.value || (t.departure ?? '').startsWith(month.value)) &&
    (price.value === '' || (t.price != null && t.price <= maxPrice)) &&
    (days.value === '' || (t.days != null && t.days <= maxDays)));
  matches.sort(sorters[sort.value]);

  shown = 0;
  $('results').replaceChildren();
  showMore();

  const { advanced, any } = activeFilters();
  $('clear').hidden = !any;
  $('toggle-count').textContent = advanced ? ` (${advanced})` : '';
  $('empty').hidden = matches.length > 0;
  writeUrl();
}

function updateCount() {
  const filtered = activeFilters().any;
  const total = formatCount(matches.length);
  if (shown < matches.length) {
    $('count').textContent = `Showing ${formatCount(shown)} of ${total}${filtered ? ' matching' : ''} tours`;
  } else {
    $('count').textContent = filtered ? `${total} of ${formatCount(tours.length)} tours` : `${total} tours`;
  }
}

function showMore() {
  const next = matches.slice(shown, shown + PAGE_SIZE);
  const cards = next.map(card);
  $('results').append(...cards);
  shown += next.length;
  const left = matches.length - shown;
  $('more').hidden = left <= 0;
  $('more').textContent = `Show ${Math.min(PAGE_SIZE, left)} more (${formatCount(left)} left)`;
  updateCount();
  return cards[0];
}

function showFailedSources(sources) {
  const failed = sources.filter((s) => s.error);
  $('notices').replaceChildren(...failed.map((s) => {
    const note = el('p', null, { class: 'notice' });
    note.append(el('strong', s.name), ' could not be refreshed in the latest update, so its listings may be out of date or incomplete.');
    return note;
  }));
}

function showSources(sources) {
  const lede = $('lede');
  lede.textContent = 'Group tour packages from ';
  sources.forEach((s, i) => {
    if (i > 0) lede.append(i === sources.length - 1 ? ' and ' : ', ');
    lede.append(isHttps(s.url) ? el('a', s.name, { href: s.url, target: '_blank', rel: 'noopener' }) : s.name);
  });
  lede.append(', searchable in one place.');
}

function fail(message) {
  $('results').replaceChildren();
  $('results').setAttribute('aria-busy', 'false');
  $('count').textContent = '';
  $('error-text').textContent = message;
  $('error').hidden = false;
}

async function load() {
  $('error').hidden = true;
  $('empty').hidden = true;
  $('more').hidden = true;
  $('count').textContent = 'Loading tours…';
  showSkeleton();
  try {
    const res = await fetch('tours.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data?.tours)) throw new Error('unexpected data format');
    const when = data.updated ? new Date(data.updated) : null;
    if (when && Number.isNaN(when.getTime())) throw new Error('invalid update time');

    tours = data.tours.map((t) => {
      const haystack = `${t.title} ${t.destination ?? ''}`.toLowerCase();
      return { ...t, haystack, places: new Set(PLACE_PATTERNS.filter(([, re]) => re.test(haystack)).map(([name]) => name)) };
    });
    const sources = data.sources ?? [];
    if (sources.length) showSources(sources);
    showFailedSources(sources);
    if (when) {
      const stamp = el('time', when.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }), { datetime: when.toISOString() });
      $('updated').replaceChildren('Last updated ', stamp, '.');
    }

    const counts = new Map();
    for (const t of tours) counts.set(t.source, (counts.get(t.source) ?? 0) + 1);
    const distinct = (values) => [...new Set(values.filter(Boolean))].sort();
    $('sources').querySelectorAll('.chip-opt').forEach((n) => n.remove());
    destination.replaceChildren(el('option', 'All destinations', { value: '' }));
    month.replaceChildren(el('option', 'Any month', { value: '' }));
    fillSources(distinct(tours.map((t) => t.source)), counts);
    fillPlaces(tours);
    fillSelect(month, distinct(tours.map((t) => t.departure?.slice(0, 7))), formatMonth);
  } catch (err) {
    fail(`The list did not load (${err.message}). Check your connection and try again.`);
    return;
  }

  loaded = true;
  $('results').setAttribute('aria-busy', 'false');
  if (!tours.length) {
    $('empty-title').textContent = 'No tours in the latest update';
    $('empty-text').textContent = 'The list is empty right now. Check back after the next refresh.';
    $('empty-clear').hidden = true;
  }
  readUrl();
  applyFilters();
}

let debounce;
$('main').addEventListener('input', (e) => {
  if (e.target.type === 'search' || e.target.type === 'number') {
    clearTimeout(debounce);
    debounce = setTimeout(applyFilters, 200);
  } else {
    applyFilters();
  }
});
$('more').addEventListener('click', () => showMore()?.querySelector('a')?.focus());
$('clear').addEventListener('click', clearFilters);
$('empty-clear').addEventListener('click', clearFilters);
$('retry').addEventListener('click', load);
$('toggle').addEventListener('click', () => setAdvancedOpen($('toggle').getAttribute('aria-expanded') !== 'true'));
load();

const PAGE_SIZE = 60;
const $ = (id) => document.getElementById(id);
const [q, source, destination, month, price, days, sort] = ['q', 'source', 'destination', 'month', 'price', 'days', 'sort'].map($);

let tours = [];
let matches = [];
let shown = 0;

function el(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

const isHttps = (u) => typeof u === 'string' && u.startsWith('https://');
const formatDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const formatMonth = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const formatPrice = (n) => `Rp ${n.toLocaleString('id-ID')}`;

function fillSelect(select, values, label = (v) => v) {
  for (const v of values) select.append(el('option', label(v), { value: v }));
}

function card(t) {
  const li = el('li');
  if (isHttps(t.image)) li.append(el('img', null, { src: t.image, alt: '', loading: 'lazy' }));
  li.append(el('h3', t.title));
  li.append(el('div', t.price == null ? 'Price not listed' : `From ${formatPrice(t.price)}`, { class: 'price' }));
  const dl = el('dl');
  const rows = [
    ['Company', t.source],
    ['Destination', t.destination],
    ['Departure', t.departure && formatDate(t.departure)],
    ['Duration', t.days && `${t.days} days`],
    ['Airline', t.airline],
  ];
  for (const [name, value] of rows) {
    if (!value) continue;
    dl.append(el('dt', name), el('dd', value));
  }
  li.append(dl);
  if (isHttps(t.url)) {
    li.append(el('a', `View on ${t.source} ▶`, { class: 'go', href: t.url, target: '_blank', rel: 'noopener' }));
  }
  return li;
}

// Missing values sort last so incomplete listings never crowd out priced ones.
const sorters = {
  departure: (a, b) => (a.departure ?? '9999').localeCompare(b.departure ?? '9999'),
  price: (a, b) => (a.price ?? 1e15) - (b.price ?? 1e15),
};

function applyFilters() {
  if (!$('summary')) return; // load() failed and fail() replaced it
  const needle = q.value.trim().toLowerCase();
  const maxPrice = price.value === '' ? Infinity : Math.round(Number(price.value) * 1e6);
  const maxDays = days.value === '' ? Infinity : Number(days.value);
  matches = tours.filter((t) =>
    (!needle || `${t.title} ${t.destination ?? ''}`.toLowerCase().includes(needle)) &&
    (!source.value || t.source === source.value) &&
    (!destination.value || t.destination === destination.value) &&
    (!month.value || (t.departure ?? '').startsWith(month.value)) &&
    (price.value === '' || (t.price != null && t.price <= maxPrice)) &&
    (days.value === '' || (t.days != null && t.days <= maxDays)));
  matches.sort(sorters[sort.value]);
  shown = 0;
  $('results').replaceChildren();
  showMore();
  $('summary').textContent = matches.length
    ? `${matches.length} tour${matches.length === 1 ? '' : 's'} found.`
    : 'No tours match these filters. Clear the search text or widen the price, days or month.';
}

function showMore() {
  const next = matches.slice(shown, shown + PAGE_SIZE);
  $('results').append(...next.map(card));
  shown += next.length;
  $('more').hidden = shown >= matches.length;
}

function fail(message) {
  $('summary').replaceWith(el('p', message, { class: 'note error', role: 'alert' }));
}

async function load() {
  let data;
  try {
    const res = await fetch('tours.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    fail(`Could not load the tour list (${err.message}). Reload the page to try again.`);
    return;
  }
  tours = data.tours ?? [];
  const failed = (data.sources ?? []).filter((s) => s.error).map((s) => s.name);
  $('meta').textContent = `Updated ${new Date(data.updated).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.` +
    (failed.length ? ` Latest refresh failed for ${failed.join(', ')}; its listings may be incomplete.` : '');
  const distinct = (key) => [...new Set(tours.map((t) => t[key]).filter(Boolean))].sort();
  fillSelect(source, distinct('source'));
  fillSelect(destination, distinct('destination'));
  fillSelect(month, [...new Set(tours.map((t) => t.departure?.slice(0, 7)).filter(Boolean))].sort(), formatMonth);
  applyFilters();
}

$('filters').addEventListener('input', applyFilters);
$('filters').addEventListener('submit', (e) => e.preventDefault());
$('more').addEventListener('click', showMore);
load();

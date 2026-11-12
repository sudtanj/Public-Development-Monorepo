import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const HONEST_UA = 'TourAggregator/1.0 (+https://github.com/sudtanj/Public-Development-Monorepo)';
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const DELAY_MS = 300;
const TIMEOUT_MS = 30000;
const MAX_PAGES = 60;

let userAgent = HONEST_UA;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retries once with a browser UA if the honest one is blocked (Cloudflare-style 403/503).
async function request(url, init = {}) {
  await sleep(DELAY_MS);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': userAgent, ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if ((res.status === 403 || res.status === 503) && userAgent === HONEST_UA && attempt === 0) {
      userAgent = BROWSER_UA;
      continue;
    }
    if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url} -> HTTP ${res.status}`);
    return res;
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const codePoint = (entity, n) => (n <= 0x10ffff ? String.fromCodePoint(n) : entity);
export function decode(s) {
  return String(s ?? '')
    .replace(/&#(\d+);/g, (m, n) => codePoint(m, +n))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => codePoint(m, parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, agu: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12 };

// "16 Apr 2027" -> "2027-04-16"
export function parseAviaDate(text) {
  const m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(text.trim());
  const month = m && MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// ---- Avia (avia.travel): server-rendered HTML, one card per package, one row per departure ----

export function parseAviaRegions(html) {
  const select = /<select name="region"[\s\S]*?<\/select>/.exec(html)?.[0] ?? '';
  return [...select.matchAll(/<option value="(\d+)">([^<]+)<\/option>/g)]
    .filter((m) => m[1] !== '0')
    .map((m) => ({ id: m[1], name: decode(m[2]).replace(/\b[a-z]/g, (c) => c.toUpperCase()) }));
}

// Returns the departures on one result page plus the URL of the next page (null on the last).
export function parseAviaPage(html, destination) {
  const records = [];
  for (const card of html.split('bevyup_product_data=').slice(1)) {
    const title = decode(/<div class="t-desti">([\s\S]*?)<\/div>/.exec(card)?.[1]);
    if (!title) continue;
    const image = /<div class="img-desti" style="[^"]*url\('([^']+)'\)/.exec(card)?.[1] ?? null;
    const priceText = /<div class="p-desti">\s*IDR\s*([\d.,]+)/.exec(card)?.[1];
    const price = priceText ? Number(priceText.replace(/[.,]/g, '')) : null;
    const row = /<a href="(https:\/\/www\.avia\.travel\/tour\/detail\/[^"]+)">\s*<div class="inline-block"><div class="w-date">([^<]+)<\/div>[\s\S]*?<div class="inline-block">(\d+) days?<\/div>\s*<\/a>(?:\s*<\/div>\s*<\/div>\s*<div class="cell w55 text-center">\s*<div>([^<]*)<\/div>)?/;
    // One departure per `tbl` block, so a row's date can never pair with the next row's days.
    for (const block of card.split('<div class="tbl mb10">').slice(1)) {
      const m = row.exec(block);
      if (!m) continue;
      records.push({
        source: 'Avia Travel',
        title,
        url: m[1],
        destination,
        departure: parseAviaDate(m[2]),
        days: Number(m[3]),
        price,
        currency: 'IDR',
        airline: m[4]?.trim() || null,
        image,
      });
    }
  }
  const pagination = /<ul class='pagination'>([\s\S]*?)<\/ul>/.exec(html)?.[1] ?? '';
  const next = /<a href="([^"]+)"><i class="fa fa-chevron-right"/.exec(pagination)?.[1] ?? null;
  return { records, next };
}

const AVIA_UMBRELLA = /^(all |others$|consortium)/i;

// The site keeps the chosen region in a session cookie, so each region is a POST followed by its paginated GETs.
async function scrapeAvia(out) {
  const base = 'https://www.avia.travel';
  const regions = parseAviaRegions(await (await request(`${base}/tour`)).text());
  if (regions.length === 0) throw new Error('no regions found on /tour');
  // Specific regions first so a tour listed under several keeps its most specific destination (first wins).
  regions.sort((a, b) => AVIA_UMBRELLA.test(a.name) - AVIA_UMBRELLA.test(b.name));
  const failures = [];
  for (const region of regions) {
    try {
      const first = await request(`${base}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `region=${region.id}&destination=0&name_destination=`,
      });
      // The site repeats the same Set-Cookie several times; keep one name=value per cookie name.
      const cookies = new Map(first.headers.getSetCookie().map((c) => c.split(';')[0]).map((c) => [c.split('=')[0], c]));
      const cookie = [...cookies.values()].join('; ');
      let html = await first.text();
      const seen = new Set();
      for (let page = 1; ; page++) {
        const { records, next } = parseAviaPage(html, region.name);
        out.push(...records);
        // Resolve against the site and never send the session cookie elsewhere.
        const nextUrl = next && new URL(next, base);
        if (!nextUrl || nextUrl.origin !== base || seen.has(nextUrl.href)) break;
        if (page === MAX_PAGES) {
          console.error(`${region.name}: stopped after ${MAX_PAGES} pages`);
          break;
        }
        seen.add(nextUrl.href);
        html = await (await request(nextUrl.href, { headers: { Cookie: cookie } })).text();
      }
    } catch (err) {
      console.error(`Avia Travel ${region.name}: ${err.message}`);
      failures.push(`${region.name}: ${err.message}`);
    }
  }
  if (failures.length) throw new Error(`${failures.length} of ${regions.length} regions failed (${failures.join('; ')})`);
}

// ---- Obaja Tour (obajatour.com): Nuxt SPA over a JSON API, one entry per package (nearest departure) ----

const OBAJA_API = 'https://service.obajatour.com/v1/modules/tour/tours/regional';

export function parseObajaTours(json) {
  const records = [];
  for (const t of json.data ?? []) {
    const it = t.itinerary;
    const title = decode(t.title);
    if (!it || !title) continue;
    const span = (Date.parse(it.arrival_date) - Date.parse(it.departure_date)) / 86400000;
    records.push({
      source: 'Obaja Tour',
      title,
      url: `https://obajatour.com/group-tour/destination/${t.id}`,
      destination: t.regional?.name ?? null,
      departure: it.departure_date ?? null,
      days: Number.isFinite(span) ? span + 1 : null,
      price: it.price || t.lowest_itinerary?.price || null,
      currency: 'IDR',
      airline: null,
      image: t.imageUrl ?? null,
    });
  }
  return { records, lastPage: json.last_page ?? 1 };
}

async function scrapeObaja(out) {
  let lastPage = 1;
  for (let page = 1; page <= lastPage && page <= MAX_PAGES; page++) {
    const res = await request(`${OBAJA_API}?page=${page}&limit=100`);
    const parsed = parseObajaTours(await res.json());
    out.push(...parsed.records);
    lastPage = parsed.lastPage;
  }
  if (lastPage > MAX_PAGES) console.error(`Obaja Tour: stopped after ${MAX_PAGES} of ${lastPage} pages`);
}

// ---- Golden Rama (goldenrama.com): Next.js SSR, listing data is the __NEXT_DATA__ JSON; one entry per package ----

const GOLDEN_RAMA = 'https://www.goldenrama.com';

function goldenRamaProps(html) {
  const json = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  return json ? JSON.parse(json).props?.pageProps : undefined;
}

export function parseGoldenRamaAreas(html) {
  return [...new Set([...html.matchAll(/href="\/tours\/area\/([a-z0-9-]+)"/g)].map((m) => m[1]))];
}

// Departures come unsorted, so the nearest one is picked by date. Packages without departures are skipped like Obaja's.
export function parseGoldenRamaPage(html) {
  const props = goldenRamaProps(html);
  const { data = [], metadata } = props?.tourSearch ?? {};
  const destination = props?.tourDetailByArea?.data?.name ?? null;
  const records = [];
  for (const t of data) {
    const title = decode(t.name);
    const next = (t.departures ?? []).reduce((a, d) => (!a || d.date < a.date ? d : a), null);
    if (!title || !next) continue;
    records.push({
      source: 'Golden Rama',
      title,
      url: `${GOLDEN_RAMA}/tours/${t.slug}`,
      destination,
      departure: next.date,
      days: next.duration ?? t.duration ?? null,
      price: next.startingPrice || t.startingPrice || null,
      currency: 'IDR',
      airline: decode(t.airlineName) || null,
      image: t.pictures?.[0]?.url ?? null,
    });
  }
  return { records, lastPage: Math.ceil((metadata?.total ?? 0) / (metadata?.per_page || 12)) || 1 };
}

// The listing ignores `limit` (12 per page), so each area is walked page by page. One bad area doesn't stop the rest.
async function scrapeGoldenRama(out) {
  const areas = parseGoldenRamaAreas(await (await request(`${GOLDEN_RAMA}/tours`)).text());
  if (areas.length === 0) throw new Error('no areas found on /tours');
  const failures = [];
  for (const area of areas) {
    try {
      let lastPage = 1;
      for (let page = 1; page <= lastPage && page <= MAX_PAGES; page++) {
        const html = await (await request(`${GOLDEN_RAMA}/tours/area/${area}?page=${page}`)).text();
        const parsed = parseGoldenRamaPage(html);
        out.push(...parsed.records);
        lastPage = parsed.lastPage;
      }
      if (lastPage > MAX_PAGES) console.error(`Golden Rama ${area}: stopped after ${MAX_PAGES} of ${lastPage} pages`);
    } catch (err) {
      console.error(`Golden Rama ${area}: ${err.message}`);
      failures.push(`${area}: ${err.message}`);
    }
  }
  if (failures.length) throw new Error(`${failures.length} of ${areas.length} areas failed (${failures.join('; ')})`);
}

// ---- Dwidaya Tour (dwidayatour.co.id): AngularJS site over a JSON API; one entry per package (nearest departure) ----

const DWIDAYA = 'https://www.dwidayatour.co.id';

export function parseDwidayaPackages(json) {
  const records = [];
  for (const p of json.Response?.ResponseDetails?.Search?.Packages?.Package ?? []) {
    const title = decode(p.DisplayHolidayTypeName || p.Name);
    if (!title || !p.PackageShortCode || !p.PackageStartDate) continue;
    records.push({
      source: 'Dwidaya Tour',
      title,
      url: `${DWIDAYA}/Package/PackageResult?PKGShortCode=${encodeURIComponent(p.PackageShortCode)}&lang=id`,
      destination: decode(p.RegionName) || null,
      departure: p.PackageStartDate,
      days: Number(p.NoOfDays) || null,
      price: Number(p.GrossPrice) || null,
      currency: 'IDR',
      airline: null,
      image: p.Thumbnail || p.BigImage || null,
    });
  }
  return records;
}

// The search form's own request template (it carries the public B2C key) is fetched and posted back unchanged,
// which lists every package in one response of about 3 MB.
async function scrapeDwidaya(out) {
  const template = await (await request(`${DWIDAYA}/Home/Package/GetPackageSearchRQ`)).text();
  const res = await request(`${DWIDAYA}/Home/Package/GetPackageResult`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ searchRequest: template }),
  });
  const records = parseDwidayaPackages(await res.json());
  if (records.length === 0) throw new Error('no packages in the search result');
  out.push(...records);
}

// ---- Bayu Buana (bayubuanatravel.com): server-rendered HTML, one page per region lists every tour (no paging) ----

const BAYU_BUANA = 'https://www.bayubuanatravel.com';

export function parseBayuBuanaRegions(html) {
  const regions = new Map();
  for (const m of html.matchAll(/<a href="\/tours-by-destination\/([a-z0-9-]+)">([^<]+)<\/a>/g)) regions.set(m[1], decode(m[2]));
  return [...regions].map(([slug, name]) => ({ slug, name }));
}

// Each card lists all its departures in `data-dates`; the earliest one is used. Detail pages (airline) are not fetched.
export function parseBayuBuanaPage(html, destination) {
  const records = [];
  for (const card of html.split('<li class="pkg-tour-list').slice(1)) {
    const link = /<h3 class="p-card-title[^>]*>\s*<a href="(\/tours\/[^"]+)">([^<]*)<\/a>/.exec(card);
    const title = decode(link?.[2]);
    const departure = [...(/data-dates="([^"]*)"/.exec(card)?.[1] ?? '').matchAll(/\d{4}-\d{2}-\d{2}/g)].map((m) => m[0]).sort()[0];
    if (!title || !departure) continue;
    const priceText = /class="promo-rate">\s*IDR\s*([\d.,]+)/.exec(card)?.[1];
    records.push({
      source: 'Bayu Buana',
      title,
      url: `${BAYU_BUANA}${link[1]}`,
      destination,
      departure,
      days: Number(/(\d+)D\b/.exec(title)?.[1]) || null,
      price: priceText ? Number(priceText.replace(/[.,]/g, '')) || null : null,
      currency: 'IDR',
      airline: null,
      image: /<div class="tour-package-thumb">\s*<a [^>]*><img src="([^"]+)"/.exec(card)?.[1] ?? null,
    });
  }
  return records;
}

// Tours listed under several regions are kept once, under the first region (main dedupes by url).
async function scrapeBayuBuana(out) {
  const regions = parseBayuBuanaRegions(await (await request(BAYU_BUANA)).text());
  if (regions.length === 0) throw new Error('no regions found on the home page');
  const failures = [];
  for (const { slug, name } of regions) {
    try {
      out.push(...parseBayuBuanaPage(await (await request(`${BAYU_BUANA}/tours-by-destination/${slug}`)).text(), name));
    } catch (err) {
      console.error(`Bayu Buana ${name}: ${err.message}`);
      failures.push(`${name}: ${err.message}`);
    }
  }
  if (failures.length) throw new Error(`${failures.length} of ${regions.length} regions failed (${failures.join('; ')})`);
}

// ---- Wita Tour (witatour.com): server-rendered HTML; the global listing has every package, detail pages hold the dates ----

const WITA = 'https://www.witatour.com';

// The listing only shows a month range, so the exact departure and airline come from the detail page.
export function parseWitaList(html) {
  const destinations = new Map();
  for (const m of html.matchAll(/<p class="col-12 subheader">([^<]*)<\/p>\s*<p class="col-12 header">([^<]*)<\/p>/g)) destinations.set(decode(m[2]), decode(m[1]));
  const records = [];
  for (const card of html.split('grouptour-slide-hover').slice(1)) {
    const url = /grouptour-view-details btn" href="(https:\/\/www\.witatour\.com\/grouptours\/view\/[^"]+)"/.exec(card)?.[1];
    const title = decode(/<p class="header">([^<]*)<\/p>/.exec(card)?.[1]);
    if (!url || !title) continue;
    const priceText = /<p class="price">([\d.]+)/.exec(card)?.[1];
    records.push({
      title,
      url,
      destination: destinations.get(title) ?? null,
      days: Number(/fa-refresh"><\/span>\s*(\d+)/.exec(card)?.[1]) || null,
      price: priceText ? Number(priceText.replace(/\./g, '')) || null : null,
      image: /grouptour-slide-item" src="(https:[^"]+)"/.exec(card)?.[1] ?? null,
    });
  }
  return records;
}

// The earliest departure that is not before `today`; null when none is left.
export function parseWitaDetail(html, today) {
  const departures = [];
  for (const block of html.split('modal-schedule-items').slice(1)) {
    const departure = parseAviaDate(/content-header">\s*(\d{1,2} [A-Za-z]{3} \d{4}) - /.exec(block)?.[1] ?? '');
    if (!departure || departure < today) continue;
    const priceText = /content-header">\s*Rp\.([\d.]+),-/.exec(block)?.[1];
    departures.push({
      departure,
      price: priceText ? Number(priceText.replace(/\./g, '')) || null : null,
      airline: decode(/grouptour-modal-lower-blue">([^<]*)</.exec(block)?.[1]) || null,
    });
  }
  return departures.sort((a, b) => (a.departure < b.departure ? -1 : 1))[0] ?? null;
}

// One bad detail page doesn't stop the rest. Packages with no upcoming departure are skipped like Golden Rama's.
async function scrapeWita(out, today) {
  const tours = parseWitaList(await (await request(`${WITA}/grouptours/region?re=global`)).text());
  if (tours.length === 0) throw new Error('no tours found on the global listing');
  const failures = [];
  for (const { url, ...tour } of tours) {
    try {
      const next = parseWitaDetail(await (await request(url)).text(), today);
      if (!next) continue;
      out.push({
        source: 'Wita Tour',
        title: tour.title,
        url,
        destination: tour.destination,
        departure: next.departure,
        days: tour.days,
        price: next.price ?? tour.price,
        currency: 'IDR',
        airline: next.airline,
        image: tour.image,
      });
    } catch (err) {
      console.error(`Wita Tour ${tour.title}: ${err.message}`);
      failures.push(`${tour.title}: ${err.message}`);
    }
  }
  if (failures.length) throw new Error(`${failures.length} of ${tours.length} tours failed (${failures.join('; ')})`);
}

// Adding a company: write a scraper that pushes normalized records into `out`, then list it here.
const SOURCES = [
  { name: 'Avia Travel', url: 'https://www.avia.travel/tour', scrape: scrapeAvia },
  { name: 'Obaja Tour', url: 'https://www.obajatour.com/group-tour', scrape: scrapeObaja },
  { name: 'Golden Rama', url: 'https://www.goldenrama.com/tours', scrape: scrapeGoldenRama },
  { name: 'Dwidaya Tour', url: 'https://www.dwidayatour.co.id/', scrape: scrapeDwidaya },
  { name: 'Bayu Buana', url: 'https://www.bayubuanatravel.com/', scrape: scrapeBayuBuana },
  { name: 'Wita Tour', url: 'https://www.witatour.com/grouptours', scrape: scrapeWita },
];

// `today` (YYYY-MM-DD, UTC) is the cutoff for past departures; records without a departure date are kept.
async function main(outPath, today = new Date().toISOString().slice(0, 10)) {
  const tours = new Map();
  const sources = [];
  for (const { name, url, scrape } of SOURCES) {
    const found = [];
    const entry = { name, url };
    try {
      await scrape(found, today);
    } catch (err) {
      entry.error = err.message;
      console.error(`${name}: ${err.message}`);
    }
    let kept = 0;
    for (const t of found) {
      if ((t.departure && t.departure < today) || tours.has(t.url)) continue;
      tours.set(t.url, t);
      kept++;
    }
    entry.count = kept;
    sources.push(entry);
    console.error(`${name}: ${kept} records`);
  }
  if (tours.size === 0) throw new Error('no tours scraped');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify({ updated: new Date().toISOString(), sources, tours: [...tours.values()] }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) {
    console.error('usage: node scrape.mjs <output.json>');
    process.exit(2);
  }
  main(process.argv[2], process.env.TOURS_TODAY).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

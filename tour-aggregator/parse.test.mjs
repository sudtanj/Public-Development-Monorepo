import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decode, parseBayuBuanaPage, parseBayuBuanaRegions, parseDwidayaPackages, parseAviaDate, parseAviaPage, parseAviaRegions, parseGoldenRamaAreas, parseGoldenRamaPage, parseObajaTours, parseWitaDetail, parseWitaList } from './scrape.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('decode handles named and numeric entities', () => {
  assert.equal(decode(' A &amp; B&#8230; &#x41; '), 'A & B… A');
});

test('parseAviaDate converts "16 Apr 2027" and rejects junk', () => {
  assert.equal(parseAviaDate('16 Apr 2027'), '2027-04-16');
  assert.equal(parseAviaDate('07 Apr 2027'), '2027-04-07');
  assert.equal(parseAviaDate('soon'), null);
});

test('parseAviaRegions lists regions and skips the placeholder option', () => {
  assert.deepEqual(parseAviaRegions(fixture('avia-regions.html')), [
    { id: '1', name: 'Africa' },
    { id: '23', name: 'All Asia' },
    { id: '4', name: 'Australia & New Zealand' },
  ]);
});

test('parseAviaPage returns one record per departure with card-level title, price and image', () => {
  const { records, next } = parseAviaPage(fixture('avia-search.html'), 'Japan');
  assert.equal(records.length, 10);
  assert.deepEqual(records[0], {
    source: 'Avia Travel',
    title: 'SUPER DEAL JAPAN DELIGHT + OSHINO HAKKAI VILLAGE',
    url: 'https://www.avia.travel/tour/detail/80310/super_deal_japan_delight_oshino_hakkai_village',
    destination: 'Japan',
    departure: '2026-11-21',
    days: 7,
    price: 23990000,
    currency: 'IDR',
    airline: 'GA',
    image: 'https://www.avia.travel/images/tour/2/COVERTOKYO2.jpg',
  });
  const last = records[9];
  assert.equal(last.title, 'GDAY JAPAN SHIRAKAWAGO');
  assert.equal(last.departure, '2027-04-07');
  assert.equal(last.airline, 'CX');
  assert.equal(last.price, 26990000);
  assert.equal(next, 'https://www.avia.travel/search/9');
});

test('parseAviaPage reports no next page when pagination has no next arrow', () => {
  const html = fixture('avia-search.html').replace(/<ul class='pagination'>[\s\S]*$/, "<ul class='pagination'><li class=\"active\"><a>1</a></li></ul>");
  assert.equal(parseAviaPage(html, 'Japan').next, null);
});

test('parseObajaTours skips tours without a departure and derives days from the dates', () => {
  const { records, lastPage } = parseObajaTours(JSON.parse(fixture('obaja-tours.json')));
  assert.equal(lastPage, 3);
  assert.equal(records.length, 2);
  assert.deepEqual(records[0], {
    source: 'Obaja Tour',
    title: 'SPRING CHINA SHAOLIN + LUOYANG & XIAN ( PKX )',
    url: 'https://obajatour.com/group-tour/destination/2729',
    destination: 'China | Hong Kong | Macau | Taiwan',
    departure: '2027-04-12',
    days: 8,
    price: 25990000,
    currency: 'IDR',
    airline: null,
    image: 'https://mars.obajatour.com/assets/images/data/1794478355_prod_3.png',
  });
  assert.equal(records[1].destination, 'Japan');
  assert.equal(records[1].days, 8);
});

test('decode leaves unknown entities, decodes once and collapses whitespace', () => {
  assert.equal(decode('Tom &amp; Jerry &nbsp;&nbsp; &lt;b&gt; &quot;x&quot; &apos;y&apos;'), 'Tom & Jerry <b> "x" \'y\'');
  assert.equal(decode('R&D &foo; &AMP;'), 'R&D &foo; &');
  assert.equal(decode('&amp;lt;'), '&lt;');
  assert.equal(decode('a\n\t b'), 'a b');
  assert.equal(decode(''), '');
});

test('decode keeps out-of-range numeric entities as text and treats null as empty', () => {
  assert.equal(decode('a &#99999999; b &#x110000; c'), 'a &#99999999; b &#x110000; c');
  assert.equal(decode(undefined), '');
  assert.equal(decode(null), '');
});

test('parseAviaDate maps all twelve English months and the Indonesian spellings', () => {
  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].forEach((m, i) => {
    assert.equal(parseAviaDate(`9 ${m} 2027`), `2027-${String(i + 1).padStart(2, '0')}-09`);
  });
  assert.equal(parseAviaDate('05 Mei 2027'), '2027-05-05');
  assert.equal(parseAviaDate('1 Agu 2027'), '2027-08-01');
  assert.equal(parseAviaDate('1 Okt 2027'), '2027-10-01');
  assert.equal(parseAviaDate('1 Des 2027'), '2027-12-01');
  assert.equal(parseAviaDate('16 April 2027'), '2027-04-16');
  assert.equal(parseAviaDate(' 16 apr 2027 '), '2027-04-16');
});

test('parseAviaDate rejects text that is not "D Mon YYYY"', () => {
  for (const bad of ['', '16 Foo 2027', '16 Apr', 'Apr 16 2027', '2027-04-16', 'TBA']) {
    assert.equal(parseAviaDate(bad), null, bad);
  }
});

test('parseAviaRegions returns nothing for pages without a region select', () => {
  assert.deepEqual(parseAviaRegions(''), []);
  assert.deepEqual(parseAviaRegions('<html><body>Service unavailable</body></html>'), []);
});

test('parseAviaRegions ignores non-numeric ids and options outside the region select', () => {
  const html = `<select name="region"><option value="0">Region</option><option value="x">Bad</option>
<option value="7">south east asia</option></select><select name="other"><option value="9">Elsewhere</option></select>`;
  assert.deepEqual(parseAviaRegions(html), [{ id: '7', name: 'South East Asia' }]);
});

test('parseAviaPage returns every departure of both fixture cards with its own url, date, days and airline', () => {
  const { records } = parseAviaPage(fixture('avia-search.html'), 'Japan');
  const base = 'https://www.avia.travel/tour/detail/';
  assert.deepEqual(
    records.map((r) => [r.url.slice(base.length), r.departure, r.days, r.airline]),
    [
      ['80310/super_deal_japan_delight_oshino_hakkai_village', '2026-11-21', 7, 'GA'],
      ['81514/super_deal_japan_delight_oshino_hakkai_village', '2026-12-28', 8, 'GA'],
      ['81516/super_deal_japan_delight_oshino_hakkai_village', '2026-12-29', 8, 'GA'],
      ['79275/super_deal_japan_delight_oshino_hakkai_village', '2027-01-14', 7, 'JAL'],
      ['79277/super_deal_japan_delight_oshino_hakkai_village', '2027-01-17', 7, 'JAL'],
      ['80326/gday_japan_shirakawago', '2026-11-21', 7, 'GA'],
      ['79302/gday_japan_shirakawago', '2027-01-14', 7, 'JAL'],
      ['79304/gday_japan_shirakawago', '2027-01-17', 7, 'JAL'],
      ['79306/gday_japan_shirakawago', '2027-01-24', 7, 'JAL'],
      ['81228/gday_japan_shirakawago', '2027-04-07', 7, 'CX'],
    ],
  );
  assert.ok(records.slice(0, 5).every((r) => r.price === 23990000 && r.image === 'https://www.avia.travel/images/tour/2/COVERTOKYO2.jpg'));
  assert.ok(records.slice(5).every((r) => r.price === 26990000 && r.image === 'https://www.avia.travel/images/tour/2/cover.jpeg'));
});

test('parseAviaPage finds no next page when the pagination block is missing', () => {
  const html = fixture('avia-search.html').replace(/<ul class='pagination'>[\s\S]*$/, '');
  const { records, next } = parseAviaPage(html, 'Japan');
  assert.equal(records.length, 10);
  assert.equal(next, null);
});

const aviaRow = (id, date, days, airline) => `<div class="tbl mb10">
<div class="cell">
<div class="link-date">
<a href="https://www.avia.travel/tour/detail/${id}/slug">
<div class="inline-block"><div class="w-date">${date}</div> <div class="bdr-kalender"></div></div>
<div class="inline-block">${days}</div>
</a>
</div>
</div>${airline === undefined ? '' : `
<div class="cell w55 text-center">
<div>${airline}</div>
</div>`}
</div>`;
const aviaCard = ({ title, price, image, rows = '' }) => `<div bevyup_product_data='{"bup_id":"X"}'">
${image ? `<div class="img-desti" style="background: url('${image}') no-repeat center;"></div>` : ''}
${title ? `<div class="t-desti">${title}</div>` : ''}
${price ? `<div class="p-desti">${price}\t\t</div>` : ''}
${rows}
</div>`;

test('parseAviaPage reads dotted and comma prices, decodes the title and shares card fields across rows', () => {
  const html = aviaCard({ title: 'Bali &amp; Lombok', price: 'IDR 1.250.000', image: 'https://img.example/a.jpg', rows: aviaRow(1, '05 Mei 2027', '1 day', 'GA') + aviaRow(2, '06 Mei 2027', '2 days', 'QG') })
    + aviaCard({ title: 'Second', price: 'IDR 2,500,000', rows: aviaRow(3, '07 Mei 2027', '3 days', 'ID') });
  const { records } = parseAviaPage(html, 'Bali');
  assert.deepEqual(records.map((r) => [r.title, r.destination, r.url.slice(-6), r.departure, r.days, r.price, r.airline, r.image]), [
    ['Bali & Lombok', 'Bali', '1/slug', '2027-05-05', 1, 1250000, 'GA', 'https://img.example/a.jpg'],
    ['Bali & Lombok', 'Bali', '2/slug', '2027-05-06', 2, 1250000, 'QG', 'https://img.example/a.jpg'],
    ['Second', 'Bali', '3/slug', '2027-05-07', 3, 2500000, 'ID', null],
  ]);
});

test('parseAviaPage uses null for a missing price, image, flight cell, empty airline or unreadable date', () => {
  const html = aviaCard({ title: 'No extras', rows: aviaRow(1, 'TBA', '4 days') + aviaRow(2, '05 Mei 2027', '4 days', '') });
  const { records } = parseAviaPage(html, 'X');
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((r) => [r.price, r.image, r.airline, r.departure]), [
    [null, null, null, null],
    [null, null, null, '2027-05-05'],
  ]);
});

test('parseAviaPage never pairs one row\'s date with the next row\'s days', () => {
  const html = aviaCard({ title: 'T', rows: aviaRow(1, '05 Mei 2027', 'soon', 'GA') + aviaRow(2, '06 Mei 2027', '2 days', 'QG') });
  const { records } = parseAviaPage(html, 'X');
  assert.deepEqual(records.map((r) => [r.url.slice(-6), r.departure, r.days, r.airline]), [['2/slug', '2027-05-06', 2, 'QG']]);
});

test('parseAviaPage skips cards without a title and cards without departures', () => {
  const html = aviaCard({ price: 'IDR 1.000', rows: aviaRow(1, '05 Mei 2027', '4 days', 'GA') }) + aviaCard({ title: 'Empty card', price: 'IDR 1.000' }) + aviaCard({ title: ' &nbsp; ', rows: aviaRow(2, '05 Mei 2027', '4 days', 'GA') });
  assert.deepEqual(parseAviaPage(html, 'X'), { records: [], next: null });
});

test('parseAviaPage does not crash on empty, non-HTML or truncated input', () => {
  const empty = { records: [], next: null };
  assert.deepEqual(parseAviaPage('', 'X'), empty);
  assert.deepEqual(parseAviaPage('{"error":"maintenance"}', 'X'), empty);
  assert.deepEqual(parseAviaPage(`bevyup_product_data='{"bup_id":"X`, 'X'), empty);
  const page = fixture('avia-search.html');
  assert.deepEqual(parseAviaPage(page.slice(0, page.indexOf('<div class="w-date">') + 10), 'X'), empty);
});

const obajaTour = (over = {}) => ({
  id: 1,
  title: 'T',
  imageUrl: 'https://img.example/x.png',
  itinerary: { price: 100, departure_date: '2027-01-01', arrival_date: '2027-01-08' },
  lowest_itinerary: { price: 90 },
  regional: { name: 'Japan' },
  ...over,
});

test('parseObajaTours maps one package and counts the departure day as day one', () => {
  const { records } = parseObajaTours({ data: [obajaTour({ title: 'A &amp; B' })], last_page: 1 });
  assert.deepEqual(records, [{
    source: 'Obaja Tour',
    title: 'A & B',
    url: 'https://obajatour.com/group-tour/destination/1',
    destination: 'Japan',
    departure: '2027-01-01',
    days: 8,
    price: 100,
    currency: 'IDR',
    airline: null,
    image: 'https://img.example/x.png',
  }]);
});

test('parseObajaTours computes days for same-day, month-end and leap-year spans', () => {
  const days = (departure_date, arrival_date) => parseObajaTours({ data: [obajaTour({ itinerary: { price: 1, departure_date, arrival_date } })] }).records[0].days;
  assert.equal(days('2027-01-01', '2027-01-01'), 1);
  assert.equal(days('2027-02-27', '2027-03-02'), 4);
  assert.equal(days('2028-02-28', '2028-03-01'), 3);
});

test('parseObajaTours leaves days null when a date is missing or unreadable', () => {
  const rec = (itinerary) => parseObajaTours({ data: [obajaTour({ itinerary })] }).records[0];
  assert.equal(rec({ price: 1, departure_date: '2027-01-01' }).days, null);
  assert.equal(rec({ price: 1, departure_date: '2027-01-01', arrival_date: 'soon' }).days, null);
  assert.equal(rec({ price: 1, arrival_date: '2027-01-08' }).departure, null);
  assert.equal(rec({ price: 1, arrival_date: '2027-01-08' }).days, null);
});

test('parseObajaTours falls back to the lowest itinerary price, then null', () => {
  assert.equal(parseObajaTours({ data: [obajaTour({ itinerary: { price: 0, departure_date: '2027-01-01', arrival_date: '2027-01-02' } })] }).records[0].price, 90);
  const none = obajaTour({ itinerary: { departure_date: '2027-01-01', arrival_date: '2027-01-02' }, lowest_itinerary: null });
  assert.equal(parseObajaTours({ data: [none] }).records[0].price, null);
});

test('parseObajaTours uses null for a missing region or image and skips packages without an itinerary', () => {
  const { records } = parseObajaTours({
    data: [obajaTour({ id: 1, regional: undefined, imageUrl: undefined }), obajaTour({ id: 2, itinerary: null }), obajaTour({ id: 3, itinerary: undefined }), obajaTour({ id: 4 })],
  });
  assert.deepEqual(records.map((r) => r.url.split('/').pop()), ['1', '4']);
  assert.equal(records[0].destination, null);
  assert.equal(records[0].image, null);
});

test('parseObajaTours tolerates a response without data and defaults lastPage to 1', () => {
  assert.deepEqual(parseObajaTours({}), { records: [], lastPage: 1 });
  assert.deepEqual(parseObajaTours({ data: null, last_page: 5 }), { records: [], lastPage: 5 });
  assert.deepEqual(parseObajaTours({ success: false, message: 'rate limited' }), { records: [], lastPage: 1 });
});

test('parseObajaTours skips a package without a title instead of failing the source', () => {
  const { records } = parseObajaTours({ data: [obajaTour({ id: 1, title: undefined }), obajaTour({ id: 2, title: ' ' }), obajaTour({ id: 3 })] });
  assert.deepEqual(records.map((r) => r.url.split('/').pop()), ['3']);
});

test('all sources emit records with the same fields, which site/tours/app.js reads', () => {
  const avia = parseAviaPage(fixture('avia-search.html'), 'Japan').records[0];
  const obaja = parseObajaTours(JSON.parse(fixture('obaja-tours.json'))).records[0];
  const fields = ['airline', 'currency', 'days', 'departure', 'destination', 'image', 'price', 'source', 'title', 'url'];
  assert.deepEqual(Object.keys(avia).sort(), fields);
  assert.deepEqual(Object.keys(obaja).sort(), fields);
  assert.deepEqual(Object.keys(parseGoldenRamaPage(fixture('goldenrama-tours.html')).records[0]).sort(), fields);
  assert.deepEqual(Object.keys(parseDwidayaPackages(JSON.parse(fixture('dwidaya-packages.json')))[0]).sort(), fields);
  assert.deepEqual(Object.keys(parseBayuBuanaPage(fixture('bayubuana-region.html'), 'Europe')[0]).sort(), fields);
});

test('parseGoldenRamaAreas lists each area link once', () => {
  assert.deepEqual(parseGoldenRamaAreas(fixture('goldenrama-tours.html')), ['asia', 'eropa']);
  assert.deepEqual(parseGoldenRamaAreas('<html></html>'), []);
});

test('parseGoldenRamaPage maps the nearest departure, skips packages without departures and counts pages', () => {
  const { records, lastPage } = parseGoldenRamaPage(fixture('goldenrama-tours.html'));
  assert.equal(lastPage, 2);
  assert.deepEqual(records, [
    {
      source: 'Golden Rama',
      title: 'Favorite Switzerland Bernina Train + Jungfraujoch & Mineralbad Spa',
      url: 'https://www.goldenrama.com/tours/favorite-switzerland-bernina-panoramic-train-jungfraujoch-mineralbad-spa',
      destination: 'Asia',
      departure: '2027-03-02',
      days: 11,
      price: 63888000,
      currency: 'IDR',
      airline: 'EMIRATES AIRLINES',
      image: 'https://grts2.goldenrama.com/images/filedoc/pictureref/a1699cb847fe2ea90755f1314e5b3b38.jpg',
    },
    {
      source: 'Golden Rama',
      title: 'Favorite Switzerland Bernina Train + Jungfraujoch & Natural Thermal Spa',
      url: 'https://www.goldenrama.com/tours/favorite-switzerland-bernina-train-jungfraujoch-natural-thermal-spa',
      destination: 'Asia',
      departure: '2027-06-21',
      days: 10,
      price: 57888000,
      currency: 'IDR',
      airline: 'ETIHAD AIRWAYS',
      image: null,
    },
  ]);
});

test('parseGoldenRamaPage returns nothing for pages without the Next.js data block', () => {
  assert.deepEqual(parseGoldenRamaPage('<html><body>maintenance</body></html>'), { records: [], lastPage: 1 });
});

const grPage = (data, metadata, extra = {}) =>
  `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { tourSearch: { data, metadata }, ...extra } } })}</script>`;
const grTour = (over = {}) => ({ name: 'Tour', slug: 'tour', departures: [{ date: '2027-01-01', duration: 5, startingPrice: 1000 }], ...over });

test('parseGoldenRamaPage takes days and price from the earliest departure whatever the order', () => {
  const departures = [
    { date: '2027-09-01', duration: 9, startingPrice: 900 },
    { date: '2027-02-01', duration: 7, startingPrice: 700 },
    { date: '2027-05-01', duration: 8, startingPrice: 800 },
  ];
  const [r] = parseGoldenRamaPage(grPage([grTour({ departures })], { total: 1 })).records;
  assert.deepEqual([r.departure, r.days, r.price], ['2027-02-01', 7, 700]);
});

test('parseGoldenRamaPage falls back to package duration and price when the departure has none', () => {
  const departures = [{ date: '2027-02-01', startingPrice: 0 }];
  const [r] = parseGoldenRamaPage(grPage([grTour({ departures, duration: 6, startingPrice: 600 })], { total: 1 })).records;
  assert.deepEqual([r.days, r.price], [6, 600]);
  const [bare] = parseGoldenRamaPage(grPage([grTour({ departures })], { total: 1 })).records;
  assert.deepEqual([bare.days, bare.price, bare.airline, bare.destination], [null, null, null, null]);
});

test('parseGoldenRamaPage gives null image for missing or empty pictures', () => {
  const html = grPage([grTour({ slug: 'a' }), grTour({ slug: 'b', pictures: [] }), grTour({ slug: 'c', pictures: [{}] })], { total: 3 });
  assert.deepEqual(parseGoldenRamaPage(html).records.map((r) => r.image), [null, null, null]);
});

test('parseGoldenRamaPage skips packages with an empty or missing title or no departures and keeps the rest', () => {
  const html = grPage([grTour({ name: '' }), grTour({ name: '  ' }), grTour({ name: undefined }), grTour({ slug: 'nodep', departures: undefined }), grTour({ slug: 'ok' })], { total: 5 });
  assert.deepEqual(parseGoldenRamaPage(html).records.map((r) => r.url), ['https://www.goldenrama.com/tours/ok']);
});

test('parseGoldenRamaPage computes the page count from total and per_page', () => {
  const pages = (metadata) => parseGoldenRamaPage(grPage([], metadata)).lastPage;
  assert.equal(pages({ total: 24, per_page: 12 }), 2);
  assert.equal(pages({ total: 25, per_page: 12 }), 3);
  assert.equal(pages({ total: 12, per_page: 12 }), 1);
  assert.equal(pages({ total: 0, per_page: 12 }), 1);
  assert.equal(pages({ total: 30 }), 3);
  assert.equal(pages({ total: 30, per_page: 0 }), 3);
  assert.equal(pages(undefined), 1);
});

test('parseGoldenRamaPage tolerates a data block without tourSearch', () => {
  const html = '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{}}}</script>';
  assert.deepEqual(parseGoldenRamaPage(html), { records: [], lastPage: 1 });
  assert.deepEqual(parseGoldenRamaPage('<script id="__NEXT_DATA__" type="application/json">{}</script>'), { records: [], lastPage: 1 });
});

test('parseGoldenRamaPage throws on truncated JSON so the scraper can record the source error', () => {
  assert.throws(() => parseGoldenRamaPage('<script id="__NEXT_DATA__" type="application/json">{"props":</script>'), SyntaxError);
});

test('parseGoldenRamaPage reads the destination from the area and decodes the title', () => {
  const html = grPage([grTour({ name: 'A &amp; B' })], { total: 1 }, { tourDetailByArea: { data: { name: 'Eropa' } } });
  const [r] = parseGoldenRamaPage(html).records;
  assert.deepEqual([r.destination, r.title], ['Eropa', 'A & B']);
});

const dwPage = (...Package) => ({ Response: { ResponseDetails: { Search: { Packages: { Package } } } } });
const dwPackage = (over = {}) => ({ Name: 'Tour 1 Jan 2027', PackageShortCode: 'T1', PackageStartDate: '2027-01-01', NoOfDays: '5', GrossPrice: '1000', ...over });

test('parseDwidayaPackages maps each package, skips the one without a start date and strips the price decimals', () => {
  assert.deepEqual(parseDwidayaPackages(JSON.parse(fixture('dwidaya-packages.json'))), [
    {
      source: 'Dwidaya Tour',
      title: '5D4N Indie GO Vietnam Sapa + Halong Bay [EXCLUDE AIR TICKET]',
      url: 'https://www.dwidayatour.co.id/Package/PackageResult?PKGShortCode=XPASVSAPA&lang=id',
      destination: 'Vietnam',
      departure: '2026-11-30',
      days: 5,
      price: 5999000,
      currency: 'IDR',
      airline: null,
      image: 'https://drive.google.com/thumbnail?id=1XYLWCcckLBGZG4ShV9dlUMqf-rAcp7y-&sz=w1000',
    },
    {
      source: 'Dwidaya Tour',
      title: 'OPEN TRIP PAPANDAYAN 6 Mar 2027',
      url: 'https://www.dwidayatour.co.id/Package/PackageResult?PKGShortCode=FDTPAPAN&lang=id',
      destination: 'West Java',
      departure: '2027-03-06',
      days: 1,
      price: 360000,
      currency: 'IDR',
      airline: null,
      image: null,
    },
    {
      source: 'Dwidaya Tour',
      title: '9D Luxury Western Europe & Lourdes',
      url: 'https://www.dwidayatour.co.id/Package/PackageResult?PKGShortCode=VDEUWELOLUX9&lang=id',
      destination: 'Western Europe',
      departure: '2027-09-09',
      days: 9,
      price: 46543500,
      currency: 'IDR',
      airline: null,
      image: 'https://cdn.example.test/europe.jpg',
    },
  ]);
});

test('parseDwidayaPackages returns nothing for a response without packages', () => {
  assert.deepEqual(parseDwidayaPackages({}), []);
  assert.deepEqual(parseDwidayaPackages({ Response: { ResponseDetails: { Error: { Code: 1 }, Search: null } } }), []);
});

test('parseDwidayaPackages uses null for missing days, price, region and image', () => {
  const [r] = parseDwidayaPackages(dwPage(dwPackage({ NoOfDays: '', GrossPrice: '', RegionName: '', Thumbnail: '', BigImage: '' })));
  assert.deepEqual([r.days, r.price, r.destination, r.image], [null, null, null, null]);
});

test('parseDwidayaPackages skips packages without a title, code or start date and keeps the rest', () => {
  const records = parseDwidayaPackages(dwPage(dwPackage({ Name: ' ' }), dwPackage({ PackageShortCode: '' }), dwPackage({ PackageStartDate: null }), dwPackage({ PackageShortCode: 'OK' })));
  assert.deepEqual(records.map((r) => r.url.split('=')[1].split('&')[0]), ['OK']);
});

test('parseDwidayaPackages prefers the display title, which has no date suffix, and decodes it', () => {
  const [r] = parseDwidayaPackages(dwPage(dwPackage({ DisplayHolidayTypeName: 'A &amp; B' })));
  assert.equal(r.title, 'A & B');
});

test('parseDwidayaPackages escapes the package code in the url', () => {
  const [r] = parseDwidayaPackages(dwPage(dwPackage({ PackageShortCode: 'A B&C' })));
  assert.equal(r.url, 'https://www.dwidayatour.co.id/Package/PackageResult?PKGShortCode=A%20B%26C&lang=id');
});

test('parseBayuBuanaRegions lists each region once, in page order, and ignores the image tiles', () => {
  assert.deepEqual(parseBayuBuanaRegions(fixture('bayubuana-home.html')), [
    { slug: 'europe', name: 'Europe' },
    { slug: 'turkiye-middle-east', name: 'Turkiye & Middle East' },
  ]);
  assert.deepEqual(parseBayuBuanaRegions('<html></html>'), []);
});

test('parseBayuBuanaPage maps each card with its earliest departure, discounted price and days from the title', () => {
  assert.deepEqual(parseBayuBuanaPage(fixture('bayubuana-region.html'), 'Europe'), [
    {
      source: 'Bayu Buana',
      title: '11D/08N EXPERIA WEST EUROPE with PARIS RIVER CRUISE plus LUXEMBOURG (XWE1)',
      url: 'https://www.bayubuanatravel.com/tours/11d08n-experia-west-europe-with-paris-river-cruise-plus-luxembourg-xwe1',
      destination: 'Europe',
      departure: '2027-01-14',
      days: 11,
      price: 24888000,
      currency: 'IDR',
      airline: null,
      image: 'https://assets-tour.bayubuanatravel.com/image/fcf528b2-0d07-4290-9845-f6acdae3471c/EU-Eiffel%20Tower.jpg',
    },
    {
      source: 'Bayu Buana',
      title: '10D/07N EXPERIA TURKIYE with CAPPADOCIA (XMT1)',
      url: 'https://www.bayubuanatravel.com/tours/10d07n-experia-turkiye-with-cappadocia-xmt1',
      destination: 'Europe',
      departure: '2027-06-07',
      days: 10,
      price: 16888000,
      currency: 'IDR',
      airline: null,
      image: null,
    },
    {
      source: 'Bayu Buana',
      title: '12D/09N AMAZING EAST EUROPE with HALLSTATT & INNSBRUCK plus MARIENBRUCKE (EEA2)',
      url: 'https://www.bayubuanatravel.com/tours/12d09n-amazing-east-europe-with-hallstatt-innsbruck-plus-marienbrucke-eea2',
      destination: 'Europe',
      departure: '2026-12-05',
      days: 12,
      price: 28888000,
      currency: 'IDR',
      airline: null,
      image: 'https://assets-tour.bayubuanatravel.com/image/c1c9ce7e-16c1-46d9-ac4b-6e3cac767c67/EU-Hallstatt.jpg',
    },
  ]);
});

const bbCard = (over = {}) => {
  const { dates = '[&#34;2027-01-01T00:00:00Z&#34;]', title = '5D/04N Tour', price = '<h6 class="promo-rate">IDR 1,000,000</h6>' } = over;
  return `<li class="pkg-tour-list all-tours" data-dates="${dates}"> <div class="tour-package-thumb"> <a href="/tours/t"></a> </div> <h3 class="p-card-title title"> <a href="/tours/t">${title}</a> </h3> ${price} </li>`;
};

test('parseBayuBuanaPage uses null for a missing price and for a title without a day count', () => {
  const [r] = parseBayuBuanaPage(bbCard({ price: '', title: 'Honeymoon special' }), 'Asia');
  assert.deepEqual([r.price, r.days], [null, null]);
  assert.equal(parseBayuBuanaPage(bbCard({ price: '<h6 class="promo-rate">IDR 0</h6>' }), 'Asia')[0].price, null);
});

test('parseBayuBuanaPage skips cards without a readable date or title and keeps the rest', () => {
  const html = [bbCard({ dates: '[]' }), bbCard({ title: ' ' }), bbCard()].join('');
  assert.equal(parseBayuBuanaPage(html, 'Asia').length, 1);
  assert.equal(parseBayuBuanaPage(bbCard({ dates: '' }), 'Asia').length, 0);
});

test('parseBayuBuanaPage picks the earliest of unsorted dates', () => {
  const dates = '[&#34;2027-12-01T00:00:00Z&#34;,&#34;2027-02-03T00:00:00Z&#34;,&#34;2027-10-09T00:00:00Z&#34;]';
  assert.equal(parseBayuBuanaPage(bbCard({ dates }), 'Asia')[0].departure, '2027-02-03');
});

test('parseBayuBuanaPage returns nothing for pages without cards', () => {
  assert.deepEqual(parseBayuBuanaPage('<html><body>maintenance</body></html>', 'Asia'), []);
});

test('parseWitaList maps each card and takes the destination from the highlight with the same title', () => {
  assert.deepEqual(parseWitaList(fixture('wita-list.html')), [
    {
      title: '7D/6N LEISURE CLASSIC TAIWAN & ALISHAN',
      url: 'https://www.witatour.com/grouptours/view/7d-6n-leisure-classic-taiwan-and-alishan/',
      destination: 'Taiwan',
      days: 7,
      price: 16800000,
      image: 'https://www.witatour.com/assets/uploads/grouptour_products-images-1101-0.jpg',
    },
    {
      title: '14D/11N WITA EUROPE MEDITERRANEAN HERITAGE & SCENIC JOURNEY',
      url: 'https://www.witatour.com/grouptours/view/14d-11n-wita-europe-mediterranean-heritage-and-scenic-journey/',
      destination: 'Europe',
      days: 14,
      price: 58900000,
      image: 'https://www.witatour.com/assets/uploads/grouptour_products-images-1111-0.jpg',
    },
  ]);
});

test('parseWitaList uses null for a missing price, image, days and destination and skips cards without a link', () => {
  const html = '<div class="grouptour-slide-hover"><a class="grouptour-view-details btn" href="https://www.witatour.com/grouptours/view/x/">View Details</a></div><p class="header">X</p>'
    + '<div class="grouptour-slide-hover"><p class="header">No link</p></div>';
  assert.deepEqual(parseWitaList(html), [{ title: 'X', url: 'https://www.witatour.com/grouptours/view/x/', destination: null, days: null, price: null, image: null }]);
  assert.deepEqual(parseWitaList('<html><body>maintenance</body></html>'), []);
});

test('parseWitaDetail picks the earliest departure that is not before today, with its price and airline', () => {
  assert.deepEqual(parseWitaDetail(fixture('wita-detail.html'), '2026-01-01'), { departure: '2026-11-28', price: 15900000, airline: 'China Airlines' });
  assert.deepEqual(parseWitaDetail(fixture('wita-detail.html'), '2026-11-28'), { departure: '2026-11-28', price: 15900000, airline: 'China Airlines' });
  assert.deepEqual(parseWitaDetail(fixture('wita-detail.html'), '2026-11-29'), { departure: '2027-04-20', price: 17900000, airline: 'Singapore Airlines' });
});

test('parseWitaDetail returns null when no departure is left or the page has none', () => {
  assert.equal(parseWitaDetail(fixture('wita-detail.html'), '2027-04-21'), null);
  assert.equal(parseWitaDetail('<html><body>maintenance</body></html>', '2026-01-01'), null);
});

test('parseWitaDetail uses null for a missing price or airline', () => {
  const html = '<div class="modal-schedule-items"><p class="grouptour-modal-content-header">05 Jan 2027 - 09 Jan 2027</p></div>';
  assert.deepEqual(parseWitaDetail(html, '2026-01-01'), { departure: '2027-01-05', price: null, airline: null });
});

test('parseWitaDetail picks the earliest of unsorted dates, skips past ones and decodes the airline', () => {
  const block = (date, airline) => `<div class="modal-schedule-items"><p class="grouptour-modal-content-header">${date}</p><span class="grouptour-modal-lower-blue">${airline}</span></div>`;
  const html = block('09 Sep 2027 - 15 Sep 2027', 'Late Air') + block('03 Mar 2026 - 09 Mar 2026', 'Past Air') + block('7 Feb 2027 - 12 Feb 2027', 'Air &amp; Co');
  assert.deepEqual(parseWitaDetail(html, '2026-06-01'), { departure: '2027-02-07', price: null, airline: 'Air & Co' });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decode, parseAviaDate, parseAviaPage, parseAviaRegions, parseObajaTours } from './scrape.mjs';

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

test('both sources emit records with the same fields, which site/tours/app.js reads', () => {
  const avia = parseAviaPage(fixture('avia-search.html'), 'Japan').records[0];
  const obaja = parseObajaTours(JSON.parse(fixture('obaja-tours.json'))).records[0];
  const fields = ['airline', 'currency', 'days', 'departure', 'destination', 'image', 'price', 'source', 'title', 'url'];
  assert.deepEqual(Object.keys(avia).sort(), fields);
  assert.deepEqual(Object.keys(obaja).sort(), fields);
});

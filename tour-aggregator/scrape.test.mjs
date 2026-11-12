import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scrapePath = fileURLToPath(new URL('./scrape.mjs', import.meta.url));
const fakeFetch = new URL('./fixtures/fake-fetch.mjs', import.meta.url).href;
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

// Runs the real scrape.mjs in a child process with fetch replaced by fixtures/fake-fetch.mjs.
function scrape(env = {}, { args = ['out'] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tours-'));
  dirs.push(dir);
  const log = join(dir, 'requests.log');
  writeFileSync(log, '');
  const childEnv = { ...process.env, FAKE_LOG: log, TOURS_TODAY: '2026-01-01', ...env };
  delete childEnv.NODE_TEST_CONTEXT;
  const out = join(dir, 'nested', 'tours.json');
  const res = spawnSync(process.execPath, ['--import', fakeFetch, scrapePath, ...args.map((a) => (a === 'out' ? out : a))], { env: childEnv, encoding: 'utf8' });
  return {
    status: res.status,
    stderr: res.stderr,
    out,
    outDir: join(dir, 'nested'),
    requests: readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)),
    result: () => JSON.parse(readFileSync(out, 'utf8')),
  };
}

test('scrape writes tours.json from all sources, deduplicated by url', () => {
  const run = scrape();
  assert.equal(run.status, 0, run.stderr);
  const { updated, sources, tours } = run.result();
  assert.equal(new Date(updated).toISOString(), updated);
  assert.deepEqual(sources, [
    { name: 'Avia Travel', url: 'https://www.avia.travel/tour', count: 10 },
    { name: 'Obaja Tour', url: 'https://www.obajatour.com/group-tour', count: 2 },
    { name: 'Golden Rama', url: 'https://www.goldenrama.com/tours', count: 2 },
    { name: 'Dwidaya Tour', url: 'https://www.dwidayatour.co.id/', count: 3 },
    { name: 'Bayu Buana', url: 'https://www.bayubuanatravel.com/', count: 3 },
  ]);
  assert.equal(tours.length, 20);
  assert.equal(new Set(tours.map((t) => t.url)).size, 20);
  const avia = tours.filter((t) => t.source === 'Avia Travel');
  assert.equal(avia.length, 10);
  assert.ok(avia.every((t) => t.destination === 'Africa'));
  assert.equal(tours.filter((t) => t.source === 'Obaja Tour').length, 2);
  const golden = tours.filter((t) => t.source === 'Golden Rama');
  assert.equal(golden.length, 2);
  assert.ok(golden.every((t) => t.destination === 'Asia'));
  assert.equal(tours.filter((t) => t.source === 'Dwidaya Tour').length, 3);
  const bayu = tours.filter((t) => t.source === 'Bayu Buana');
  assert.equal(bayu.length, 3);
  assert.ok(bayu.every((t) => t.destination === 'Europe'));
  assert.ok(tours.every((t) => t.currency === 'IDR' && t.url.startsWith('https://')));
});

test('scrape posts each region, reuses the session cookie on later pages and walks every Obaja page', () => {
  const { requests } = scrape();
  assert.equal(requests.length, 20);
  assert.deepEqual(requests.map((r) => `${r.method} ${r.url}`), [
    'GET https://www.avia.travel/tour',
    'POST https://www.avia.travel/search',
    'GET https://www.avia.travel/search/9',
    'POST https://www.avia.travel/search',
    'GET https://www.avia.travel/search/9',
    'POST https://www.avia.travel/search',
    'GET https://www.avia.travel/search/9',
    'GET https://service.obajatour.com/v1/modules/tour/tours/regional?page=1&limit=100',
    'GET https://service.obajatour.com/v1/modules/tour/tours/regional?page=2&limit=100',
    'GET https://service.obajatour.com/v1/modules/tour/tours/regional?page=3&limit=100',
    'GET https://www.goldenrama.com/tours',
    'GET https://www.goldenrama.com/tours/area/asia?page=1',
    'GET https://www.goldenrama.com/tours/area/asia?page=2',
    'GET https://www.goldenrama.com/tours/area/eropa?page=1',
    'GET https://www.goldenrama.com/tours/area/eropa?page=2',
    'GET https://www.dwidayatour.co.id/Home/Package/GetPackageSearchRQ',
    'POST https://www.dwidayatour.co.id/Home/Package/GetPackageResult',
    'GET https://www.bayubuanatravel.com',
    'GET https://www.bayubuanatravel.com/tours-by-destination/europe',
    'GET https://www.bayubuanatravel.com/tours-by-destination/turkiye-middle-east',
  ]);
  assert.deepEqual([1, 3, 5].map((i) => requests[i].body), [
    'region=1&destination=0&name_destination=',
    'region=4&destination=0&name_destination=',
    'region=23&destination=0&name_destination=',
  ]);
  assert.deepEqual([1, 3, 5].map((i) => requests[i].cookie), [null, null, null]);
  assert.deepEqual([2, 4, 6].map((i) => requests[i].cookie), ['PHPSESSID=abc123', 'PHPSESSID=abc123', 'PHPSESSID=abc123']);
  assert.ok(requests.every((r) => r.ua.startsWith('TourAggregator/1.0')));
});

test('scrape drops departures before today and keeps the rest', () => {
  const run = scrape({ TOURS_TODAY: '2027-04-05' });
  assert.equal(run.status, 0, run.stderr);
  const { sources, tours } = run.result();
  assert.deepEqual(sources.map((s) => s.count), [1, 1, 1, 1, 1]);
  assert.deepEqual(tours.map((t) => t.departure).sort(), ['2027-04-07', '2027-04-12', '2027-06-07', '2027-06-21', '2027-09-09']);
});

test('scrape continues with the other regions when one region fails and records the error', () => {
  const run = scrape({ FAKE_AVIA: 'region-1-down' });
  assert.equal(run.status, 0, run.stderr);
  const { sources, tours } = run.result();
  assert.match(sources[0].error, /Africa: .*HTTP 500/);
  assert.equal(sources[0].count, 10);
  assert.equal(sources[1].error, undefined);
  assert.equal(tours.filter((t) => t.destination === 'Australia & New Zealand').length, 10);
  assert.equal(run.requests.length, 19);
});

test('scrape does not follow pagination to another host, so the session cookie stays on Avia', () => {
  const { requests } = scrape({ FAKE_AVIA: 'offsite-next' });
  assert.equal(requests.length, 17);
  assert.ok(requests.every((r) => !r.url.includes('evil.example')));
});

test('scrape retries with a browser user agent when the honest one is blocked', () => {
  const run = scrape({ FAKE_BLOCK_HONEST_UA: '1' });
  assert.equal(run.status, 0, run.stderr);
  const { requests } = run;
  assert.equal(requests.length, 21);
  assert.ok(requests[0].ua.startsWith('TourAggregator/1.0'));
  assert.equal(requests[1].url, requests[0].url);
  assert.ok(requests.slice(1).every((r) => r.ua.startsWith('Mozilla/5.0')));
  assert.equal(run.result().tours.length, 20);
});

test('scrape keeps the other source when Avia answers HTTP 500', () => {
  const run = scrape({ FAKE_AVIA: 'down' });
  assert.equal(run.status, 0, run.stderr);
  const { sources, tours } = run.result();
  assert.equal(sources[0].name, 'Avia Travel');
  assert.match(sources[0].error, /HTTP 500/);
  assert.equal(sources[0].count, 0);
  assert.equal(sources[1].error, undefined);
  assert.equal(tours.length, 10);
  assert.deepEqual([...new Set(tours.map((t) => t.source))], ['Obaja Tour', 'Golden Rama', 'Dwidaya Tour', 'Bayu Buana']);
});

test('scrape keeps the other source when Obaja is unreachable', () => {
  const run = scrape({ FAKE_OBAJA: 'offline' });
  assert.equal(run.status, 0, run.stderr);
  const { sources, tours } = run.result();
  assert.equal(sources[0].error, undefined);
  assert.equal(sources[1].error, 'fetch failed');
  assert.equal(sources[1].count, 0);
  assert.equal(tours.length, 18);
});

test('scrape survives non-JSON from Obaja and records the error', () => {
  const run = scrape({ FAKE_OBAJA: 'malformed' });
  assert.equal(run.status, 0, run.stderr);
  const { sources, tours } = run.result();
  assert.ok(sources[1].error);
  assert.equal(tours.length, 18);
});

test('scrape survives unparseable Avia result pages without an error entry', () => {
  const run = scrape({ FAKE_AVIA: 'garbage-results' });
  assert.equal(run.status, 0, run.stderr);
  const { sources, tours } = run.result();
  assert.equal(sources[0].count, 0);
  assert.equal('error' in sources[0], false);
  assert.equal(tours.length, 10);
});

test('scrape exits 1 and writes nothing when every source is down', () => {
  const run = scrape({ FAKE_AVIA: 'down', FAKE_OBAJA: 'down', FAKE_GOLDENRAMA: 'down', FAKE_DWIDAYA: 'down', FAKE_BAYUBUANA: 'down' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /no tours scraped/);
  assert.equal(existsSync(run.out), false);
  assert.equal(existsSync(run.outDir), false);
});

test('scrape exits 1 without crashing when every source returns a malformed body', () => {
  const run = scrape({ FAKE_AVIA: 'malformed', FAKE_OBAJA: 'malformed', FAKE_GOLDENRAMA: 'malformed', FAKE_DWIDAYA: 'malformed', FAKE_BAYUBUANA: 'malformed' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /no regions found on \/tour/);
  assert.match(run.stderr, /no tours scraped/);
  assert.doesNotMatch(run.stderr, /\n\s+at /);
  assert.equal(existsSync(run.out), false);
});

test('scrape without an output path prints usage and exits 2', () => {
  const run = scrape({}, { args: [] });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /usage: node scrape\.mjs <output\.json>/);
  assert.equal(run.requests.length, 0);
});

test('scrape keeps the other sources when Golden Rama answers HTTP 500', () => {
  const run = scrape({ FAKE_GOLDENRAMA: 'down' });
  assert.equal(run.status, 0, run.stderr);
  const { sources, tours } = run.result();
  assert.match(sources[2].error, /HTTP 500/);
  assert.equal(sources[2].count, 0);
  assert.equal(tours.length, 18);
});

test('scrape records an error when the Golden Rama /tours page lists no areas', () => {
  const run = scrape({ FAKE_GOLDENRAMA: 'tours-broken' });
  assert.equal(run.status, 0, run.stderr);
  const { sources, tours } = run.result();
  assert.match(sources[2].error, /no areas found on \/tours/);
  assert.equal(sources[2].count, 0);
  assert.equal(tours.length, 18);
  assert.equal(run.requests.length, 16);
});

test('scrape treats Golden Rama area pages without packages as empty, not as an error', () => {
  const run = scrape({ FAKE_GOLDENRAMA: 'empty-pages' });
  assert.equal(run.status, 0, run.stderr);
  const { sources, tours } = run.result();
  assert.equal('error' in sources[2], false);
  assert.equal(sources[2].count, 0);
  assert.equal(tours.length, 18);
  assert.equal(run.requests.length, 18);
});

test('scrape records the error when one Golden Rama area page has broken data and keeps the other sources', () => {
  const run = scrape({ FAKE_GOLDENRAMA: 'area-asia-broken' });
  assert.equal(run.status, 0, run.stderr);
  const { sources } = run.result();
  assert.ok(sources[2].error);
  assert.deepEqual(sources.slice(0, 2).map((s) => s.count), [10, 2]);
});

test('scrape continues with the other Golden Rama areas when one fails', () => {
  const run = scrape({ FAKE_GOLDENRAMA: 'area-asia-broken' });
  const { sources } = run.result();
  assert.match(sources[2].error, /asia/);
  assert.equal(sources[2].count, 2);
  assert.equal(run.requests.length, 19);
});

test('scrape keeps the other sources when Dwidaya answers HTTP 500', () => {
  const run = scrape({ FAKE_DWIDAYA: 'down' });
  assert.equal(run.status, 0, run.stderr);
  const { sources, tours } = run.result();
  assert.match(sources[3].error, /GetPackageSearchRQ -> HTTP 500/);
  assert.equal(sources[3].count, 0);
  assert.equal(tours.length, 17);
});

test('scrape records an error when the Dwidaya search lists no packages', () => {
  const run = scrape({ FAKE_DWIDAYA: 'no-packages' });
  assert.equal(run.status, 0, run.stderr);
  const { sources, tours } = run.result();
  assert.match(sources[3].error, /no packages in the search result/);
  assert.equal(sources[3].count, 0);
  assert.equal(tours.length, 17);
});

test('scrape posts the Dwidaya request template back unchanged as a JSON string', () => {
  const { requests } = scrape();
  const post = requests.find((r) => r.method === 'POST' && r.url.includes('dwidayatour'));
  assert.deepEqual(JSON.parse(post.body), { searchRequest: '{"Request":{"Authentication":{"AuthenticationKey":"test-key"}}}' });
});

test('scrape keeps the other sources when Bayu Buana answers HTTP 500', () => {
  const run = scrape({ FAKE_BAYUBUANA: 'down' });
  assert.equal(run.status, 0, run.stderr);
  const { sources, tours } = run.result();
  assert.match(sources[4].error, /HTTP 500/);
  assert.equal(sources[4].count, 0);
  assert.equal(tours.length, 17);
  assert.equal(run.requests.length, 18);
});

test('scrape records an error when the Bayu Buana home page links no regions', () => {
  const run = scrape({ FAKE_BAYUBUANA: 'home-broken' });
  assert.equal(run.status, 0, run.stderr);
  const { sources, tours } = run.result();
  assert.match(sources[4].error, /no regions found on the home page/);
  assert.equal(sources[4].count, 0);
  assert.equal(tours.length, 17);
  assert.equal(run.requests.length, 18);
});

test('scrape continues with the other Bayu Buana regions when one fails', () => {
  const run = scrape({ FAKE_BAYUBUANA: 'region-europe-down' });
  assert.equal(run.status, 0, run.stderr);
  const { sources, tours } = run.result();
  assert.match(sources[4].error, /1 of 2 regions failed \(Europe: .*HTTP 500/);
  assert.equal(sources[4].count, 3);
  assert.deepEqual([...new Set(tours.filter((t) => t.source === 'Bayu Buana').map((t) => t.destination))], ['Turkiye & Middle East']);
  assert.equal(run.requests.length, 20);
});

// Preloaded with `node --import` so the real scrape.mjs runs against canned responses.
// FAKE_AVIA / FAKE_OBAJA / FAKE_GOLDENRAMA / FAKE_DWIDAYA / FAKE_BAYUBUANA: ok (default) | down (HTTP 500) | offline (network error) | malformed (not the expected format)
// FAKE_GOLDENRAMA also takes tours-broken (/tours lists no areas), area-asia-broken (truncated __NEXT_DATA__ on
// /tours/area/asia) and empty-pages (area pages list no packages).
// FAKE_DWIDAYA=no-packages answers the search with an empty package list.
// FAKE_BAYUBUANA also takes home-broken (the home page links no regions) and region-europe-down (HTTP 500 for the Europe page).
// FAKE_AVIA=garbage-results serves the region list but unparseable search pages; region-1-down answers HTTP 500 to
// the search for region 1 only; offsite-next points the pagination arrow at another host.
// FAKE_BLOCK_HONEST_UA=1 answers 403 to the project's own user agent. Every request is appended to FAKE_LOG as JSON.
import { appendFileSync, readFileSync } from 'node:fs';

const fixture = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...args) => realSetTimeout(fn, 0, ...args);

function avia(mode, method, pathname, body) {
  if (pathname === '/tour') return new Response(fixture('avia-regions.html'));
  let results = mode === 'garbage-results' ? '<html><body>maintenance</body></html>' : fixture('avia-search.html');
  if (mode === 'offsite-next') results = results.replace(/<a href="[^"]*">(<i class="fa fa-chevron-right")/, '<a href="https://evil.example/search/9">$1');
  if (method === 'POST' && pathname === '/search') {
    if (mode === 'region-1-down' && body.startsWith('region=1&')) return new Response('boom', { status: 500 });
    // The real site repeats the same Set-Cookie header several times.
    const headers = new Headers();
    for (let i = 0; i < 3; i++) headers.append('Set-Cookie', 'PHPSESSID=abc123; path=/; HttpOnly');
    return new Response(results, { headers });
  }
  if (pathname.startsWith('/search/')) return new Response(results.replace(/<ul class='pagination'>[\s\S]*$/, ''));
  return new Response('not found', { status: 404 });
}

function obaja(page) {
  const body = page === '1' ? fixture('obaja-tours.json') : '{"data":[],"last_page":3}';
  return new Response(body, { headers: { 'Content-Type': 'application/json' } });
}

const nextData = (json) => `<html><script id="__NEXT_DATA__" type="application/json">${json}</script></html>`;

function goldenRama(mode, pathname) {
  const areaPage = pathname.startsWith('/tours/area/');
  if (mode === 'tours-broken' && !areaPage) return new Response('<html><body>coming soon</body></html>');
  if (mode === 'area-asia-broken' && pathname === '/tours/area/asia') return new Response(nextData('{"props":'));
  if (mode === 'empty-pages' && areaPage) return new Response(nextData('{"props":{"pageProps":{"tourSearch":{"data":[],"metadata":{"page":1,"per_page":12,"total":0}}}}}'));
  return new Response(fixture('goldenrama-tours.html'));
}

function dwidaya(mode, pathname) {
  const json = { headers: { 'Content-Type': 'application/json' } };
  if (pathname === '/Home/Package/GetPackageSearchRQ') return new Response('{"Request":{"Authentication":{"AuthenticationKey":"test-key"}}}', json);
  if (pathname !== '/Home/Package/GetPackageResult') return new Response('not found', { status: 404 });
  return new Response(mode === 'no-packages' ? '{"Response":{"ResponseDetails":{"Error":null,"Search":{"Packages":{"Total":0,"Package":[]}}}}}' : fixture('dwidaya-packages.json'), json);
}

function bayuBuana(mode, pathname) {
  if (mode === 'home-broken' && pathname === '/') return new Response('<html><body>coming soon</body></html>');
  if (mode === 'region-europe-down' && pathname === '/tours-by-destination/europe') return new Response('boom', { status: 500 });
  return new Response(fixture(pathname === '/' ? 'bayubuana-home.html' : 'bayubuana-region.html'));
}

globalThis.fetch = async (url, init = {}) => {
  const { hostname, pathname, searchParams } = new URL(url);
  const headers = init.headers ?? {};
  const method = init.method ?? 'GET';
  appendFileSync(process.env.FAKE_LOG, `${JSON.stringify({ url: String(url), method, ua: headers['User-Agent'], cookie: headers.Cookie ?? null, body: init.body ?? null })}\n`);
  if (process.env.FAKE_BLOCK_HONEST_UA && headers['User-Agent'].startsWith('TourAggregator')) {
    return new Response('blocked', { status: 403 });
  }
  const isAvia = hostname === 'www.avia.travel';
  const isGoldenRama = hostname === 'www.goldenrama.com';
  const isDwidaya = hostname === 'www.dwidayatour.co.id';
  const isBayuBuana = hostname === 'www.bayubuanatravel.com';
  const mode = (isAvia ? process.env.FAKE_AVIA : isGoldenRama ? process.env.FAKE_GOLDENRAMA : isDwidaya ? process.env.FAKE_DWIDAYA : isBayuBuana ? process.env.FAKE_BAYUBUANA : process.env.FAKE_OBAJA) ?? 'ok';
  if (mode === 'down') return new Response('boom', { status: 500 });
  if (mode === 'offline') throw new TypeError('fetch failed');
  if (mode === 'malformed') return new Response('<html><body>{"data": [');
  if (isGoldenRama) return goldenRama(mode, pathname);
  if (isDwidaya) return dwidaya(mode, pathname);
  if (isBayuBuana) return bayuBuana(mode, pathname);
  return isAvia ? avia(mode, method, pathname, init.body ?? '') : obaja(searchParams.get('page'));
};

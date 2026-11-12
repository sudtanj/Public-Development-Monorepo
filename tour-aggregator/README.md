# Tour aggregator

Collects group tour packages from Indonesian tour companies into one JSON file that the
[search page](../site/tours/index.html) filters in the browser. No dependencies; needs Node 20+.

```
node tour-aggregator/scrape.mjs out/tours.json   # fetch every source
node --test tour-aggregator/                     # parser tests (offline, use fixtures/)
```

The Pages workflow runs both daily and writes `_site/tours/tours.json`. A source that fails is recorded
with its error in `sources` and the others still publish; the run exits non-zero only if no tours at all were found.

## Sources

| Source | How it is read |
| --- | --- |
| Avia Travel | HTML. Region ids come from the search form on `/tour`; each region is a POST to `/search` plus the `Set-Cookie` session, then `/search/<offset>` pages are followed via the pagination "next" link. One record per departure; title, "from" price and image are shared by the departures of a card. |
| Obaja Tour | The JSON API behind the site, `service.obajatour.com/v1/modules/tour/tours/regional`. One record per package, using its nearest departure. Packages with no scheduled departure are skipped. |
| Golden Rama | The `__NEXT_DATA__` JSON embedded in the server-rendered pages. Area slugs come from the links on `/tours`; each `/tours/area/<slug>?page=N` is walked (12 packages per page, `limit` is ignored). One record per package, using its earliest departure and that departure's price; the area name is the destination. Detail pages are disallowed by `robots.txt` and are never fetched. |
| Dwidaya Tour | The JSON API behind the site. `GET /Home/Package/GetPackageSearchRQ` returns the search form's empty request template, which is posted back unchanged to `/Home/Package/GetPackageResult`; that one response lists every package (about 3 MB, no paging). One record per package, using its start date (`PackageStartDate`); packages without one are skipped. There is no airline field. The link points at the site's package search for that package code, because detail pages need a session-built query. |
| Bayu Buana | Server-rendered HTML. Region slugs come from the `/tours-by-destination/<slug>` links on the home page; each region page lists all its tours without paging (about 660 cards, 514 distinct tours, because tours repeat across regions). One record per tour, using the earliest date in the card's `data-dates`, the discounted "Start from" price, and the day count from the title. A tour listed under several regions keeps the first region as its destination. No airline: it is only on detail pages, which are not fetched. The site has no `robots.txt` (404). |
| Wita Tour | Server-rendered HTML. `/grouptours/region?re=global` lists every package (29 cards, no paging) but only a month range, so each package's detail page (`/grouptours/view/<slug>/`) is fetched too: its departure schedule gives the exact date, price and airline. One record per package, using the earliest departure that is not before today and that departure's price; the destination is the country or region from the listing's highlight row. Packages with no upcoming departure are skipped. About 30 requests per run. The site has no `robots.txt` (404). |

## Adding a company

1. Write `parseX(input)` returning records `{source, title, url, destination, departure, days, price, currency, airline, image}`
   (`departure` is `YYYY-MM-DD` or null, `price` is a number or null, unknown values are null). Keep it free of I/O.
2. Write `scrapeX(out)` that fetches with `request()` and pushes records into `out`.
3. Add it to `SOURCES` in `scrape.mjs`, save a trimmed real response in `fixtures/` and test the parser in `parse.test.mjs`.

Be polite: requests are sequential with a 300 ms pause, and the user agent identifies this project.

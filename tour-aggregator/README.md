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

## Adding a company

1. Write `parseX(input)` returning records `{source, title, url, destination, departure, days, price, currency, airline, image}`
   (`departure` is `YYYY-MM-DD` or null, `price` is a number or null, unknown values are null). Keep it free of I/O.
2. Write `scrapeX(out)` that fetches with `request()` and pushes records into `out`.
3. Add it to `SOURCES` in `scrape.mjs`, save a trimmed real response in `fixtures/` and test the parser in `parse.test.mjs`.

Be polite: requests are sequential with a 300 ms pause, and the user agent identifies this project.

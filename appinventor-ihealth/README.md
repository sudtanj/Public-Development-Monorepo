# iHealth airflow graph (App Inventor)

An [MIT App Inventor](https://ai2.appinventor.mit.edu) practice app from 2017, moved here from
[`sudtanj/ai2-iHealth`](https://github.com/sudtanj/ai2-iHealth).

[`PersonAirflowGraph.aia`](PersonAirflowGraph.aia) polls <http://ihealth.sepdek.net/> once a second. That API serves
simulated readings from an iHealth sensor kit (airflow, body temperature, heart rate and more). The app plots the
latest airflow percentage as a line graph that keeps the last 10 readings, and stores older readings in TinyDB.
It draws the chart with the [ChartMaker](https://github.com/MillsCS215AppInventorProj/chartmaker) extension, which
renders Google Charts in a WebViewer. The extension is bundled inside the `.aia`.

## How the blocks read the data

`Web.JsonTextDecode` turns every JSON object into a list of `[key, value]` pairs, with the keys sorted. Each reading
(`{"sensor", "value", "metric", "timeStamp"}`) therefore becomes `[metric, sensor, timeStamp, value]`, and item 4 is
the value pair. The timer block uses that pair as text, which App Inventor writes as `(value 26.35)`. It splits the
text at spaces, takes the second part and removes the `)`, which leaves `26.35`.

## Play in the browser

**[▶ Open the showcase](https://sudtanj.github.io/Public-Development-Monorepo/)**. The `.aia` player (`site/aia/`) runs
these blocks as written, including the sorted-key JSON decoding and the list-as-text conversion, and draws the
ChartMaker line graph as SVG. The API is plain HTTP without CORS, so browsers block it on the HTTPS showcase. The
player falls back to simulated readings in the same format and says so in its event log.

## Opening the project

Go to <https://ai2.appinventor.mit.edu> and choose *Projects → Import project (.aia)*.

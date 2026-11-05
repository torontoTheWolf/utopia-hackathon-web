# claude

A React (Vite, TypeScript) frontend with a Convex backend.

## Develop

```
npm install
npm run dev
```

The first run logs you into Convex and creates a dev deployment. It writes `VITE_CONVEX_URL` to `.env.local`. After that, `npm run dev` syncs `convex/` and starts Vite.

## Places API

Place suggestions and the routes to them come from our own API (`server/api.ts`), not a public service. On this machine, `npm run dev` and `npm run preview` start it and stop it with Vite. To run it on its own, use `npm run api`. The live site runs the same API on Vercel, from a saved area around the hotel (see [The live site's API](#the-live-sites-api)).

It reads the OpenStreetMap extract `tmp/thailand-261014.osm.pbf` (from [Geofabrik](https://download.geofabrik.de/)) and serves these on `127.0.0.1:8787`, which Vite proxies `/api` to:

- `GET /api/suggest?kinds=park,cafe:2&lat=…&lng=…&radiusKm=…&mode=foot&emotion=Happy&answers=1,2,,1,2&exclude=n123,w456` returns `{ place, route, reason }`: the place of any of the kinds that is closest by road for the mode, or Claude's pick (see below), and the route there. A kind written as `cafe:2` counts as twice as far away, which is how `DISTANCE_FACTORS` in `src/places.ts` makes some kinds come up less or more often for an emotion. `emotion` and `answers` are optional; `answers` has one entry per question in `src/questions.ts`: the number of the option chosen, 1 or 2, or empty when unanswered. Answers the API can't read, as from a live site built before the questions changed, count as unanswered. `reason` is why Claude picked the place, or null. It skips the places in `exclude`, so the app asks for another each time Try again is pressed. It answers 404 when no place within the radius can be reached by road.
- `GET /api/places?kind=park&lat=…&lng=…&radiusKm=…` lists named places of a kind nearby. Each has an `id`, the OpenStreetMap element, such as `n123` for a node or `w456` for a way.
- `GET /api/route?from=lat,lng&to=lat,lng&mode=foot` (or `mode=car`) returns `{ distanceKm, path }`: the shortest walk, or the quickest drive at typical road speeds. Routes start and end at the closest point of the closest road, and only join a road up to 30 m further from the end than that, so they can't cut across canals or buildings. It answers 404 when the ends aren't joined by roads or either is over a kilometre from one, and the app then falls back to a dashed straight line.
- `GET /api/speak?text=…` returns MP3 audio of the text, up to 600 characters, read by ElevenLabs (see below). It answers 503 until ElevenLabs is set up, and 502 when ElevenLabs fails.

The first start takes about a minute and a half to index the places and build the road graph, and requests wait until it finishes. Both are cached next to the extract, as `.places.json` and `.roads.bin` (about 660 MB), and later starts load them in under a second. The places cache is rebuilt when the extract or the place kinds in `src/places.ts` change, and the road graph when the extract changes. The running API uses about 1.1 GB of memory. To use another extract, put it in `tmp/` and change `DEFAULT_EXTRACT` in `server/placeIndex.ts`, or pass its path: `npm run api -- tmp/other.osm.pbf`.

Place names follow the browser's language when the map has a name in that language.

### Routes from GraphHopper

Routes come from [GraphHopper](https://github.com/graphhopper/graphhopper), which the API runs alongside itself. It respects turn restrictions, barriers and access rules, and gives the turn-by-turn directions shown on the open map. It needs Java 17 or later. The first start downloads GraphHopper 11.1 from Maven Central (47 MB, checked against a pinned SHA-256) into `tmp/graphhopper/`, then imports the extract, which takes about 15 minutes and up to 7 GB of memory. Later starts take about half a minute. Until it's ready, and without Java, routes come from the API's own router, which has no directions and ignores turn restrictions. Its settings are in `server/graphhopper.yml`, and its log is `tmp/graphhopper/graphhopper.log`. When the extract changes, it imports it into a new `tmp/graphhopper/graph-…` folder, and the old one can be deleted.

To pick a suggestion, the API's own router finds the closest place of each kind, for up to 8 kinds, and the one with the shortest GraphHopper route wins.

### Suggestions from Claude

With an Anthropic API key, Claude Haiku 5.5 chooses among those places instead (`server/pick.ts`). It gets the emotion, each question in `src/questions.ts` with the option chosen, and each place's name, kind and distance by road. It answers with one of the places and a sentence on why it suits the person, which the app shows in the suggestion. Put the key in `.env.local`, which git ignores, as `ANTHROPIC_API_KEY=sk-ant-…`, and restart the API. Vite passes only the `VITE_` variables in that file to the browser, so the key never reaches visitors. The API says when it starts whether Claude is picking. The live site's API reads the key from the Vercel project's environment variables instead.

Without a key, or when Claude fails, declines or doesn't answer within 10 seconds, the closest place is suggested as before, and the API logs why. The emotion, the answers and the places' names go to Anthropic; the person's location doesn't.

### Reading aloud with ElevenLabs

Small megaphones, in the accent colour, start each question, the How to use panel and the suggestion in the pop-up. Pressing one reads its text aloud with [ElevenLabs](https://elevenlabs.io/), and pressing it again stops (`src/SpeakButton.tsx`, `server/speak.ts`). Put an ElevenLabs API key in `.env.local` as `ELEVENLABS_API_KEY=…` and restart the API, which says when it starts whether the megaphones can speak. Until then the megaphone fades when pressed and says reading aloud isn't set up yet. Like the Anthropic key, it never reaches visitors, and the live site reads it from Vercel's environment variables.

It uses the voice George and the `eleven_flash_v2_5` model, the quickest and cheapest per character. To use another voice, copy its ID from its page on elevenlabs.io into `.env.local` as `ELEVENLABS_VOICE_ID=…`. ElevenLabs charges by the character, so each visitor may have 20 texts read a minute, and browsers keep each one's audio for a day, so playing it again is free. The text goes to ElevenLabs.

### The live site's API

Vercel can't hold the extract or run GraphHopper, so the live site's API answers from a small area saved in `data/`. For now the app places everyone at one spot, `FIXED_LOCATION` in `src/geo.ts`, and the area is what the API needs around it (`server/area.ts`):

- `data/places.json.gz`: the places within the app's 7.5 km search radius, and GraphHopper's walking and driving routes to each from the spot, with directions in English, Chinese, Japanese, Korean, Russian, German, French and Spanish. Browsers in other languages get English, as they do from GraphHopper here.
- `data/roads.bin`: the roads within 15 km, for the built-in router. Routes to a spot tapped on the map come from it, without turn-by-turn directions, and tapped spots further out get the dashed straight line.

`api/suggest.ts`, `api/route.ts` and `api/speak.ts` serve `server/api.ts` from the area as Vercel functions (`server/vercel.ts`), so suggestions are the same as here. Nothing needs to run on this machine. The functions need `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY`, and optionally `ELEVENLABS_VOICE_ID`, in the Vercel project's Production environment variables, and pick up changes on the next deployment.

When the spot, the place kinds or the extract change, save the area again, which takes about 10 minutes and needs the extract and GraphHopper as for `npm run api`:

```
npm run area
```

Then commit `data/` and push, and Vercel redeploys. The functions are limited like the local API, but each function instance counts requests separately, so the per-visitor limits are rougher.

## Deploy to Vercel

1. Import the repository in Vercel. The build command comes from `vercel.json`.
2. In the Convex dashboard, generate a Production deploy key.
3. In Vercel, set `CONVEX_DEPLOY_KEY` to that key in the Production environment only.

For preview deployments, generate a Preview deploy key in the Convex dashboard and set `CONVEX_DEPLOY_KEY` to it in the Preview environment. Never use the Production key there, because preview builds would push functions to the production deployment. Without a key, preview builds fail at `convex deploy`.

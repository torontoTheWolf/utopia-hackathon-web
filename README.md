# claude

A React (Vite, TypeScript) frontend with a Convex backend.

## Develop

```
npm install
npm run dev
```

The first run logs you into Convex and creates a dev deployment. It writes `VITE_CONVEX_URL` to `.env.local`. After that, `npm run dev` syncs `convex/` and starts Vite.

## Places API

Place suggestions and the routes to them come from a local API, not a public service. `npm run dev` and `npm run preview` start it and stop it with Vite. To run it on its own, use `npm run api`.

It reads the OpenStreetMap extract `tmp/thailand-261014.osm.pbf` (from [Geofabrik](https://download.geofabrik.de/)) and serves these on `127.0.0.1:8787`, which Vite proxies `/api` to:

- `GET /api/suggest?kinds=park,cafe&lat=…&lng=…&radiusKm=…&mode=foot&exclude=n123,w456` returns `{ place, route }`: the place of any of the kinds that is closest by road for the mode, and the route there. It skips the places in `exclude`, so the app asks for the next closest each time an emotion is picked again. It answers 404 when nothing is within the radius.
- `GET /api/places?kind=park&lat=…&lng=…&radiusKm=…` lists named places of a kind nearby. Each has an `id`, the OpenStreetMap element, such as `n123` for a node or `w456` for a way.
- `GET /api/route?from=lat,lng&to=lat,lng&mode=foot` (or `mode=car`) returns `{ distanceKm, path }`: the shortest walk, or the quickest drive at typical road speeds. It answers 404 when the ends aren't joined by roads or either is over a kilometre from one, and the app then falls back to a straight line.

The first start takes about a minute and a half to index the places and build the road graph, and requests wait until it finishes. Both are cached next to the extract, as `.places.json` and `.roads.bin` (about 660 MB), and later starts load them in under a second. The places cache is rebuilt when the extract or the place kinds in `src/places.ts` change, and the road graph when the extract changes. The running API uses about 1.1 GB of memory. To use another extract, put it in `tmp/` and change `DEFAULT_EXTRACT` in `server/main.ts`, or pass its path: `npm run api -- tmp/other.osm.pbf`.

Place names follow the browser's language when the map has a name in that language. Routes ignore turn restrictions, so a drive can be slightly shorter than the real one.

### Share the API with the live site

The live site has no API of its own. To serve it from this machine, install [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (`sudo pacman -S cloudflared` on Arch) and run:

```
npm run share
```

It starts the API unless `npm run dev` already has, and opens a Cloudflare quick tunnel to it. A quick tunnel gets a new `*.trycloudflare.com` address every time, so the script writes the address into the `/api` rewrite in `vercel.json`, commits only that file, and pushes the branch. The live site uses this machine once Vercel has redeployed, in a minute or two, and until the script stops. Visitors' locations then reach this machine, through Cloudflare. The API refuses searches wider than 50 km and routes longer than 50 km, and allows each visitor 300 requests a minute.

## Deploy to Vercel

1. Import the repository in Vercel. The build command comes from `vercel.json`.
2. In the Convex dashboard, generate a Production deploy key.
3. In Vercel, set `CONVEX_DEPLOY_KEY` to that key in the Production environment only.

For preview deployments, generate a Preview deploy key in the Convex dashboard and set `CONVEX_DEPLOY_KEY` to it in the Preview environment. Never use the Production key there, because preview builds would push functions to the production deployment. Without a key, preview builds fail at `convex deploy`.

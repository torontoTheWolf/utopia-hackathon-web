# claude

A React (Vite, TypeScript) frontend with a Convex backend.

## Develop

```
npm install
npm run dev
```

The first run logs you into Convex and creates a dev deployment. It writes `VITE_CONVEX_URL` to `.env.local`. After that, `npm run dev` syncs `convex/` and starts Vite.

## Places API

Place suggestions come from a local API, not a public service. `npm run dev` and `npm run preview` start it and stop it with Vite. To run it on its own, use `npm run api`.

It reads the OpenStreetMap extract `tmp/thailand-261014.osm.pbf` (from [Geofabrik](https://download.geofabrik.de/)) and serves `GET /api/places?kind=park&lat=…&lng=…&radiusKm=…` on `127.0.0.1:8787`. Vite proxies `/api` to it. The first start indexes the extract in about a minute, and suggestions wait until it finishes. The result is cached next to the extract as `.places.json`. Later starts load the cache, unless the extract or the place kinds in `src/places.ts` changed. To use another extract, put it in `tmp/` and change `DEFAULT_EXTRACT` in `server/main.ts`, or pass its path: `npm run api -- tmp/other.osm.pbf`.

Place names follow the browser's language when the map has a name in that language.

## Deploy to Vercel

1. Import the repository in Vercel. The build command comes from `vercel.json`.
2. In the Convex dashboard, generate a Production deploy key.
3. In Vercel, set `CONVEX_DEPLOY_KEY` to that key in the Production environment only.

For preview deployments, generate a Preview deploy key in the Convex dashboard and set `CONVEX_DEPLOY_KEY` to it in the Preview environment. Never use the Production key there, because preview builds would push functions to the production deployment. Without a key, preview builds fail at `convex deploy`.

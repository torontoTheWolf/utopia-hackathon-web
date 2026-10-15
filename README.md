# claude

A React (Vite, TypeScript) frontend with a Convex backend.

## Develop

```
npm install
npm run dev
```

The first run logs you into Convex and creates a dev deployment. It writes `VITE_CONVEX_URL` to `.env.local`. After that, `npm run dev` syncs `convex/` and starts Vite.

## Deploy to Vercel

1. Import the repository in Vercel. The build command comes from `vercel.json`.
2. In the Convex dashboard, generate a Production deploy key.
3. In Vercel, set `CONVEX_DEPLOY_KEY` to that key in the Production environment only.

For preview deployments, generate a Preview deploy key in the Convex dashboard and set `CONVEX_DEPLOY_KEY` to it in the Preview environment. Never use the Production key there, because preview builds would push functions to the production deployment. Without a key, preview builds fail at `convex deploy`.

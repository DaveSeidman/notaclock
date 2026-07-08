# Not A Clock

A frontend-only wall-art clock for GitHub Pages. The site reads a static image catalog, picks the latest available 12-hour slot at or before the visitor's local time, and fades between hidden-time images without a backend.

## Stack

- `client/`: Vite + React + Sass static viewer
- `client/public/clock-media/`: optimized Pages-ready image catalog
- `local-media/`: raw image download archive, intentionally gitignored
- `scripts/download-hosted-images.mjs`: optional one-time or repeatable media downloader for the retired API
- `scripts/build-static-media.mjs`: converts downloaded PNGs into optimized static WebP assets

## Quick Start

Install dependencies:

```bash
npm install
```

Run the static client:

```bash
npm start
```

Open `http://localhost:8080`.

Build the GitHub Pages client:

```bash
npm run build
```

## Static Media Workflow

The raw image archive is not committed:

```text
local-media/
```

To refresh it from the old hosted API while that endpoint still exists:

```bash
npm run download:hosted-images
```

If the admin catalog later requires a password:

```bash
NOTACLOCK_ADMIN_PASSWORD=... npm run download:hosted-images
```

To rebuild the optimized static catalog:

```bash
npm run build:static-media
```

This writes:

- `client/public/clock-media/catalog.json`
- `client/public/clock-media/approved/generated/*.webp`
- `client/public/clock-media/unapproved/generated/*.webp`
- copied source masks under `client/public/clock-media/**/masks/*.png`

Current optimized media coverage:

- 287 distinct 12-hour clock slots
- 60 approved-selected slots
- max interval between covered slots: 9 minutes
- longest uncovered ranges longer than 5 minutes: `3:21-3:28`, `5:06-5:11`, `8:16-8:23`
- optimized media size: about 23 MB

## How It Works

On boot the browser fetches `/clock-media/catalog.json`.

Every 15 seconds the app:

1. Computes the visitor's current 12-hour minute.
2. Selects the latest available catalog slot at or before that minute.
3. Moves the history rail so the current slot is first.
4. Transitions to the new current slot only after the selected viewer cadence has elapsed.

The optional source overlay uses the copied mask image. There is no write API in the hosted site.

## GitHub Pages

The Pages workflow is [`.github/workflows/deploy-client.yml`](/Users/daveseidman/Documents/personal/notaclock/.github/workflows/deploy-client.yml). It builds `client/dist` and deploys that static artifact.

Recommended repository variables:

- `VITE_PUBLIC_BASE=/notaclock/` for project Pages, or `/` for a root/custom domain
- `VITE_SITE_URL=https://<username>.github.io/notaclock` or your custom domain, for social-card metadata
- `VITE_CLOCK_TIMEZONE=America/New_York` only if you want a fixed timezone instead of each visitor's local time

No `VITE_API_BASE_URL`, Render service, or backend workspace is needed.

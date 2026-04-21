# Not A Clock

A light monorepo for a wall-art clock: the server generates hidden-time images on a randomized five-minute cadence, stores a rolling history, and the frontend fades between images while letting viewers rewind recent frames.

## Stack

- `server/`: Express API, server-side time-mask generation, retention cleanup, image history, pluggable renderers
- `client/`: Vite + React + Sass static viewer built for GitHub Pages
- `render.yaml`: Render service starter config for the backend

## Render Modes

### `fal`

Best hosted option for this project. The server generates the black-and-white time mask locally, sends it to Fal's hosted `fal-ai/illusion-diffusion` model, downloads the resulting image, and stores it for playback.

Required env:

- `RENDER_MODE=fal`
- `FAL_KEY=...`

Optional envs:

- `FAL_MODEL=fal-ai/illusion-diffusion`
- `FAL_GUIDANCE_SCALE=5.5`
- `FAL_CONTROLNET_CONDITIONING_SCALE=1`
- `FAL_CONTROL_GUIDANCE_START=0`
- `FAL_CONTROL_GUIDANCE_END=1`
- `FAL_NUM_INFERENCE_STEPS=40`
- `FAL_SCHEDULER=Euler`

### `comfyui`

Self-hosted option. The server uploads each generated mask to ComfyUI, fills placeholders in your exported API workflow JSON, queues a prompt, and stores the first output image.

Required env:

- `RENDER_MODE=comfyui`
- `COMFYUI_URL=http://127.0.0.1:8188`
- `COMFYUI_WORKFLOW_PATH=./workflows/illusion-diffusion.api.json`

See [server/workflows/README.md](/Users/daveseidman/Documents/personal/notaclock/server/workflows/README.md) for placeholder details.

### `mock`

Local demo mode. Useful for UI development or smoke tests without an external model provider.

## Quick Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create local env files:

   - Copy [server/.env.example](/Users/daveseidman/Documents/personal/notaclock/server/.env.example) to `server/.env`
   - Copy [client/.env.example](/Users/daveseidman/Documents/personal/notaclock/client/.env.example) to `client/.env`

3. Pick a renderer:

   - For hosted generation, set `RENDER_MODE=fal` and add `FAL_KEY`.
   - For self-hosted generation, set `RENDER_MODE=comfyui` and point at your exported workflow.
   - For a local dry run, set `RENDER_MODE=mock`.

4. Start both apps:

   ```bash
   npm run dev
   ```

5. Open the client at `http://localhost:5173`.

The API runs on `http://localhost:3000` by default.

## How It Works

Every scheduled run, currently once per five-minute bucket with a random 0-4 minute offset:

1. The server formats the current time in your configured timezone.
2. It generates a fresh 1024x1024 black-and-white mask with randomized type size, spacing, placement, and font choices.
3. It builds either a random art prompt or selects one from `PROMPT_PRESETS`.
4. It renders the final artwork using Fal, ComfyUI, or the built-in mock renderer.
5. It stores the output plus metadata and deletes images older than `RETENTION_HOURS`.

The frontend polls the latest image, crossfades between frames, keeps the on-screen UI nearly invisible, reveals the control layer on demand, and still lets the viewer choose a display cadence from 5 minutes to 1 hour while rewinding recent history from the keyboard.

## API

- `GET /api/health`
- `GET /api/config`
- `GET /api/images`
- `GET /api/images/current`
- `POST /api/generate`
- `GET /social-image.png`

Generated files are served from:

- `/media/generated/...`
- `/media/masks/...`

## Deployment Notes

This can stay as one GitHub repo. The Render backend and GitHub Pages frontend each have their own deploy config, and both understand monorepos well enough for this project.

### 1. Render API

The backend starter config is in [render.yaml](/Users/daveseidman/Documents/personal/notaclock/render.yaml). It is currently configured for Render's free web service tier:

- service name: `notaclock-api`
- instance type: `free`
- build command: `npm ci && npm run build:server`
- start command: `npm --workspace server run start`
- health check: `/api/health`
- storage: ephemeral `/tmp/notaclock`, used by `MEDIA_ROOT=/tmp/notaclock`

You can create this as a normal Web Service and enter the settings above manually. If you use a Blueprint, Render will prompt for the secret values marked `sync: false`. Set these first:

- `FAL_KEY`: your Fal API key
- `PUBLIC_API_URL`: the Render URL, for example `https://notaclock-api.onrender.com`
- `CORS_ORIGIN`: the GitHub Pages origin, for example `https://<username>.github.io`
- `ALLOW_MOCK_FALLBACK=false`: recommended in production so failed Fal renders do not silently become mock images

If Render gives the service a different URL, use that actual URL for both `PUBLIC_API_URL` and the GitHub `VITE_API_BASE_URL` variable. If GitHub Pages serves this repo at `https://<username>.github.io/notaclock/`, keep `CORS_ORIGIN` as `https://<username>.github.io` because browser origins do not include path segments. If you do not know the Pages URL yet, you can temporarily set `CORS_ORIGIN=*` and tighten it after the frontend is live.

The app stores final images, masks, the current image index, aggregate feedback, and per-click feedback events under `MEDIA_ROOT`. On the free Render tier, this data is intentionally temporary and will be lost whenever the service spins down, restarts, or redeploys. The main files for analysis while the process is alive are:

- `index.json`: current rolling image records, prompts, filenames, and aggregate thumbs-up/thumbs-down counts
- `feedback-events.jsonl`: one JSON event per viewer vote or vote change

Important note: this free-tier setup is good for testing the public experience, but it is not a durable week-long experiment. To preserve a week of images and feedback, upgrade the service to `starter`, add a persistent disk, set `MEDIA_ROOT=/var/data/notaclock`, and increase `RETENTION_HOURS=168`.

### 2. GitHub Pages Client

The frontend workflow is [`.github/workflows/deploy-client.yml`](/Users/daveseidman/Documents/personal/notaclock/.github/workflows/deploy-client.yml). In GitHub:

1. Go to Settings -> Pages and set Build and deployment -> Source to GitHub Actions.
2. Go to Settings -> Secrets and variables -> Actions -> Variables.
3. Add `VITE_API_BASE_URL` with the Render API URL, for example `https://notaclock-api.onrender.com`.
4. Optionally add `VITE_PUBLIC_BASE=/` if this repo will deploy at a root/custom Pages domain. If you omit it, the workflow defaults to `/<repo-name>/`, which is right for `https://<username>.github.io/notaclock/`.
5. Push to `main`, or run the `Deploy Client` workflow manually from the Actions tab.

### Cost Notes

Fal's pricing API reported `fal-ai/illusion-diffusion` at `$0.000575` per compute second on 2026-04-21. At one image per minute, the rough Fal cost is:

```text
daily Fal cost ~= average_compute_seconds_per_image * images_per_day * 0.000575
weekly Fal cost ~= daily Fal cost * 7
```

At the default five-minute server cadence, `images_per_day` is about `288`. For quick calibration, 10 compute seconds per image is about `$1.66/day`; 20 compute seconds per image is about `$3.31/day`. Render free web service hosting avoids Render compute/disk costs for the demo, but Fal generation still costs money whenever images are generated.

# Not A Clock

A light monorepo for a wall-art clock: the server generates a new hidden-time image every minute, stores a rolling history, and the frontend fades between images while letting viewers rewind recent frames.

## Stack

- `server/`: Express API, server-side time-mask generation, retention cleanup, image history, pluggable renderers
- `client/`: Vite + Sass static viewer built for GitHub Pages
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

Every scheduled run:

1. The server formats the current time in your configured timezone.
2. It generates a fresh 1024x1024 black-and-white mask with randomized type size, spacing, placement, and font choices.
3. It builds either a random art prompt or selects one from `PROMPT_PRESETS`.
4. It renders the final artwork using Fal, ComfyUI, or the built-in mock renderer.
5. It stores the output plus metadata and deletes images older than `RETENTION_HOURS`.

The frontend polls the latest image, crossfades between frames, keeps the on-screen UI nearly invisible, reveals the control layer on demand, and still lets the viewer choose a display cadence from 1 to 30 minutes while rewinding recent history from the keyboard.

## API

- `GET /api/health`
- `GET /api/config`
- `GET /api/images`
- `GET /api/images/current`
- `POST /api/generate`

Generated files are served from:

- `/media/generated/...`
- `/media/masks/...`

## Deployment Notes

### GitHub Pages

The frontend is set up with [`.github/workflows/deploy-client.yml`](/Users/daveseidman/Documents/personal/notaclock/.github/workflows/deploy-client.yml).

Before enabling it, set a repository variable named `VITE_API_BASE_URL` to your Render backend URL, for example:

- `https://notaclock-api.onrender.com`

### Render

The backend starter config is in [render.yaml](/Users/daveseidman/Documents/personal/notaclock/render.yaml).

Important note: recent image rewind depends on server-side file persistence. Render web services use ephemeral local storage unless you attach persistent disk storage or switch the media/index layer to object storage plus a database. The current setup assumes a writable disk mount via `MEDIA_ROOT`.

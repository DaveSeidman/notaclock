# ComfyUI Workflow Notes

If you want to use `RENDER_MODE=comfyui`, export an API-format ComfyUI workflow JSON and place it in this folder, for example:

- `server/workflows/illusion-diffusion.api.json`

The backend replaces these placeholders anywhere they appear in the JSON:

- `{{PROMPT}}`
- `{{NEGATIVE_PROMPT}}`
- `{{MASK_IMAGE}}`
- `{{MASK_SUBFOLDER}}`
- `{{MASK_TYPE}}`
- `{{OUTPUT_PREFIX}}`
- `{{MINUTE_KEY}}`
- `{{TIME_LABEL}}`
- `{{SEED}}`

Typical setup:

1. Point the ControlNet or image input node at `{{MASK_IMAGE}}`.
2. Point your positive prompt node at `{{PROMPT}}`.
3. Point your negative prompt node at `{{NEGATIVE_PROMPT}}`.
4. Point any seed field at `{{SEED}}`.
5. Point your save-image prefix at `{{OUTPUT_PREFIX}}`.

The server uploads the generated time mask to ComfyUI before queuing the prompt, then downloads the first output image and stores it locally for the history API.

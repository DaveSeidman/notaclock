import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(srcDir, '..');

dotenv.config({
  path: path.join(serverDir, '.env')
});

function readInt(name, fallback, options = {}) {
  const raw = process.env[name];
  const value = raw ? Number.parseInt(raw, 10) : fallback;

  if (Number.isNaN(value)) {
    return fallback;
  }

  if (options.min !== undefined && value < options.min) {
    return options.min;
  }

  if (options.max !== undefined && value > options.max) {
    return options.max;
  }

  return value;
}

function parsePromptPresets(raw) {
  if (!raw?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => String(entry).trim()).filter(Boolean);
    }
  } catch {}

  return raw
    .split(/\r?\n|\|/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveFromServer(inputPath, fallback) {
  if (!inputPath) {
    return fallback;
  }

  return path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(serverDir, inputPath);
}

export function loadConfig() {
  const minRefreshIntervalMinutes = readInt('MIN_REFRESH_INTERVAL_MINUTES', 1, { min: 1, max: 30 });
  const maxRefreshIntervalMinutes = readInt('MAX_REFRESH_INTERVAL_MINUTES', 30, { min: minRefreshIntervalMinutes, max: 30 });
  const defaultRefreshIntervalMinutes = readInt('DEFAULT_REFRESH_INTERVAL_MINUTES', 1, {
    min: minRefreshIntervalMinutes,
    max: maxRefreshIntervalMinutes
  });
  const mediaRoot = resolveFromServer(process.env.MEDIA_ROOT, path.join(serverDir, 'data'));

  return {
    port: readInt('PORT', 3000, { min: 1 }),
    publicApiUrl: process.env.PUBLIC_API_URL?.trim() || '',
    corsOrigin: process.env.CORS_ORIGIN?.trim() || '*',
    imageSize: readInt('IMAGE_SIZE', 1024, { min: 512, max: 2048 }),
    generationIntervalMinutes: readInt('GENERATION_INTERVAL_MINUTES', 1, { min: 1, max: 30 }),
    retentionHours: readInt('RETENTION_HOURS', 24, { min: 1, max: 168 }),
    minRefreshIntervalMinutes,
    maxRefreshIntervalMinutes,
    defaultRefreshIntervalMinutes,
    defaultHistoryLimit: readInt('DEFAULT_HISTORY_LIMIT', 1440, { min: 1, max: 5000 }),
    maxHistoryLimit: readInt('MAX_HISTORY_LIMIT', 1440, { min: 1, max: 5000 }),
    clockTimezone: process.env.CLOCK_TIMEZONE?.trim() || 'America/New_York',
    clockFormat: process.env.CLOCK_FORMAT === '24h' ? '24h' : '12h',
    renderMode: process.env.RENDER_MODE?.trim() || (process.env.FAL_KEY ? 'fal' : process.env.COMFYUI_URL ? 'comfyui' : 'mock'),
    allowMockFallback: process.env.ALLOW_MOCK_FALLBACK !== 'false',
    mediaRoot,
    generatedDir: path.join(mediaRoot, 'generated'),
    maskDir: path.join(mediaRoot, 'masks'),
    overlayDir: path.join(mediaRoot, 'overlays'),
    indexPath: path.join(mediaRoot, 'index.json'),
    feedbackEventsPath: path.join(mediaRoot, 'feedback-events.jsonl'),
    falModel: process.env.FAL_MODEL?.trim() || 'fal-ai/illusion-diffusion',
    falGuidanceScale: Number.parseFloat(process.env.FAL_GUIDANCE_SCALE || '5.5'),
    falControlnetConditioningScale: Number.parseFloat(process.env.FAL_CONTROLNET_CONDITIONING_SCALE || '1'),
    falControlGuidanceStart: Number.parseFloat(process.env.FAL_CONTROL_GUIDANCE_START || '0'),
    falControlGuidanceEnd: Number.parseFloat(process.env.FAL_CONTROL_GUIDANCE_END || '1'),
    falNumInferenceSteps: readInt('FAL_NUM_INFERENCE_STEPS', 40, { min: 1, max: 80 }),
    falScheduler: process.env.FAL_SCHEDULER?.trim() || 'Euler',
    comfyUrl: process.env.COMFYUI_URL?.trim() || '',
    comfyWorkflowPath: resolveFromServer(process.env.COMFYUI_WORKFLOW_PATH, ''),
    comfyTimeoutMs: readInt('COMFYUI_TIMEOUT_MS', 180000, { min: 10000, max: 900000 }),
    comfyPollIntervalMs: readInt('COMFYUI_POLL_INTERVAL_MS', 1500, { min: 500, max: 10000 }),
    promptPresets: parsePromptPresets(process.env.PROMPT_PRESETS),
    negativePrompt:
      process.env.NEGATIVE_PROMPT?.trim() ||
      'visible text, watermark, signature, logo, low resolution, blurry details, cropped subject, extra limbs, deformed anatomy, clock face, obvious digits, subtitles'
  };
}

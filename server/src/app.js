import cors from 'cors';
import express from 'express';
import { loadConfig } from './config.js';
import { createApiRouter } from './routes/api.js';
import { createSocialImageRouter } from './routes/social-image.js';
import { ComfyClient } from './lib/comfy-client.js';
import { FalRenderer } from './lib/fal-client.js';
import { ImageGeneratorService } from './lib/image-generator.js';
import { MockRenderer } from './lib/mock-renderer.js';
import { PromptGenerator } from './lib/prompt-generator.js';
import { GenerationScheduler } from './lib/scheduler.js';
import { ImageStore } from './lib/storage.js';

function createCorsOptions(config) {
  if (config.corsOrigin === '*') {
    return { origin: '*' };
  }

  const allowed = config.corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    origin(origin, callback) {
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS.'));
    }
  };
}

export async function createApp() {
  const config = loadConfig();
  const store = new ImageStore(config);
  await store.init();

  const promptGenerator = new PromptGenerator(config);
  const falRenderer = new FalRenderer(config);
  const comfyClient = new ComfyClient(config);
  const mockRenderer = new MockRenderer(config);
  const generator = new ImageGeneratorService({
    config,
    store,
    promptGenerator,
    falRenderer,
    comfyClient,
    mockRenderer
  });
  const scheduler = new GenerationScheduler({
    config,
    generator,
    store
  });
  const app = express();

  app.set('trust proxy', true);
  app.use(cors(createCorsOptions(config)));
  app.use(express.json({ limit: '1mb' }));
  app.use('/media/generated', express.static(config.generatedDir, { maxAge: '1h' }));
  app.use('/media/masks', express.static(config.maskDir, { maxAge: '1h' }));
  app.use('/media/overlays', express.static(config.overlayDir, { maxAge: '1h' }));
  app.use(createSocialImageRouter({ config, store }));
  app.use('/api', createApiRouter({ config, store, generator, scheduler }));

  app.get('/', (req, res) => {
    res.json({
      name: 'notaclock-api',
      ok: true,
      endpoints: ['/api/health', '/api/config', '/api/images', '/api/images/current', '/social-image.png']
    });
  });

  app.use((error, req, res, next) => {
    console.error('[notaclock] request failed', error);
    res.status(500).json({
      error: error.message || 'Unexpected server error.'
    });
  });

  return {
    app,
    config,
    store,
    generator,
    scheduler
  };
}

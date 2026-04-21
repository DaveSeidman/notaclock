import express from 'express';
import { clamp } from '../lib/utils.js';

function buildBaseUrl(req, config) {
  return config.publicApiUrl || `${req.protocol}://${req.get('host')}`;
}

function serializeImage(record, req, config) {
  if (!record) {
    return null;
  }

  const baseUrl = buildBaseUrl(req, config);

  return {
    ...record,
    imageUrl: `${baseUrl}/media/generated/${record.imageFilename}`,
    maskUrl: record.maskFilename ? `${baseUrl}/media/masks/${record.maskFilename}` : '',
    overlayUrl: record.overlayFilename ? `${baseUrl}/media/overlays/${record.overlayFilename}` : ''
  };
}

export function createApiRouter({ config, store, generator, scheduler }) {
  const router = express.Router();
  const validVotes = new Set(['up', 'down']);

  router.get('/health', async (req, res) => {
    const latest = await store.getLatestImage();
    res.json({
      ok: true,
      renderMode: config.renderMode,
      latestMinuteKey: latest?.minuteKey || null,
      nextRunAt: scheduler.nextRunAt
    });
  });

  router.get('/config', (req, res) => {
    res.json({
      timezone: config.clockTimezone,
      clockFormat: config.clockFormat,
      imageSize: config.imageSize,
      retentionHours: config.retentionHours,
      renderMode: config.renderMode,
      refreshInterval: {
        min: config.minRefreshIntervalMinutes,
        max: config.maxRefreshIntervalMinutes,
        step: config.refreshIntervalStepMinutes,
        default: config.defaultRefreshIntervalMinutes
      }
    });
  });

  router.get('/images', async (req, res) => {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = clamp(
      Number.isNaN(requestedLimit) ? config.defaultHistoryLimit : requestedLimit,
      1,
      config.maxHistoryLimit
    );
    const images = await store.getImages(limit);

    res.json({
      images: images.map((image) => serializeImage(image, req, config)),
      serverTime: new Date().toISOString()
    });
  });

  router.get('/images/current', async (req, res) => {
    const latest = await store.getLatestImage();
    res.json({
      image: serializeImage(latest, req, config),
      serverTime: new Date().toISOString()
    });
  });

  router.post('/images/:id/feedback', async (req, res, next) => {
    try {
      const vote = req.body?.vote ?? null;
      const previousVote = req.body?.previousVote ?? null;
      const visitorId = typeof req.body?.visitorId === 'string' ? req.body.visitorId.slice(0, 120) : '';

      if (vote !== null && !validVotes.has(vote)) {
        res.status(400).json({ error: 'vote must be "up", "down", or null.' });
        return;
      }

      if (previousVote !== null && !validVotes.has(previousVote)) {
        res.status(400).json({ error: 'previousVote must be "up", "down", or null.' });
        return;
      }

      const image = await store.updateFeedback(req.params.id, { vote, previousVote, visitorId });

      if (!image) {
        res.status(404).json({ error: 'Image not found.' });
        return;
      }

      res.json({
        image: serializeImage(image, req, config)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/generate', async (req, res, next) => {
    try {
      const requestedDate = req.body?.at ? new Date(req.body.at) : new Date();

      if (Number.isNaN(requestedDate.getTime())) {
        res.status(400).json({ error: 'Invalid "at" timestamp.' });
        return;
      }

      const image = await generator.generateForDate(requestedDate, { force: true });
      res.status(201).json({
        image: serializeImage(image, req, config)
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

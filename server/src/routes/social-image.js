import path from 'node:path';
import express from 'express';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

function drawCover(context, image) {
  const sourceRatio = image.width / image.height;
  const targetRatio = OG_WIDTH / OG_HEIGHT;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.width;
  let sourceHeight = image.height;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.height * targetRatio;
    sourceX = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / targetRatio;
    sourceY = (image.height - sourceHeight) / 2;
  }

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, OG_WIDTH, OG_HEIGHT);
}

function createFallbackImage() {
  const canvas = createCanvas(OG_WIDTH, OG_HEIGHT);
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, OG_WIDTH, OG_HEIGHT);

  gradient.addColorStop(0, '#060606');
  gradient.addColorStop(0.55, '#141310');
  gradient.addColorStop(1, '#2d2418');
  context.fillStyle = gradient;
  context.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);
  context.strokeStyle = 'rgba(244, 239, 232, 0.24)';
  context.lineWidth = 2;
  context.strokeRect(42, 42, OG_WIDTH - 84, OG_HEIGHT - 84);
  context.fillStyle = 'rgba(244, 239, 232, 0.7)';
  context.font = '500 24px Arial';
  context.fillText('NOT A CLOCK', 76, 104);
  context.fillStyle = '#f4efe8';
  context.font = '600 88px Georgia';
  context.fillText('The next image', 76, 260);
  context.fillText('is generating.', 76, 360);
  context.fillStyle = 'rgba(244, 239, 232, 0.68)';
  context.font = '400 30px Arial';
  context.fillText('A picture that keeps time.', 80, 472);

  return canvas.toBuffer('image/png');
}

async function createLatestSocialImage(config, store) {
  const latest = await store.getLatestImage();

  if (!latest?.imageFilename) {
    return createFallbackImage();
  }

  const image = await loadImage(path.join(config.generatedDir, latest.imageFilename));
  const canvas = createCanvas(OG_WIDTH, OG_HEIGHT);
  const context = canvas.getContext('2d');

  context.fillStyle = '#070707';
  context.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);
  drawCover(context, image);

  return canvas.toBuffer('image/png');
}

export function createSocialImageRouter({ config, store }) {
  const router = express.Router();
  let cachedFilename = '';
  let cachedBuffer = null;

  router.get('/social-image.png', async (req, res) => {
    const latest = await store.getLatestImage();
    const filename = latest?.imageFilename || '';

    try {
      if (!cachedBuffer || cachedFilename !== filename) {
        cachedBuffer = await createLatestSocialImage(config, store);
        cachedFilename = filename;
      }
    } catch (error) {
      console.warn('[notaclock] social image fallback used', error);
      cachedBuffer = createFallbackImage();
      cachedFilename = '';
    }

    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300'
    });
    res.send(cachedBuffer);
  });

  return router;
}

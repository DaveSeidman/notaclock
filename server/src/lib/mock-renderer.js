import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createSeedFromString, mulberry32, randomBetween } from './utils.js';

function hsl(h, s, l, a = 1) {
  return `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${a})`;
}

export class MockRenderer {
  constructor(config) {
    this.config = config;
  }

  async render({ prompt, maskBuffer, minuteKey }) {
    const seed = createSeedFromString(`${prompt}:${minuteKey}`);
    const rng = mulberry32(seed);
    const size = this.config.imageSize;
    const canvas = createCanvas(size, size);
    const context = canvas.getContext('2d');
    const hue = randomBetween(10, 240, rng);
    const maskImage = await loadImage(maskBuffer);

    const gradient = context.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, hsl(hue, randomBetween(35, 65, rng), randomBetween(72, 86, rng)));
    gradient.addColorStop(0.5, hsl(hue + randomBetween(25, 80, rng), randomBetween(28, 55, rng), randomBetween(48, 70, rng)));
    gradient.addColorStop(1, hsl(hue + randomBetween(90, 150, rng), randomBetween(25, 45, rng), randomBetween(20, 34, rng)));
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    for (let index = 0; index < 42; index += 1) {
      context.save();
      context.translate(randomBetween(0, size, rng), randomBetween(0, size, rng));
      context.rotate(randomBetween(-Math.PI, Math.PI, rng));
      context.fillStyle = hsl(hue + randomBetween(-35, 45, rng), randomBetween(25, 70, rng), randomBetween(30, 78, rng), randomBetween(0.08, 0.24, rng));
      context.fillRect(
        -randomBetween(140, 320, rng),
        -randomBetween(35, 95, rng),
        randomBetween(180, 520, rng),
        randomBetween(50, 150, rng)
      );
      context.restore();
    }

    for (let index = 0; index < 140; index += 1) {
      context.beginPath();
      context.fillStyle = hsl(hue + randomBetween(-50, 90, rng), randomBetween(20, 45, rng), randomBetween(40, 88, rng), randomBetween(0.03, 0.1, rng));
      context.arc(randomBetween(0, size, rng), randomBetween(0, size, rng), randomBetween(8, 48, rng), 0, Math.PI * 2);
      context.fill();
    }

    context.save();
    context.globalAlpha = 0.22;
    context.globalCompositeOperation = rng() > 0.5 ? 'soft-light' : 'overlay';
    context.drawImage(maskImage, 0, 0, size, size);
    context.restore();

    context.save();
    context.globalAlpha = 0.1;
    context.globalCompositeOperation = 'multiply';
    context.drawImage(maskImage, 0, 0, size, size);
    context.restore();

    const vignette = context.createRadialGradient(size * 0.5, size * 0.45, size * 0.18, size * 0.5, size * 0.5, size * 0.72);
    vignette.addColorStop(0, 'rgba(255,255,255,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.22)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, size, size);

    return {
      buffer: canvas.toBuffer('image/png'),
      extension: '.png',
      renderMode: 'mock',
      note: 'Canvas-based mock renderer used. Switch RENDER_MODE=fal or RENDER_MODE=comfyui for generated artwork.'
    };
  }
}

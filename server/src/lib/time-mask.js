import { createCanvas } from '@napi-rs/canvas';
import { clamp, mulberry32, pick, randomBetween } from './utils.js';

const FONT_FAMILIES = [
  'Arial',
  'Helvetica',
  'Verdana',
  'Trebuchet MS',
  'Georgia',
  'Palatino',
  'Gill Sans',
  'Avenir Next',
  'Times New Roman'
];

const LAYOUTS = [
  'single-drift',
  'single-drift',
  'single-diagonal',
  'two-stack',
  'two-stack',
  'two-lopsided',
  'three-scatter'
];

function createTimeChunks(label) {
  const [hour = '', minute = ''] = label.split(':');
  const hourDigits = hour.split('');
  const minuteDigits = minute.split('');

  if (hourDigits.length === 0) {
    return {
      hourChunks: [':'],
      minuteChunks: minuteDigits
    };
  }

  return {
    hourChunks: [
      ...hourDigits.slice(0, -1),
      `${hourDigits[hourDigits.length - 1]}:`
    ],
    minuteChunks: minuteDigits
  };
}

function withoutEmptyLines(lines) {
  return lines.map((line) => line.filter(Boolean)).filter((line) => line.length > 0);
}

function createLineChunks(label, layout, rng) {
  const { hourChunks, minuteChunks } = createTimeChunks(label);

  switch (layout) {
    case 'two-stack':
      return withoutEmptyLines([hourChunks, minuteChunks]);
    case 'two-lopsided': {
      if (rng() > 0.5 && minuteChunks.length > 1) {
        return withoutEmptyLines([[...hourChunks, minuteChunks[0]], minuteChunks.slice(1)]);
      }

      return withoutEmptyLines([hourChunks.slice(0, -1), [hourChunks.at(-1), ...minuteChunks]]);
    }
    case 'three-scatter': {
      if (hourChunks.length > 1 && rng() > 0.45) {
        return withoutEmptyLines([[hourChunks[0]], hourChunks.slice(1), minuteChunks]);
      }

      return withoutEmptyLines([hourChunks, [minuteChunks[0]], minuteChunks.slice(1)]);
    }
    default:
      return [[...hourChunks, ...minuteChunks]];
  }
}

function drawGlyphs(context, glyphs, options) {
  context.textBaseline = 'alphabetic';

  for (const glyph of glyphs) {
    context.save();
    context.translate(glyph.drawX, glyph.drawY);
    context.rotate(glyph.rotation);
    context.font = `${glyph.fontWeight} ${glyph.fontSize}px "${glyph.fontFamily}"`;

    if (options.shadowColor) {
      context.shadowColor = options.shadowColor;
      context.shadowBlur = options.shadowBlur;
    }

    if (options.strokeStyle) {
      context.lineJoin = 'round';
      context.lineWidth = options.strokeWidth;
      context.strokeStyle = options.strokeStyle;
      context.strokeText(glyph.char, -glyph.width / 2, 0);
    }

    context.fillStyle = options.fillStyle;
    context.fillText(glyph.char, -glyph.width / 2, 0);
    context.restore();
  }
}

export function createTimeMask({ label, size, seed }) {
  const rng = mulberry32(seed);
  const maskCanvas = createCanvas(size, size);
  const maskContext = maskCanvas.getContext('2d');
  const overlayCanvas = createCanvas(size, size);
  const overlayContext = overlayCanvas.getContext('2d');
  const invert = rng() > 0.58;
  const background = invert ? '#f5f3ef' : '#080808';
  const foreground = invert ? '#080808' : '#f4f1eb';
  const layout = pick(LAYOUTS, rng);
  const lineChunks = createLineChunks(label, layout, rng);
  const lineCount = lineChunks.length;

  maskContext.fillStyle = background;
  maskContext.fillRect(0, 0, size, size);

  const baseSize = size * randomBetween(lineCount === 1 ? 0.26 : 0.2, lineCount === 3 ? 0.3 : 0.36, rng);
  const centerY = size * randomBetween(lineCount === 1 ? 0.38 : 0.42, lineCount === 1 ? 0.68 : 0.62, rng);
  const lineGap = baseSize * randomBetween(0.68, 1.05, rng);
  const globalSlant = layout === 'single-diagonal' ? randomBetween(-0.16, 0.16, rng) : randomBetween(-0.07, 0.07, rng);
  const lineStartY = centerY - ((lineCount - 1) * lineGap) / 2;
  const glyphs = [];

  lineChunks.forEach((chunks, lineIndex) => {
    const lineFontScale = randomBetween(0.86, 1.18, rng);
    const letterSpacing = size * randomBetween(0.005, 0.05, rng);
    const lineRotation = globalSlant + randomBetween(-0.05, 0.05, rng);
    const lineGlyphs = chunks.map((chunk, chunkIndex) => {
      const containsColon = chunk.includes(':');
      const edgeChunk = chunkIndex === 0 || chunkIndex === chunks.length - 1;
      const scale = lineFontScale * randomBetween(edgeChunk ? 0.9 : 0.74, edgeChunk ? 1.36 : 1.2, rng);
      const fontSize = baseSize * scale;
      const fontWeight = Math.floor(randomBetween(500, 901, rng) / 100) * 100;
      const fontFamily = pick(FONT_FAMILIES, rng);

      maskContext.font = `${fontWeight} ${fontSize}px "${fontFamily}"`;
      const width = maskContext.measureText(chunk).width;

      return {
        char: chunk,
        fontSize,
        fontWeight,
        fontFamily,
        width,
        xJitter: size * randomBetween(containsColon ? -0.012 : -0.04, containsColon ? 0.012 : 0.04, rng),
        yJitter: size * randomBetween(-0.04, 0.04, rng),
        rotation: lineRotation + randomBetween(-0.06, 0.06, rng)
      };
    });
    let totalWidth = lineGlyphs.reduce((sum, glyph) => sum + glyph.width, 0) + Math.max(0, lineGlyphs.length - 1) * letterSpacing;
    const maxLineWidth = size * 0.64;

    if (totalWidth > maxLineWidth) {
      const widthScale = maxLineWidth / totalWidth;
      for (const glyph of lineGlyphs) {
        glyph.fontSize *= widthScale;
        glyph.width *= widthScale;
      }
      totalWidth = maxLineWidth;
    }

    const anchorX = size * randomBetween(0.3, 0.7, rng);
    const asymmetricAlignment = randomBetween(0.26, 0.74, rng);
    const lineDrift = size * randomBetween(-0.08, 0.08, rng);
    let cursorX = clamp(anchorX - totalWidth * asymmetricAlignment + lineDrift, size * 0.18, size * 0.82 - totalWidth);
    const baselineY = clamp(lineStartY + lineIndex * lineGap + size * randomBetween(-0.03, 0.03, rng), size * 0.22, size * 0.78);

    for (const glyph of lineGlyphs) {
      glyph.drawX = clamp(cursorX + glyph.width / 2 + glyph.xJitter, size * 0.18, size * 0.82);
      glyph.drawY = clamp(baselineY + glyph.yJitter, size * 0.22, size * 0.8);
      glyphs.push(glyph);
      cursorX += glyph.width + letterSpacing;
    }
  });

  drawGlyphs(maskContext, glyphs, {
    fillStyle: foreground
  });

  drawGlyphs(overlayContext, glyphs, {
    fillStyle: '#ffffff',
    strokeStyle: 'rgba(0, 0, 0, 0.94)',
    strokeWidth: Math.max(2, size * 0.006),
    shadowColor: 'rgba(0, 0, 0, 0.34)',
    shadowBlur: size * 0.01
  });

  return {
    maskBuffer: maskCanvas.toBuffer('image/png'),
    overlayBuffer: overlayCanvas.toBuffer('image/png'),
    palette: {
      background,
      foreground
    }
  };
}

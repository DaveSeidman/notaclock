import fs from 'node:fs/promises';

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function randomBetween(min, max, rng = Math.random) {
  return min + (max - min) * rng();
}

export function pick(items, rng = Math.random) {
  return items[Math.floor(rng() * items.length)];
}

export function createSeedFromString(input) {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function mulberry32(seed) {
  let value = seed >>> 0;

  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatMinuteKey(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`;
}

export function formatDisplayTime(date, timeZone, clockFormat) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const hour24 = Number.parseInt(parts.hour, 10);

  if (clockFormat === '24h') {
    return `${hour24}:${parts.minute}`;
  }

  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${parts.minute}`;
}

export function formatDisplayDate(date, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readJson(jsonPath, fallbackValue) {
  try {
    const raw = await fs.readFile(jsonPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallbackValue;
    }

    throw error;
  }
}

export async function writeJson(jsonPath, value) {
  const tempPath = `${jsonPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tempPath, jsonPath);
}

export async function removeIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

export function extensionFromFilename(filename) {
  const match = filename.match(/\.[a-z0-9]+$/i);
  return match ? match[0].toLowerCase() : '.png';
}

export function safeFilePart(input) {
  return input.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_SOURCE_MANIFEST = 'local-media/notaclock/manifest.json';
const DEFAULT_OUT_DIR = 'client/public/clock-media';
const DEFAULT_QUALITY = 74;

function parseArgs(argv) {
  const options = {
    sourceManifest: DEFAULT_SOURCE_MANIFEST,
    outDir: DEFAULT_OUT_DIR,
    quality: DEFAULT_QUALITY,
    cwebpBin: process.env.CWEBP_BIN || 'cwebp',
    concurrency: 4
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--source') {
      options.sourceManifest = next || '';
      index += 1;
    } else if (arg === '--out') {
      options.outDir = next || '';
      index += 1;
    } else if (arg === '--quality') {
      options.quality = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === '--cwebp') {
      options.cwebpBin = next || '';
      index += 1;
    } else if (arg === '--concurrency') {
      options.concurrency = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.sourceManifest = options.sourceManifest || DEFAULT_SOURCE_MANIFEST;
  options.outDir = options.outDir || DEFAULT_OUT_DIR;
  options.quality = Number.isFinite(options.quality) ? Math.min(Math.max(options.quality, 1), 100) : DEFAULT_QUALITY;
  options.concurrency =
    Number.isFinite(options.concurrency) && options.concurrency > 0 ? Math.floor(options.concurrency) : 4;

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/build-static-media.mjs [options]

Options:
  --source <file>       Raw downloaded manifest. Defaults to ${DEFAULT_SOURCE_MANIFEST}
  --out <dir>           Static media output directory. Defaults to ${DEFAULT_OUT_DIR}
  --quality <number>    WebP quality for generated images. Defaults to ${DEFAULT_QUALITY}
  --cwebp <path>        cwebp binary. Defaults to CWEBP_BIN or cwebp
  --concurrency <n>     Parallel encodes. Defaults to 4
`);
}

function getDisplaySlotKey(record) {
  if (record?.displaySlotKey) {
    return record.displaySlotKey;
  }

  const match = String(record?.timeSlotKey || record?.minuteKey || '').match(/(\d{2})(\d{2})$/);

  if (!match) {
    return '';
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = match[2];

  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    return '';
  }

  return `${String(hour % 12).padStart(2, '0')}${minute}`;
}

function slotMinute(slotKey) {
  const match = String(slotKey).match(/^(\d{2})(\d{2})$/);

  if (!match) {
    return null;
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 11 || minute < 0 || minute > 59) {
    return null;
  }

  return hour * 60 + minute;
}

function minuteLabel(value) {
  const normalized = ((value % 720) + 720) % 720;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;

  return `${hour}:${String(minute).padStart(2, '0')}`;
}

function rangeLabel(start, end) {
  if (start === end) {
    return minuteLabel(start);
  }

  return `${minuteLabel(start)}-${minuteLabel(end)}`;
}

function summarizeCoverage(records) {
  const minutes = [...new Set(records.map((record) => slotMinute(record.displaySlotKey)).filter(Number.isInteger))]
    .sort((left, right) => left - right);

  if (minutes.length === 0) {
    return {
      coveredSlots: 0,
      coveragePercent: 0,
      maxMinutesBetweenCoveredSlots: null,
      longestUncoveredRunMinutes: 720,
      longestUncoveredRun: '0:00-11:59',
      uncoveredRangesLongerThan5Minutes: ['0:00-11:59']
    };
  }

  let maxInterval = 0;
  let longestGapStart = null;
  let longestGapEnd = null;
  const longRanges = [];

  for (let index = 0; index < minutes.length; index += 1) {
    const current = minutes[index];
    const next = index === minutes.length - 1 ? minutes[0] + 720 : minutes[index + 1];
    const interval = next - current;
    const uncovered = interval - 1;

    if (interval > maxInterval) {
      maxInterval = interval;
      longestGapStart = current + 1;
      longestGapEnd = next - 1;
    }

    if (uncovered > 5) {
      longRanges.push(rangeLabel(current + 1, next - 1));
    }
  }

  return {
    coveredSlots: minutes.length,
    coveragePercent: Number(((minutes.length / 720) * 100).toFixed(1)),
    maxMinutesBetweenCoveredSlots: maxInterval,
    longestUncoveredRunMinutes: Math.max(0, maxInterval - 1),
    longestUncoveredRun: maxInterval > 1 ? rangeLabel(longestGapStart, longestGapEnd) : '',
    uncoveredRangesLongerThan5Minutes: longRanges
  };
}

function getAssetKey(kind, filename) {
  return `${kind}/${filename}`;
}

function scoreRecord(record, asset) {
  const feedback = record.feedback || {};
  const up = Number.parseInt(feedback.up, 10) || 0;
  const down = Number.parseInt(feedback.down, 10) || 0;
  const createdAt = Date.parse(record.createdAt || record.representedAt) || 0;

  return [
    asset?.approved ? 1 : 0,
    record.protected ? 1 : 0,
    up,
    -down,
    record.renderMode?.startsWith('reuse:') ? 0 : 1,
    createdAt
  ];
}

function compareScore(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }

  return 0;
}

function selectRecords(manifest) {
  const assetsByKey = new Map(manifest.assets.map((asset) => [asset.key, asset]));
  const recordsBySlot = new Map();

  for (const record of manifest.records) {
    const displaySlotKey = getDisplaySlotKey(record);

    if (!displaySlotKey || !record.imageFilename || !record.imageUrl) {
      continue;
    }

    const asset = assetsByKey.get(getAssetKey('generated', record.imageFilename));
    const next = {
      record: {
        ...record,
        approved: Boolean(asset?.approved || record.protected),
        displaySlotKey,
        slotMinute: slotMinute(displaySlotKey)
      },
      asset,
      score: scoreRecord(record, asset)
    };
    const current = recordsBySlot.get(displaySlotKey);

    if (!current || compareScore(current.score, next.score) < 0) {
      recordsBySlot.set(displaySlotKey, next);
    }
  }

  return [...recordsBySlot.values()].sort((left, right) => left.record.slotMinute - right.record.slotMinute);
}

async function copyFile(sourcePath, targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
}

async function encodeWebp(sourcePath, targetPath, options) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await execFileAsync(options.cwebpBin, ['-quiet', '-q', String(options.quality), '-m', '6', sourcePath, '-o', targetPath]);
}

async function runQueue(items, worker, concurrency) {
  const results = [];
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;

      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

function webpName(filename) {
  return filename.replace(/\.[a-z0-9]+$/i, '.webp');
}

function publicPath(...parts) {
  return parts.join('/').replace(/\/+/g, '/');
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceManifestPath = path.resolve(options.sourceManifest);
  const outDir = path.resolve(options.outDir);
  const sourceRoot = path.dirname(sourceManifestPath);
  const manifest = JSON.parse(await fs.readFile(sourceManifestPath, 'utf8'));
  const selected = selectRecords(manifest);

  if (selected.length === 0) {
    throw new Error('No records were selected from the source manifest.');
  }

  console.log(`[notaclock] selected ${selected.length} clock slots from ${manifest.records.length} records`);

  const catalogRecords = selected.map(({ record, asset }) => {
    const group = asset?.approved ? 'approved' : 'unapproved';
    const imageName = webpName(record.imageFilename);
    const maskName = record.maskFilename || '';

    return {
      id: record.id,
      minuteKey: record.minuteKey,
      timeSlotKey: record.timeSlotKey,
      displaySlotKey: record.displaySlotKey,
      slotMinute: record.slotMinute,
      displayTime: record.displayTime,
      displayDate: record.displayDate,
      representedAt: record.representedAt,
      createdAt: record.createdAt,
      prompt: record.prompt,
      negativePrompt: record.negativePrompt,
      feedback: record.feedback || { up: 0, down: 0 },
      approved: record.approved,
      protected: Boolean(record.protected),
      sourceImageFilename: record.imageFilename,
      sourceMaskFilename: maskName,
      imageUrl: publicPath('clock-media', group, 'generated', imageName),
      maskUrl: maskName ? publicPath('clock-media', group, 'masks', maskName) : '',
      width: record.width,
      height: record.height,
      renderMode: record.renderMode,
      reusedFromMinuteKey: record.reusedFromMinuteKey || ''
    };
  });

  const tasks = selected.flatMap(({ record, asset }) => {
    const group = asset?.approved ? 'approved' : 'unapproved';
    const sourceGroup = asset?.group || group;
    const imageName = webpName(record.imageFilename);
    const imageSourcePath = path.join(sourceRoot, sourceGroup, 'generated', record.imageFilename);
    const imageTargetPath = path.join(outDir, group, 'generated', imageName);
    const taskList = [
      {
        type: 'webp',
        sourcePath: imageSourcePath,
        targetPath: imageTargetPath
      }
    ];

    if (record.maskFilename) {
      taskList.push({
        type: 'copy',
        sourcePath: path.join(sourceRoot, sourceGroup, 'masks', record.maskFilename),
        targetPath: path.join(outDir, group, 'masks', record.maskFilename)
      });
    }

    return taskList;
  });

  let completed = 0;
  await runQueue(
    tasks,
    async (task) => {
      if (task.type === 'webp') {
        await encodeWebp(task.sourcePath, task.targetPath, options);
      } else {
        await copyFile(task.sourcePath, task.targetPath);
      }

      completed += 1;
      if (completed % 50 === 0 || completed === tasks.length) {
        console.log(`[notaclock] media ${completed}/${tasks.length}`);
      }
    },
    options.concurrency
  );

  const coverage = summarizeCoverage(catalogRecords);
  const catalog = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceManifest: path.relative(process.cwd(), sourceManifestPath),
    imageFormat: 'webp',
    imageQuality: options.quality,
    clockFormat: '12h',
    timezone: '',
    refreshInterval: {
      min: 5,
      max: 60,
      step: 5,
      default: 5
    },
    coverage,
    summary: {
      records: catalogRecords.length,
      approvedRecords: catalogRecords.filter((record) => record.approved).length,
      unapprovedRecords: catalogRecords.filter((record) => !record.approved).length
    },
    images: catalogRecords
  };

  await writeJson(path.join(outDir, 'catalog.json'), catalog);

  console.log(
    `[notaclock] wrote ${path.relative(process.cwd(), outDir)} with ` +
      `${catalog.summary.records} records, ${catalog.summary.approvedRecords} approved`
  );
  console.log(
    `[notaclock] coverage: ${coverage.coveredSlots}/720 slots, max interval ${coverage.maxMinutesBetweenCoveredSlots} minutes`
  );
}

main().catch((error) => {
  console.error(`[notaclock] ${error.message}`);
  process.exit(1);
});

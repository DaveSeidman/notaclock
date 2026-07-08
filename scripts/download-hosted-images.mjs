import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_API_BASE = 'https://notaclock-api.onrender.com';
const DEFAULT_OUT_DIR = 'local-media/notaclock';
const DEFAULT_LIMIT = 5000;
const LOCAL_PREFIX = 'local-media/notaclock';

const assetTypes = [
  {
    kind: 'generated',
    urlKey: 'imageUrl',
    filenameKey: 'imageFilename',
    localUrlKey: 'localImageUrl'
  },
  {
    kind: 'masks',
    urlKey: 'maskUrl',
    filenameKey: 'maskFilename',
    localUrlKey: 'localMaskUrl'
  },
  {
    kind: 'overlays',
    urlKey: 'overlayUrl',
    filenameKey: 'overlayFilename',
    localUrlKey: 'localOverlayUrl'
  }
];

function parseArgs(argv) {
  const options = {
    apiBase: process.env.NOTACLOCK_API_BASE_URL || '',
    adminPassword: process.env.NOTACLOCK_ADMIN_PASSWORD || '',
    outDir: DEFAULT_OUT_DIR,
    limit: DEFAULT_LIMIT,
    force: false,
    concurrency: 8
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--api-base') {
      options.apiBase = next || '';
      index += 1;
    } else if (arg === '--admin-password') {
      options.adminPassword = next || '';
      index += 1;
    } else if (arg === '--out') {
      options.outDir = next || '';
      index += 1;
    } else if (arg === '--limit') {
      options.limit = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === '--concurrency') {
      options.concurrency = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.limit = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : DEFAULT_LIMIT;
  options.concurrency = Number.isFinite(options.concurrency) && options.concurrency > 0 ? options.concurrency : 8;
  options.outDir = options.outDir || DEFAULT_OUT_DIR;

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/download-hosted-images.mjs [options]

Options:
  --api-base <url>          API base URL. Defaults to NOTACLOCK_API_BASE_URL
                            or ${DEFAULT_API_BASE}
  --admin-password <value>  Admin password. Defaults to NOTACLOCK_ADMIN_PASSWORD
  --out <dir>               Output directory. Defaults to ${DEFAULT_OUT_DIR}
  --limit <number>          Admin catalog limit. Defaults to ${DEFAULT_LIMIT}
  --concurrency <number>    Parallel downloads. Defaults to 8
  --force                   Redownload files that already exist
`);
}

async function resolveConfig(options) {
  const apiBase = (options.apiBase || DEFAULT_API_BASE).replace(/\/+$/, '');

  return {
    ...options,
    apiBase,
    adminPassword: options.adminPassword
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const message = body ? `${response.status} ${response.statusText}: ${body}` : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return response.json();
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() && stat.size > 0;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

function getTimeSlotKey(record) {
  if (record?.timeSlotKey) {
    return record.timeSlotKey;
  }

  const match = String(record?.minuteKey || '').match(/-(\d{4})$/);
  return match ? match[1] : '';
}

function getDisplaySlotKey(record) {
  if (record?.displaySlotKey) {
    return record.displaySlotKey;
  }

  const timeSlotKey = getTimeSlotKey(record);
  const match = String(timeSlotKey).match(/^(\d{2})(\d{2})$/);

  if (!match) {
    return '';
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = match[2];

  if (!Number.isFinite(hour)) {
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
  const minutes = [...new Set(records.map((record) => slotMinute(getDisplaySlotKey(record))).filter(Number.isInteger))]
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

function buildCatalog(records, apiBase) {
  const assets = new Map();

  for (const record of records) {
    for (const assetType of assetTypes) {
      const filename = record[assetType.filenameKey];
      const url = record[assetType.urlKey];

      if (!filename || !url) {
        continue;
      }

      const key = `${assetType.kind}/${filename}`;
      const current = assets.get(key) || {
        key,
        kind: assetType.kind,
        filename,
        sourceUrl: url,
        approved: false,
        recordIds: [],
        minuteKeys: [],
        displaySlotKeys: []
      };

      current.approved ||= record.protected === true;
      current.recordIds.push(record.id);
      current.minuteKeys.push(record.minuteKey);
      current.displaySlotKeys.push(getDisplaySlotKey(record));
      assets.set(key, current);
    }
  }

  const assetList = [...assets.values()].map((asset) => {
    const group = asset.approved ? 'approved' : 'unapproved';
    const relativePath = `${group}/${asset.kind}/${asset.filename}`;

    return {
      ...asset,
      group,
      relativePath,
      localUrl: `${LOCAL_PREFIX}/${relativePath}`
    };
  });

  const assetByKey = new Map(assetList.map((asset) => [asset.key, asset]));
  const localRecords = records.map((record) => {
    const localRecord = {
      ...record,
      displaySlotKey: getDisplaySlotKey(record)
    };

    for (const assetType of assetTypes) {
      const filename = record[assetType.filenameKey];
      const asset = filename ? assetByKey.get(`${assetType.kind}/${filename}`) : null;
      localRecord[assetType.localUrlKey] = asset?.localUrl || '';
    }

    return localRecord;
  });

  const approvedRecords = localRecords.filter((record) => record.protected === true);
  const unapprovedRecords = localRecords.filter((record) => record.protected !== true);

  return {
    version: 1,
    sourceApiBase: apiBase,
    downloadedAt: new Date().toISOString(),
    summary: {
      records: localRecords.length,
      approvedRecords: approvedRecords.length,
      unapprovedRecords: unapprovedRecords.length,
      assets: assetList.length,
      approvedAssets: assetList.filter((asset) => asset.approved).length,
      unapprovedAssets: assetList.filter((asset) => !asset.approved).length,
      generatedAssets: assetList.filter((asset) => asset.kind === 'generated').length,
      approvedGeneratedAssets: assetList.filter((asset) => asset.kind === 'generated' && asset.approved).length,
      unapprovedGeneratedAssets: assetList.filter((asset) => asset.kind === 'generated' && !asset.approved).length
    },
    coverage: {
      allRecords: summarizeCoverage(localRecords),
      approvedRecords: summarizeCoverage(approvedRecords),
      unapprovedRecords: summarizeCoverage(unapprovedRecords)
    },
    assets: assetList,
    records: localRecords
  };
}

async function downloadAsset(asset, outDir, options) {
  const targetPath = path.join(outDir, asset.relativePath);

  if (!options.force && await fileExists(targetPath)) {
    return { status: 'skipped', asset };
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  const response = await fetch(asset.sourceUrl);

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${asset.sourceUrl}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const tempPath = `${targetPath}.tmp`;
  await fs.writeFile(tempPath, buffer);
  await fs.rename(tempPath, targetPath);

  return { status: 'downloaded', asset, bytes: buffer.length };
}

async function runQueue(items, worker, concurrency) {
  const results = [];
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;

      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { status: 'failed', asset: items[index], error: error.message };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function main() {
  const options = await resolveConfig(parseArgs(process.argv.slice(2)));
  const outDir = path.resolve(options.outDir);
  const catalogUrl = new URL('/api/admin/images', options.apiBase);
  catalogUrl.searchParams.set('limit', String(options.limit));

  console.log(`[notaclock] fetching catalog from ${catalogUrl.origin}`);

  const headers = {};
  if (options.adminPassword) {
    headers['x-admin-password'] = options.adminPassword;
  }

  let payload;
  try {
    payload = await fetchJson(catalogUrl, { headers });
  } catch (error) {
    if (String(error.message).includes('401')) {
      throw new Error('Admin catalog requires a password. Set NOTACLOCK_ADMIN_PASSWORD or pass --admin-password.');
    }

    throw error;
  }

  if (!Array.isArray(payload.images)) {
    throw new Error('Admin catalog response did not include an images array.');
  }

  const catalog = buildCatalog(payload.images, options.apiBase);
  const assets = catalog.assets;

  console.log(
    `[notaclock] ${catalog.summary.records} records, ${catalog.summary.approvedRecords} approved records, ` +
      `${catalog.summary.generatedAssets} unique generated images`
  );

  let completed = 0;
  const results = await runQueue(
    assets,
    async (asset) => {
      const result = await downloadAsset(asset, outDir, options);
      completed += 1;

      if (completed % 25 === 0 || completed === assets.length) {
        console.log(`[notaclock] assets ${completed}/${assets.length}`);
      }

      return result;
    },
    options.concurrency
  );

  const failures = results.filter((result) => result.status === 'failed');
  const downloaded = results.filter((result) => result.status === 'downloaded');
  const skipped = results.filter((result) => result.status === 'skipped');

  const approvedRecords = catalog.records.filter((record) => record.protected === true);
  const unapprovedRecords = catalog.records.filter((record) => record.protected !== true);
  const approvedAssets = catalog.assets.filter((asset) => asset.approved);
  const unapprovedAssets = catalog.assets.filter((asset) => !asset.approved);
  const generatedAssets = catalog.assets.filter((asset) => asset.kind === 'generated');

  await writeJson(path.join(outDir, 'manifest.json'), catalog);
  await writeJson(path.join(outDir, 'records-approved.json'), approvedRecords);
  await writeJson(path.join(outDir, 'records-unapproved.json'), unapprovedRecords);
  await writeJson(path.join(outDir, 'assets-approved.json'), approvedAssets);
  await writeJson(path.join(outDir, 'assets-unapproved.json'), unapprovedAssets);
  await writeJson(path.join(outDir, 'generated-assets.json'), generatedAssets);
  await writeJson(path.join(outDir, 'coverage.json'), catalog.coverage);
  await writeJson(path.join(outDir, 'download-report.json'), {
    apiBase: options.apiBase,
    outDir,
    downloadedAt: catalog.downloadedAt,
    downloaded: downloaded.length,
    skipped: skipped.length,
    failed: failures.length,
    failures
  });

  console.log(
    `[notaclock] wrote ${path.relative(process.cwd(), outDir)}: ` +
      `${downloaded.length} downloaded, ${skipped.length} skipped, ${failures.length} failed`
  );
  console.log(
    `[notaclock] all-record coverage: ${catalog.coverage.allRecords.coveredSlots}/720 slots, ` +
      `max interval ${catalog.coverage.allRecords.maxMinutesBetweenCoveredSlots} minutes`
  );
  console.log(
    `[notaclock] approved-record coverage: ${catalog.coverage.approvedRecords.coveredSlots}/720 slots, ` +
      `max interval ${catalog.coverage.approvedRecords.maxMinutesBetweenCoveredSlots} minutes`
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[notaclock] ${error.message}`);
  process.exit(1);
});

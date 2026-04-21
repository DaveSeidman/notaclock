import path from 'node:path';
import fs from 'node:fs/promises';
import { ensureDir, readJson, removeIfExists, writeJson } from './utils.js';

function sortImagesDescending(images) {
  return [...images].sort((left, right) => {
    const leftTime = Date.parse(left.representedAt || left.createdAt);
    const rightTime = Date.parse(right.representedAt || right.createdAt);
    return rightTime - leftTime;
  });
}

function normalizeFeedback(feedback = {}) {
  return {
    up: Math.max(0, Number.parseInt(feedback.up, 10) || 0),
    down: Math.max(0, Number.parseInt(feedback.down, 10) || 0)
  };
}

export class ImageStore {
  constructor(config) {
    this.config = config;
    this.queue = Promise.resolve();
  }

  async init() {
    await ensureDir(this.config.mediaRoot);
    await ensureDir(this.config.generatedDir);
    await ensureDir(this.config.maskDir);
    await ensureDir(this.config.overlayDir);

    const existing = await readJson(this.config.indexPath, { version: 1, images: [] });
    if (!Array.isArray(existing.images)) {
      await writeJson(this.config.indexPath, { version: 1, images: [] });
    }
  }

  async readIndex() {
    const payload = await readJson(this.config.indexPath, { version: 1, images: [] });
    return {
      version: 1,
      images: sortImagesDescending(Array.isArray(payload.images) ? payload.images : [])
    };
  }

  async writeIndex(payload) {
    await writeJson(this.config.indexPath, {
      version: 1,
      images: sortImagesDescending(payload.images)
    });
  }

  async withLock(work) {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => {});
    return next;
  }

  async getImages(limit = this.config.defaultHistoryLimit) {
    const payload = await this.readIndex();
    return payload.images.slice(0, limit);
  }

  async getLatestImage() {
    const images = await this.getImages(1);
    return images[0] ?? null;
  }

  async findByMinuteKey(minuteKey) {
    const payload = await this.readIndex();
    return payload.images.find((image) => image.minuteKey === minuteKey) ?? null;
  }

  async addImage(record) {
    return this.withLock(async () => {
      const payload = await this.readIndex();
      const remainingImages = payload.images.filter((image) => image.minuteKey !== record.minuteKey);
      const nextImages = sortImagesDescending([record, ...remainingImages]);
      await this.writeIndex({ version: 1, images: nextImages });
      return record;
    });
  }

  async updateFeedback(minuteKey, { vote, previousVote, visitorId }) {
    return this.withLock(async () => {
      const payload = await this.readIndex();
      const imageIndex = payload.images.findIndex((image) => image.minuteKey === minuteKey || image.id === minuteKey);

      if (imageIndex === -1) {
        return null;
      }

      const image = { ...payload.images[imageIndex] };
      const feedback = normalizeFeedback(image.feedback);

      if (previousVote && previousVote !== vote) {
        feedback[previousVote] = Math.max(0, feedback[previousVote] - 1);
      }

      if (vote && previousVote !== vote) {
        feedback[vote] += 1;
      }

      image.feedback = feedback;
      image.feedbackUpdatedAt = new Date().toISOString();
      payload.images[imageIndex] = image;
      await this.writeIndex(payload);
      await this.appendFeedbackEvent({
        at: image.feedbackUpdatedAt,
        imageId: image.id,
        minuteKey: image.minuteKey,
        representedAt: image.representedAt,
        imageFilename: image.imageFilename,
        maskFilename: image.maskFilename,
        prompt: image.prompt,
        negativePrompt: image.negativePrompt,
        renderMode: image.renderMode,
        vote,
        previousVote,
        visitorId: visitorId || '',
        feedback
      });

      return image;
    });
  }

  async appendFeedbackEvent(event) {
    await fs.appendFile(this.config.feedbackEventsPath, `${JSON.stringify(event)}\n`, 'utf8');
  }

  async cleanupExpired() {
    return this.withLock(async () => {
      const payload = await this.readIndex();
      const cutoff = Date.now() - this.config.retentionHours * 60 * 60 * 1000;
      const keep = [];
      const remove = [];

      for (const image of payload.images) {
        const timestamp = Date.parse(image.representedAt || image.createdAt);
        if (Number.isFinite(timestamp) && timestamp < cutoff) {
          remove.push(image);
        } else {
          keep.push(image);
        }
      }

      if (remove.length === 0) {
        return 0;
      }

      for (const image of remove) {
        await removeIfExists(path.join(this.config.generatedDir, image.imageFilename));
        if (image.maskFilename) {
          await removeIfExists(path.join(this.config.maskDir, image.maskFilename));
        }
        if (image.overlayFilename) {
          await removeIfExists(path.join(this.config.overlayDir, image.overlayFilename));
        }
      }

      await this.writeIndex({ version: 1, images: keep });
      return remove.length;
    });
  }
}

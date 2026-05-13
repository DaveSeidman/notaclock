import fs from 'node:fs/promises';
import path from 'node:path';
import { createTimeMask } from './time-mask.js';
import { createSeedFromString, formatDisplayDate, formatDisplayTime, formatMinuteKey } from './utils.js';

function getUpvotes(record) {
  return Math.max(0, Number.parseInt(record?.feedback?.up, 10) || 0);
}

function getTimeSlotKey(minuteKey) {
  const match = String(minuteKey).match(/-(\d{4})$/);
  return match ? match[1] : '';
}

export class ImageGeneratorService {
  constructor({ config, store, promptGenerator, falRenderer, comfyClient, mockRenderer }) {
    this.config = config;
    this.store = store;
    this.promptGenerator = promptGenerator;
    this.falRenderer = falRenderer;
    this.comfyClient = comfyClient;
    this.mockRenderer = mockRenderer;
  }

  async generateForDate(date = new Date(), options = {}) {
    const representedAt = new Date(date);
    const minuteKey = formatMinuteKey(representedAt, this.config.clockTimezone);
    const timeSlotKey = getTimeSlotKey(minuteKey);
    const existing = !options.force ? await this.store.findByMinuteKey(minuteKey) : null;

    if (existing) {
      const upvotes = getUpvotes(existing);

      if (existing.protected || upvotes > this.config.protectedImageUpvotes) {
        console.log(
          `[notaclock] skipping ${minuteKey}; existing image is protected or has ${upvotes} upvotes`
        );
        return this.ensureDerivedAssets(existing);
      }
    }

    if (!options.force) {
      const protectedSource = await this.store.findProtectedByTimeSlot(timeSlotKey);

      if (protectedSource) {
        console.log(
          `[notaclock] reusing protected ${protectedSource.minuteKey} for ${minuteKey}; time slot ${timeSlotKey} is locked`
        );
        return this.reuseProtectedImage(protectedSource, representedAt, minuteKey, timeSlotKey);
      }
    }

    if (existing) {
      const upvotes = getUpvotes(existing);
      console.log(
        `[notaclock] regenerating ${minuteKey}; existing image has ${upvotes} upvotes, at or below protected threshold ${this.config.protectedImageUpvotes}`
      );
    }

    const displayTime = formatDisplayTime(representedAt, this.config.clockTimezone, this.config.clockFormat);
    const displayDate = formatDisplayDate(representedAt, this.config.clockTimezone);
    const seed = createSeedFromString(`${minuteKey}:${displayTime}`);
    const promptPayload = this.promptGenerator.generate(representedAt, minuteKey);
    const mask = createTimeMask({
      label: displayTime,
      size: this.config.imageSize,
      seed
    });
    const maskFilename = `mask-${minuteKey}.png`;
    const overlayFilename = `overlay-${minuteKey}.png`;

    await fs.writeFile(path.join(this.config.maskDir, maskFilename), mask.maskBuffer);
    await fs.writeFile(path.join(this.config.overlayDir, overlayFilename), mask.overlayBuffer);

    let renderResult;
    let renderMode = this.config.renderMode;
    let fallbackReason = '';

    try {
      renderResult = await this.renderImage({
        prompt: promptPayload.prompt,
        negativePrompt: promptPayload.negativePrompt,
        maskBuffer: mask.maskBuffer,
        minuteKey,
        timeLabel: displayTime,
        seed
      });
      renderMode = renderResult.renderMode;
    } catch (error) {
      if (!this.config.allowMockFallback || this.config.renderMode === 'mock') {
        throw error;
      }

      fallbackReason = error.message;
      renderResult = await this.mockRenderer.render({
        prompt: promptPayload.prompt,
        maskBuffer: mask.maskBuffer,
        minuteKey,
        timeLabel: displayTime
      });
      renderMode = `${this.config.renderMode}-fallback`;
    }

    const imageFilename = `image-${minuteKey}${renderResult.extension || '.png'}`;
    await fs.writeFile(path.join(this.config.generatedDir, imageFilename), renderResult.buffer);

    const record = {
      id: minuteKey,
      minuteKey,
      timeSlotKey,
      representedAt: representedAt.toISOString(),
      createdAt: new Date().toISOString(),
      displayTime,
      displayDate,
      prompt: promptPayload.prompt,
      negativePrompt: promptPayload.negativePrompt,
      timezone: this.config.clockTimezone,
      clockFormat: this.config.clockFormat,
      imageFilename,
      maskFilename,
      overlayFilename,
      width: this.config.imageSize,
      height: this.config.imageSize,
      renderMode,
      fallbackReason,
      note: renderResult.note || '',
      comfyPromptId: renderResult.promptId || ''
    };

    const savedRecord = await this.store.addImage(record);
    await this.store.cleanupExpired();
    return savedRecord;
  }

  async ensureDerivedAssets(record) {
    if (record.maskFilename && record.overlayFilename) {
      return record;
    }

    const seed = createSeedFromString(`${record.minuteKey}:${record.displayTime}`);
    const mask = createTimeMask({
      label: record.displayTime,
      size: this.config.imageSize,
      seed
    });
    const nextRecord = { ...record };

    if (!nextRecord.maskFilename) {
      nextRecord.maskFilename = `mask-${record.minuteKey}.png`;
      await fs.writeFile(path.join(this.config.maskDir, nextRecord.maskFilename), mask.maskBuffer);
    }

    if (!nextRecord.overlayFilename) {
      nextRecord.overlayFilename = `overlay-${record.minuteKey}.png`;
      await fs.writeFile(path.join(this.config.overlayDir, nextRecord.overlayFilename), mask.overlayBuffer);
    }

    return this.store.addImage(nextRecord);
  }

  async reuseProtectedImage(sourceRecord, representedAt, minuteKey, timeSlotKey) {
    const displayTime = formatDisplayTime(representedAt, this.config.clockTimezone, this.config.clockFormat);
    const displayDate = formatDisplayDate(representedAt, this.config.clockTimezone);
    const record = {
      ...sourceRecord,
      id: minuteKey,
      minuteKey,
      timeSlotKey,
      representedAt: representedAt.toISOString(),
      createdAt: new Date().toISOString(),
      displayTime,
      displayDate,
      protected: false,
      protectedAt: undefined,
      reusedFromMinuteKey: sourceRecord.minuteKey,
      reusedFromImageId: sourceRecord.id,
      renderMode: `reuse:${sourceRecord.renderMode}`,
      fallbackReason: '',
      note: `Reused protected image from ${sourceRecord.displayDate || sourceRecord.minuteKey} ${sourceRecord.displayTime || ''}`.trim(),
      feedback: { up: 0, down: 0 }
    };

    delete record.feedbackUpdatedAt;

    return this.store.addImage(record);
  }

  async renderImage({ prompt, negativePrompt, maskBuffer, minuteKey, timeLabel, seed }) {
    switch (this.config.renderMode) {
      case 'fal':
        return this.falRenderer.render({
          prompt,
          negativePrompt,
          maskBuffer,
          minuteKey,
          timeLabel,
          seed
        });
      case 'comfyui':
        return this.comfyClient.render({
          prompt,
          negativePrompt,
          maskBuffer,
          minuteKey,
          timeLabel
        });
      default:
        return this.mockRenderer.render({
          prompt,
          maskBuffer,
          minuteKey,
          timeLabel
        });
    }
  }
}

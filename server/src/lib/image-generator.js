import fs from 'node:fs/promises';
import path from 'node:path';
import { createTimeMask } from './time-mask.js';
import { createSeedFromString, formatDisplayDate, formatDisplayTime, formatMinuteKey } from './utils.js';

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
    const existing = !options.force ? await this.store.findByMinuteKey(minuteKey) : null;

    if (existing) {
      return this.ensureDerivedAssets(existing);
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

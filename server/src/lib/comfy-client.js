import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { Blob } from 'node:buffer';
import { extensionFromFilename, sleep } from './utils.js';

function replacePlaceholders(value, replacements) {
  if (Array.isArray(value)) {
    return value.map((entry) => replacePlaceholders(entry, replacements));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replacePlaceholders(entry, replacements)]));
  }

  if (typeof value !== 'string') {
    return value;
  }

  const exactMatch = value.match(/^\{\{([A-Z0-9_]+)\}\}$/);
  if (exactMatch) {
    return replacements[exactMatch[1]] ?? value;
  }

  return value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => String(replacements[key] ?? `{{${key}}}`));
}

export class ComfyClient {
  constructor(config) {
    this.config = config;
    this.clientId = crypto.randomUUID();
    this.cachedWorkflow = null;
  }

  isConfigured() {
    return Boolean(this.config.comfyUrl && this.config.comfyWorkflowPath);
  }

  async render({ prompt, negativePrompt, maskBuffer, minuteKey, timeLabel }) {
    if (!this.isConfigured()) {
      throw new Error('ComfyUI mode requires COMFYUI_URL and COMFYUI_WORKFLOW_PATH.');
    }

    const workflowTemplate = await this.loadWorkflowTemplate();
    const maskUpload = await this.uploadMask(maskBuffer, `mask-${minuteKey}.png`);
    const replacements = {
      PROMPT: prompt,
      NEGATIVE_PROMPT: negativePrompt,
      MASK_IMAGE: maskUpload.name,
      MASK_SUBFOLDER: maskUpload.subfolder || '',
      MASK_TYPE: maskUpload.type || 'input',
      OUTPUT_PREFIX: `notaclock/${minuteKey}`,
      MINUTE_KEY: minuteKey,
      TIME_LABEL: timeLabel,
      SEED: Math.floor(Math.random() * 4294967295)
    };
    const workflow = replacePlaceholders(workflowTemplate, replacements);
    const promptId = await this.queuePrompt(workflow);
    const imageRef = await this.waitForImage(promptId);
    const buffer = await this.downloadImage(imageRef);

    return {
      buffer,
      extension: extensionFromFilename(imageRef.filename),
      renderMode: 'comfyui',
      promptId
    };
  }

  async loadWorkflowTemplate() {
    if (this.cachedWorkflow) {
      return this.cachedWorkflow;
    }

    const raw = await fs.readFile(this.config.comfyWorkflowPath, 'utf8');
    this.cachedWorkflow = JSON.parse(raw);
    return this.cachedWorkflow;
  }

  async uploadMask(maskBuffer, filename) {
    const form = new FormData();
    form.append('image', new Blob([maskBuffer], { type: 'image/png' }), filename);
    form.append('overwrite', 'true');
    const response = await fetch(new URL('/upload/image', this.config.comfyUrl), {
      method: 'POST',
      body: form
    });

    if (!response.ok) {
      throw new Error(`ComfyUI image upload failed with ${response.status}.`);
    }

    return response.json();
  }

  async queuePrompt(workflow) {
    const response = await fetch(new URL('/prompt', this.config.comfyUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        client_id: this.clientId,
        prompt: workflow
      })
    });

    if (!response.ok) {
      throw new Error(`ComfyUI prompt queue failed with ${response.status}.`);
    }

    const payload = await response.json();
    if (!payload.prompt_id) {
      throw new Error('ComfyUI prompt queue response did not include prompt_id.');
    }

    return payload.prompt_id;
  }

  async waitForImage(promptId) {
    const deadline = Date.now() + this.config.comfyTimeoutMs;

    while (Date.now() < deadline) {
      const response = await fetch(new URL(`/history/${promptId}`, this.config.comfyUrl));
      if (!response.ok) {
        throw new Error(`ComfyUI history polling failed with ${response.status}.`);
      }

      const payload = await response.json();
      const promptHistory = payload[promptId];
      const outputs = promptHistory?.outputs ? Object.values(promptHistory.outputs) : [];

      for (const output of outputs) {
        if (Array.isArray(output.images) && output.images.length > 0) {
          return output.images[0];
        }
      }

      await sleep(this.config.comfyPollIntervalMs);
    }

    throw new Error('Timed out waiting for ComfyUI image output.');
  }

  async downloadImage(imageRef) {
    const url = new URL('/view', this.config.comfyUrl);
    url.searchParams.set('filename', imageRef.filename);
    url.searchParams.set('subfolder', imageRef.subfolder || '');
    url.searchParams.set('type', imageRef.type || 'output');

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ComfyUI image download failed with ${response.status}.`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}

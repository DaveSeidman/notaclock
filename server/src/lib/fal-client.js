import { fal } from '@fal-ai/client';
import { extensionFromFilename } from './utils.js';

function toDataUri(buffer, mimeType = 'image/png') {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export class FalRenderer {
  constructor(config) {
    this.config = config;
  }

  isConfigured() {
    return Boolean(process.env.FAL_KEY?.trim());
  }

  async render({ prompt, negativePrompt, maskBuffer, minuteKey, seed }) {
    if (!this.isConfigured()) {
      throw new Error('Fal mode requires the FAL_KEY environment variable.');
    }

    const result = await fal.subscribe(this.config.falModel, {
      input: {
        image_url: toDataUri(maskBuffer),
        prompt,
        negative_prompt: negativePrompt,
        guidance_scale: this.config.falGuidanceScale,
        controlnet_conditioning_scale: this.config.falControlnetConditioningScale,
        control_guidance_start: this.config.falControlGuidanceStart,
        control_guidance_end: this.config.falControlGuidanceEnd,
        num_inference_steps: this.config.falNumInferenceSteps,
        scheduler: this.config.falScheduler,
        image_size: {
          width: this.config.imageSize,
          height: this.config.imageSize
        },
        seed
      }
    });

    const image = result.data?.image;
    if (!image?.url) {
      throw new Error('Fal did not return an image URL.');
    }

    const response = await fetch(image.url);
    if (!response.ok) {
      throw new Error(`Fal image download failed with ${response.status}.`);
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      extension: extensionFromFilename(image.file_name || `image-${minuteKey}.png`),
      renderMode: 'fal',
      requestId: result.requestId || '',
      note: `Generated via ${this.config.falModel}`
    };
  }
}

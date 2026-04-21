export class GenerationScheduler {
  constructor({ config, generator, store }) {
    this.config = config;
    this.generator = generator;
    this.store = store;
    this.running = false;
    this.timeoutId = null;
    this.nextRunAt = null;
  }

  async start() {
    await this.generator.generateForDate(new Date());

    this.scheduleNextRun();
  }

  stop() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  getNextRunAt(now = Date.now()) {
    const intervalMs = this.config.generationIntervalMinutes * 60 * 1000;
    const jitterChoices = Math.max(0, this.config.generationJitterMinutes) + 1;
    const currentBucketStart = Math.floor(now / intervalMs) * intervalMs;
    let bucketStart = currentBucketStart + intervalMs;
    let jitterMinutes = Math.floor(Math.random() * jitterChoices);
    let nextTick = bucketStart + jitterMinutes * 60 * 1000 + 250;

    if (nextTick <= now + 1000) {
      bucketStart += intervalMs;
      jitterMinutes = Math.floor(Math.random() * jitterChoices);
      nextTick = bucketStart + jitterMinutes * 60 * 1000 + 250;
    }

    return nextTick;
  }

  scheduleNextRun() {
    const now = Date.now();
    const nextTick = this.getNextRunAt(now);
    const delay = Math.max(1000, nextTick - now);

    this.nextRunAt = new Date(nextTick).toISOString();
    this.timeoutId = setTimeout(() => {
      void this.run();
    }, delay);
  }

  async run() {
    if (this.running) {
      this.scheduleNextRun();
      return;
    }

    this.running = true;

    try {
      await this.generator.generateForDate(new Date());
    } catch (error) {
      console.error('[notaclock] generation failed', error);
    } finally {
      this.running = false;
      this.scheduleNextRun();
    }
  }
}

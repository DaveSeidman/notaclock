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
    const summary = await this.store.getCatalogSummary();
    console.log(
      `[notaclock] app booting, media store has ${summary.total} images already generated${
        summary.latestMinuteKey ? `, latest is ${summary.latestMinuteKey}` : ''
      }`
    );

    try {
      const image = await this.generator.generateForDate(new Date());
      console.log(`[notaclock] boot generation check complete, latest candidate is ${image.minuteKey}`);
    } catch (error) {
      console.error('[notaclock] boot generation failed', error);
    } finally {
      this.scheduleNextRun();
    }
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
    console.log(`[notaclock] next generation check at ${this.nextRunAt}`);
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
      const image = await this.generator.generateForDate(new Date());
      console.log(`[notaclock] generation check complete, latest candidate is ${image.minuteKey}`);
    } catch (error) {
      console.error('[notaclock] generation failed', error);
    } finally {
      this.running = false;
      this.scheduleNextRun();
    }
  }
}

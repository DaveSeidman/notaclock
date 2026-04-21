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

  scheduleNextRun() {
    const intervalMs = this.config.generationIntervalMinutes * 60 * 1000;
    const now = Date.now();
    const nextTick = Math.floor(now / intervalMs) * intervalMs + intervalMs + 250;
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

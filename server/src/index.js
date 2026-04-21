import { createApp } from './app.js';

const { app, config, scheduler } = await createApp();

const server = app.listen(config.port, async () => {
  console.log(`[notaclock] server listening on http://localhost:${config.port}`);
  await scheduler.start();
  console.log(`[notaclock] scheduler active, next run at ${scheduler.nextRunAt}`);
});

function shutdown() {
  scheduler.stop();
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

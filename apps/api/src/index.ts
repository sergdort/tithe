import { runMigrations } from '@tithe/db';
import { buildServer } from './server.js';

const start = async (): Promise<void> => {
  runMigrations();
  const app = buildServer();
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? '0.0.0.0';

  try {
    await app.listen({ port, host });
    app.log.info(`API listening on http://${host}:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();

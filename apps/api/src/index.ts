import { runMigrations } from '@tithe/db';
import { loadApiRuntimeConfig } from './config.js';
import { loadWorkspaceEnv } from './load-env.js';
import { buildServer } from './server.js';

const start = async (): Promise<void> => {
  loadWorkspaceEnv();
  const config = loadApiRuntimeConfig();
  runMigrations();
  const app = buildServer({ config });

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`API listening on http://${config.host}:${config.port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();

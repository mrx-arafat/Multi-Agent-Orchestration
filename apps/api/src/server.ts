/**
 * MAOF API Server entry point.
 * Loads environment, builds the Fastify app, and starts listening.
 * Handles SIGINT/SIGTERM for graceful shutdown.
 */
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { getConfig } from './config/index.js';

async function main(): Promise<void> {
  let app: FastifyInstance | undefined;

  try {
    // Parse and validate environment — fails fast if config is invalid
    const config = getConfig();
    app = await buildApp();

    // Graceful shutdown handler
    const appInstance = app;
    const shutdown = async (signal: string): Promise<void> => {
      appInstance.log.info({ signal }, 'Received shutdown signal — draining connections...');
      try {
        await appInstance.close();
        appInstance.log.info('Server closed gracefully');
        process.exit(0);
      } catch (err) {
        appInstance.log.error({ err }, 'Error during graceful shutdown');
        process.exit(1);
      }
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));

    // Start listening
    await app.listen({ port: config.MAOF_PORT, host: config.MAOF_HOST });
    app.log.info(
      { port: config.MAOF_PORT, env: config.MAOF_NODE_ENV },
      '🚀 MAOF API server started',
    );
  } catch (err) {
    if (app) {
      app.log.error({ err }, 'Fatal startup error');
    } else {
      console.error('Fatal startup error:', err);
    }
    process.exit(1);
  }
}

main();

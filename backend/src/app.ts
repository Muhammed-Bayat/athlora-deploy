import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';

export function createApp() {
  const app = express();
  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(helmet());
  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json());
  if (process.env.REQUEST_TIMING_LOG === 'true') {
    app.use((req, res, next) => {
      const startedAt = process.hrtime.bigint();
      res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const contentLength = res.getHeader('content-length');
        console.info(JSON.stringify({
          type: 'request_timing',
          route: req.originalUrl,
          status: res.statusCode,
          durationMs: Number(durationMs.toFixed(2)),
          responseBytes: typeof contentLength === 'string' || typeof contentLength === 'number' ? Number(contentLength) : null,
        }));
      });
      next();
    });
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/v1', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

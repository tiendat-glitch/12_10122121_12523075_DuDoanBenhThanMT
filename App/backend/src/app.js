import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { healthRoutes } from './routes/health.routes.js';
import { predictionRoutes } from './routes/prediction.routes.js';
import { modelRoutes } from './routes/model.routes.js';
import { createHealthController } from './controllers/health.controller.js';
import { createPredictionController } from './controllers/prediction.controller.js';
import { createPredictionService } from './services/prediction.service.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { sendError } from './utils/response.js';
import { log } from './utils/logger.js';
export function createApp({ config, schema, model, database }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const incoming = req.get('X-Request-ID');
    req.requestId = incoming && /^[A-Za-z0-9_-]{1,128}$/.test(incoming) ? incoming : randomUUID();
    res.set('X-Request-ID', req.requestId);
    const start = performance.now();
    const path = req.path;
    res.on('finish', () => log('request_completed', { request_id: req.requestId, method: req.method, path, status: res.statusCode, duration_ms: Math.round((performance.now() - start) * 100) / 100 }));
    next();
  });
  app.use(cors({ origin: config.corsOrigins, exposedHeaders: ['X-Request-ID'] }));
  app.use(express.json({ limit: '32kb' }));
  const health = createHealthController(config, model, database);
  const controller = createPredictionController(createPredictionService(model, database));
  app.use(healthRoutes(health));
  // Keep compatibility with existing clients; /api is the canonical contract.
  for (const prefix of ['/api/v1', '/api']) {
    app.use(prefix, healthRoutes(health), modelRoutes(model, schema), predictionRoutes(controller, schema));
  }
  app.use((req, res) => sendError(res, 404, 'not_found', 'Endpoint không tồn tại', req.requestId));
  app.use(errorMiddleware);
  return app;
}

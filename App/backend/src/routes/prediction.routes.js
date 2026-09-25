import { Router } from 'express';
import { validationMiddleware } from '../middlewares/validation.middleware.js';
export function predictionRoutes(controller, schema) {
  const router = Router();
  router.post('/predict', validationMiddleware(schema), controller.predict);
  router.get('/history', controller.history);
  return router;
}

import { Router } from 'express';
export function modelRoutes(model, schema) {
  const router = Router();
  router.get('/schema', (req, res) => res.json(schema));
  router.get('/model-info', async (req, res) => res.json(await model.info(req.requestId)));
  return router;
}

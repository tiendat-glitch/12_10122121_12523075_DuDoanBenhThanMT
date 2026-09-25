import { AppError } from '../utils/response.js';
export function createPredictionController(service) {
  return {
    predict: async (req, res) => res.json(await service.predict(req.body.features, req.requestId)),
    history: async (req, res) => {
      const raw = req.query.limit ?? '20';
      if (typeof raw !== 'string' || !/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 100) throw new AppError(400, 'invalid_input', 'limit phải là số nguyên từ 1 đến 100');
      res.json({ items: await service.history(Number(raw)), request_id: req.requestId });
    },
  };
}

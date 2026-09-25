import { AppError } from '../utils/response.js';
import { log } from '../utils/logger.js';
export function createPredictionService(model, database) {
  return {
    async predict(features, requestId) {
      log('validation_ok', { request_id: requestId });
      const result = await model.predict(features, requestId);
      const { explanation, ...record } = result;
      try { await database.savePrediction({ ...record, features }); }
      catch { throw new AppError(503, 'history_unavailable', 'Không lưu được lịch sử vào MongoDB'); }
      log('history_saved', { request_id: requestId, model_version: result.model_version });
      return result;
    },
    async history(limit) {
      try { return await database.listPredictions(limit); }
      catch { throw new AppError(503, 'history_unavailable', 'Không đọc được lịch sử MongoDB'); }
    },
  };
}

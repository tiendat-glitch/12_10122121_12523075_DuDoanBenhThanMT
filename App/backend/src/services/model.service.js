import { AppError } from '../utils/response.js';
export function createModelService(config, fetchImpl = fetch) {
  async function call(path, requestId, features) {
    try {
      const response = await fetchImpl(config.aiServiceUrl + path, {
        method: features ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
        ...(features ? { body: JSON.stringify({ features }) } : {}),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      if (!response.ok) throw new AppError(502, 'ai_service_error', 'AI Service không xử lý được yêu cầu');
      return await response.json();
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new AppError(504, 'ai_timeout', 'AI Service phản hồi quá thời hạn');
      throw new AppError(503, 'ai_service_unavailable', 'Không kết nối được AI Service');
    }
  }
  return {
    health: id => call('/health', id),
    info: id => call('/model-info', id),
    async predict(features, id) {
      const result = await call('/predict', id, features);
      if (typeof result.prediction !== 'string' || typeof result.model_version !== 'string' ||
          !(result.probability === null || (typeof result.probability === 'number' && result.probability >= 0 && result.probability <= 1))) {
        throw new AppError(502, 'invalid_ai_response', 'Phản hồi AI không đúng hợp đồng');
      }
      return { ...result, request_id: id };
    },
  };
}

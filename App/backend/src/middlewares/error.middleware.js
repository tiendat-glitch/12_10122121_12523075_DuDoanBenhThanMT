import { AppError, sendError } from '../utils/response.js';
import { log } from '../utils/logger.js';
export function errorMiddleware(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') return sendError(res, 400, 'invalid_input', 'JSON không hợp lệ', req.requestId);
  if (error.type === 'entity.too.large') return sendError(res, 413, 'payload_too_large', 'Dữ liệu vượt quá 32 KB', req.requestId);
  const known = error instanceof AppError;
  const status = known ? error.status : 500;
  log('request_error', { request_id: req.requestId, status, code: known ? error.code : 'internal_error' });
  return sendError(res, status, known ? error.code : 'internal_error', known ? error.message : 'Lỗi hệ thống', req.requestId);
}

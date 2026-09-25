export class AppError extends Error {
  constructor(status, code, detail) { super(detail); this.status = status; this.code = code; }
}
export function sendError(res, status, error, detail, requestId) {
  return res.status(status).json({ error, detail, request_id: requestId });
}

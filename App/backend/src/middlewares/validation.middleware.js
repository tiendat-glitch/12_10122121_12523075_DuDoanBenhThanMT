import { AppError } from '../utils/response.js';
export function validateFeatures(features, schema) {
  if (!features || typeof features !== 'object' || Array.isArray(features)) throw new AppError(400, 'invalid_input', 'features phải là object');
  const errors = [];
  for (const name of schema.features) if (!Object.hasOwn(features, name)) errors.push('Thiếu ' + name);
  for (const name of Object.keys(features)) if (!schema.features.includes(name)) errors.push('Trường không hợp lệ: ' + name);
  for (const [name, range] of Object.entries(schema.numeric_ranges)) {
    const value = features[name];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < range.min || value > range.max) errors.push(name + ' phải là số từ ' + range.min + ' đến ' + range.max);
  }
  for (const [name, allowed] of Object.entries(schema.allowed_categories)) {
    if (!allowed.includes(features[name])) errors.push(name + ' phải thuộc ' + allowed.join(', '));
  }
  if (errors.length) throw new AppError(400, 'invalid_input', errors.join('; '));
}
export function validationMiddleware(schema) {
  return (req, res, next) => {
    if (!req.body || Object.keys(req.body).some(key => key !== 'features')) throw new AppError(400, 'invalid_input', 'Body chỉ chứa features');
    validateFeatures(req.body.features, schema);
    next();
  };
}

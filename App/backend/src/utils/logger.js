export function log(event, fields = {}) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'backend', event, ...fields }));
}

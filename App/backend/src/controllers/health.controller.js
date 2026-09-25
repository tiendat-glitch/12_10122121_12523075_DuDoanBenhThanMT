export function createHealthController(config, model, database) {
  const started = performance.now();
  return async (req, res) => {
    const [ai, db] = await Promise.allSettled([model.health(req.requestId), database.ping()]);
    const aiReady = ai.status === 'fulfilled' && ai.value.status === 'ok' && ai.value.model_loaded === true;
    const dbReady = db.status === 'fulfilled' && db.value === true;
    res.status(aiReady && dbReady ? 200 : 503).json({
      status: aiReady && dbReady ? 'ok' : 'degraded', service: 'backend', port: config.port,
      uptime_seconds: Math.round((performance.now() - started) / 1000),
      ai_service_ready: aiReady, mongodb_ready: dbReady, request_id: req.requestId,
    });
  };
}

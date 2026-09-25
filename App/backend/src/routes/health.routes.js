import { Router } from 'express';
export function healthRoutes(controller) { const router = Router(); router.get('/health', controller); return router; }

import { Router } from 'express';
import { createGeminiToken } from '../controllers/ai.js';
import { aiTokenLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post('/gemini-token', aiTokenLimiter, createGeminiToken);

export default router;
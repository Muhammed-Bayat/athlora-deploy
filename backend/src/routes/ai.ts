import { Router } from 'express';
import { createGeminiToken } from '../controllers/ai.js';

const router = Router();

router.post('/gemini-token', createGeminiToken);

export default router;
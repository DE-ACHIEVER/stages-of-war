import express from 'express';
import { getGames, getGameBySlug, getLeaderboard } from '../controllers/gameController.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getGames);
router.get('/:slug', getGameBySlug);
router.get('/:slug/leaderboard', optionalAuth, getLeaderboard);

export default router;
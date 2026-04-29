// /backend/routes/matchRoutes.js
import express from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import {
    createMatch,
    getAvailableMatches,
    joinMatch,
    submitMatchResults,
    getYourMatches,
    getMatchDetails,
    submitFFAResults,
    disputeMatch,
    resolveDispute

} from '../controllers/unifiedMatchController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Match creation and discovery
router.post('/create', createMatch);
router.get('/available', getAvailableMatches);
router.get('/your-matches', getYourMatches);

// Match actions
router.post('/:matchId/join', joinMatch);
router.post('/:matchId/results', submitMatchResults);
router.get('/:matchId', getMatchDetails);
router.post('/:matchId/results-ffa', submitFFAResults);
// Dispute routes
router.post('/:matchId/dispute', disputeMatch);
router.post('/admin/disputes/:disputeId/resolve', resolveDispute);

// Admin routes (protected)
router.post('/admin/disputes/:disputeId/resolve', authenticate, requireAdmin, resolveDispute);

export default router;
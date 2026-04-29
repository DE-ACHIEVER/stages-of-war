import express from 'express';
import { 
    getDashboardStats,
    getPendingDisputes,
    resolveDispute,
    getUsers,
    toggleBan,
    getUserDetails,
    getAllTransactions,
    adjustUserBalance
} from '../controllers/adminController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate, requireAdmin); // All admin routes require admin privileges

router.get('/stats', getDashboardStats);
router.get('/disputes/pending', getPendingDisputes);
router.post('/disputes/:disputeId/resolve', resolveDispute);
router.get('/users', getUsers);
router.get('/users/:userId', getUserDetails);
router.post('/users/:userId/toggle-ban', toggleBan);
router.post('/users/:userId/adjust-balance', adjustUserBalance);
router.get('/transactions/all', getAllTransactions);

export default router;
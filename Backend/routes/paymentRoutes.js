import express from 'express';
import { 
    initializeDeposit,
    verifyTransaction,
    withdraw,
    verifyAccountName,
    getBalance,
    getTransactions,
    getBanks,
    handleWebhook
} from '../controllers/paymentController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/webhook', handleWebhook);

router.use(authenticate); // All payment routes require authentication

router.post('/deposit/initialize', initializeDeposit);
router.get('/verify/:reference', verifyTransaction);
router.get('/verify-account', verifyAccountName);
router.post('/withdraw', withdraw);
router.get('/balance', getBalance);
router.get('/transactions', getTransactions);
router.get('/banks', getBanks);

export default router;
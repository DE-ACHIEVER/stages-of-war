import express from 'express';
import { 
    register, 
    login, 
    verifyPhone, 
    resendCode, 
    logout,
    refreshToken,
    forgotPassword,
    resetPassword
} from '../controllers/authController.js';
import { registerValidation, loginValidation, validate } from '../middleware/validation.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', authLimiter, registerValidation, validate, register);
router.post('/login', authLimiter, loginValidation, validate, login);
router.post('/verify-phone', verifyPhone);
router.post('/resend-code', resendCode);
router.post('/logout', authenticate, logout);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);



export default router;

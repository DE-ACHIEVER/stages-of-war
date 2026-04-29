
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken'; // ← MISSING IMPORT
import { generateTokens } from '../middleware/auth.js';
import { validateUsername } from '../middleware/validation.js';
import db from '../config/database.js'; // Make sure this path is correct
import { config } from '../config/env.js';
import { sendVerificationSMS } from '../services/smsService.js';
import { sendMatchNotification } from '../services/notificationService.js'; // ← MISSING IMPORT
import { sendPasswordResetEmail, sendWelcomeEmail } from '../services/emailService.js'; 
import logger from '../utils/logger.js';

/**
 * Register a new user
 * - Checks for existing user
 * - Hashes password
 * - Creates verification code
 * - Sends SMS
 * - Returns success response
 */
export const register = async (req, res, next) => {
    try {
        const { username, email, phone_number, password } = req.body;

        // Validate input
        if (!username || !email || !phone_number || !password) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Check if user already exists
        const existingUser = await db.query(
            'SELECT id FROM users WHERE email = $1 OR phone_number = $2 OR username = $3',
            [email, phone_number, username]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'User with these details already exists'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, config.BCRYPT_ROUNDS || 12);

        // Generate verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const codeExpiry = new Date();
        codeExpiry.setMinutes(codeExpiry.getMinutes() + 10);

        // Start transaction
        const result = await db.transaction(async (client) => {
            // Create user
            const userResult = await client.query(
                `INSERT INTO users (username, email, phone_number, password_hash)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, username, email, phone_number`,
                [username, email, phone_number, hashedPassword]
            );

            const user = userResult.rows[0];

            // Save verification code
            await client.query(
                `INSERT INTO verification_codes (user_id, code, expires_at)
                 VALUES ($1, $2, $3)`,
                [user.id, verificationCode, codeExpiry]
            );

            return user;
        });

        // Send SMS with verification code (don't await - non-blocking)
        sendVerificationSMS(phone_number, verificationCode).catch(err => {
            logger.error('SMS sending failed:', err);
        });

        // Send welcome notification (don't await - non-blocking)
        sendMatchNotification(result.id, {
            type: 'WELCOME',
            data: {
                username: result.username
            }
        }).catch(err => {
            logger.error('Welcome notification failed:', err);
        });

        // ✅ SINGLE response at the end
        res.status(201).json({
            success: true,
            message: 'Registration successful. Please verify your phone number.',
            data: {
                userId: result.id,
                username: result.username,
                email: result.email,
                phone: result.phone_number
            }
        });

    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Registration failed',
            error: config.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Login user
 * - Find by email/phone/username
 * - Verify password
 * - Generate tokens
 * - Set cookie
 */
export const login = async (req, res, next) => {
    try {
        const { identifier, password } = req.body;

        if (!identifier || !password) {
            return res.status(400).json({
                success: false,
                message: 'Identifier and password are required'
            });
        }

        // Find user by email, phone, or username
        const user = await db.query(
            `SELECT id, username, email, phone_number, password_hash, 
                    phone_verified, is_admin, is_banned, balance
             FROM users 
             WHERE email = $1 OR phone_number = $1 OR username = $1`,
            [identifier]
        );

        if (user.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const foundUser = user.rows[0];

        // Check if banned
        if (foundUser.is_banned) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been banned'
            });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, foundUser.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Update last login
        await db.query(
            'UPDATE users SET last_login = NOW() WHERE id = $1',
            [foundUser.id]
        );

        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(foundUser.id);

        // Save refresh token
        await db.query(
            'UPDATE users SET refresh_token = $1 WHERE id = $2',
            [refreshToken, foundUser.id]
        );

        // Set cookie
        res.cookie('token', accessToken, {
            httpOnly: true,
            secure: config.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: {
                    id: foundUser.id,
                    username: foundUser.username,
                    email: foundUser.email,
                    phone: foundUser.phone_number,
                    phoneVerified: foundUser.phone_verified,
                    isAdmin: foundUser.is_admin,
                    balance: foundUser.balance
                },
                token: accessToken
            }
        });

    } catch (error) {
        logger.error('Login error:', error);
        next(error);
    }
};

/**
 * Verify phone number with code
 */
export const verifyPhone = async (req, res, next) => {
    try {
        const { identifier, code } = req.body;

        if (!identifier || !code) {
            return res.status(400).json({
                success: false,
                message: 'Identifier and code are required'
            });
        }

        // Find user by phone
        const user = await db.query(
            'SELECT id FROM users WHERE phone_number = $1',
            [identifier]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userId = user.rows[0].id;

        // Check verification code
        const verification = await db.query(
            `SELECT id, attempts, expires_at 
             FROM verification_codes 
             WHERE user_id = $1 AND code = $2 AND used_at IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            [userId, code]
        );

        if (verification.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification code'
            });
        }

        const codeData = verification.rows[0];

        // Check attempts
        if (codeData.attempts >= 3) {
            return res.status(400).json({
                success: false,
                message: 'Too many attempts. Request a new code.'
            });
        }

        // Check expiry
        if (new Date() > new Date(codeData.expires_at)) {
            return res.status(400).json({
                success: false,
                message: 'Verification code expired'
            });
        }

        // Update attempts
        await db.query(
            'UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1',
            [codeData.id]
        );

        // Mark as used and verify phone
        await db.transaction(async (client) => {
            await client.query(
                'UPDATE verification_codes SET used_at = NOW() WHERE id = $1',
                [codeData.id]
            );
            await client.query(
                'UPDATE users SET phone_verified = true WHERE id = $1',
                [userId]
            );
        });

        res.json({
            success: true,
            message: 'Phone number verified successfully'
        });

    } catch (error) {
        logger.error('Phone verification error:', error);
        next(error);
    }
};

/**
 * Resend verification code
 */
export const resendCode = async (req, res, next) => {
    try {
        const { identifier } = req.body;

        if (!identifier) {
            return res.status(400).json({
                success: false,
                message: 'Identifier is required'
            });
        }

        const user = await db.query(
            'SELECT id FROM users WHERE phone_number = $1',
            [identifier]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userId = user.rows[0].id;

        // Generate new code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const codeExpiry = new Date();
        codeExpiry.setMinutes(codeExpiry.getMinutes() + 10);

        // Save new code
        await db.query(
            `INSERT INTO verification_codes (user_id, code, expires_at)
             VALUES ($1, $2, $3)`,
            [userId, verificationCode, codeExpiry]
        );

        // Send SMS (don't await)
        sendVerificationSMS(phone, verificationCode).catch(err => {
            logger.error('SMS resend failed:', err);
        });

        res.json({
            success: true,
            message: 'Verification code resent'
        });

    } catch (error) {
        logger.error('Resend code error:', error);
        next(error);
    }
};

/**
 * Logout user
 */
export const logout = async (req, res) => {
    try {
        // Clear refresh token if user is authenticated
        if (req.user && req.user.id) {
            await db.query(
                'UPDATE users SET refresh_token = NULL WHERE id = $1',
                [req.user.id]
            );
        }

        // Clear cookie
        res.clearCookie('token');

        res.json({
            success: true,
            message: 'Logged out successfully'
        });

    } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Logout failed'
        });
    }
};

/**
 * Refresh access token
 */
export const refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: 'Refresh token required'
            });
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, config.JWT.REFRESH_SECRET);

        // Check if token exists in database
        const user = await db.query(
            'SELECT id FROM users WHERE id = $1 AND refresh_token = $2',
            [decoded.userId, refreshToken]
        );

        if (user.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        // Generate new tokens
        const tokens = generateTokens(decoded.userId);

        // Update refresh token
        await db.query(
            'UPDATE users SET refresh_token = $1 WHERE id = $2',
            [tokens.refreshToken, decoded.userId]
        );

        res.json({
            success: true,
            data: tokens
        });

    } catch (error) {
        logger.error('Refresh token error:', error);
        next(error);
    }
};

/**
 * Forgot password - send reset code
 */
export const forgotPassword = async (req, res, next) => {
    try {
        const { identifier } = req.body;

        if (!identifier) {
            return res.status(400).json({
                success: false,
                message: 'Email or phone number is required'
            });
        }

        // Find user
        const user = await db.query(
            'SELECT id, email, phone_number FROM users WHERE email = $1 OR phone_number = $1',
            [identifier]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const foundUser = user.rows[0];

        // Generate reset code
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        const codeExpiry = new Date();
        codeExpiry.setMinutes(codeExpiry.getMinutes() + 15);

        // Save reset code
        await db.query(
            `INSERT INTO verification_codes (user_id, code, purpose, expires_at)
             VALUES ($1, $2, 'PASSWORD_RESET', $3)`,
            [foundUser.id, resetCode, codeExpiry]
        );

        // Send code via SMS
       // Replace the SMS line with email
const isEmail = identifier.includes('@');

if (isEmail) {
    await sendPasswordResetEmail(foundUser.email, resetCode);
    logger.info(`📧 Reset code sent to email: ${foundUser.email}`);

} else if (foundUser.phone_number) {
    // Keep SMS for phone users
    await sendVerificationSMS(foundUser.phone_number, 
        `Your password reset code is: ${resetCode}. Valid for 15 minutes.`
    );
}
        res.json({
            success: true,
            message: 'Password reset code sent'
        });

    } catch (error) {
        logger.error('Forgot password error:', error);
        next(error);
    }
};
/**
 * Reset password with code
 */
export const resetPassword = async (req, res, next) => {
    try {
        const { identifier, code, newPassword } = req.body;

        if (!identifier || !code || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Identifier (email or phone), code, and new password are required'
            });
        }

        // Find the verification code
        const verificationQuery = `
            SELECT vc.*, u.id as user_id, u.email, u.phone_number 
            FROM verification_codes vc
            JOIN users u ON u.id = vc.user_id
            WHERE (u.email = $1 OR u.phone_number = $1) 
            AND vc.code = $2 
            AND vc.purpose = 'PASSWORD_RESET'
            AND vc.expires_at > NOW()
            AND vc.used_at IS NULL
            ORDER BY vc.created_at DESC 
            LIMIT 1
        `;
        
        const result = await db.query(verificationQuery, [identifier, code]);
        
        if (result.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset code'
            });
        }

        const verification = result.rows[0];

        // Start transaction
        await db.transaction(async (client) => {
            // Mark code as used
            await client.query(
                'UPDATE verification_codes SET used_at = NOW() WHERE id = $1',
                [verification.id]
            );

            // Hash new password
            const hashedPassword = await bcrypt.hash(newPassword, config.BCRYPT_ROUNDS || 12);

            // Update user password
            await client.query(
                'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
                [hashedPassword, verification.user_id]
            );
        });

        logger.info(`Password reset successful for user ${verification.user_id}`);

        res.json({
            success: true,
            message: 'Password reset successful'
        });

    } catch (error) {
        logger.error('Reset password error:', error);
        next(error);
    }
};
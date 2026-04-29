import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import db from '../config/database.js';
import logger from '../utils/logger.js';

export const authenticate = async (req, res, next) => {
    try {
        const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
console.log('🔐 Token received:', token ? 'Yes' : 'No');

        if (!token) {
            console.log('❌ No token provided');

            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, config.JWT.SECRET);
console.log('✅ Token decoded:', decoded);

        // Check if user still exists
        const user = await db.query(
            'SELECT id, username, email, phone_number, is_admin, is_banned FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (user.rows.length === 0) {
console.log('❌ User not found:', decoded.userId);

            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        if (user.rows[0].is_banned) {
console.log('❌ User is banned:', decoded.userId);

            return res.status(403).json({
                success: false,
                message: 'Your account has been banned'
            });
        }

        req.user = user.rows[0];
        console.log('✅ User authenticated:', req.user.id);
        
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }
        logger.error('Auth middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication error'
        });
    }
};

export const requireAdmin = (req, res, next) => {
    if (!req.user || !req.user.is_admin) {
        return res.status(403).json({
            success: false,
            message: 'Admin access required'
        });
    }
    next();
};

export const optionalAuth = async (req, res, next) => {
    try {
        const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

        if (token) {
            const decoded = jwt.verify(token, config.JWT.SECRET);
            const user = await db.query(
                'SELECT id, username FROM users WHERE id = $1',
                [decoded.userId]
            );
            if (user.rows.length > 0) {
                req.user = user.rows[0];
            }
        }
        next();
    } catch (error) {
        // Ignore auth errors for optional auth
        next();
    }
};

export const generateTokens = (userId) => {
    const accessToken = jwt.sign(
        { userId },
        config.JWT.SECRET,
        { expiresIn: config.JWT.EXPIRE }
    );

    const refreshToken = jwt.sign(
        { userId },
        config.JWT.REFRESH_SECRET,
        { expiresIn: config.JWT.REFRESH_EXPIRE }
    );

    return { accessToken, refreshToken };
};
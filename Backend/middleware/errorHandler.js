import logger from '../utils/logger.js';
import { config } from '../config/env.js';

export const errorHandler = (err, req, res, next) => {
    logger.error('❌ Error:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        body: req.body,
        user: req.user?.id
    });

    // Database errors
    if (err.code) {
        switch (err.code) {
            case '23505': // Unique violation
                return res.status(409).json({
                    success: false,
                    message: 'Duplicate entry',
                    field: err.detail
                });
            case '23503': // Foreign key violation
                return res.status(400).json({
                    success: false,
                    message: 'Referenced record not found'
                });
            case '23514': // Check violation
                return res.status(400).json({
                    success: false,
                    message: 'Data validation failed'
                });
        }
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid authentication token'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'Authentication token expired'
        });
    }

    // Validation errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: err.errors
        });
    }

    // Default error
    const status = err.status || 500;
    const message = config.NODE_ENV === 'production' && status === 500
        ? 'Internal server error'
        : err.message || 'Something went wrong';

    res.status(status).json({
        success: false,
        message,
        ...(config.NODE_ENV === 'development' && { stack: err.stack })
    });
};
import { body, validationResult } from 'express-validator';

// Username validation rules
export const validateUsername = (username) => {
    const specialCharCount = (username.match(/[!@#$%^&*_-]/g) || []).length;
    
    return (
        username.length >= 3 &&
        username.length <= 20 &&
        /^[A-Za-z0-9]/.test(username) && // Starts with letter or number
        !/[!@#$%^&*_-]{2,}/.test(username) && // No consecutive special chars
        specialCharCount <= 2 && // Max 2 special chars
        !/admin|stagesofwar|support/i.test(username) // No reserved words
    );
};

// Validation rules for registration
export const registerValidation = [
    body('username')
        .isLength({ min: 3, max: 20 })
        .withMessage('Username must be 3-20 characters')
        .custom(validateUsername)
        .withMessage('Username contains invalid characters or format')
        .trim(),
    body('email')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),
    body('phone_number')
        .matches(/^[0-9]{11,15}$/)
        .withMessage('Please provide a valid phone number'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/[A-Z]/)
        .withMessage('Password must contain at least one uppercase letter')
        .matches(/[0-9]/)
        .withMessage('Password must contain at least one number')
        .matches(/[!@#$%^&*]/)
        .withMessage('Password must contain at least one special character'),
    body('confirmPassword')
        .custom((value, { req }) => value === req.body.password)
        .withMessage('Passwords do not match')
];

// Validation rules for login
export const loginValidation = [
    body('identifier')
        .notEmpty()
        .withMessage('Email, phone, or username required')
        .trim(),
    body('password')
        .notEmpty()
        .withMessage('Password required')
];

// Validation rules for match creation
export const matchValidation = [
    body('gameId')
        .isInt()
        .withMessage('Valid game ID required'),
    body('stakeAmount')
        .isInt({ min: 100, max: 10000 })
        .withMessage('Stake must be between ₦100 and ₦10,000')
];

// Validation rules for evidence upload
export const evidenceValidation = [
    body('matchId')
        .isInt()
        .withMessage('Valid match ID required')
];

// Check validation results
export const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
    }
    next();
};
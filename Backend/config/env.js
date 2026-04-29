import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Required environment variables
const requiredEnvVars = [
    'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
    'JWT_SECRET', 'JWT_REFRESH_SECRET',
    'ADMIN_EMAIL', 'ADMIN_PASSWORD',
    'PAYSTACK_SECRET_KEY', 'PAYSTACK_PUBLIC_KEY'
];

// Check for missing required variables
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.error('\n📝 Please check your .env file');
    process.exit(1);
}

export const config = {
    // Server
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT) || 5000,
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
    BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:5000',

    // Database
    DB: {
        HOST: process.env.DB_HOST,
        PORT: parseInt(process.env.DB_PORT) || 5432,
        NAME: process.env.DB_NAME,
        USER: process.env.DB_USER,
        PASSWORD: process.env.DB_PASSWORD,
        POOL_MAX: parseInt(process.env.DB_POOL_MAX) || 20,
        POOL_IDLE: parseInt(process.env.DB_POOL_IDLE) || 10000,
    },

    // Authentication
    JWT: {
        SECRET: process.env.JWT_SECRET,
        EXPIRE: process.env.JWT_EXPIRE || '24h',
        REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
        REFRESH_EXPIRE: process.env.JWT_REFRESH_EXPIRE || '7d',
    },
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS) || 12,

    // Admin
    ADMIN: {
        USERNAME: process.env.ADMIN_USERNAME || 'STAGES_ADMIN',
        EMAIL: process.env.ADMIN_EMAIL,
        PHONE: process.env.ADMIN_PHONE,
        PASSWORD: process.env.ADMIN_PASSWORD,
    },

    // Paystack
    PAYSTACK: {
        SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
        PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY,
        WEBHOOK_SECRET: process.env.PAYSTACK_WEBHOOK_SECRET,
    },

    // SMS (AT)
AFRICASTALKING: {
    API_KEY: process.env.AFRICASTALKING_API_KEY,
    USERNAME: process.env.AFRICASTALKING_USERNAME || 'sandbox',
    SENDER_ID: process.env.AFRICASTALKING_SENDER_ID || 'STAGESOFWAR',
},

    // Email
    SMTP: {
        HOST: process.env.SMTP_HOST,
        PORT: parseInt(process.env.SMTP_PORT) || 587,
        SECURE: process.env.SMTP_SECURE === 'true',
        USER: process.env.SMTP_USER,
        PASS: process.env.SMTP_PASS,
        FROM: process.env.SMTP_FROM || 'STAGES OF WAR <notifications@stagesofwar.com>',
    },

// Add this inside your config object (where other settings are)
MAILGUN: {
    API_KEY: process.env.MAILGUN_API_KEY,
    DOMAIN: process.env.MAILGUN_DOMAIN,
    FROM: process.env.MAILGUN_FROM || 'STAGES OF WAR <noreply@stagesofwar.com>',
},

    // File Upload
    UPLOAD: {
        PATH: process.env.UPLOAD_PATH || './backend/uploads',
        MAX_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 5242880,
        ALLOWED_TYPES: process.env.ALLOWED_FILE_TYPES?.split(',') || ['image/jpeg', 'image/png', 'image/heic'],
        MAX_FILES: parseInt(process.env.MAX_FILES_PER_MATCH) || 3,
    },

    // Platform
    PLATFORM: {
        MIN_STAKE: parseInt(process.env.MIN_STAKE) || 100,
        MAX_STAKE: parseInt(process.env.MAX_STAKE) || 10000,
        COMMISSION: parseInt(process.env.COMMISSION_PERCENTAGE) || 5,
        DISPUTE_TIMER_HOURS: parseInt(process.env.DISPUTE_TIMER_HOURS) || 2,
    },

    // Security
    RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW) || 15,
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5500',
};
import bcrypt from 'bcrypt';
import db from '../../backend/config/database.js';
import { config } from '../../backend/config/env.js';
import logger from '../../backend/utils/logger.js';

async function seedAdmin() {
    try {
        logger.info('🌱 Seeding admin user...');

        const hashedPassword = await bcrypt.hash(config.ADMIN.PASSWORD, config.BCRYPT_ROUNDS);

        const result = await db.query(`
            INSERT INTO users (
                username,
                email,
                phone_number,
                phone_verified,
                password_hash,
                balance,
                is_admin,
                created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (email) DO UPDATE SET
                username = EXCLUDED.username,
                password_hash = EXCLUDED.password_hash,
                is_admin = EXCLUDED.is_admin
            RETURNING id, username, email
        `, [
            config.ADMIN.USERNAME,
            config.ADMIN.EMAIL,
            config.ADMIN.PHONE,
            true,
            hashedPassword,
            1000000.00, // ₦1,000,000 admin balance
            true
        ]);

        logger.info('✅ Admin user seeded successfully:', result.rows[0]);
        return result.rows[0];
    } catch (error) {
        logger.error('❌ Failed to seed admin user:', error);
        throw error;
    }
}

export default seedAdmin;
import db from '../../backend/config/database.js';
import logger from '../../backend/utils/logger.js';
import seedAdmin from './01_admin_user.js';

async function runSeeds() {
    try {
        logger.info('🚀 Starting database seeding...');

        // Test database connection
        await db.testConnection();

        // Run seeds in order
        await seedAdmin();

        logger.info('✅ All seeds completed successfully!');
        process.exit(0);
    } catch (error) {
        logger.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

runSeeds();
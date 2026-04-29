import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../backend/config/database.js';
import logger from '../../backend/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
    try {
        logger.info('🔄 Running database migrations...');

        // Test database connection
        await db.testConnection();

        // Read schema file
        const schemaPath = path.join(__dirname, '../schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Split into individual statements
        const statements = schema
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        logger.info(`📦 Executing ${statements.length} migration statements...`);

        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            try {
                await db.query(statements[i]);
                logger.debug(`✅ Statement ${i + 1}/${statements.length} executed`);
            } catch (error) {
                // Ignore "already exists" errors for indexes and triggers
                if (error.message.includes('already exists')) {
                    logger.debug(`⚠️ Statement ${i + 1} skipped (already exists)`);
                } else {
                    throw error;
                }
            }
        }

        logger.info('✅ Migrations completed successfully!');
        
        // Run seeds after migrations
        logger.info('🌱 Running seeds...');
        await import('../seeds/run.js');
        
    } catch (error) {
        logger.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigrations();
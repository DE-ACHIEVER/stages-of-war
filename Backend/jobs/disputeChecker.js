import cron from 'node-cron';
import db from '../config/database.js';
import logger from '../utils/logger.js';

// Run every 5 minutes
cron.schedule('*/5 * * * *', async () => {
    try {
        logger.debug('🔍 Running dispute checker...');

        // Find matches where evidence deadline has passed and no action taken
        const result = await db.query(
            `SELECT id FROM matches 
             WHERE status = 'ACTIVE' 
               AND evidence_submitted_at IS NOT NULL
               AND evidence_deadline < NOW()
               AND loser_confirmed = false
               AND dispute_raised_by IS NULL`
        );

        for (const match of result.rows) {
            await db.transaction(async (client) => {
                // Update match to disputed
                await client.query(
                    `UPDATE matches 
                     SET status = 'DISPUTED',
                         dispute_reason = 'AUTO_DISPUTE_TIMEOUT'
                     WHERE id = $1`,
                    [match.id]
                );

                // Create dispute record
                await client.query(
                    `INSERT INTO disputes (match_id, raised_by, reason, description)
                     VALUES ($1, $2, 'NO_CONFIRM', 'Loser did not respond within timeframe')`,
                    [match.id, null] // null raised_by indicates auto-dispute
                );

                logger.info(`🚨 Auto-dispute created for match ${match.id}`);
            });
        }
    } catch (error) {
        logger.error('Dispute checker error:', error);
    }
});

// Run cleanup job daily at 3 AM
cron.schedule('0 3 * * *', async () => {
    try {
        logger.info('🧹 Running cleanup job...');

        // Clean up old temp files
        import('../middleware/upload.js').then(({ cleanupTempFiles }) => {
            cleanupTempFiles();
        });

        // Archive old matches (older than 90 days)
        await db.query(
            `UPDATE matches 
             SET status = 'ARCHIVED' 
             WHERE completed_at < NOW() - INTERVAL '90 days'`
        );

        logger.info('✅ Cleanup completed');
    } catch (error) {
        logger.error('Cleanup error:', error);
    }
});
import db from '../config/database.js';
import emailService from './emailService.js';
import { sendMatchNotification as sendSMSNotification } from './smsService.js';
import logger from '../utils/logger.js';

export const sendMatchNotification = async (userId, notification) => {
    try {
        // Get user details
        const user = await db.query(
            'SELECT email, phone_number, phone_verified, username FROM users WHERE id = $1',
            [userId]
        );

        if (user.rows.length === 0) return;

        const userData = user.rows[0];

        // Send based on notification type
        switch (notification.type) {
            case 'MATCH_ACCEPTED':
                // Send email
                await emailService.sendMatchAcceptedEmail(
                    userData.email,
                    userData.username,
                    notification.data
                );
                
                // Send SMS if phone verified
                if (userData.phone_verified) {
                    await sendSMSNotification(userData.phone_number, notification);
                }
                break;

            case 'EVIDENCE_UPLOADED':
                await emailService.sendEvidenceUploadedEmail(
                    userData.email,
                    userData.username,
                    notification.data
                );
                
                if (userData.phone_verified) {
                    await sendSMSNotification(userData.phone_number, notification);
                }
                break;

            case 'MATCH_WIN':
                await emailService.sendMatchWinEmail(
                    userData.email,
                    userData.username,
                    notification.data
                );
                break;

            case 'MATCH_LOSS':
                await emailService.sendMatchLossEmail(
                    userData.email,
                    userData.username,
                    notification.data
                );
                break;

            case 'DISPUTE_RAISED':
                await emailService.sendDisputeRaisedEmail(
                    userData.email,
                    userData.username,
                    notification.data
                );
                break;

            case 'DISPUTE_RESOLVED':
                await emailService.sendDisputeResolvedEmail(
                    userData.email,
                    userData.username,
                    notification.data
                );
                break;

            case 'WELCOME':
                await emailService.sendWelcomeEmail(
                    userData.email,
                    userData.username
                );
                break;

            default:
                logger.debug(`Unhandled notification type: ${notification.type}`);
        }

        logger.debug(`✅ Notification sent to user ${userId}: ${notification.type}`);

    } catch (error) {
        logger.error('❌ Notification failed:', error);
    }
};

// Admin notifications
export const sendAdminNotification = async (notification) => {
    try {
        // Get all admin emails
        const admins = await db.query(
            "SELECT email FROM users WHERE is_admin = true"
        );

        for (const admin of admins.rows) {
            switch (notification.type) {
                case 'NEW_DISPUTE':
                    await emailService.sendNewDisputeNotification(
                        admin.email,
                        notification.data
                    );
                    break;

                case 'DAILY_REPORT':
                    await emailService.sendDailyAdminReport(
                        admin.email,
                        notification.data
                    );
                    break;
            }
        }

        logger.debug(`✅ Admin notification sent: ${notification.type}`);

    } catch (error) {
        logger.error('❌ Admin notification failed:', error);
    }
};
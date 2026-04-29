import nodemailer from 'nodemailer';// services/emailService.js
import formData from 'form-data';
import Mailgun from 'mailgun.js';
import { config } from '../config/env.js';
import logger from '../utils/logger.js';

// Initialize Mailgun
const mailgun = new Mailgun(formData);
const mg = mailgun.client({
    username: 'api',
    key: config.MAILGUN.API_KEY,
    // For EU region, uncomment next line:
    // url: 'https://api.eu.mailgun.net'
});

/**
 * Send email using Mailgun
 */
export const sendEmail = async ({ to, subject, text, html }) => {
    try {
        // For development, just log
        if (config.NODE_ENV === 'development') {
            logger.info(`📧 [DEV MODE] Email to: ${to}`);
            logger.info(`   Subject: ${subject}`);
            logger.info(`   Content: ${text || 'HTML content'}`);
            return { 
                status: 'development_mode', 
                message: 'Email logged to console',
                id: 'dev-' + Date.now()
            };
        }

        // Production - send real email
        const response = await mg.messages.create(config.MAILGUN.DOMAIN, {
            from: config.MAILGUN.FROM || `STAGES OF WAR <noreply@${config.MAILGUN.DOMAIN}>`,
            to: [to],
            subject: subject,
            text: text,
            html: html
        });

        logger.info(`✅ Email sent to ${to}:`, response);
        return response;
    } catch (error) {
        logger.error('❌ Email sending failed:', {
            message: error.message,
            status: error.status,
            details: error.details
        });
        
        // Don't throw in development - just log
        if (config.NODE_ENV === 'development') {
            logger.info('📧 [DEV MODE] Email would have been sent (simulated)');
            return { status: 'dev_mode_fallback', message: 'Email simulated' };
        }
        
        throw error;
    }
};

/**
 * Send password reset email
 */
export const sendPasswordResetEmail = async (email, resetCode) => {
    const subject = 'Password Reset - Stages of War';
    const text = `Your password reset code is: ${resetCode}. This code is valid for 15 minutes. If you didn't request this, please ignore this email.`;
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #1a1a1a; color: white; padding: 20px; text-align: center; }
                .content { padding: 30px; background: #f9f9f9; }
                .code { 
                    font-size: 32px; 
                    font-weight: bold; 
                    color: #4CAF50; 
                    text-align: center; 
                    padding: 20px;
                    background: white;
                    border-radius: 5px;
                    margin: 20px 0;
                }
                .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>STAGES OF WAR</h1>
                </div>
                <div class="content">
                    <h2>Password Reset Request</h2>
                    <p>You requested to reset your password. Use the code below:</p>
                    <div class="code">${resetCode}</div>
                    <p>This code is valid for <strong>15 minutes</strong>.</p>
                    <p>If you didn't request this, please ignore this email or contact support.</p>
                </div>
                <div class="footer">
                    <p>&copy; 2026 Stages of War. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return sendEmail({ to: email, subject, text, html });
};

/**
 * Send welcome email
 */
export const sendWelcomeEmail = async (email, username) => {
    const subject = 'Welcome to Stages of War!';
    const text = `Welcome ${username}! Get ready to compete in exciting matches and win real money.`;
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #1a1a1a; color: white; padding: 20px; text-align: center; }
                .content { padding: 30px; background: #f9f9f9; }
                .button { 
                    display: inline-block; 
                    padding: 10px 20px; 
                    background: #4CAF50; 
                    color: white; 
                    text-decoration: none; 
                    border-radius: 5px;
                }
                .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>STAGES OF WAR</h1>
                </div>
                <div class="content">
                    <h2>Welcome, ${username}!</h2>
                    <p>Thank you for joining Stages of War. Get ready to:</p>
                    <ul>
                        
                    <li>Create 1v1 matches</li>
                    <li>Create Free For All matches</li>
                        <li>Compete for real money</li>
                        <li>Climb the leaderboard</li>
                    </ul>
                    <p style="text-align: center;">
                        <a href="${config.FRONTEND_URL}/matches" class="button">Start Playing</a>
                    </p>
                </div>
                <div class="footer">
                    <p>&copy; 2026 Stages of War. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return sendEmail({ to: email, subject, text, html });
};

/**
 * Send match notification email
 */
export const sendMatchNotificationEmail = async (email, matchData) => {
    let subject, text, html;
    
    switch (matchData.type) {
        case 'MATCH_ACCEPTED':
            subject = 'Match Accepted - Stages of War';
            text = `Your match has been accepted! Log in to view details.`;
            html = `<h2>Match Accepted!</h2><p>Your match against ${matchData.opponent} has been accepted.</p>`;
            break;
        case 'EVIDENCE_UPLOADED':
            subject = 'Evidence Uploaded - Stages of War';
            text = `Evidence has been uploaded for your match. You have ${config.PLATFORM?.DISPUTE_TIMER_HOURS || 2} hours to respond.`;
            html = `<h2>Evidence Uploaded</h2><p>Evidence has been uploaded. You have ${config.PLATFORM?.DISPUTE_TIMER_HOURS || 2} hours to respond.</p>`;
            break;
        case 'DISPUTE_RESOLVED':
            subject = 'Dispute Resolved - Stages of War';
            text = `Your dispute has been resolved. Check the app for details.`;
            html = `<h2>Dispute Resolved</h2><p>Your dispute has been resolved. Check the app for the outcome.</p>`;
            break;
        default:
            subject = 'Match Update - Stages of War';
            text = `Update on your match. Please check the app.`;
            html = `<h2>Match Update</h2><p>There's an update on your match. Please check the app.</p>`;
    }
    
    return sendEmail({ to: email, subject, text, html });
};

// Export all functions
export default {
    sendEmail,
    sendPasswordResetEmail,
    sendWelcomeEmail,
    sendMatchNotificationEmail
};
// ============================================
// SMS SERVICE - Africa's Talking Integration
// ============================================
// File: /backend/services/smsService.js

import axios from 'axios';
import { config } from '../config/env.js';
import logger from '../utils/logger.js';
import https from 'https';
import africastalking from 'africastalking';

/**
 * Africa's Talking SMS Service
 * 
 * Features:
 * - High deliverability in Nigeria
 * - Automatic retry on failure
 * - Message templating
 * - Delivery reports
 * - Bulk SMS support
 * - Cost optimization
 */

class AfricaTalkingService {
    constructor() {
        this.apiKey = config.AFRICASTALKING.API_KEY;
        this.username = config.AFRICASTALKING.USERNAME;
        this.senderId = config.AFRICASTALKING.SENDER_ID || 'STAGESOFWAR';
        this.baseURL = config.AFRICASTALKING.IS_PRODUCTION 
            ? 'https://api.africastalking.com/version1/messaging'
            : 'https://api.sandbox.africastalking.com/version1/messaging';
        
        this.retryConfig = {
            maxRetries: 3,
            initialDelay: 1000,
            maxDelay: 5000
        };
        
        this.rateLimit = {
            perSecond: 10,
            perDay: 10000
        };
        
        this.requestCount = 0;
        this.lastReset = Date.now();
        
        logger.info('📱 Africa\'s Talking SMS service initialized');
    }

    /**
     * Main SMS sending method with retry logic
     */
    async sendSMS(phoneNumber, message, options = {}) {
        const {
            retryCount = 0,
            isBulk = false,
            enqueue = true,
            deliveryReport = true
        } = options;

        try {
            // Rate limiting check
            await this.checkRateLimit();

            // Format phone number (Nigeria format)
            const formattedNumber = this.formatPhoneNumber(phoneNumber);

            // Prepare request payload
            const payload = {
                username: this.username,
                to: formattedNumber,
                message: message,
                from: this.senderId,
                bulkSMSMode: isBulk,
                enqueue: enqueue,
                ...(deliveryReport && { deliveryReport: '1' })
            };

            // Log attempt
            logger.debug(`📤 Sending SMS to ${formattedNumber}`, {
                messageLength: message.length,
                retryCount
            });

            // Make API request
            const response = await axios.post(this.baseURL = `https://api.sandbox.africastalking.com/version1/messaging`, payload, {
                headers: {
                    'apiKey': this.apiKey,
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 10000, // 10 second timeout
                httpsAgent: new https.Agent({ keepAlive: true })
            });

            // Parse response
            const result = this.parseResponse(response.data);

            if (result.isSuccess) {
                logger.info(`✅ SMS sent successfully to ${formattedNumber}`, {
                    messageId: result.messageId,
                    cost: result.cost
                });
                
                // Track for billing
                this.trackUsage(formattedNumber, message.length);
                
                return {
                    success: true,
                    messageId: result.messageId,
                    cost: result.cost,
                    recipient: formattedNumber
                };
            } else {
                throw new Error(result.error || 'Unknown error');
            }

        } catch (error) {
            logger.error(`❌ SMS sending failed:`, {
                error: error.message,
                phone: phoneNumber,
                retryCount
            });

            // Retry logic
            if (retryCount < this.retryConfig.maxRetries) {
                const delay = this.calculateBackoff(retryCount);
                logger.info(`🔄 Retrying SMS in ${delay}ms (attempt ${retryCount + 1}/${this.retryConfig.maxRetries})`);
                
                await this.sleep(delay);
                return this.sendSMS(phoneNumber, message, {
                    ...options,
                    retryCount: retryCount + 1
                });
            }

            throw new Error(`SMS failed after ${retryCount} retries: ${error.message}`);
        }
    }

    /**
     * Send verification code
     */
    async sendVerificationCode(phoneNumber, code) {
        const message = this.getTemplate('verification', { code });
        return this.sendSMS(phoneNumber, message, {
            priority: 'high',
            deliveryReport: true
        });
    }

    /**
     * Send match notification
     */
    async sendMatchNotification(phoneNumber, matchData) {
        const template = this.getTemplate(matchData.type, matchData);
        return this.sendSMS(phoneNumber, template, {
            priority: 'normal'
        });
    }

    /**
     * Send bulk notifications to multiple users
     */
    async sendBulkNotifications(recipients) {
        if (!Array.isArray(recipients) || recipients.length === 0) {
            throw new Error('Invalid recipients list');
        }

        // Africa's Talking supports up to 1000 numbers per bulk request
        const batches = this.chunkArray(recipients, 1000);
        const results = [];

        for (const batch of batches) {
            try {
                const recipients = batch.map(r => r.phoneNumber).join(',');
                const message = batch[0].message; // All same message for bulk

                const result = await this.sendSMS(recipients, message, {
                    isBulk: true,
                    enqueue: true
                });

                results.push(result);

                // Delay between batches
                await this.sleep(1000);
            } catch (error) {
                logger.error('Bulk SMS batch failed:', error);
                results.push({ batch, error: error.message });
            }
        }

        return {
            success: results.every(r => r.success),
            results
        };
    }

    /**
     * Check SMS balance
     */
    async checkBalance() {
        try {
            const response = await axios.get(
                'https://api.africastalking.com/version1/user',
                {
                    headers: {
                        'apiKey': this.apiKey,
                        'Accept': 'application/json'
                    }
                }
            );

            const balance = response.data.UserData.balance;
            logger.info(`💰 SMS Balance: ${balance}`);

            return {
                balance: parseFloat(balance),
                currency: 'KES', // Africa's Talking uses KES
                lowBalance: parseFloat(balance) < 100 // Alert if below 100 KES
            };
        } catch (error) {
            logger.error('Failed to check SMS balance:', error);
            return null;
        }
    }

    /**
     * Get message templates
     */
    getTemplate(type, data) {
        const templates = {
            verification: `Your STAGES OF WAR verification code is: ${data.code}. Valid for 10 minutes. Do not share this code.`,
            
            matchAccepted: `${data.opponentName} accepted your challenge! Stake: ₦${data.stakeAmount}. Log in to submit your CODM ID.`,
            
            evidenceUploaded: `Evidence uploaded for match #${data.matchId}. You have 2 hours to respond or dispute. Log in to STAGES OF WAR.`,
            
            matchWin: `🎉 VICTORY! You won ₦${data.winnings} in match #${data.matchId}. Congratulations champion!`,
            
            matchLoss: `Match #${data.matchId} result: ${data.opponentName} won. Keep practicing, legend!`,
            
            disputeRaised: `⚠️ Dispute raised for match #${data.matchId}. Admin will review within 24 hours.`,
            
            disputeResolved: `⚖️ Dispute #${data.matchId} resolved. Check app for details.`,
            
            depositSuccess: `💰 Deposit of ₦${data.amount} successful. New balance: ₦${data.newBalance}`,
            
            withdrawalSuccess: `💸 Withdrawal of ₦${data.amount} processed. Reference: ${data.reference}`,
            
            welcome: `🎮 Welcome to STAGES OF WAR, ${data.username}! Verify your phone to start winning.`,
            
            passwordReset: `🔐 Password reset code: ${data.code}. Valid for 15 minutes.`,
            
            gameIdsReady: `🎯 Game IDs exchanged! Add ${data.opponentId} in CODM and play your match.`
        };

        return templates[type] || data.message;
    }

    /**
     * Format phone number for Africa's Talking (international format)
     */
    formatPhoneNumber(phone) {
        // Remove any non-digit characters
        let cleaned = phone.replace(/\D/g, '');

        // Nigeria numbers
        if (cleaned.startsWith('0')) {
            cleaned = '234' + cleaned.slice(1);
        } else if (cleaned.startsWith('234')) {
            // Already in correct format
        } else if (cleaned.length === 10) {
            cleaned = '234' + cleaned;
        }

        // Ensure it's a valid Nigerian number
        if (!cleaned.startsWith('234') || cleaned.length !== 13) {
            throw new Error(`Invalid Nigerian phone number: ${phone}`);
        }

        return cleaned;
    }

    /**
     * Parse Africa's Talking API response
     */
    parseResponse(data) {
        try {
            const result = {
                isSuccess: false,
                messageId: null,
                cost: null,
                error: null
            };

            if (data.SMSMessageData && data.SMSMessageData.Recipients) {
                const recipient = data.SMSMessageData.Recipients[0];
                if (recipient.status === 'Success') {
                    result.isSuccess = true;
                    result.messageId = recipient.messageId;
                    result.cost = recipient.cost;
                } else {
                    result.error = recipient.status;
                }
            } else if (data.errorMessage) {
                result.error = data.errorMessage;
            }

            return result;
        } catch (error) {
            return {
                isSuccess: false,
                error: 'Failed to parse response'
            };
        }
    }

    /**
     * Rate limiting check
     */
    async checkRateLimit() {
        const now = Date.now();
        
        // Reset counter every second
        if (now - this.lastReset > 1000) {
            this.requestCount = 0;
            this.lastReset = now;
        }

        if (this.requestCount >= this.rateLimit.perSecond) {
            const waitTime = 1000 - (now - this.lastReset);
            if (waitTime > 0) {
                logger.debug(`⏳ Rate limit reached, waiting ${waitTime}ms`);
                await this.sleep(waitTime);
                this.requestCount = 0;
                this.lastReset = Date.now();
            }
        }

        this.requestCount++;
    }

    /**
     * Track SMS usage for analytics
     */
    trackUsage(phoneNumber, messageLength) {
        // This could be saved to database for billing/analytics
        logger.debug('SMS usage tracked', {
            phone: phoneNumber,
            length: messageLength,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Calculate exponential backoff for retries
     */
    calculateBackoff(retryCount) {
        const delay = Math.min(
            this.retryConfig.initialDelay * Math.pow(2, retryCount),
            this.retryConfig.maxDelay
        );
        return delay + Math.random() * 100; // Add jitter
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Chunk array for bulk processing
     */
    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Test connection to Africa's Talking
     */
    async testConnection() {
        try {
            const balance = await this.checkBalance();
            if (balance) {
                logger.info('✅ Africa\'s Talking connection successful');
                return true;
            }
            return false;
        } catch (error) {
            logger.error('❌ Africa\'s Talking connection failed:', error);
            return false;
        }
    }

    /**
     * Get delivery report for a message
     */
    async getDeliveryReport(messageId) {
        try {
            // Africa's Talking doesn't have direct delivery report API
            // You'd need to set up a webhook endpoint to receive delivery reports
            logger.info(`Delivery report requested for ${messageId}`);
            return null;
        } catch (error) {
            logger.error('Failed to get delivery report:', error);
            return null;
        }
    }
}

// Create and export singleton instance
const smsService = new AfricaTalkingService();

// Export individual functions for backward compatibility
export const sendVerificationSMS = (phone, code) => 
    smsService.sendVerificationCode(phone, code);

export const sendMatchNotification = (phone, data) => 
    smsService.sendMatchNotification(phone, data);

export const sendBulkSMS = (recipients) => 
    smsService.sendBulkNotifications(recipients);

export const checkSMSBalance = () => 
    smsService.checkBalance();

export const testSMSConnection = () => 
    smsService.testConnection();

export default smsService;
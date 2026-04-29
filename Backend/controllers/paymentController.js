import axios from 'axios';
import { config } from '../config/env.js';
import db from '../config/database.js';
import logger from '../utils/logger.js';

export const initializeDeposit = async (req, res, next) => {
    try {
        const { amount } = req.body;
        const userId = req.user.id;

        if (amount < 100 || amount > 50000) {
            return res.status(400).json({
                success: false,
                message: 'Amount must be between ₦100 and ₦50,000'
            });
        }

        // Initialize Paystack transaction
        const response = await axios.post(
            'https://api.paystack.co/transaction/initialize',
            {
                amount: amount * 100, // Convert to kobo
                email: req.user.email,
                currency: 'NGN',
                metadata: {
                    userId,
                    purpose: 'deposit'
                },
                callback_url: `${config.FRONTEND_URL}/wallet?success=true`
            },
            {
                headers: {
                    Authorization: `Bearer ${config.PAYSTACK.SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Save transaction reference
        await db.query(
            `INSERT INTO transactions (user_id, transaction_type, amount, paystack_reference, status)
             VALUES ($1, 'DEPOSIT', $2, $3, 'PENDING')`,
            [userId, amount, response.data.data.reference]
        );

        res.json({
            success: true,
            data: {
                authorization_url: response.data.data.authorization_url,
                reference: response.data.data.reference
            }
        });
    } catch (error) {
        logger.error('Paystack initialization error:', error.response?.data || error);
        next(error);
    }
};

export const verifyTransaction = async (req, res, next) => {
    try {
        const { reference } = req.params;

        // Verify with Paystack
        const response = await axios.get(
            `https://api.paystack.co/transaction/verify/${reference}`,
            {
                headers: {
                    Authorization: `Bearer ${config.PAYSTACK.SECRET_KEY}`
                }
            }
        );

        if (response.data.data.status === 'success') {
            const { metadata, amount } = response.data.data;
            const userId = metadata.userId;
            const actualAmount = amount / 100; // Convert from kobo

            // Update transaction and user balance
            await db.transaction(async (client) => {
                // Get current balance
                const user = await client.query(
                    'SELECT balance FROM users WHERE id = $1',
                    [userId]
                );

                const balanceBefore = user.rows[0].balance;
                const balanceAfter = balanceBefore + actualAmount;

                // Update transaction
                await client.query(
                    `UPDATE transactions 
                     SET status = 'SUCCESS', 
                         balance_before = $1,
                         balance_after = $2
                     WHERE paystack_reference = $3`,
                    [balanceBefore, balanceAfter, reference]
                );

                // Update user balance
                await client.query(
                    'UPDATE users SET balance = balance + $1 WHERE id = $2',
                    [actualAmount, userId]
                );
            });

            res.json({
                success: true,
                message: 'Transaction verified successfully',
                data: {
                    amount: actualAmount
                }
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Transaction verification failed'
            });
        }
    } catch (error) {
        next(error);
    }
};

export const verifyAccountName = async (req, res, next) => {
    try {
        const { bank_code, account_number } = req.query;
        
        if (!bank_code || !account_number) {
            return res.status(400).json({
                success: false,
                message: 'Bank code and account number are required'
            });
        }
        
        // Call Paystack to resolve account name
        const response = await axios.get(
            `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
            {
                headers: {
                    Authorization: `Bearer ${config.PAYSTACK.SECRET_KEY}`
                },
                timeout: 30000
            }
        );
        
        if (response.data.status && response.data.data) {
            res.json({
                success: true,
                data: {
                    account_name: response.data.data.account_name
                }
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Could not verify account name'
            });
        }
    } catch (error) {
        logger.error('Account verification error:', error.response?.data || error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify account name'
        });
    }
};

export const withdraw = async (req, res, next) => {
    try {
        const { amount, bank_code, account_number, account_name } = req.body;
        const userId = req.user.id;

        // Check balance
        const user = await db.query(
            'SELECT balance FROM users WHERE id = $1',
            [userId]
        );

        if (user.rows[0].balance < amount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient balance'
            });
        }

        if (amount < 1000) {
            return res.status(400).json({
                success: false,
                message: 'Minimum withdrawal is ₦1,000'
            });
        }

        // ✅ FIRST: Verify the account name
        const verifyResponse = await axios.get(
            `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
            {
                headers: {
                    Authorization: `Bearer ${config.PAYSTACK.SECRET_KEY}`
                },
                timeout: 30000
            }
        );

        const verifiedName = verifyResponse.data.data.account_name;
        
        // Check if the provided account name matches Paystack's verification
        if (verifiedName.toLowerCase() !== account_name.toLowerCase()) {
            return res.status(400).json({
                success: false,
                message: `Account name mismatch. Expected: ${verifiedName}`
            });
        }

        // Create transfer recipient with verified name
        const recipientResponse = await axios.post(
            'https://api.paystack.co/transferrecipient',
            {
                type: 'nuban',
                name: verifiedName,  // ✅ Use verified name
                account_number,
                bank_code,
                currency: 'NGN'
            },
            {
                headers: {
                    Authorization: `Bearer ${config.PAYSTACK.SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        const recipientCode = recipientResponse.data.data.recipient_code;

        // Initialize transfer
        const transferResponse = await axios.post(
            'https://api.paystack.co/transfer',
            {
                source: 'balance',
                amount: amount * 100,
                recipient: recipientCode,
                reason: `STAGES OF WAR - Withdrawal to ${verifiedName}`
            },
            {
                headers: {
                    Authorization: `Bearer ${config.PAYSTACK.SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        const transferReference = transferResponse.data.data.reference;

        // Record transaction
        await db.transaction(async (client) => {
            const balanceBefore = user.rows[0].balance;
            const balanceAfter = balanceBefore - amount;

            await client.query(
                `INSERT INTO transactions 
                 (user_id, transaction_type, amount, balance_before, balance_after, 
                  paystack_reference, status, bank_details)
                 VALUES ($1, 'WITHDRAW', $2, $3, $4, $5, 'PENDING', $6)`,
                [userId, amount, balanceBefore, balanceAfter, transferReference, JSON.stringify({
                    bank_code,
                    account_number,
                    account_name: verifiedName
                })]
            );

            await client.query(
                'UPDATE users SET balance = balance - $1 WHERE id = $2',
                [amount, userId]
            );
        });

        res.json({
            success: true,
            message: 'Withdrawal initiated successfully',
            data: {
                reference: transferReference,
                amount,
                account_name: verifiedName
            }
        });
    } catch (error) {
        logger.error('Withdrawal error:', error.response?.data || error);
        next(error);
    }
};

export const getBalance = async (req, res) => {
    try {
        const user = await db.query(
            'SELECT balance FROM users WHERE id = $1',
            [req.user.id]
        );

        res.json({
            success: true,
            data: {
                balance: user.rows[0].balance
            }
        });
    } catch (error) {
        next(error);
    }
};

export const getTransactions = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        const result = await db.query(
            `SELECT * FROM transactions 
             WHERE user_id = $1 
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        const countResult = await db.query(
            'SELECT COUNT(*) FROM transactions WHERE user_id = $1',
            [userId]
        );

        res.json({
            success: true,
            data: {
                transactions: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(countResult.rows[0].count),
                    pages: Math.ceil(countResult.rows[0].count / limit)
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

export const getBanks = async (req, res, next) => {
    try {
        const response = await axios.get(
            'https://api.paystack.co/bank?country=nigeria',
            {
                headers: {
                    Authorization: `Bearer ${config.PAYSTACK.SECRET_KEY}`
                },
                timeout:60000
            }
        );

        res.json({
            success: true,
            data: response.data.data
        });
    } catch (error) {
        next(error);
    }
};

export const handleWebhook = async (req, res) => {
    try {
        const event = req.body;
        
        logger.info('Webhook received:', event.event);
        
        // Verify webhook signature (recommended for production)
        const signature = req.headers['x-paystack-signature'];
        
        // For testing, you can skip signature verification
        // if (signature !== config.PAYSTACK.WEBHOOK_SECRET) {
        //     return res.status(401).json({ message: 'Invalid signature' });
        // }
        
        switch(event.event) {
            case 'charge.success':
                const { reference, amount, metadata } = event.data;
                const userId = metadata?.userId;
                
                if (!userId) {
                    logger.error('Webhook: No userId in metadata');
                    return res.sendStatus(400);
                }
                
                // Check if transaction already processed
                const existingTx = await db.query(
                    'SELECT id FROM transactions WHERE paystack_reference = $1 AND status = $2',
                    [reference, 'SUCCESS']
                );
                
                if (existingTx.rows.length > 0) {
                    logger.info(`Webhook: Transaction ${reference} already processed`);
                    return res.sendStatus(200);
                }
                
                const actualAmount = amount / 100; // Convert from kobo to naira
                
                // Update transaction and user balance
                await db.transaction(async (client) => {
                    // Get current balance
                    const user = await client.query(
                        'SELECT balance FROM users WHERE id = $1',
                        [userId]
                    );
                    
                    const balanceBefore = parseFloat(user.rows[0].balance);
                    const balanceAfter = balanceBefore + actualAmount;
                    
                    // Update transaction
                    await client.query(
                        `UPDATE transactions 
                         SET status = 'SUCCESS', 
                             balance_before = $1,
                             balance_after = $2
                         WHERE paystack_reference = $3`,
                        [balanceBefore, balanceAfter, reference]
                    );
                    
                    // Update user balance
                    await client.query(
                        'UPDATE users SET balance = balance + $1 WHERE id = $2',
                        [actualAmount, userId]
                    );
                });
                
                logger.info(`✅ Webhook: User ${userId} credited with ₦${actualAmount}`);
                break;
                
            case 'transfer.success':
                const transferRef = event.data.reference;
                
                await db.query(
                    `UPDATE transactions 
                     SET status = 'SUCCESS' 
                     WHERE paystack_reference = $1`,
                    [transferRef]
                );
                
                logger.info(`✅ Webhook: Transfer ${transferRef} completed`);
                break;
                
            case 'transfer.failed':
                const failedRef = event.data.reference;
                
                // Refund user for failed withdrawal
                const failedTx = await db.query(
                    'SELECT user_id, amount FROM transactions WHERE paystack_reference = $1',
                    [failedRef]
                );
                
                if (failedTx.rows.length > 0) {
                    await db.query(
                        'UPDATE users SET balance = balance + $1 WHERE id = $2',
                        [failedTx.rows[0].amount, failedTx.rows[0].user_id]
                    );
                    
                    await db.query(
                        `UPDATE transactions 
                         SET status = 'FAILED' 
                         WHERE paystack_reference = $1`,
                        [failedRef]
                    );
                }
                
                logger.error(`❌ Webhook: Transfer ${failedRef} failed`);
                break;
                
            default:
                logger.info(`Webhook: Unhandled event ${event.event}`);
        }
        
        // Always return 200 to acknowledge receipt
        res.sendStatus(200);
        
    } catch (error) {
        logger.error('Webhook error:', error);
        res.sendStatus(500);
    }
};
import express from 'express';
import crypto from 'crypto';
import { config } from '../config/env.js';
import db from '../config/database.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Paystack webhook endpoint (public, no auth)
router.post('/paystack', express.raw({type: 'application/json'}), async (req, res) => {
    try {
        // Verify webhook signature
        const hash = crypto
            .createHmac('sha512', config.PAYSTACK.WEBHOOK_SECRET)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (hash !== req.headers['x-paystack-signature']) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const event = req.body;

        logger.info('Paystack webhook received:', event.event);

        // Handle different event types
        switch (event.event) {
            case 'charge.success':
                await handleChargeSuccess(event.data);
                break;
            case 'transfer.success':
                await handleTransferSuccess(event.data);
                break;
            case 'transfer.failed':
                await handleTransferFailed(event.data);
                break;
            default:
                logger.debug(`Unhandled event type: ${event.event}`);
        }

        res.sendStatus(200);
    } catch (error) {
        logger.error('Webhook error:', error);
        res.sendStatus(500);
    }
});

async function handleChargeSuccess(data) {
    const { reference, metadata, amount } = data;
    const userId = metadata.userId;
    const actualAmount = amount / 100;

    await db.transaction(async (client) => {
        const user = await client.query(
            'SELECT balance FROM users WHERE id = $1',
            [userId]
        );

        const balanceBefore = user.rows[0].balance;
        const balanceAfter = balanceBefore + actualAmount;

        await client.query(
            `UPDATE transactions 
             SET status = 'SUCCESS', 
                 balance_before = $1,
                 balance_after = $2
             WHERE paystack_reference = $3`,
            [balanceBefore, balanceAfter, reference]
        );

        await client.query(
            'UPDATE users SET balance = balance + $1 WHERE id = $2',
            [actualAmount, userId]
        );
    });
}

async function handleTransferSuccess(data) {
    const { reference } = data;

    await db.query(
        `UPDATE transactions 
         SET status = 'SUCCESS' 
         WHERE paystack_reference = $1`,
        [reference]
    );
}

async function handleTransferFailed(data) {
    const { reference } = data;

    await db.transaction(async (client) => {
        const transaction = await client.query(
            'SELECT user_id, amount FROM transactions WHERE paystack_reference = $1',
            [reference]
        );

        if (transaction.rows.length > 0) {
            const { user_id, amount } = transaction.rows[0];

            await client.query(
                `UPDATE transactions 
                 SET status = 'FAILED' 
                 WHERE paystack_reference = $1`,
                [reference]
            );

            // Refund user
            await client.query(
                'UPDATE users SET balance = balance + $1 WHERE id = $2',
                [amount, user_id]
            );
        }
    });
}

export default router;
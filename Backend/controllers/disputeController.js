import db from '../config/database.js';
import logger from '../utils/logger.js';
import { sendMatchNotification, sendAdminNotification } from '../services/notificationService.js';

/**
 * DISPUTE CONTROLLER
 * 
 * This controller handles all dispute-related functionality for players.
 * It allows users to:
 * - Raise disputes on matches
 * - View dispute status
 * - Provide additional evidence
 * - Track resolution progress
 * 
 * Disputes are critical for platform trust and fairness
 */

/**
 * Raise a new dispute on a match
 * This is called when a player disagrees with match outcome or evidence
 */
export const raiseDispute = async (req, res, next) => {
    try {
        const { matchId } = req.params;
        const { reason, description } = req.body;
        const userId = req.user.id;

        // Validate reason
        const validReasons = ['NO_CONFIRM', 'FAKE_EVIDENCE', 'WRONG_WINNER', 'TECHNICAL_ISSUE', 'OTHER'];
        if (!validReasons.includes(reason)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid dispute reason'
            });
        }

        // Check if match exists and is in disputeable state
        const match = await db.query(
            `SELECT m.*, 
                    u1.username as p1_name, u1.email as p1_email,
                    u2.username as p2_name, u2.email as p2_email,
                    g.name as game_name
             FROM matches m
             JOIN users u1 ON m.player1_id = u1.id
             JOIN users u2 ON m.player2_id = u2.id
             JOIN games g ON m.game_id = g.id
             WHERE m.id = $1 
               AND (m.player1_id = $2 OR m.player2_id = $2)
               AND m.status IN ('ACTIVE', 'PENDING')`,
            [matchId, userId]
        );

        if (match.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Match not found or cannot be disputed'
            });
        }

        const matchData = match.rows[0];

        // Check if dispute already exists for this match
        const existingDispute = await db.query(
            'SELECT id FROM disputes WHERE match_id = $1 AND resolved_at IS NULL',
            [matchId]
        );

        if (existingDispute.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'A dispute for this match is already pending'
            });
        }

        // Check if user has raised too many disputes recently (anti-fraud)
        const recentDisputes = await db.query(
            `SELECT COUNT(*) as dispute_count 
             FROM disputes d
             JOIN matches m ON d.match_id = m.id
             WHERE (m.player1_id = $1 OR m.player2_id = $1)
               AND d.created_at > NOW() - INTERVAL '7 days'`,
            [userId]
        );

        if (parseInt(recentDisputes.rows[0].dispute_count) >= 3) {
            return res.status(400).json({
                success: false,
                message: 'You have raised too many disputes recently. Please contact support.'
            });
        }

        // Create dispute
        const dispute = await db.transaction(async (client) => {
            // Update match status
            await client.query(
                `UPDATE matches 
                 SET status = 'DISPUTED',
                     dispute_raised_by = $1,
                     dispute_reason = $2
                 WHERE id = $3`,
                [userId, reason, matchId]
            );

            // Create dispute record
            const result = await client.query(
                `INSERT INTO disputes (match_id, raised_by, reason, description)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, created_at`,
                [matchId, userId, reason, description]
            );

            return result.rows[0];
        });

        // Determine opponent ID
        const opponentId = matchData.player1_id === userId 
            ? matchData.player2_id 
            : matchData.player1_id;

        // Notify opponent
        await sendMatchNotification(opponentId, {
            type: 'DISPUTE_RAISED',
            data: {
                matchId,
                reason,
                description,
                raisedBy: req.user.username
            }
        });

        // Notify admin (you)
        await sendAdminNotification({
            type: 'NEW_DISPUTE',
            data: {
                disputeId: dispute.id,
                matchId,
                game: matchData.game_name,
                player1: matchData.p1_name,
                player2: matchData.p2_name,
                raisedBy: req.user.username,
                reason,
                description,
                stake: matchData.stake_amount,
                evidenceCount: matchData.evidence_files?.length || 0,
                created
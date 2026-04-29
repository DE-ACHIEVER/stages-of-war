import db from '../config/database.js';
import logger from '../utils/logger.js';
import { sendMatchNotification } from './notificationService.js';

class MatchmakingService {
    // Find optimal opponent for a player
    async findOpponent(playerId, gameId, stakeAmount) {
        try {
            // Find players with same stake, excluding self and those already in matches
            const potentialOpponents = await db.query(
                `SELECT 
                    u.id,
                    u.username,
                    u.total_wins,
                    u.total_losses,
                    u.dispute_count,
                    COUNT(m.id) as active_matches
                 FROM users u
                 LEFT JOIN matches m ON (u.id = m.player1_id OR u.id = m.player2_id) 
                     AND m.status IN ('PENDING', 'ACTIVE')
                 WHERE u.id != $1 
                     AND u.is_banned = false
                     AND u.phone_verified = true
                     AND u.balance >= $2
                 GROUP BY u.id
                 HAVING COUNT(m.id) = 0
                 ORDER BY 
                     ABS(u.total_wins - u.total_losses) ASC, -- Similar skill level
                     u.dispute_count ASC, -- Fewer disputes better
                     RANDOM() -- Randomize if multiple matches
                 LIMIT 5`,
                [playerId, stakeAmount]
            );

            return potentialOpponents.rows;
        } catch (error) {
            logger.error('Matchmaking error:', error);
            throw error;
        }
    }

    // Auto-match players in queue
    async processMatchmakingQueue() {
        try {
            // Get all pending matches
            const pendingMatches = await db.query(
                `SELECT 
                    m.*,
                    u1.username as player1_username,
                    u1.balance as player1_balance
                 FROM matches m
                 JOIN users u1 ON m.player1_id = u1.id
                 WHERE m.status = 'PENDING'
                 ORDER BY m.created_at ASC`
            );

            for (const match of pendingMatches.rows) {
                // Find suitable opponent
                const opponents = await this.findOpponent(
                    match.player1_id,
                    match.game_id,
                    match.stake_amount
                );

                if (opponents.length > 0) {
                    // Auto-match with best opponent
                    await this.autoAcceptMatch(match.id, opponents[0].id);
                }
            }
        } catch (error) {
            logger.error('Queue processing error:', error);
        }
    }

    // Auto-accept match for user
    async autoAcceptMatch(matchId, opponentId) {
        const client = await db.getClient();
        
        try {
            await client.query('BEGIN');

            // Get match details
            const match = await client.query(
                'SELECT * FROM matches WHERE id = $1 FOR UPDATE',
                [matchId]
            );

            if (match.rows.length === 0 || match.rows[0].status !== 'PENDING') {
                throw new Error('Match not available');
            }

            const matchData = match.rows[0];

            // Check opponent balance
            const opponent = await client.query(
                'SELECT balance FROM users WHERE id = $1 FOR UPDATE',
                [opponentId]
            );

            if (opponent.rows[0].balance < matchData.stake_amount) {
                throw new Error('Opponent insufficient balance');
            }

            // Update match
            await client.query(
                `UPDATE matches 
                 SET player2_id = $1, status = 'ACTIVE', started_at = NOW()
                 WHERE id = $2`,
                [opponentId, matchId]
            );

            // Debit both players
            await client.query(
                `UPDATE users 
                 SET balance = balance - $1,
                     total_stakes = total_stakes + $1
                 WHERE id = $2 OR id = $3`,
                [matchData.stake_amount, matchData.player1_id, opponentId]
            );

            // Create transaction records
            await client.query(
                `INSERT INTO transactions (user_id, match_id, transaction_type, amount, status)
                 VALUES 
                     ($1, $2, 'STAKE', $3, 'SUCCESS'),
                     ($4, $2, 'STAKE', $3, 'SUCCESS')`,
                [matchData.player1_id, matchId, matchData.stake_amount, opponentId]
            );

            await client.query('COMMIT');

            // Send notifications
            await sendMatchNotification(matchData.player1_id, {
                type: 'MATCH_ACCEPTED',
                matchId,
                opponentId
            });

            await sendMatchNotification(opponentId, {
                type: 'MATCH_FOUND',
                matchId,
                opponentId: matchData.player1_id
            });

            logger.info(`✅ Auto-matched match ${matchId} with player ${opponentId}`);
            
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Auto-accept error:', error);
        } finally {
            client.release();
        }
    }

    // Calculate player skill rating
    async calculatePlayerRating(userId) {
        const stats = await db.query(
            `SELECT 
                COALESCE(total_wins, 0) as wins,
                COALESCE(total_losses, 0) as losses,
                COALESCE(dispute_count, 0) as disputes,
                COUNT(*) FILTER (WHERE status = 'COMPLETED') as total_matches
             FROM users u
             LEFT JOIN matches m ON (u.id = m.player1_id OR u.id = m.player2_id)
             WHERE u.id = $1
             GROUP BY u.id, u.total_wins, u.total_losses, u.dispute_count`,
            [userId]
        );

        if (stats.rows.length === 0) return 1000; // Default rating

        const { wins, losses, disputes, total_matches } = stats.rows[0];
        
        if (total_matches === 0) return 1000;

        // Simple ELO-like calculation
        const winRate = wins / total_matches;
        const disputePenalty = disputes * 50;
        
        return Math.round(1000 + (winRate * 500) - disputePenalty);
    }

    // Get match recommendations
    async getRecommendedStakes(userId) {
        const user = await db.query(
            'SELECT balance, total_wins, total_losses FROM users WHERE id = $1',
            [userId]
        );

        if (user.rows.length === 0) return [];

        const balance = user.rows[0].balance;
        const winRate = user.rows[0].total_wins + user.rows[0].total_losses > 0
            ? user.rows[0].total_wins / (user.rows[0].total_wins + user.rows[0].total_losses)
            : 0.5;

        // Recommend stakes based on balance and skill
        const recommendations = [
            { amount: 100, label: 'Entry Level', risk: 'low' },
            { amount: 500, label: 'Casual', risk: 'low' },
            { amount: 1000, label: 'Regular', risk: 'medium' },
            { amount: 5000, label: 'Pro', risk: 'medium' },
            { amount: 10000, label: 'High Roller', risk: 'high' }
        ];

        return recommendations.filter(r => r.amount <= balance * 0.5); // Don't recommend more than 50% of balance
    }
}

const matchmakingService = new MatchmakingService();
export default matchmakingService;
import db from '../config/database.js';
import logger from '../utils/logger.js';
import { sendAdminNotification } from '../services/notificationService.js';
import bcrypt from 'bcrypt';
import { config } from '../config/env.js';



export const getDashboardStats = async (req, res, next) => {
    try {
        logger.info('📊 Admin fetching dashboard stats');

        // Get current date ranges
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const thisWeek = new Date(today);
        thisWeek.setDate(thisWeek.getDate() - 7);
        const thisMonth = new Date(today);
        thisMonth.setMonth(thisMonth.getMonth() - 1);

        // Run multiple queries in parallel for performance
        const [
            userStats,
            matchStats,
            revenueStats,
            disputeStats,
            transactionStats,
            growthStats
        ] = await Promise.all([
            // User statistics
            db.query(`
                SELECT 
                    COUNT(*) as total_users,
                    COUNT(CASE WHEN phone_verified = true THEN 1 END) as verified_users,
                    COUNT(CASE WHEN created_at >= $1 THEN 1 END) as new_users_today,
                    COUNT(CASE WHEN created_at >= $2 THEN 1 END) as new_users_week,
                    COUNT(CASE WHEN is_banned = true THEN 1 END) as banned_users,
                    COALESCE(SUM(balance), 0) as total_user_balance
                FROM users
            `, [today, thisWeek]),

            // Match statistics
            db.query(`
                SELECT 
                    COUNT(*) as total_matches,
                    COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active_matches,
                    COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_matches,
                    COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_matches,
                    COUNT(CASE WHEN status = 'DISPUTED' THEN 1 END) as disputed_matches,
                    COUNT(CASE WHEN created_at >= $1 THEN 1 END) as matches_today,
                    COUNT(CASE WHEN created_at >= $2 THEN 1 END) as matches_week,
                    COALESCE(AVG(stake_amount), 0) as avg_stake,
                    COALESCE(MAX(stake_amount), 0) as max_stake
                FROM matches
            `, [today, thisWeek]),

            // Revenue statistics
            db.query(`
                SELECT 
                    COALESCE(SUM(commission), 0) as total_revenue,
                    COALESCE(SUM(stake_amount * 2), 0) as total_volume,
                    COALESCE(SUM(CASE WHEN completed_at >= $1 THEN commission END), 0) as revenue_today,
                    COALESCE(SUM(CASE WHEN completed_at >= $2 THEN commission END), 0) as revenue_week,
                    COALESCE(SUM(CASE WHEN completed_at >= $1 THEN stake_amount * 2 END), 0) as volume_today,
                    COALESCE(SUM(CASE WHEN completed_at >= $2 THEN stake_amount * 2 END), 0) as volume_week
                FROM matches
                WHERE status = 'COMPLETED'
            `, [today, thisWeek]),

            // Dispute statistics
            db.query(`
                SELECT 
                    COUNT(*) as total_disputes,
                    COUNT(CASE WHEN resolved_at IS NULL THEN 1 END) as pending_disputes,
                    COUNT(CASE WHEN created_at >= $1 THEN 1 END) as disputes_today,
                    AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600)::numeric(10,2) as avg_resolution_hours
                FROM disputes
            `, [today]),

            // Transaction statistics
            db.query(`
                SELECT 
                    COUNT(*) as total_transactions,
                    COALESCE(SUM(CASE WHEN transaction_type = 'DEPOSIT' AND status = 'SUCCESS' THEN amount END), 0) as total_deposits,
                    COALESCE(SUM(CASE WHEN transaction_type = 'WITHDRAW' AND status = 'SUCCESS' THEN amount END), 0) as total_withdrawals,
                    COALESCE(SUM(CASE WHEN transaction_type = 'WINNING' THEN amount END), 0) as total_winnings,
                    COUNT(CASE WHEN transaction_type = 'WITHDRAW' AND status = 'PENDING' THEN 1 END) as pending_withdrawals
                FROM transactions
            `),

            // Growth statistics (hourly for last 24h)
            db.query(`
                SELECT 
                    DATE_TRUNC('hour', created_at) as hour,
                    COUNT(*) as signups
                FROM users
                WHERE created_at >= NOW() - INTERVAL '24 hours'
                GROUP BY DATE_TRUNC('hour', created_at)
                ORDER BY hour DESC
            `)
        ]);

        // Calculate platform health metrics
        const disputeRate = matchStats.rows[0].completed_matches > 0 
            ? (disputeStats.rows[0].total_disputes / matchStats.rows[0].completed_matches * 100).toFixed(2)
            : 0;

        const resolutionRate = disputeStats.rows[0].total_disputes > 0
            ? ((disputeStats.rows[0].total_disputes - disputeStats.rows[0].pending_disputes) / disputeStats.rows[0].total_disputes * 100).toFixed(2)
            : 100;

        res.json({
            success: true,
            data: {
                // User metrics
                users: {
                    total: parseInt(userStats.rows[0].total_users),
                    verified: parseInt(userStats.rows[0].verified_users),
                    verificationRate: userStats.rows[0].total_users > 0 
                        ? (userStats.rows[0].verified_users / userStats.rows[0].total_users * 100).toFixed(1)
                        : 0,
                    newToday: parseInt(userStats.rows[0].new_users_today),
                    newThisWeek: parseInt(userStats.rows[0].new_users_week),
                    banned: parseInt(userStats.rows[0].banned_users),
                    totalBalance: parseFloat(userStats.rows[0].total_user_balance)
                },

                // Match metrics
                matches: {
                    total: parseInt(matchStats.rows[0].total_matches),
                    active: parseInt(matchStats.rows[0].active_matches),
                    pending: parseInt(matchStats.rows[0].pending_matches),
                    completed: parseInt(matchStats.rows[0].completed_matches),
                    disputed: parseInt(matchStats.rows[0].disputed_matches),
                    today: parseInt(matchStats.rows[0].matches_today),
                    thisWeek: parseInt(matchStats.rows[0].matches_week),
                    avgStake: parseFloat(matchStats.rows[0].avg_stake),
                    maxStake: parseFloat(matchStats.rows[0].max_stake)
                },

                // Revenue metrics
                revenue: {
                    total: parseFloat(revenueStats.rows[0].total_revenue),
                    today: parseFloat(revenueStats.rows[0].revenue_today),
                    thisWeek: parseFloat(revenueStats.rows[0].revenue_week),
                    totalVolume: parseFloat(revenueStats.rows[0].total_volume),
                    volumeToday: parseFloat(revenueStats.rows[0].volume_today),
                    volumeWeek: parseFloat(revenueStats.rows[0].volume_week),
                    commission: config.PLATFORM.COMMISSION
                },

                // Dispute metrics
                disputes: {
                    total: parseInt(disputeStats.rows[0].total_disputes),
                    pending: parseInt(disputeStats.rows[0].pending_disputes),
                    today: parseInt(disputeStats.rows[0].disputes_today),
                    disputeRate: parseFloat(disputeRate),
                    resolutionRate: parseFloat(resolutionRate),
                    avgResolutionHours: parseFloat(disputeStats.rows[0].avg_resolution_hours || 0)
                },

                // Transaction metrics
                transactions: {
                    total: parseInt(transactionStats.rows[0].total_transactions),
                    totalDeposits: parseFloat(transactionStats.rows[0].total_deposits),
                    totalWithdrawals: parseFloat(transactionStats.rows[0].total_withdrawals),
                    totalWinnings: parseFloat(transactionStats.rows[0].total_winnings),
                    pendingWithdrawals: parseInt(transactionStats.rows[0].pending_withdrawals),
                    netLiquidity: parseFloat(transactionStats.rows[0].total_deposits - transactionStats.rows[0].total_withdrawals)
                },

                // Growth trend (last 24 hours)
                hourlyGrowth: growthStats.rows.map(row => ({
                    hour: row.hour,
                    signups: parseInt(row.signups)
                })),

                // Platform health score (0-100)
                healthScore: calculateHealthScore({
                    disputeRate,
                    resolutionRate,
                    activeMatches: matchStats.rows[0].active_matches,
                    pendingDisputes: disputeStats.rows[0].pending_disputes,
                    verifiedUsers: userStats.rows[0].verified_users
                }),

                // Timestamp
                lastUpdated: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error('❌ Error fetching admin stats:', error);
        next(error);
    }
};

function calculateHealthScore({ disputeRate, resolutionRate, activeMatches, pendingDisputes, verifiedUsers }) {
    let score = 100;

    // Deduct for high dispute rate
    if (disputeRate > 10) score -= 20;
    else if (disputeRate > 5) score -= 10;

    // Deduct for low resolution rate
    if (resolutionRate < 80) score -= 20;
    else if (resolutionRate < 90) score -= 10;

    // Deduct for high pending disputes
    if (pendingDisputes > 20) score -= 20;
    else if (pendingDisputes > 10) score -= 10;

    // Bonus for high verification rate
    if (verifiedUsers > 100) score += 5;

    return Math.max(0, Math.min(100, score));
}


export const getUsers = async (req, res, next) => {
    try {
        const { 
            search = '', 
            page = 1, 
            limit = 20,
            sortBy = 'created_at',
            sortOrder = 'DESC',
            filter 
        } = req.query;

        const offset = (page - 1) * limit;
        const validSortFields = ['created_at', 'username', 'balance', 'total_wins', 'dispute_count'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
        const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Build query with filters
        let query = `
            SELECT 
                id, username, email, phone_number, phone_verified,
                balance, total_stakes, total_wins, total_losses,
                dispute_count, strike_count, is_banned, is_admin,
                created_at, last_login,
                (
                    SELECT COUNT(*) FROM matches 
                    WHERE (player1_id = users.id OR player2_id = users.id) 
                    AND status = 'ACTIVE'
                ) as active_matches
            FROM users
            WHERE 1=1
        `;
        
        const params = [];
        let paramCounter = 1;

        // Add search condition
        if (search) {
            query += ` AND (
                username ILIKE $${paramCounter} OR 
                email ILIKE $${paramCounter} OR 
                phone_number ILIKE $${paramCounter}
            )`;
            params.push(`%${search}%`);
            paramCounter++;
        }

        // Add filters
        if (filter) {
            switch (filter) {
                case 'banned':
                    query += ` AND is_banned = true`;
                    break;
                case 'unverified':
                    query += ` AND phone_verified = false`;
                    break;
                case 'high_dispute':
                    query += ` AND dispute_count > 3`;
                    break;
                case 'active':
                    query += ` AND last_login > NOW() - INTERVAL '7 days'`;
                    break;
            }
        }

        // Get total count for pagination
        const countQuery = `SELECT COUNT(*) FROM (${query}) as count_query`;
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        // Add sorting and pagination
        query += ` ORDER BY ${sortField} ${order} LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
        params.push(limit, offset);

        const result = await db.query(query, params);

        // Get additional stats for each user (wins in last 30 days)
        const userIds = result.rows.map(u => u.id);
        if (userIds.length > 0) {
            const recentStats = await db.query(`
                SELECT 
                    player_id,
                    COUNT(*) as matches_30d,
                    SUM(CASE WHEN winner_id = player_id THEN 1 ELSE 0 END) as wins_30d
                FROM (
                    SELECT player1_id as player_id, winner_id FROM matches WHERE player1_id = ANY($1) AND created_at > NOW() - INTERVAL '30 days'
                    UNION ALL
                    SELECT player2_id as player_id, winner_id FROM matches WHERE player2_id = ANY($1) AND created_at > NOW() - INTERVAL '30 days'
                ) as recent
                GROUP BY player_id
            `, [userIds]);

            // Merge recent stats
            const statsMap = new Map(recentStats.rows.map(s => [s.player_id, s]));
            result.rows.forEach(user => {
                const stats = statsMap.get(user.id);
                user.recent_form = stats ? {
                    matches: parseInt(stats.matches_30d),
                    wins: parseInt(stats.wins_30d),
                    winRate: stats.matches_30d > 0 ? ((stats.wins_30d / stats.matches_30d) * 100).toFixed(1) : 0
                } : { matches: 0, wins: 0, winRate: 0 };
            });
        }

        res.json({
            success: true,
            data: {
                users: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit),
                    hasNext: offset + limit < total,
                    hasPrev: page > 1
                },
                filters: {
                    search,
                    filter,
                    sortBy: sortField,
                    sortOrder: order
                }
            }
        });

    } catch (error) {
        logger.error('❌ Error fetching users:', error);
        next(error);
    }
};


export const getUserDetails = async (req, res, next) => {
    try {
        const { userId } = req.params;

        // Get user basic info
        const user = await db.query(
            `SELECT 
                id, username, email, phone_number, phone_verified,
                balance, total_stakes, total_wins, total_losses,
                dispute_count, strike_count, is_banned, is_admin,
                created_at, last_login,
                (
                    SELECT COUNT(*) FROM matches 
                    WHERE (player1_id = users.id OR player2_id = users.id) 
                    AND status = 'ACTIVE'
                ) as current_matches
             FROM users WHERE id = $1`,
            [userId]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = user.rows[0];

        // Get user's match history with details
        const matches = await db.query(
            `SELECT 
                m.*,
                g.name as game_name,
                CASE 
                    WHEN m.player1_id = $1 THEN 
                        (SELECT username FROM users WHERE id = m.player2_id)
                    ELSE 
                        (SELECT username FROM users WHERE id = m.player1_id)
                END as opponent_username,
                CASE 
                    WHEN m.winner_id = $1 THEN 'WIN'
                    WHEN m.status = 'COMPLETED' AND m.winner_id != $1 THEN 'LOSS'
                    ELSE m.status
                END as result,
                EXTRACT(EPOCH FROM (COALESCE(m.completed_at, NOW()) - m.created_at))/3600 as duration_hours
             FROM matches m
             JOIN games g ON m.game_id = g.id
             WHERE m.player1_id = $1 OR m.player2_id = $1
             ORDER BY m.created_at DESC
             LIMIT 50`,
            [userId]
        );

        // Get user's transaction history
        const transactions = await db.query(
            `SELECT * FROM transactions 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 100`,
            [userId]
        );

        // Get dispute history (both raised and involved)
        const disputes = await db.query(
            `SELECT 
                d.*,
                m.stake_amount,
                m.status as match_status,
                u.username as raised_by_username
             FROM disputes d
             JOIN matches m ON d.match_id = m.id
             JOIN users u ON d.raised_by = u.id
             WHERE m.player1_id = $1 OR m.player2_id = $1
             ORDER BY d.created_at DESC`,
            [userId]
        );

        // Calculate user statistics
        const totalMatches = userData.total_wins + userData.total_losses;
        const winRate = totalMatches > 0 ? (userData.total_wins / totalMatches * 100).toFixed(1) : 0;

        // Get recent activity timeline
        const activity = await db.query(
            `SELECT 
                'match' as type,
                created_at,
                CASE 
                    WHEN player1_id = $1 OR player2_id = $1 THEN 'played match'
                END as description,
                stake_amount as value
             FROM matches
             WHERE player1_id = $1 OR player2_id = $1
             
             UNION ALL
             
             SELECT 
                'transaction' as type,
                created_at,
                transaction_type as description,
                amount as value
             FROM transactions
             WHERE user_id = $1
             
             ORDER BY created_at DESC
             LIMIT 20`,
            [userId]
        );

        res.json({
            success: true,
            data: {
                user: {
                    ...userData,
                    totalMatches,
                    winRate: parseFloat(winRate),
                    reliabilityScore: calculateReliabilityScore(userData)
                },
                matches: matches.rows,
                transactions: transactions.rows,
                disputes: disputes.rows,
                activity: activity.rows,
                summary: {
                    totalStaked: userData.total_stakes,
                    netProfit: userData.total_wins * 0.9 - userData.total_losses, // 90% of wins minus losses
                    favoriteGame: getFavoriteGame(matches.rows),
                    avgMatchDuration: calculateAvgDuration(matches.rows),
                    disputeRatio: totalMatches > 0 ? (userData.dispute_count / totalMatches * 100).toFixed(2) : 0
                }
            }
        });

    } catch (error) {
        logger.error('❌ Error fetching user details:', error);
        next(error);
    }
};

function calculateReliabilityScore(user) {
    let score = 100;

    // Deduct for disputes
    score -= user.dispute_count * 10;

    // Deduct for strikes
    score -= user.strike_count * 15;

    // Bonus for verified phone
    if (user.phone_verified) score += 10;

    // Bonus for many wins
    if (user.total_wins > 100) score += 5;
    else if (user.total_wins > 50) score += 3;

    return Math.max(0, Math.min(100, score));
}

function getFavoriteGame(matches) {
    if (!matches.length) return 'None';
    const gameCounts = matches.reduce((acc, m) => {
        acc[m.game_name] = (acc[m.game_name] || 0) + 1;
        return acc;
    }, {});
    return Object.entries(gameCounts).sort((a, b) => b[1] - a[1])[0][0];
}

function calculateAvgDuration(matches) {
    const completed = matches.filter(m => m.status === 'COMPLETED' && m.duration_hours);
    if (!completed.length) return 0;
    const avg = completed.reduce((sum, m) => sum + parseFloat(m.duration_hours), 0) / completed.length;
    return avg.toFixed(1);
}

export const toggleBan = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { ban, reason } = req.body;

        // Don't allow banning yourself
        if (parseInt(userId) === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'Cannot ban yourself'
            });
        }

        // Check if user exists
        const user = await db.query(
            'SELECT username, is_admin FROM users WHERE id = $1',
            [userId]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Don't allow banning other admins
        if (user.rows[0].is_admin) {
            return res.status(400).json({
                success: false,
                message: 'Cannot ban another admin'
            });
        }

        // Update ban status
        await db.query(
            'UPDATE users SET is_banned = $1 WHERE id = $2',
            [ban, userId]
        );

        // If banning, cancel all active matches and refund stakes
        if (ban) {
            await cancelUserMatches(userId, reason);
        }

        logger.info(`👤 User ${userId} ${ban ? 'banned' : 'unbanned'} by admin ${req.user.id}. Reason: ${reason || 'No reason provided'}`);

        // Send notification to user
        await sendUserNotification(userId, {
            type: ban ? 'ACCOUNT_BANNED' : 'ACCOUNT_UNBANNED',
            reason
        });

        res.json({
            success: true,
            message: `User ${ban ? 'banned' : 'unbanned'} successfully`,
            data: {
                userId,
                banned: ban,
                reason,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error('❌ Error toggling user ban:', error);
        next(error);
    }
};


async function cancelUserMatches(userId, reason) {
    const activeMatches = await db.query(
        `SELECT * FROM matches 
         WHERE (player1_id = $1 OR player2_id = $1) 
         AND status IN ('PENDING', 'ACTIVE')`,
        [userId]
    );

    for (const match of activeMatches.rows) {
        await db.transaction(async (client) => {
            // Refund the other player
            const otherPlayerId = match.player1_id === userId ? match.player2_id : match.player1_id;
            
            if (otherPlayerId) {
                await client.query(
                    'UPDATE users SET balance = balance + $1 WHERE id = $2',
                    [match.stake_amount, otherPlayerId]
                );

                await client.query(
                    `INSERT INTO transactions (user_id, match_id, transaction_type, amount, status, metadata)
                     VALUES ($1, $2, 'REFUND', $3, 'SUCCESS', $4)`,
                    [otherPlayerId, match.id, match.stake_amount, JSON.stringify({ reason: 'admin_ban_cancellation' })]
                );
            }

            // Update match status
            await client.query(
                `UPDATE matches 
                 SET status = 'CANCELLED', 
                     admin_notes = $1,
                     completed_at = NOW()
                 WHERE id = $2`,
                [`Cancelled due to user ban: ${reason}`, match.id]
            );
        });
    }
}


export const adjustUserBalance = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { amount, reason, type = 'ADJUSTMENT' } = req.body;
        const adminId = req.user.id;

        if (!amount || !reason) {
            return res.status(400).json({
                success: false,
                message: 'Amount and reason are required'
            });
        }

        // Verify user exists
        const user = await db.query(
            'SELECT balance FROM users WHERE id = $1',
            [userId]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const balanceBefore = user.rows[0].balance;
        const balanceAfter = balanceBefore + amount;

        // Ensure balance doesn't go negative
        if (balanceAfter < 0) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient balance for this adjustment'
            });
        }

        // Perform adjustment
        await db.transaction(async (client) => {
            // Create transaction record
            await client.query(
                `INSERT INTO transactions 
                 (user_id, transaction_type, amount, balance_before, balance_after, status, metadata)
                 VALUES ($1, $2, $3, $4, $5, 'SUCCESS', $6)`,
                [userId, type, Math.abs(amount), balanceBefore, balanceAfter, 
                 JSON.stringify({ reason, adminId, adjustment: true })]
            );

            // Update user balance
            await client.query(
                'UPDATE users SET balance = balance + $1 WHERE id = $2',
                [amount, userId]
            );
        });

        logger.info(`💰 Balance adjusted for user ${userId} by ${amount > 0 ? '+' : ''}${amount}. Reason: ${reason}`);

        res.json({
            success: true,
            message: 'Balance adjusted successfully',
            data: {
                userId,
                previousBalance: balanceBefore,
                newBalance: balanceAfter,
                adjustment: amount,
                reason
            }
        });

    } catch (error) {
        logger.error('❌ Error adjusting balance:', error);
        next(error);
    }
};



export const getPendingDisputes = async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT 
                d.*,
                m.id as match_id,
                m.game_id,
                g.name as game_name,
                m.stake_amount,
                m.total_pool,
                m.commission,
                m.winner_payout,
                m.evidence_files,
                m.evidence_submitted_at,
                m.evidence_deadline,
                m.player1_id,
                m.player2_id,
                u1.username as player1_username,
                u1.phone_verified as p1_verified,
                u1.dispute_count as p1_disputes,
                u1.strike_count as p1_strikes,
                u2.username as player2_username,
                u2.phone_verified as p2_verified,
                u2.dispute_count as p2_disputes,
                u2.strike_count as p2_strikes,
                ru.username as raised_by_username,
                EXTRACT(EPOCH FROM (NOW() - d.created_at))/3600 as hours_pending
            FROM disputes d
            JOIN matches m ON d.match_id = m.id
            JOIN games g ON m.game_id = g.id
            JOIN users u1 ON m.player1_id = u1.id
            JOIN users u2 ON m.player2_id = u2.id
            JOIN users ru ON d.raised_by = ru.id
            WHERE d.resolved_at IS NULL
            ORDER BY 
                CASE 
                    WHEN m.evidence_deadline < NOW() THEN 0  -- Urgent: past deadline
                    ELSE 1 
                END,
                d.created_at ASC
        `);

        // Categorize disputes by priority
        const disputes = result.rows.map(dispute => ({
            ...dispute,
            priority: getDisputePriority(dispute),
            timeRemaining: dispute.evidence_deadline ? 
                Math.max(0, new Date(dispute.evidence_deadline) - new Date()) : null
        }));

        // Group by priority
        const grouped = {
            urgent: disputes.filter(d => d.priority === 'URGENT'),
            high: disputes.filter(d => d.priority === 'HIGH'),
            medium: disputes.filter(d => d.priority === 'MEDIUM'),
            low: disputes.filter(d => d.priority === 'LOW')
        };

        res.json({
            success: true,
            data: {
                total: disputes.length,
                byPriority: {
                    urgent: grouped.urgent.length,
                    high: grouped.high.length,
                    medium: grouped.medium.length,
                    low: grouped.low.length
                },
                disputes,
                grouped
            }
        });

    } catch (error) {
        logger.error('❌ Error fetching pending disputes:', error);
        next(error);
    }
};


function getDisputePriority(dispute) {
    // Past deadline - URGENT
    if (dispute.evidence_deadline && new Date(dispute.evidence_deadline) < new Date()) {
        return 'URGENT';
    }

    // High stake - HIGH priority
    if (dispute.stake_amount >= 5000) {
        return 'HIGH';
    }

    // Multiple disputes from same player - HIGH priority
    if (dispute.p1_disputes > 3 || dispute.p2_disputes > 3) {
        return 'HIGH';
    }

    // Pending more than 24 hours - MEDIUM
    if (dispute.hours_pending > 24) {
        return 'MEDIUM';
    }

    // Default - LOW
    return 'LOW';
}


export const resolveDispute = async (req, res, next) => {
    try {
        const { disputeId } = req.params;
        const { decision, notes, action } = req.body;
        const adminId = req.user.id;

        // Validate decision
        const validDecisions = ['PAY_WINNER', 'REFUND_BOTH', 'BAN_PLAYER'];
        if (!validDecisions.includes(decision)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid decision. Must be PAY_WINNER, REFUND_BOTH, or BAN_PLAYER'
            });
        }

        // Get dispute details with all necessary data
        const dispute = await db.query(
            `SELECT d.*, m.*, 
                    u1.username as p1_name, u1.balance as p1_balance, u1.email as p1_email,
                    u2.username as p2_name, u2.balance as p2_balance, u2.email as p2_email
             FROM disputes d
             JOIN matches m ON d.match_id = m.id
             JOIN users u1 ON m.player1_id = u1.id
             JOIN users u2 ON m.player2_id = u2.id
             WHERE d.id = $1 AND d.resolved_at IS NULL`,
            [disputeId]
        );

        if (dispute.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Dispute not found or already resolved'
            });
        }

        const disputeData = dispute.rows[0];
        
        // Log the resolution for audit
        logger.info(`⚖️ Admin ${adminId} resolving dispute ${disputeId} with decision: ${decision}`);

        // Process based on decision
        let resolution;
        switch (decision) {
            case 'PAY_WINNER':
                resolution = await resolvePayWinner(disputeData, adminId, notes);
                break;
            case 'REFUND_BOTH':
                resolution = await resolveRefundBoth(disputeData, adminId, notes);
                break;
            case 'BAN_PLAYER':
                resolution = await resolveBanPlayer(disputeData, adminId, notes);
                break;
        }

        // Update dispute record
        await db.query(
            `UPDATE disputes 
             SET admin_decision = $1, 
                 admin_notes = $2, 
                 resolved_by = $3, 
                 resolved_at = NOW(),
                 evidence_reviewed = true
             WHERE id = $4`,
            [decision, notes, adminId, disputeId]
        );

        // Notify both players of resolution
        await Promise.all([
            sendUserNotification(disputeData.player1_id, {
                type: 'DISPUTE_RESOLVED',
                data: {
                    matchId: disputeData.match_id,
                    decision,
                    notes,
                    outcome: resolution[disputeData.player1_id]
                }
            }),
            sendUserNotification(disputeData.player2_id, {
                type: 'DISPUTE_RESOLVED',
                data: {
                    matchId: disputeData.match_id,
                    decision,
                    notes,
                    outcome: resolution[disputeData.player2_id]
                }
            })
        ]);

        // If action required on player, do it
        if (action) {
            await handlePostResolutionAction(action, disputeData, adminId);
        }

        res.json({
            success: true,
            message: 'Dispute resolved successfully',
            data: {
                disputeId,
                decision,
                resolution,
                resolvedBy: adminId,
                resolvedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error('❌ Error resolving dispute:', error);
        next(error);
    }
};


async function resolvePayWinner(disputeData, adminId, notes) {
    // Determine winner (the player who didn't raise the dispute)
    const winnerId = disputeData.player1_id === disputeData.raised_by 
        ? disputeData.player2_id 
        : disputeData.player1_id;
    
    const loserId = disputeData.player1_id === winnerId 
        ? disputeData.player2_id 
        : disputeData.player1_id;

    return await db.transaction(async (client) => {
        // Update match
        await client.query(
            `UPDATE matches 
             SET status = 'COMPLETED', 
                 winner_id = $1,
                 admin_notes = $2,
                 completed_at = NOW() 
             WHERE id = $3`,
            [winnerId, notes, disputeData.match_id]
        );

        // Pay winner
        await client.query(
            `UPDATE users 
             SET balance = balance + $1,
                 total_wins = total_wins + $2
             WHERE id = $3`,
            [disputeData.winner_payout, disputeData.stake_amount * 2, winnerId]
        );

        // Record winner transaction
        await client.query(
            `INSERT INTO transactions (user_id, match_id, transaction_type, amount, balance_before, balance_after, status, metadata)
             SELECT 
                $1, $2, 'WINNING', $3,
                (SELECT balance FROM users WHERE id = $1) - $3,
                (SELECT balance FROM users WHERE id = $1),
                'SUCCESS',
                $4`,
            [winnerId, disputeData.match_id, disputeData.winner_payout, 
             JSON.stringify({ disputeResolution: true, adminId, notes })]
        );

        // Record platform commission
        await client.query(
            `INSERT INTO transactions (user_id, match_id, transaction_type, amount, status, metadata)
             VALUES (NULL, $1, 'COMMISSION', $2, 'SUCCESS', $3)`,
            [disputeData.match_id, disputeData.commission, 
             JSON.stringify({ adminId, notes, fromDispute: true })]
        );

        // Update loser stats
        await client.query(
            `UPDATE users 
             SET total_losses = total_losses + $1,
                 dispute_count = dispute_count + 1
             WHERE id = $2`,
            [disputeData.stake_amount, loserId]
        );

        logger.info(`✅ Dispute resolved: Paid winner ${winnerId} ₦${disputeData.winner_payout}`);

        return {
            [winnerId]: { outcome: 'win', amount: disputeData.winner_payout },
            [loserId]: { outcome: 'loss', amount: -disputeData.stake_amount }
        };
    });
}


async function resolveRefundBoth(disputeData, adminId, notes) {
    return await db.transaction(async (client) => {
        // Update match
        await client.query(
            `UPDATE matches 
             SET status = 'CANCELLED',
                 admin_notes = $1,
                 completed_at = NOW() 
             WHERE id = $2`,
            [notes, disputeData.match_id]
        );

        // Refund both players
        await client.query(
            `UPDATE users 
             SET balance = balance + $1 
             WHERE id = $2 OR id = $3`,
            [disputeData.stake_amount, disputeData.player1_id, disputeData.player2_id]
        );

        // Record refund transactions
        for (const playerId of [disputeData.player1_id, disputeData.player2_id]) {
            await client.query(
                `INSERT INTO transactions (user_id, match_id, transaction_type, amount, status, metadata)
                 VALUES ($1, $2, 'REFUND', $3, 'SUCCESS', $4)`,
                [playerId, disputeData.match_id, disputeData.stake_amount,
                 JSON.stringify({ disputeResolution: true, adminId, notes })]
            );
        }

        logger.info(`✅ Dispute resolved: Refunded both players ₦${disputeData.stake_amount} each`);

        return {
            [disputeData.player1_id]: { outcome: 'refund', amount: disputeData.stake_amount },
            [disputeData.player2_id]: { outcome: 'refund', amount: disputeData.stake_amount }
        };
    });
}


async function resolveBanPlayer(disputeData, adminId, notes) {
    const fraudulentPlayer = disputeData.raised_by;
    const honestPlayer = disputeData.player1_id === fraudulentPlayer 
        ? disputeData.player2_id 
        : disputeData.player1_id;

    return await db.transaction(async (client) => {
        // Ban fraudulent player
        await client.query(
            `UPDATE users 
             SET is_banned = true, 
                 strike_count = strike_count + 3,
                 dispute_count = dispute_count + 1
             WHERE id = $1`,
            [fraudulentPlayer]
        );

        // Update match
        await client.query(
            `UPDATE matches 
             SET status = 'COMPLETED', 
                 winner_id = $1,
                 admin_notes = $2,
                 completed_at = NOW() 
             WHERE id = $3`,
            [honestPlayer, notes, disputeData.match_id]
        );

        // Pay honest player
        await client.query(
            `UPDATE users 
             SET balance = balance + $1,
                 total_wins = total_wins + $2
             WHERE id = $3`,
            [disputeData.winner_payout, disputeData.stake_amount * 2, honestPlayer]
        );

        // Record transactions
        await client.query(
            `INSERT INTO transactions (user_id, match_id, transaction_type, amount, status, metadata)
             VALUES ($1, $2, 'WINNING', $3, 'SUCCESS', $4)`,
            [honestPlayer, disputeData.match_id, disputeData.winner_payout,
             JSON.stringify({ disputeResolution: true, adminId, notes, bannedPlayer: fraudulentPlayer })]
        );

        logger.info(`✅ Dispute resolved: Banned player ${fraudulentPlayer}, paid ${honestPlayer} ₦${disputeData.winner_payout}`);

        return {
            [honestPlayer]: { outcome: 'win', amount: disputeData.winner_payout },
            [fraudulentPlayer]: { outcome: 'banned', amount: 0 }
        };
    });
}

/**
 * Handle additional actions after dispute resolution
 */
async function handlePostResolutionAction(action, disputeData, adminId) {
    switch (action.type) {
        case 'WARN_USER':
            await db.query(
                `INSERT INTO user_notes (user_id, admin_id, note) VALUES ($1, $2, $3)`,
                [action.userId, adminId, action.message]
            );
            break;
        case 'ESCALATE':
            // For complex cases that need additional review
            await db.query(
                `INSERT INTO escalated_cases (dispute_id, reason, escalated_by) VALUES ($1, $2, $3)`,
                [disputeData.id, action.reason, adminId]
            );
            break;
    }
}

// ============================================
// FINANCIAL AUDIT
// ============================================

/**
 * Get all transactions with filtering and pagination
 * Essential for financial oversight and auditing
 */
export const getAllTransactions = async (req, res, next) => {
    try {
        const { 
            page = 1, 
            limit = 50,
            type,
            status,
            startDate,
            endDate,
            minAmount,
            maxAmount,
            userId,
            sortBy = 'created_at',
            sortOrder = 'DESC'
        } = req.query;

        const offset = (page - 1) * limit;
        const params = [];
        let paramCounter = 1;

        // Build query
        let query = `
            SELECT 
                t.*,
                u.username,
                u.email,
                m.id as match_id,
                g.name as game_name
            FROM transactions t
            LEFT JOIN users u ON t.user_id = u.id
            LEFT JOIN matches m ON t.match_id = m.id
            LEFT JOIN games g ON m.game_id = g.id
            WHERE 1=1
        `;

        // Apply filters
        if (type) {
            query += ` AND t.transaction_type = $${paramCounter}`;
            params.push(type);
            paramCounter++;
        }

        if (status) {
            query += ` AND t.status = $${paramCounter}`;
            params.push(status);
            paramCounter++;
        }

        if (startDate) {
            query += ` AND t.created_at >= $${paramCounter}`;
            params.push(startDate);
            paramCounter++;
        }

        if (endDate) {
            query += ` AND t.created_at <= $${paramCounter}`;
            params.push(endDate);
            paramCounter++;
        }

        if (minAmount) {
            query += ` AND t.amount >= $${paramCounter}`;
            params.push(minAmount);
            paramCounter++;
        }

        if (maxAmount) {
            query += ` AND t.amount <= $${paramCounter}`;
            params.push(maxAmount);
            paramCounter++;
        }

        if (userId) {
            query += ` AND t.user_id = $${paramCounter}`;
            params.push(userId);
            paramCounter++;
        }

        // Get total count
        const countQuery = `SELECT COUNT(*) FROM (${query}) as count_query`;
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        // Add sorting and pagination
        const validSortFields = ['created_at', 'amount', 'transaction_type', 'status'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
        const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        
        query += ` ORDER BY t.${sortField} ${order} LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
        params.push(limit, offset);

        const result = await db.query(query, params);

        // Calculate summary statistics
        const summary = await db.query(`
            SELECT 
                COUNT(*) as total_transactions,
                COALESCE(SUM(CASE WHEN transaction_type = 'DEPOSIT' AND status = 'SUCCESS' THEN amount END), 0) as total_deposits,
                COALESCE(SUM(CASE WHEN transaction_type = 'WITHDRAW' AND status = 'SUCCESS' THEN amount END), 0) as total_withdrawals,
                COALESCE(SUM(CASE WHEN transaction_type = 'WINNING' THEN amount END), 0) as total_winnings,
                COALESCE(SUM(CASE WHEN transaction_type = 'COMMISSION' THEN amount END), 0) as total_commission,
                COALESCE(AVG(CASE WHEN transaction_type = 'DEPOSIT' AND status = 'SUCCESS' THEN amount END), 0) as avg_deposit
            FROM transactions
        `);

        res.json({
            success: true,
            data: {
                transactions: result.rows,
                summary: summary.rows[0],
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit),
                    hasNext: offset + limit < total,
                    hasPrev: page > 1
                },
                filters: {
                    type, status, startDate, endDate, minAmount, maxAmount, userId,
                    sortBy: sortField,
                    sortOrder: order
                }
            }
        });

    } catch (error) {
        logger.error('❌ Error fetching transactions:', error);
        next(error);
    }
};

/**
 * Get financial summary for reporting
 */
export const getFinancialSummary = async (req, res, next) => {
    try {
        const { period = 'month' } = req.query;

        let interval;
        switch (period) {
            case 'week':
                interval = '7 days';
                break;
            case 'month':
                interval = '30 days';
                break;
            case 'year':
                interval = '12 months';
                break;
            default:
                interval = '30 days';
        }

        // Get daily breakdown
        const daily = await db.query(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as transactions,
                COALESCE(SUM(CASE WHEN transaction_type = 'DEPOSIT' AND status = 'SUCCESS' THEN amount END), 0) as deposits,
                COALESCE(SUM(CASE WHEN transaction_type = 'WITHDRAW' AND status = 'SUCCESS' THEN amount END), 0) as withdrawals,
                COALESCE(SUM(CASE WHEN transaction_type = 'WINNING' THEN amount END), 0) as winnings,
                COALESCE(SUM(CASE WHEN transaction_type = 'COMMISSION' THEN amount END), 0) as commission
            FROM transactions
            WHERE created_at >= NOW() - INTERVAL '${interval}'
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `);

        // Get top depositors
        const topDepositors = await db.query(`
            SELECT 
                u.id,
                u.username,
                COUNT(*) as deposit_count,
                SUM(t.amount) as total_deposits
            FROM transactions t
            JOIN users u ON t.user_id = u.id
            WHERE t.transaction_type = 'DEPOSIT' 
                AND t.status = 'SUCCESS'
                AND t.created_at >= NOW() - INTERVAL '${interval}'
            GROUP BY u.id, u.username
            ORDER BY total_deposits DESC
            LIMIT 10
        `);

        // Get top winners
        const topWinners = await db.query(`
            SELECT 
                u.id,
                u.username,
                COUNT(*) as win_count,
                SUM(t.amount) as total_winnings
            FROM transactions t
            JOIN users u ON t.user_id = u.id
            WHERE t.transaction_type = 'WINNING'
                AND t.created_at >= NOW() - INTERVAL '${interval}'
            GROUP BY u.id, u.username
            ORDER BY total_winnings DESC
            LIMIT 10
        `);

        res.json({
            success: true,
            data: {
                period,
                daily: daily.rows,
                topDepositors: topDepositors.rows,
                topWinners: topWinners.rows,
                totals: {
                    deposits: daily.rows.reduce((sum, d) => sum + parseFloat(d.deposits), 0),
                    withdrawals: daily.rows.reduce((sum, d) => sum + parseFloat(d.withdrawals), 0),
                    winnings: daily.rows.reduce((sum, d) => sum + parseFloat(d.winnings), 0),
                    commission: daily.rows.reduce((sum, d) => sum + parseFloat(d.commission), 0),
                    netLiquidity: daily.rows.reduce((sum, d) => sum + parseFloat(d.deposits - d.withdrawals), 0)
                }
            }
        });

    } catch (error) {
        logger.error('❌ Error fetching financial summary:', error);
        next(error);
    }
};

// ============================================
// SYSTEM SETTINGS
// ============================================

/**
 * Update platform settings (stake limits, commission, etc.)
 */
export const updateSettings = async (req, res, next) => {
    try {
        const settings = req.body;
        const adminId = req.user.id;

        // Validate settings
        if (settings.minStake && (settings.minStake < 100 || settings.minStake > 10000)) {
            return res.status(400).json({
                success: false,
                message: 'Minimum stake must be between ₦100 and ₦10,000'
            });
        }

        if (settings.maxStake && (settings.maxStake < 100 || settings.maxStake > 100000)) {
            return res.status(400).json({
                success: false,
                message: 'Maximum stake must be between ₦100 and ₦100,000'
            });
        }

        if (settings.commission && (settings.commission < 5 || settings.commission > 20)) {
            return res.status(400).json({
                success: false,
                message: 'Commission must be between 5% and 20%'
            });
        }

        // Log settings change
        logger.info(`⚙️ Admin ${adminId} updating platform settings:`, settings);

        // In a real app, you'd store these in a settings table
        // For now, we'll just log them
        await db.query(
            `INSERT INTO admin_logs (admin_id, action, details) VALUES ($1, $2, $3)`,
            [adminId, 'UPDATE_SETTINGS', JSON.stringify(settings)]
        );

        res.json({
            success: true,
            message: 'Settings updated successfully',
            data: settings
        });

    } catch (error) {
        logger.error('❌ Error updating settings:', error);
        next(error);
    }
};

/**
 * Get audit logs
 */
export const getAuditLogs = async (req, res, next) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        const result = await db.query(
            `SELECT * FROM admin_logs 
             ORDER BY created_at DESC 
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const countResult = await db.query('SELECT COUNT(*) FROM admin_logs');

        res.json({
            success: true,
            data: {
                logs: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(countResult.rows[0].count),
                    pages: Math.ceil(countResult.rows[0].count / limit)
                }
            }
        });

    } catch (error) {
        logger.error('❌ Error fetching audit logs:', error);
        next(error);
    }
};

// Helper function to send notifications to users
async function sendUserNotification(userId, notification) {
    // Import dynamically to avoid circular dependency
    const { sendMatchNotification } = await import('../services/notificationService.js');
    return sendMatchNotification(userId, notification);
}
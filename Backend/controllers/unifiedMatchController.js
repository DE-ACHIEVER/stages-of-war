// /backend/controllers/matchController.js
// COMPLETE REPLACEMENT - Unified 1v1 + FFA

import db from '../config/database.js';
import { config } from '../config/env.js';
import { sendMatchNotification } from '../services/notificationService.js';
import logger from '../utils/logger.js';
// /backend/controllers/matchController.js


const status = {
    PENDING: 1,
    ACTIVE: 2,
    COMPLETED: 3,
    CANCELLED: 4,
    DISPUTED: 5
}
// ADD these fields and update existing functions



export const createMatch = async (req, res, next) => {
    try {// Get game by name instead of ID
const { gameId, matchType, stakeAmount, inviteLink, lobbyCode } = req.body;
const userId = req.user.id;


// Validate gameId exists and is a number
if (!gameId || isNaN(parseInt(gameId))) {
    return res.status(400).json({
        success: false,
        message: 'Valid gameId is required'
    });
}

 // Validate userId
        if (!userId || isNaN(parseInt(userId))) {
            return res.status(401).json({
                success: false,
                message: 'Invalid user'
            });
        }

let parsedGameId = parseInt(gameId);
    

    // Use gameId if provided directly
    const gameResult = await db.query(
        'SELECT id FROM games WHERE id = $1',
        [parsedGameId]
    );
    
    if (gameResult.rows.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Game not found'
        });
    }


        // Validate match type
        console.log('4. Checking match type...');
        if (!['1v1', 'ffa'].includes(matchType)) {
           console.log('5. Match type validation FAILED');
            
            return res.status(400).json({
                success: false,
                message: 'Invalid match type. Must be "1v1" or "ffa"'
            });
        }
        console.log('5. Match type validation PASSED');

        // Validate stake
        console.log('6. Checking stake...');
        if (stakeAmount < 100 || stakeAmount > 10000) {
           console.log('7. Stake validation FAILED');
           
            return res.status(400).json({
                success: false,
                message: 'Stake must be between ₦100 and ₦10,000'
            });
        }
console.log('7. Stake validation PASSED');


        // ✅ Validate at least ONE method is provided
       console.log('8. Checking invite/lobby...');
        if (!inviteLink && !lobbyCode) {
            console.log('9. No invite or lobby provided');

            return res.status(400).json({
                success: false,
                message: 'You must provide either an invite link OR a lobby code from CODM'
            });
        }
console.log('9. Invite/lobby check PASSED');


        // Validate invite link format if provided
       console.log('10. Checking invite link format...');
       
        if (inviteLink && !inviteLink.startsWith('http://www.callofduty.com/')) {
           console.log('11. Invite link format FAILED:', inviteLink);
           
            return res.status(400).json({
                success: false,
                message: 'Invalid invite link. Must start with http://www.callofduty.com/'
            });
        }
        console.log('11. Invite link format PASSED');



        // Validate lobby code if provided (should be 10 digits)
       console.log('12. Checking lobby code format...');
       
        if (lobbyCode && !/^\d{10}$/.test(lobbyCode)) {
             console.log('13. Lobby code FAILED:', lobbyCode);

            return res.status(400).json({
                success: false,
                message: 'Invalid lobby code. Must be 10 digits from CODM private lobby'
            });
        
        }
console.log('13. Lobby code PASSED');

console.log('14. All validations PASSED! Creating match...');

        // Set max players based on match type
        const maxPlayers = matchType === '1v1' ? 2 : 8;
        const totalPool = stakeAmount * maxPlayers;
        const commission = totalPool * 0.10;
        const prizePool = totalPool - commission;

        // Prize distribution for FFA
        const prizeDistribution = matchType === 'ffa' ? {
            first: prizePool * 0.5,
            second: prizePool * 0.3,
            third: prizePool * 0.2,
            percentages: { first: '50%', second: '30%', third: '20%' }
        } : null;

        // Check user balance
        const user = await db.query(
            'SELECT balance FROM users WHERE id = $1',
            [userId]
        );

        if (user.rows[0].balance < stakeAmount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient balance'
            });
        }

     // Create match in transaction
const result = await db.transaction(async (client) => {
    // Insert match
    const matchResult = await client.query(
        `INSERT INTO matches (
            game_id, match_type, max_players, current_players,
            stake_amount,
            invite_link, lobby_code,
            lobby_provider, prize_distribution, status, created_by
        ) VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
            parsedGameId,                              // $1
            matchType,                           // $2
            maxPlayers,                          // $3
            stakeAmount,                         // $4
            inviteLink || null,                  // $5
            lobbyCode || null,                   // $6
            userId,                              // $7
            prizeDistribution ? JSON.stringify(prizeDistribution) : null, // $8
            '1',            // $9
            userId                               // $10
        ]
    );

            // Add creator as first player
            await client.query(
                `INSERT INTO match_players (match_id, user_id)
                 VALUES ($1, $2)`,
                [matchResult.rows[0].id, userId]
            );

            // Hold stake
            await client.query(
                `UPDATE users SET balance = balance - $1 WHERE id = $2`,
                [stakeAmount, userId]
            );

            // Record transaction
            await client.query(
                `INSERT INTO transactions (user_id, match_id, transaction_type, amount, status)
                 VALUES ($1, $2, 'MATCH_ENTRY', $3, 'PENDING')`,
                [userId, matchResult.rows[0].id, stakeAmount]
            );

            return matchResult.rows[0];

        });


        
        logger.info(`✅ ${matchType} match created: ${result.id} by user ${userId}`);

        res.status(201).json({
            success: true,
            message: `${matchType === '1v1' ? '1v1 match' : 'FFA tournament'} created successfully!`,
            data: {
                id: result.id,
                matchType: result.match_type,
                stakeAmount: result.stake_amount,
                totalPool: result.total_pool,
                inviteLink: result.invite_link,
                lobbyCode: result.lobby_code,
                spotsLeft: maxPlayers - 1,
                prizeDistribution: matchType === 'ffa' ? prizeDistribution : null
            }
        });

    } catch (error) {
        logger.error('❌ Create match error:', error);
        next(error);
    }
};

// Update getAvailableMatches to return both
export const getAvailableMatches = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { type, stake } = req.query;

        let query = `
            SELECT 
                m.*,
                u.username as creator_name,
                COUNT(mp.id) as player_count
            FROM matches m
            JOIN users u ON m.created_by = u.id
            LEFT JOIN match_players mp ON m.id = mp.match_id
            WHERE m.status = '1'
            AND m.current_players < m.max_players
            AND m.created_by != $1
        `;
        
        const params = [userId];
        let paramCount = 1;

        if (type && type !== 'all') {
            paramCount++;
            query += ` AND m.match_type = $${paramCount}`;
            params.push(type);
        }

        if (stake && stake !== 'all') {
            paramCount++;
            query += ` AND m.stake_amount = $${paramCount}`;
            params.push(parseInt(stake));
        }

        query += ` GROUP BY m.id, u.username ORDER BY m.created_at DESC`;

        const result = await db.query(query, params);

        // Format response with BOTH invite_link and lobby_code
        const matches = result.rows.map(match => ({
            id: match.id,
            match_type: match.match_type,
            stake_amount: match.stake_amount,
            total_pool: match.total_pool,
            invite_link: match.invite_link,      // Full deep link
            lobby_code: match.lobby_code,        // 10-digit code
            creator_name: match.creator_name,
            creator_id: match.created_by,
            current_players: parseInt(match.current_players),
            max_players: match.max_players,
            spots_left: match.max_players - parseInt(match.current_players),
            created_at: match.created_at,
            prize_distribution: match.prize_distribution
        }));

        res.json({
            success: true,
            data: matches,
            count: matches.length
        });

    } catch (error) {
        logger.error('❌ Get available matches error:', error);
        next(error);
    }
};

// Update joinMatch to return both methods
export const joinMatch = async (req, res, next) => {
    console.log('🔥 JOINMATCH CALLED 🔥');
    
    try {
        const { matchId } = req.params;
        const userId = req.user.id;
        
        console.log('Match ID:', matchId);
        console.log('User ID:', userId);
        
        // 1. Get match details
        const match = await db.query(
            `SELECT * FROM matches WHERE id = $1 AND status = '1'`,
            [parseInt(matchId)]
        );
        
        if (match.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Match not found or already started'
            });
        }
        
        const matchData = match.rows[0];
        console.log('Match found:', matchData.id);
        
        // 2. Check if match is full
        if (matchData.current_players >= matchData.max_players) {
            return res.status(400).json({
                success: false,
                message: 'Match is already full'
            });
        }
        
        // 3. Check if user is the creator (can't join own match)
        if (matchData.created_by === userId) {
            return res.status(400).json({
                success: false,
                message: 'You cannot join your own match'
            });
        }
        
        // 4. Check user balance
        const user = await db.query(
            'SELECT balance FROM users WHERE id = $1',
            [userId]
        );
        
        const userBalance = parseFloat(user.rows[0].balance);
        const stakeAmount = parseFloat(matchData.stake_amount);
        
        if (userBalance < stakeAmount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient balance to join'
            });
        }
        
        // 5. Remove any existing records for this user in this match (cleanup)
        await db.query(
            `DELETE FROM match_players WHERE match_id = $1 AND user_id = $2`,
            [parseInt(matchId), userId]
        );
        
        // 6. Start transaction to ensure all operations succeed together
        const result = await db.transaction(async (client) => {
            // 6a. Add player to match_players
            await client.query(
                `INSERT INTO match_players (match_id, user_id) VALUES ($1, $2)`,
                [parseInt(matchId), userId]
            );
            console.log('✓ Player added to match_players');
            
            // 6b. Update match current_players count
            await client.query(
                `UPDATE matches SET current_players = current_players + 1 WHERE id = $1`,
                [parseInt(matchId)]
            );
            console.log('✓ Match player count updated');
            
            // 6c. Deduct stake from user
            await client.query(
                `UPDATE users SET balance = balance - $1 WHERE id = $2`,
                [stakeAmount, userId]
            );
            console.log('✓ Stake deducted from user');
            
            // 6d. Record transaction
            await client.query(
                `INSERT INTO transactions (user_id, match_id, transaction_type, amount, status)
                 VALUES ($1, $2, 'MATCH_ENTRY', $3, 'PENDING')`,
                [userId, parseInt(matchId), stakeAmount]
            );
            console.log('✓ Transaction recorded');
            
            // 6e. Get updated player count to check if match is now full
            const updatedMatch = await client.query(
                `SELECT current_players, max_players FROM matches WHERE id = $1`,
                [parseInt(matchId)]
            );
            
            const newPlayerCount = updatedMatch.rows[0].current_players;
            const isNowFull = newPlayerCount >= updatedMatch.rows[0].max_players;
            
            // 6f. If match is full, update status to ACTIVE ('2')
            if (isNowFull) {
                await client.query(
                    `UPDATE matches SET status = '2' WHERE id = $1`,
                    [parseInt(matchId)]
                );
                console.log('✓ Match is now FULL and ACTIVE!');
            }
            
            return { newPlayerCount, isNowFull };
        });
        
        // 7. Calculate spots left
        const spotsLeft = matchData.max_players - result.newPlayerCount;
        
        console.log('✅ Join successful! Spots left:', spotsLeft);
        
        // 8. Return success response
        res.json({
            success: true,
            message: result.isNowFull ? 'Match is now full! Ready to play.' : 'Successfully joined the match!',
            data: {
                matchId: parseInt(matchId),
                lobbyCode: matchData.lobby_code,
                spotsLeft: spotsLeft,
                isFull: result.isNowFull,
                matchType: matchData.match_type,
                stakeAmount: stakeAmount
            }
        });
        
    } catch (error) {
        console.error('❌ Join match error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to join match: ' + error.message
        });
    }
};

// Add this function after joinMatch or at the end of your file
export const getMatchDetails = async (req, res, next) => {
    try {
        const { matchId } = req.params;
        
        console.log('Getting match details for ID:', matchId);
        
        // Only select columns that definitely exist
        const match = await db.query(
            `SELECT id, match_type, stake_amount, status, created_by, 
                    lobby_code, invite_link, current_players, max_players,
                    created_at
             FROM matches 
             WHERE id = $1`,
            [matchId]
        );
        
        if (match.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Match not found'
            });
        }
        
        const matchData = match.rows[0];
        
        // Get creator username
        const creator = await db.query(
            'SELECT username FROM users WHERE id = $1',
            [matchData.created_by]
        );
        
        matchData.creator_name = creator.rows[0]?.username || 'Unknown';
        
        res.json({
            success: true,
            data: matchData
        });
        
    } catch (error) {
        console.error('getMatchDetails error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to get match details'
        });
    }
};

export const getYourMatches = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { status, page = 1, limit = 10 } = req.query;
        
        const offset = (page - 1) * limit;
        
        // Build query based on filters (using correct status numbers)
        let statusFilter = '';
        if (status === 'active') {
            statusFilter = "AND m.status IN ('1', '2')";  // PENDING(1) or ACTIVE(2)
        } else if (status === 'completed') {
            statusFilter = "AND m.status = '3'";  // COMPLETED(3)
        }
        
        // Get matches where user is a participant (from match_players table)
        const matches = await db.query(
            `SELECT m.*, 
                    u.username as opponent_name
             FROM matches m
             JOIN match_players mp ON m.id = mp.match_id
             LEFT JOIN users u ON (
                 SELECT user_id FROM match_players 
                 WHERE match_id = m.id AND user_id != $1 LIMIT 1
             ) = u.id
             WHERE mp.user_id = $1
             ${statusFilter}
             ORDER BY m.created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );
        
        // Get total count
        const countResult = await db.query(
            `SELECT COUNT(*) 
             FROM matches m
             JOIN match_players mp ON m.id = mp.match_id
             WHERE mp.user_id = $1`,
            [userId]
        );
        
        res.json({
            success: true,
            data: {
                matches: matches.rows,
                total: parseInt(countResult.rows[0].count),
                page: parseInt(page),
                limit: parseInt(limit),
                total_pages: Math.ceil(countResult.rows[0].count / limit)
            }
        });
        
    } catch (error) {
        console.error('Get user matches error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get matches: ' + error.message
        });
    }
};

export const submitMatchResults = async (req, res, next) => {
    console.log('🔥 SUBMIT RESULTS CALLED 🔥');
    
    try {
        const { matchId } = req.params;
        const { score, screenshots } = req.body;
        const userId = req.user.id;
        
        // 1. Get match details
        const match = await db.query(
            `SELECT * FROM matches WHERE id = $1`,
            [parseInt(matchId)]
        );
        
        if (match.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Match not found'
            });
        }
        
        const matchData = match.rows[0];
        
        // 2. Get all players in this match
        const players = await db.query(
            `SELECT user_id FROM match_players WHERE match_id = $1`,
            [parseInt(matchId)]
        );
        
        const playerIds = players.rows.map(p => p.user_id);
        
        // 3. Verify user is in this match
        if (!playerIds.includes(userId)) {
            return res.status(403).json({
                success: false,
                message: 'You are not part of this match'
            });
        }
        
        // 4. Check match is active
        if (matchData.status !== '2') {
            return res.status(400).json({
                success: false,
                message: 'Match is not active'
            });
        }
        
        // 5. Winner is the user submitting
        const winnerId = userId;
        const loserId = playerIds.find(id => id !== winnerId);
        
        // 6. Calculate prize
        const stakeAmount = parseFloat(matchData.stake_amount);
        const totalPool = stakeAmount * 2;
        const prize = totalPool * 0.9;
        
        // 7. Set dispute deadline (2 hours from now)
        const disputeDeadline = new Date();
        disputeDeadline.setHours(disputeDeadline.getHours() + 2);
        
        // 8. Update match to PENDING_VERIFICATION
        await db.query(
            `UPDATE matches 
             SET status = '4',
                 winner_id = $1,
                 score = $2,
                 screenshots = $3,
                 dispute_deadline = $4,
                 completed_at = NOW()
             WHERE id = $5`,
            [winnerId, score, screenshots, disputeDeadline, parseInt(matchId)]
        );
        console.log('✓ Match results saved, dispute window opened');

// Schedule auto-payment if no dispute
setTimeout(async () => {
    const checkMatch = await db.query(
        `SELECT * FROM matches WHERE id = $1 AND status = '4'`,
        [parseInt(matchId)]
    );
    
    if (checkMatch.rows.length > 0) {
        // No dispute filed, auto-pay winner
        await db.query(
            `UPDATE users SET balance = balance + $1 WHERE id = $2`,
            [prize, winnerId]
        );
        
        await db.query(
            `UPDATE matches SET status = '3' WHERE id = $1`,
            [parseInt(matchId)]
        );
        
        await db.query(
            `UPDATE transactions 
             SET status = 'SUCCESS' 
             WHERE match_id = $1 AND transaction_type = 'WINNING'`,
            [parseInt(matchId)]
        );
        
        console.log(`✅ Auto-paid winner for match ${matchId}`);
    }
}, 2 * 60 * 60 * 1000); // 2 hours

        
        // 9. Record winning transaction (PENDING until dispute resolved)
        await db.query(
            `INSERT INTO transactions (user_id, match_id, transaction_type, amount, status)
             VALUES ($1, $2, 'WINNING', $3, 'PENDING')`,
            [winnerId, parseInt(matchId), prize]
        );
        console.log('✓ Winning transaction recorded (PENDING)');
        
        // 10. Notify loser
        console.log(`📧 Notify loser ${loserId}: Results submitted. Dispute within 2 hours.`);
        
        res.json({
            success: true,
            message: 'Results submitted! Loser has 2 hours to dispute.',
            data: {
                matchId: parseInt(matchId),
                winnerId: winnerId,
                prize: prize,
                disputeDeadline: disputeDeadline,
                status: 'PENDING_VERIFICATION'
            }
        });

        // After paying winner, update stats
// Winner stats
await db.query(
    `UPDATE users 
     SET wins = wins + 1,
         total_earnings = total_earnings + $1,
         updated_at = NOW()
     WHERE id = $2`,
    [prize, winnerId]
);

// Loser stats
await db.query(
    `UPDATE users 
     SET losses = losses + 1,
         updated_at = NOW()
     WHERE id = $1`,
    [loserId]
);
        
    } catch (error) {
        console.error('❌ Submit results error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit results: ' + error.message
        });
    }
};

export const submitFFAResults = async (req, res) => {
    try {
        const { matchId } = req.params;
        const { rankings, scores, screenshot_url } = req.body;
        const userId = req.user.id;
        
        // Get match details
        const match = await db.query('SELECT * FROM matches WHERE id = $1', [matchId]);
        if (match.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Match not found' });
        }
        
        const matchData = match.rows[0];
        const stake = parseFloat(matchData.stake_amount);
        const totalPool = stake * matchData.max_players;
        const prizePool = totalPool * 0.9;
        
        const prizes = {
            [rankings[0]]: prizePool * 0.5,  // 1st place - 50%
            [rankings[1]]: prizePool * 0.3,  // 2nd place - 30%
            [rankings[2]]: prizePool * 0.2   // 3rd place - 20%
        };
        
        // Pay winners
        for (const [winnerId, amount] of Object.entries(prizes)) {
            await db.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount, winnerId]);
            await db.query(
                `INSERT INTO transactions (user_id, match_id, transaction_type, amount, status)
                 VALUES ($1, $2, 'WINNING', $3, 'SUCCESS')`,
                [winnerId, matchId, amount]
            );
        }
        
        // Update match status
        await db.query(
            `UPDATE matches SET status = '3', winner_id = $1, completed_at = NOW() WHERE id = $2`,
            [rankings[0], matchId]
        );
        
        res.json({ success: true, message: 'FFA results submitted' });
        
    } catch (error) {
        console.error('FFA submit error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};


export const disputeMatch = async (req, res, next) => {
    console.log('🔥 DISPUTE MATCH CALLED 🔥');
    
    try {
        const { matchId } = req.params;
        const { reason, evidence } = req.body;
        const userId = req.user.id;
        
        // 1. Get match details
        const match = await db.query(
            `SELECT * FROM matches WHERE id = $1`,
            [parseInt(matchId)]
        );
        
        if (match.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Match not found'
            });
        }
        
        const matchData = match.rows[0];
        
        // 2. Check if user is the loser
        const players = await db.query(
            `SELECT user_id FROM match_players WHERE match_id = $1`,
            [parseInt(matchId)]
        );
        
        const playerIds = players.rows.map(p => p.user_id);
        
        if (!playerIds.includes(userId)) {
            return res.status(403).json({
                success: false,
                message: 'You are not part of this match'
            });
        }
        
        // 3. Check if user is the winner (can't dispute if you won)
        if (matchData.winner_id === userId) {
            return res.status(400).json({
                success: false,
                message: 'Winner cannot dispute a match'
            });
        }
        
        // 4. Check if match is in dispute window
        const now = new Date();
        const deadline = new Date(matchData.dispute_deadline);
        
        if (now > deadline) {
            return res.status(400).json({
                success: false,
                message: 'Dispute window has expired (2 hours)'
            });
        }
        
        // 5. Check if already disputed
        const existingDispute = await db.query(
            `SELECT * FROM disputes WHERE match_id = $1`,
            [parseInt(matchId)]
        );
        
        if (existingDispute.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'A dispute has already been filed for this match'
            });
        }
        
        // 6. Create dispute record
        await db.query(
            `INSERT INTO disputes (match_id, raised_by, reason, evidence, status)
             VALUES ($1, $2, $3, $4, 'PENDING')`,
            [parseInt(matchId), userId, reason, evidence]
        );
        
        // 7. Update match status to DISPUTED
        await db.query(
            `UPDATE matches SET status = '5' WHERE id = $1`,
            [parseInt(matchId)]
        );
        
        console.log(`✅ Dispute created for match ${matchId} by user ${userId}`);
        
        res.json({
            success: true,
            message: 'Dispute filed successfully! Admin will review.',
            data: {
                matchId: parseInt(matchId),
                status: 'DISPUTED',
                adminWillReview: true
            }
        });
        
    } catch (error) {
        console.error('❌ Dispute match error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to file dispute: ' + error.message
        });
    }
};

export const resolveDispute = async (req, res, next) => {
    console.log('🔥 RESOLVE DISPUTE CALLED 🔥');
    
    try {
        const { disputeId } = req.params;
        const { resolution, adminNotes } = req.body;
        const adminId = req.user.id; // Should be admin only
        
        // 1. Get dispute details
        const dispute = await db.query(
            `SELECT * FROM disputes WHERE id = $1`,
            [parseInt(disputeId)]
        );
        
        if (dispute.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Dispute not found'
            });
        }
        
        const disputeData = dispute.rows[0];
        const matchId = disputeData.match_id;
        
        // 2. Get match details
        const match = await db.query(
            `SELECT * FROM matches WHERE id = $1`,
            [matchId]
        );
        
        const matchData = match.rows[0];
        
        // 3. Get players
        const players = await db.query(
            `SELECT user_id FROM match_players WHERE match_id = $1`,
            [matchId]
        );
        
        const playerIds = players.rows.map(p => p.user_id);
        
        let winnerId = null;
        let prize = 0;
        
        // 4. Handle resolution
        if (resolution === 'AWARD_WINNER') {
            winnerId = matchData.winner_id;
            const stakeAmount = parseFloat(matchData.stake_amount);
            prize = (stakeAmount * 2) * 0.9;
            
            // Pay winner
            await db.query(
                `UPDATE users SET balance = balance + $1 WHERE id = $2`,
                [prize, winnerId]
            );
            
            // Update transaction
            await db.query(
                `UPDATE transactions 
                 SET status = 'SUCCESS' 
                 WHERE match_id = $1 AND transaction_type = 'WINNING'`,
                [matchId]
            );
            
        } else if (resolution === 'REFUND_BOTH') {
            // Refund both players
            for (const playerId of playerIds) {
                await db.query(
                    `UPDATE users SET balance = balance + $1 WHERE id = $2`,
                    [matchData.stake_amount, playerId]
                );
            }
            
            // Cancel winning transaction
            await db.query(
                `UPDATE transactions 
                 SET status = 'FAILED' 
                 WHERE match_id = $1 AND transaction_type = 'WINNING'`,
                [matchId]
            );
            
        } else if (resolution === 'CANCEL_MATCH') {
            // No refunds, match cancelled
        }
        
        // 5. Update dispute status
        await db.query(
            `UPDATE disputes 
             SET status = 'RESOLVED',
                 admin_notes = $1,
                 resolved_by = $2,
                 resolved_at = NOW()
             WHERE id = $3`,
            [adminNotes, adminId, disputeId]
        );
        
        // 6. Update match status
        await db.query(
            `UPDATE matches 
             SET status = '3' 
             WHERE id = $1`,
            [matchId]
        );
        
        res.json({
            success: true,
            message: 'Dispute resolved successfully',
            data: {
                disputeId: parseInt(disputeId),
                resolution: resolution,
                winnerId: winnerId,
                prize: prize
            }
        });
        
    } catch (error) {
        console.error('❌ Resolve dispute error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to resolve dispute: ' + error.message
        });
    }
};

export const getMatchHistory = async (req, res, next) => {
    console.log('🔥 GET MATCH HISTORY CALLED 🔥');
    
    try {
        const userId = req.user.id;
        const { page = 1, limit = 10, status } = req.query;
        
        const offset = (page - 1) * limit;
        
        // Build query
        let query = `
            SELECT 
                m.id,
                m.match_type,
                m.stake_amount,
                m.winner_id,
                m.score,
                m.screenshots,
                m.completed_at,
                m.created_at,
                m.status,
                CASE 
                    WHEN m.winner_id = $1 THEN 'WIN'
                    ELSE 'LOSS'
                END as result,
                u.username as opponent_name,
                u.id as opponent_id
            FROM matches m
            JOIN match_players mp ON m.id = mp.match_id
            JOIN users u ON u.id = (
                SELECT user_id FROM match_players 
                WHERE match_id = m.id AND user_id != $1 LIMIT 1
            )
            WHERE mp.user_id = $1
            AND m.status = '3'
        `;
        
        const params = [userId];
        let paramCount = 1;
        
        if (status && status !== 'all') {
            paramCount++;
            query += ` AND m.status = $${paramCount}`;
            params.push(status);
        }
        
        query += ` ORDER BY m.completed_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
        params.push(limit, offset);
        
        const matches = await db.query(query, params);
        
        // Get total count
        const countResult = await db.query(
            `SELECT COUNT(*) 
             FROM matches m
             JOIN match_players mp ON m.id = mp.match_id
             WHERE mp.user_id = $1 AND m.status = '3'`,
            [userId]
        );
        
        // Get user stats
        const userStats = await db.query(
            `SELECT wins, losses, total_earnings, total_staked, balance
             FROM users WHERE id = $1`,
            [userId]
        );
        
        res.json({
            success: true,
            data: {
                matches: matches.rows,
                stats: userStats.rows[0],
                pagination: {
                    total: parseInt(countResult.rows[0].count),
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(countResult.rows[0].count / limit)
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Get match history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get match history: ' + error.message
        });
    }
};

export const getUserStats = async (req, res, next) => {
    console.log('🔥 GET USER STATS CALLED 🔥');
    
    try {
        const { userId } = req.params;
        
        const userStats = await db.query(
            `SELECT 
                id,
                username,
                balance,
                wins,
                losses,
                total_earnings,
                total_staked,
                CASE 
                    WHEN (wins + losses) > 0 
                    THEN (wins * 100.0 / (wins + losses))
                    ELSE 0
                END as win_rate
             FROM users 
             WHERE id = $1`,
            [userId]
        );
        
        if (userStats.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        res.json({
            success: true,
            data: userStats.rows[0]
        });
        
    } catch (error) {
        console.error('Get user stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user stats: ' + error.message
        });
    }
};
export const getLeaderboard = async (req, res, next) => {
    console.log('🔥 GET LEADERBOARD CALLED 🔥');
    
    try {
        const { type = 'wins', limit = 10 } = req.query;
        
        let orderBy = 'wins DESC';
        if (type === 'earnings') orderBy = 'total_earnings DESC';
        if (type === 'winrate') orderBy = '(wins * 100.0 / NULLIF(wins + losses, 0)) DESC';
        
        const leaderboard = await db.query(
            `SELECT 
                id,
                username,
                wins,
                losses,
                total_earnings,
                total_staked,
                CASE 
                    WHEN (wins + losses) > 0 
                    THEN (wins * 100.0 / (wins + losses))
                    ELSE 0
                END as win_rate
             FROM users
             WHERE wins > 0 OR losses > 0
             ORDER BY ${orderBy}
             LIMIT $1`,
            [limit]
        );
        
        res.json({
            success: true,
            data: {
                type: type,
                leaderboard: leaderboard.rows
            }
        });
        
    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get leaderboard: ' + error.message
        });
    }
};


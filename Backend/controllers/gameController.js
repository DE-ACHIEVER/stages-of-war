import db from '../config/database.js';

export const getGames = async (req, res, next) => {
    try {
        const result = await db.query(
            'SELECT id, name, slug, description, icon_url, is_active FROM games WHERE is_active = true ORDER BY name'
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        next(error);
    }
};

export const getGameBySlug = async (req, res, next) => {
    try {
        const { slug } = req.params;

        const result = await db.query(
            'SELECT id, name, slug, description, icon_url FROM games WHERE slug = $1 AND is_active = true',
            [slug]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        next(error);
    }
};

export const getLeaderboard = async (req, res, next) => {
    try {
        const { slug } = req.params;

        // Get game ID
        const game = await db.query(
            'SELECT id FROM games WHERE slug = $1',
            [slug]
        );

        if (game.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        const gameId = game.rows[0].id;

        // Get top players for this game
        const result = await db.query(
            `SELECT 
                u.id,
                u.username,
                COUNT(m.id) as matches_played,
                SUM(CASE WHEN m.winner_id = u.id THEN 1 ELSE 0 END) as wins,
                SUM(m.stake_amount * 2 * 0.9) as total_winnings
             FROM users u
             JOIN matches m ON (u.id = m.player1_id OR u.id = m.player2_id)
             WHERE m.game_id = $1 AND m.status = 'COMPLETED'
             GROUP BY u.id
             ORDER BY wins DESC, total_winnings DESC
             LIMIT 50`,
            [gameId]
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        next(error);
    }
};

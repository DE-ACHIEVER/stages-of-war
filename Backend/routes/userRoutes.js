import express from 'express';
import { authenticate } from '../middleware/auth.js';
import db from '../config/database.js';
import { 
    getMatchHistory,
    getUserStats,
    getLeaderboard
} from '../controllers/unifiedMatchController.js';

const router = express.Router();

router.use(authenticate);

router.get('/profile', async (req, res) => {
    const user = await db.query(
        `SELECT id, username, email, phone_number, phone_verified,
                balance, total_stakes, total_wins, total_losses,
                dispute_count, created_at
         FROM users WHERE id = $1`,
        [req.user.id]
    );

    res.json({
        success: true,
        data: user.rows[0]
    });
});

router.put('/profile', async (req, res, next) => {
    try {
        const { username } = req.body;
        const userId = req.user.id;

        await db.query(
            'UPDATE users SET username = $1 WHERE id = $2',
            [username, userId]
        );

        res.json({
            success: true,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        next(error);
    }
});


// User stats routes
router.get('/history', getMatchHistory);
router.get('/stats/:userId', getUserStats);
router.get('/leaderboard', getLeaderboard);

export default router;
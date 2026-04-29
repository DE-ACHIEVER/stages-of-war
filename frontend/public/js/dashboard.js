// API Base URL
const API_URL = 'http://localhost:5000/api';

// Helper function for API calls
async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers
    });
    
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.message || 'API request failed');
    }
    
    return data;
}

// API object



document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '../pages/login.html';
        return;
    }

    // Load dashboard data
    loadUserProfile();
    loadActiveMatches();
    loadRecentActivity();
    loadGameStats();

    // Set up auto-refresh every 30 seconds
    setInterval(() => {
        loadActiveMatches();
        loadRecentActivity();
    }, 30000);
});

async function loadUserProfile() {
    try {
        console.log('1. Loading user profile...');

        const response = await api.getProfile();
        console.log('2. Response:', response);

        const user = response.data;
        console.log('3. User object:', user);
        console.log('4. Username:', user.username);

        // Update welcome message
        document.getElementById('dashboardUsername').textContent = user.username;
        document.getElementById('balance').textContent = `₦${user.balance.toLocaleString()}`;
        document.getElementById('totalWins').textContent = user.total_wins || 0;

        // Calculate win rate
        const totalMatches = (user.total_wins || 0) + (user.total_losses || 0);
        const winRate = totalMatches > 0 
            ? Math.round((user.total_wins / totalMatches) * 100) 
            : 0;
        document.getElementById('winRate').textContent = `${winRate}%`;

        // Update balance in nav
        document.querySelector('.balance').textContent = `₦${user.balance.toLocaleString()}`;
    } catch (error) {
        console.error('Failed to load profile:', error);
        if (error.message.includes('token')) {
            api.removeToken();
            window.location.href = '/login.html';
        }
    }
}

async function loadActiveMatches() {
    try {
        const response = await api.getMatchHistory(1);
        const matches = response.data.matches || [];
        
        const activeMatches = matches.filter(m => 
            ['PENDING', 'ACTIVE'].includes(m.status)
        );

        // Update active matches count
        document.getElementById('activeMatches').textContent = 
            `${activeMatches.length} ongoing`;

        // Render active matches list
        const container = document.getElementById('activeMatchesList');
        
        if (activeMatches.length === 0) {
            container.innerHTML = `
                <div class="no-matches">
                    <p>No active matches. Ready to play?</p>
                    <a href="/games/codm.html" class="btn btn-primary">Find Opponent</a>
                </div>
            `;
            return;
        }

        container.innerHTML = activeMatches.map(match => `
            <div class="match-item">
                <div class="match-info">
                    <span class="match-game">${match.game_name || 'CODM'}</span>
                    <div class="match-opponent">
                        <span>vs ${match.opponent_username || 'Opponent'}</span>
                        <small>Stake: ₦${match.stake_amount.toLocaleString()}</small>
                    </div>
                </div>
                <div class="match-stake">₦${match.stake_amount.toLocaleString()}</div>
                <span class="match-status ${match.status.toLowerCase()}">${match.status}</span>
                <a href="/matches/detail.html?id=${match.id}" class="btn btn-small">View</a>
            </div>
        `).join('');

    } catch (error) {
        console.error('Failed to load matches:', error);
    }
}

async function loadRecentActivity() {
    try {
        const response = await api.getMatchHistory(1);
        const matches = response.data.matches || [];
        
        const recentMatches = matches.slice(0, 5);
        const timeline = document.getElementById('activityTimeline');

        if (recentMatches.length === 0) {
            timeline.innerHTML = `
                <div class="no-activity">
                    <p>No recent activity. Start playing!</p>
                </div>
            `;
            return;
        }

        timeline.innerHTML = recentMatches.map(match => {
            const isWin = match.result === 'WIN';
            const amount = isWin ? `+₦${match.winner_payout?.toLocaleString()}` : `-₦${match.stake_amount.toLocaleString()}`;
            
            return `
                <div class="activity-item">
                    <div class="activity-icon">${isWin ? '🏆' : '🎮'}</div>
                    <div class="activity-details">
                        <div class="activity-text">
                            ${isWin ? 'Won against' : 'Lost to'} ${match.opponent_username}
                        </div>
                        <div class="activity-time">${formatDate(match.created_at)}</div>
                    </div>
                    <div class="activity-amount ${isWin ? 'win' : 'loss'}">${amount}</div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Failed to load activity:', error);
    }
}

async function loadGameStats() {
    try {
        // Get online count from available matches
        const response = await api.getAvailableMatches(1, 100); // Game ID 1 = CODM
        const matches = response.data || [];
        
        document.getElementById('onlineCount').textContent = matches.length;

        // Calculate total staked from active matches
        const activeResponse = await api.getMatchHistory(1);
        const totalStaked = activeResponse.data.matches
            .filter(m => m.status === 'COMPLETED')
            .reduce((sum, m) => sum + (m.stake_amount * 2), 0);

        document.getElementById('totalStaked').textContent = `₦${totalStaked.toLocaleString()}`;

    } catch (error) {
        console.error('Failed to load game stats:', error);
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour ago`;
    if (diffDays < 7) return `${diffDays} day ago`;
    return date.toLocaleDateString();
}

// Logout handler
document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    api.logout();
    window.location.href = '/';
});
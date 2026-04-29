// ============================================
// GAME LOBBY UNIFIED - COMPLETE FIXED VERSION
// ============================================

// API Base URL
const API_URL = 'http://localhost:5000/api';


// Status mapping - Convert database numbers to readable text
const STATUS_MAP = {
    '1': 'PENDING',
    '2': 'ACTIVE', 
    '3': 'COMPLETED',
    '4': 'CANCELLED',
    '5': 'DISPUTED'
};

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

// ============================================
// API FUNCTIONS
// ============================================

const api = {
    // Get user balance
    getBalance: async () => {
        return await apiCall('/payments/balance');
    },
    
    // Create match
    createMatch: async (matchData) => {
        return await apiCall('/matches/create', {
            method: 'POST',
            body: JSON.stringify(matchData)
        });
    },
    
    // Get available matches
    getAvailableMatches: async (type, stake) => {
        let url = '/matches/available';
        const params = [];
        if (type && type !== 'all') params.push(`type=${type}`);
        if (stake && stake !== 'all') params.push(`stake=${stake}`);
        if (params.length) url += `?${params.join('&')}`;
        return await apiCall(url);
    },
    
    // Join match
    joinMatch: async (matchId) => {
        return await apiCall(`/matches/${matchId}/join`, {
            method: 'POST'
        });
    },
    
    // Get user's matches
    getYourMatches: async () => {
        return await apiCall('/matches/your-matches');
    },
    
    // Submit match results
    submitResults: async (matchId, results) => {
        return await apiCall(`/matches/${matchId}/results`, {
            method: 'POST',
            body: JSON.stringify(results)
        });
    }
};

// ============================================
// GLOBAL VARIABLES
// ============================================

let currentMatchType = '1v1';
let currentStake = 0;
let currentUserId = null;

// ============================================
// MAIN INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async function() {
    console.log('Game lobby unified script loaded');
    
    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '../login.html';
        return;
    }
    
    // Get current user ID from token
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        currentUserId = payload.userId || payload.id;
    } catch (e) {
        console.log('Could not decode token');
    }
    
    await initUnifiedLobby();
});

// ============================================
// INITIALIZE LOBBY
// ============================================

async function initUnifiedLobby() {
    console.log('Initializing unified lobby...');
    
    // Load user balance
    await loadUserBalance();
    
    // Setup event listeners
    setupEventListeners();
    
    // Load initial data
    await loadAvailableMatches();
    await loadYourMatches();
    await loadGameStats();
    
    // Auto-refresh every 15 seconds
    setInterval(() => {
        loadAvailableMatches(true);
    }, 15000);
}

// ============================================
// SETUP EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Match type toggle
    const typeBtns = document.querySelectorAll('.type-btn');
    typeBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            typeBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentMatchType = this.dataset.type;
            updateMatchTypeUI();
        });
    });
    
    // Stake input
    const stakeInput = document.getElementById('stakeAmount');
    if (stakeInput) {
        stakeInput.addEventListener('input', updatePrizePreview);
    }
    
    // Preset buttons
    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const amount = this.dataset.amount;
            if (stakeInput) {
                stakeInput.value = amount;
                updatePrizePreview();
            }
        });
    });
    
    // Create match button
    const createBtn = document.getElementById('createMatchBtn');
    if (createBtn) {
        createBtn.addEventListener('click', createMatch);
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshMatches');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadAvailableMatches();
            loadYourMatches();
        });
    }
    
    // Invite link and lobby code inputs
    const inviteLink = document.getElementById('inviteLink');
    const lobbyCode = document.getElementById('lobbyCode');
    
    if (inviteLink) {
        inviteLink.addEventListener('input', validateForm);
    }
    if (lobbyCode) {
        lobbyCode.addEventListener('input', validateForm);
    }
    
    // Paste code button
    const pasteCodeBtn = document.getElementById('pasteCodeBtn');
    if (pasteCodeBtn) {
        pasteCodeBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (lobbyCode && text && /^\d{10}$/.test(text.trim())) {
                    lobbyCode.value = text.trim();
                    validateForm();
                    showNotification('Code pasted!', 'success');
                } else {
                    showNotification('Invalid 10-digit code in clipboard', 'error');
                }
            } catch (err) {
                showNotification('Unable to paste. Please type manually.', 'error');
            }
        });
    }
}

// ============================================
// LOAD USER BALANCE
// ============================================

async function loadUserBalance() {
    try {
        const response = await api.getBalance();
        if (response && response.success) {
            const balance = response.data?.balance || 0;
            const balanceElements = document.querySelectorAll('.balance');
            balanceElements.forEach(el => {
                el.textContent = `₦${balance.toLocaleString()}`;
            });
            window.currentBalance = balance;
        }
    } catch (error) {
        console.error('Failed to load balance:', error);
        window.currentBalance = 0;
    }
}

// ============================================
// UPDATE UI BASED ON MATCH TYPE
// ============================================

function updateMatchTypeUI() {
    const titleEl = document.getElementById('createTitle');
    const gameModeEl = document.getElementById('gameMode');
    const ffaPrizesEl = document.getElementById('ffaPrizes');
    const winnerPrizeEl = document.getElementById('winnerPrize');
    
    if (titleEl) {
        titleEl.textContent = currentMatchType === '1v1' ? 'Create 1v1 Match' : 'Create 8-Player FFA Tournament';
    }
    
    if (gameModeEl) {
        gameModeEl.textContent = currentMatchType === '1v1' ? '1v1 Duel' : 'Free-For-All (8 players)';
    }
    
    if (ffaPrizesEl && winnerPrizeEl) {
        if (currentMatchType === '1v1') {
            ffaPrizesEl.style.display = 'none';
            winnerPrizeEl.style.display = 'flex';
        } else {
            ffaPrizesEl.style.display = 'block';
            winnerPrizeEl.style.display = 'none';
        }
    }
    
    updatePrizePreview();
}

// ============================================
// UPDATE PRIZE PREVIEW
// ============================================

function updatePrizePreview() {
    const stakeInput = document.getElementById('stakeAmount');
    const stake = parseFloat(stakeInput?.value) || 0;
    currentStake = stake;
    
    const totalPoolEl = document.getElementById('totalPool');
    const platformFeeEl = document.getElementById('platformFee');
    const winnerAmountEl = document.getElementById('winnerAmount');
    const firstPrizeEl = document.getElementById('firstPrize');
    const secondPrizeEl = document.getElementById('secondPrize');
    const thirdPrizeEl = document.getElementById('thirdPrize');
    
    if (currentMatchType === '1v1') {
        const totalPool = stake * 2;
        const commission = totalPool * 0.05;
        const winnerAmount = totalPool - commission;
        
        if (totalPoolEl) totalPoolEl.textContent = `₦${totalPool.toLocaleString()}`;
        if (platformFeeEl) platformFeeEl.textContent = `₦${commission.toLocaleString()}`;
        if (winnerAmountEl) winnerAmountEl.textContent = `₦${winnerAmount.toLocaleString()}`;
    } else {
        const totalPool = stake * 8;
        const commission = totalPool * 0.05;
        const prizePool = totalPool - commission;
        
        if (totalPoolEl) totalPoolEl.textContent = `₦${totalPool.toLocaleString()}`;
        if (platformFeeEl) platformFeeEl.textContent = `₦${commission.toLocaleString()}`;
        if (firstPrizeEl) firstPrizeEl.textContent = `₦${Math.floor(prizePool * 0.5).toLocaleString()}`;
        if (secondPrizeEl) secondPrizeEl.textContent = `₦${Math.floor(prizePool * 0.3).toLocaleString()}`;
        if (thirdPrizeEl) thirdPrizeEl.textContent = `₦${Math.floor(prizePool * 0.2).toLocaleString()}`;
    }
    
    validateForm();
}

// ============================================
// VALIDATION
// ============================================

function validateLobbyCode(code) {
    return code && /^\d{10}$/.test(code);
}

function validateInviteLink(link) {
    return link && link.includes('codm://') && link.length > 10;
}

function validateForm() {
    const stake = currentStake;
    const inviteLink = document.getElementById('inviteLink')?.value || '';
    const lobbyCode = document.getElementById('lobbyCode')?.value || '';
    const createBtn = document.getElementById('createMatchBtn');
    
    const hasValidLink = validateInviteLink(inviteLink);
    const hasValidCode = validateLobbyCode(lobbyCode);
    
    if (stake >= 100 && (hasValidLink || hasValidCode)) {
        if (createBtn) createBtn.disabled = false;
    } else {
        if (createBtn) createBtn.disabled = true;
    }
}

// ============================================
// CREATE MATCH
// ============================================

async function createMatch() {
    const stake = currentStake;
    const inviteLink = document.getElementById('inviteLink')?.value || '';
    const lobbyCode = document.getElementById('lobbyCode')?.value || '';
    const createBtn = document.getElementById('createMatchBtn');
    
    const hasValidLink = validateInviteLink(inviteLink);
    const hasValidCode = validateLobbyCode(lobbyCode);
    
    if (!hasValidLink && !hasValidCode) {
        showNotification('Please provide either an invite link OR a 10-digit lobby code', 'error');
        return;
    }
    
    if (stake < 100 || stake > 10000) {
        showNotification('Stake must be between ₦100 and ₦10,000', 'error');
        return;
    }
    
    try {
        if (createBtn) {
            createBtn.disabled = true;
            createBtn.textContent = 'Creating...';
        }
        
        const response = await api.createMatch({
            gameId: 1,
            matchType: currentMatchType,
            stakeAmount: stake,
            inviteLink: hasValidLink ? inviteLink : null,
            lobbyCode: hasValidCode ? lobbyCode : null
        });
        
        if (response && response.success) {
            showNotification('Match created successfully!', 'success');
            
            // Reset form
            const stakeInput = document.getElementById('stakeAmount');
            const inviteLinkInput = document.getElementById('inviteLink');
            const lobbyCodeInput = document.getElementById('lobbyCode');
            
            if (stakeInput) stakeInput.value = '';
            if (inviteLinkInput) inviteLinkInput.value = '';
            if (lobbyCodeInput) lobbyCodeInput.value = '';
            
            currentStake = 0;
            updatePrizePreview();
            await loadAvailableMatches();
            await loadYourMatches();
            await loadUserBalance();
        } else {
            throw new Error(response?.message || 'Failed to create match');
        }
    } catch (error) {
        console.error('Create match error:', error);
        showNotification(error.message || 'Failed to create match', 'error');
    } finally {
        if (createBtn) {
            createBtn.disabled = false;
            createBtn.textContent = 'Create Match';
        }
    }
}

// ============================================
// LOAD AVAILABLE MATCHES
// ============================================

async function loadAvailableMatches(silent = false) {
    const grid = document.getElementById('matchesGrid');
    if (!grid) return;
    
    try {
        if (!silent) {
            grid.innerHTML = '<div class="loading-matches">Loading matches...</div>';
        }
        
        const response = await api.getAvailableMatches('all', 'all');
        
        if (response && response.success) {
            const matches = response.data || [];
            
            if (matches.length === 0) {
                grid.innerHTML = '<div class="no-matches">No matches available. Create one above!</div>';
                return;
            }
            
            grid.innerHTML = matches.map(match => createMatchCard(match)).join('');
            
            // Add event listeners to join buttons
            document.querySelectorAll('.join-match-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const matchId = this.dataset.matchId;
                    if (matchId) joinMatch(matchId);
                });
            });
        }
    } catch (error) {
        console.error('Failed to load matches:', error);
        if (!silent) {
            grid.innerHTML = '<div class="error-message">Failed to load matches. Please refresh.</div>';
        }
    }
}

// ============================================
// CREATE MATCH CARD
// ============================================

function createMatchCard(match) {
    const isFFA = match.match_type === 'ffa';
    const playersJoined = match.current_players || 1;
    const playersNeeded = isFFA ? 8 : 2;
    const spotsLeft = playersNeeded - playersJoined;
    
    return `
        <div class="match-card">
            <div class="match-badge">
                ${isFFA ? '🎮 8-Player FFA' : '⚔️ 1v1 Duel'}
            </div>
            <div class="match-status-badge ${STATUS_MAP[match.status]?.toLowerCase() || 'pending'}">
                ${STATUS_MAP[match.status] || 'PENDING'}
            </div>

            <div class="match-creator">
                Created by: <strong>${escapeHtml(match.creator_name)}</strong>
            </div>
            <div class="match-stake">
                Entry: <strong>₦${(match.stake_amount || 0).toLocaleString()}</strong>
            </div>
            <div class="match-players">
                ${playersJoined}/${playersNeeded} players
                ${spotsLeft > 0 ? `(${spotsLeft} spot${spotsLeft > 1 ? 's' : ''} left)` : ''}
            </div>
            ${match.lobby_code ? `
                <div class="match-code">
                    Code: <strong>${match.lobby_code}</strong>
                </div>
            ` : ''}
            ${spotsLeft > 0 && match.created_by !== currentUserId ? `
                <button class="btn btn-primary join-match-btn" data-match-id="${match.id}">
                    Join Match (₦${(match.stake_amount || 0).toLocaleString()})
                </button>
            ` : spotsLeft === 0 ? `
                <div class="match-full">Match Full - In Progress</div>
            ` : ''}
        </div>
    `;
}

// ============================================
// LOAD USER'S MATCHES
// ============================================

async function loadYourMatches() {
    const container = document.getElementById('yourMatchesList');
    if (!container) return;
    
    try {
        const response = await api.getYourMatches();
        
        if (response && response.success) {
            const matches = response.data?.matches || [];
            
            if (matches.length === 0) {
                container.innerHTML = '<div class="no-matches">No active matches</div>';
                return;
            }
            
            container.innerHTML = matches.map(match => `
                <div class="your-match-card">
                    <div class="match-header">
                        <span class="match-type">${match.match_type === '1v1' ? '⚔️ 1v1' : '🎮 FFA'}</span>
                       <span class="match-status ${STATUS_MAP[match.status]?.toLowerCase() || 'pending'}">${STATUS_MAP[match.status] || 'PENDING'}</span>
                    </div>
                       <div class="match-details">
                        <div>Stake: ₦${(match.stake_amount || 0).toLocaleString()}</div>
                        <div>Players: ${match.current_players || 1}/${match.max_players || 2}</div>
                    </div>
                    ${match.status === '2' ? `
    <a href="../result_reporting.html?id=${match.id}" class="btn btn-small btn-primary">
        Submit Results
    </a>
` : ''}
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Failed to load your matches:', error);
        container.innerHTML = '<div class="error-message">Failed to load your matches</div>';
    }
}

// ============================================
// JOIN MATCH
// ============================================

async function joinMatch(matchId) {
    try {
        const response = await api.joinMatch(matchId);
        
        if (response && response.success) {
            showNotification('Joined match successfully!', 'success');
            await loadAvailableMatches();
            await loadYourMatches();
            await loadUserBalance();
        } else {
            throw new Error(response?.message || 'Failed to join match');
        }
    } catch (error) {
        console.error('Join match error:', error);
        showNotification(error.message || 'Failed to join match', 'error');
    }
}

// ============================================
// LOAD GAME STATS
// ============================================

async function loadGameStats() {
    try {
        const response = await api.getAvailableMatches('all', 'all');
        if (response && response.success) {
            const matches = response.data || [];
            const onlineCountEl = document.getElementById('onlineCount');
            const activeMatchCountEl = document.getElementById('activeMatchCount');
            
            if (onlineCountEl) onlineCountEl.textContent = matches.length;
       if (activeMatchCountEl) activeMatchCountEl.textContent = matches.filter(m => STATUS_MAP[m.status] === 'ACTIVE').length;
        }
    } catch (error) {
        console.error('Failed to load game stats:', error);
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#3b82f6'};
        color: white;
        border-radius: 8px;
        z-index: 9999;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
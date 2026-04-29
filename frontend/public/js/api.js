// API Service
class API {
    constructor() {
        this.baseURL = 'http://localhost:5000/api';
        this.token = localStorage.getItem('token');
    }

    setToken(token) {
        this.token = token;
        localStorage.setItem('token', token);
    }

    removeToken() {
        this.token = null;
        localStorage.removeItem('token');
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const config = {
            ...options,
            headers,
            credentials: 'include'
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Auth endpoints
    async register(userData) {
        return this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    }

    async login(identifier, password) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ identifier, password })
        });
        
        if (data.data?.token) {
            this.setToken(data.data.token);
        }
        
        return data;
    }

    async verifyPhone(phone, code) {
        return this.request('/auth/verify-phone', {
            method: 'POST',
            body: JSON.stringify({ phone, code })
        });
    }

    async resendCode(phone) {
        return this.request('/auth/resend-code', {
            method: 'POST',
            body: JSON.stringify({ phone })
        });
    }

    async logout() {
        await this.request('/auth/logout', { method: 'POST' });
        this.removeToken();
    }

    // Game endpoints
    async getGames() {
        return this.request('/games');
    }

    async getGame(slug) {
        return this.request(`/games/${slug}`);
    }

    async getLeaderboard(slug) {
        return this.request(`/games/${slug}/leaderboard`);
    }
ss
    // MATCH ENDPOINTS - FIND THIS SECTION
    // ============================================
    
    /**
     * CREATE A NEW MATCH (1v1 or FFA)
     * @param {Object} matchData - { gameId, matchType, stakeAmount, inviteLink }
     * @returns {Promise} - Match creation response
     */
    async createMatch(matchData) {
        // matchData should contain: 
        // - gameId: 1 for CODM
        // - matchType: "1v1" or "ffa"
        // - stakeAmount: 100-10000
        // - inviteLink: "codm://invite?lobby=571384"
        // No lobbyCode field!
        return this.request('/matches/create', {
            method: 'POST',
            body: JSON.stringify(matchData)
        });
    }

    /**
     * GET AVAILABLE MATCHES
     * @param {string} type - "all", "1v1", or "ffa"
     * @param {number} stake - Filter by stake amount
     * @returns {Promise} - List of available matches
     */
    async getAvailableMatches(type = 'all', stake = 'all') {
        return this.request(`/matches/available?type=${type}&stake=${stake}`);
    }

    /**
     * JOIN A MATCH
     * @param {number} matchId - ID of match to join
     * @returns {Promise} - Join response with lobby info
     */
    async joinMatch(matchId) {
        return this.request(`/matches/${matchId}/join`, {
            method: 'POST'
        });
    }

    /**
     * GET USER'S ACTIVE MATCHES
     * @returns {Promise} - List of user's matches
     */
    async getYourMatches() {
        return this.request('/matches/your-matches');
    }

    /**
     * GET MATCH DETAILS
     * @param {number} matchId - Match ID
     * @returns {Promise} - Match details
     */
    async getMatchDetails(matchId) {
        return this.request(`/matches/${matchId}`);
    }

    /**
     * SUBMIT MATCH RESULTS
     * @param {number} matchId - Match ID
     * @param {Object} results - { kills, deaths, position, evidence }
     * @returns {Promise} - Submission response
     */
    async submitMatchResults(matchId, results) {
        return this.request(`/matches/${matchId}/results`, {
            method: 'POST',
            body: JSON.stringify(results)
        });
    }

    // Keep your existing getMatchHistory if you have it
    async getMatchHistory(page = 1) {
        return this.request(`/matches/history/all?page=${page}`);
    }

    // ============================================
    // PAYMENT ENDPOINTS
    // ============================================
    async initializeDeposit(amount) {
        return this.request('/payments/deposit/initialize', {
            method: 'POST',
            body: JSON.stringify({ amount })
        });
    }

    async verifyTransaction(reference) {
        return this.request(`/payments/verify/${reference}`);
    }

    async withdraw(amount, bankCode, accountNumber, accountName) {
        return this.request('/payments/withdraw', {
            method: 'POST',
            body: JSON.stringify({ 
                amount, 
                bank_code: bankCode, 
                account_number: accountNumber, 
                account_name: accountName 
            })
        });
    }

    async getBalance() {
        return this.request('/payments/balance');
    }

    async getTransactions(page = 1) {
        return this.request(`/payments/transactions?page=${page}`);
    }

    async getBanks() {
        return this.request('/payments/banks');
    }

    // ============================================
    // USER ENDPOINTS
    // ============================================
    async getProfile() {
        return this.request('/users/profile');
    }

    async updateProfile(username) {
        return this.request('/users/profile', {
            method: 'PUT',
            body: JSON.stringify({ username })
        });
    }

    // ============================================
    // ADMIN ENDPOINTS
    // ============================================
    async getAdminStats() {
        return this.request('/admin/stats');
    }

    async getPendingDisputes() {
        return this.request('/admin/disputes/pending');
    }

    async resolveDispute(disputeId, decision, notes) {
        return this.request(`/admin/disputes/${disputeId}/resolve`, {
            method: 'POST',
            body: JSON.stringify({ decision, notes })
        });
    }

    async getUsers(search = '', page = 1) {
        const query = new URLSearchParams({ search, page }).toString();
        return this.request(`/admin/users?${query}`);
    }

    async toggleBan(userId, ban) {
        return this.request(`/admin/users/${userId}/toggle-ban`, {
            method: 'POST',
            body: JSON.stringify({ ban })
        });
    }

    async getUserDetails(userId) {
        return this.request(`/admin/users/${userId}`);
    }

    async getAllTransactions(page = 1) {
        return this.request(`/admin/transactions/all?page=${page}`);
    }

    async adjustBalance(userId, amount, reason) {
        return this.request(`/admin/users/${userId}/adjust-balance`, {
            method: 'POST',
            body: JSON.stringify({ amount, reason })
        });
    }

// In /frontend/public/js/api.js

async forgotPassword(identifier) {
    return this.request('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ identifier })
    });
}

async verifyResetCode(identifier, code) {
    return this.request('/auth/verify-reset-code', {
        method: 'POST',
        body: JSON.stringify({ identifier, code })
    });
}

async resetPassword(phone, code, newPassword) {
    return this.request('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ phone, code, newPassword })
    });
}

}



// Create global API instance
const api = new API();
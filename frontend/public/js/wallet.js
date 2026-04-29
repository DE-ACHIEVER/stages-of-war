
// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('💰 Wallet page initializing...');
    
    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
        console.log('No token found, redirecting to login...');
        window.location.href = './login.html';
        return;
    }
    
    // Initialize all wallet functionality
    initWallet();
});

/**
 * Main initialization function
 * Wrapped in try-catch to prevent crashes
 */
async function initWallet() {
    try {
        // Load all wallet data
        await Promise.all([
            loadBalance(),
            loadTransactionStats(),
            loadTransactions(1),
            loadBanks()
        ]);
        
        // Setup event listeners
        setupEventListeners();
        
        // Check URL for deposit action
        checkUrlParams();
        
        console.log('✅ Wallet initialized successfully');
    } catch (error) {
        console.error('❌ Wallet initialization error:', error);
        showNotification('Failed to load wallet data', 'error');
    }
}

    async function payWithPaystack() {
        const amount = document.getElementById('depositAmount').value;
        
        if (!amount || amount < 100 || amount > 50000) {
            alert('Please enter a valid amount (₦100 - ₦50,000)');
            return;
        }
        
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const email = user.email;
        
        if (!email) {
            alert('Please login again');
            window.location.href = 'login.html';
            return;
        }
        
        try {
            const response = await fetch('http://localhost:5000/api/payments/deposit/initialize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ amount: parseInt(amount) })
            });
            
            const data = await response.json();
            
            if (data.success) {
                const handler = PaystackPop.setup({
                    key: 'pk_test_d31441649327f0a695efe31a189701d2034306c1',
                    email: email,
                    amount: amount * 100,
                    currency: 'NGN',
                    ref: data.data.reference,
                    callback: function(response) {
                        alert('Payment successful! Reference: ' + response.reference);
                        window.location.href = 'wallet.html?success=true';
                    },
                    onClose: function() {
                        console.log('Payment window closed');
                    }
                });
                handler.openIframe();
            } else {
                alert(data.message || 'Payment initialization failed');
            }
        } catch (error) {
            console.error('Payment error:', error);
            alert('Error initiating payment. Please try again.');
        }
    }
/**
 * Load user balance
 */
async function loadBalance() {
    const balanceElement = document.getElementById('balanceAmount');
    if (!balanceElement) {
        console.warn('Balance element not found');
        return;
    }
    
    try {
        // Check if api object exists
        if (typeof api === 'undefined') {
            throw new Error('API service not loaded');
        }
        
        const response = await api.getBalance();
        
        if (response && response.success && response.data) {
            const balance = response.data.balance || 0;
            balanceElement.textContent = formatCurrency(balance);
            
            // Update balance in navigation if exists
            const navBalance = document.querySelector('.balance');
            if (navBalance) {
                navBalance.textContent = formatCurrency(balance);
            }
        } else {
            throw new Error('Invalid balance response');
        }
    } catch (error) {
        console.error('Failed to load balance:', error);
        balanceElement.textContent = '₦0.00';
        
        // Show error but don't crash
        showNotification('Could not load balance', 'warning');
    }
}

/**
 * Load transaction statistics
 */
async function loadTransactionStats() {
    const elements = {
        totalDeposits: document.getElementById('totalDeposits'),
        totalWithdrawals: document.getElementById('totalWithdrawals'),
        totalWinnings: document.getElementById('totalWinnings'),
        matchesPlayed: document.getElementById('matchesPlayed')
    };
    
    // Check if elements exist
    const anyElementExists = Object.values(elements).some(el => el);
    if (!anyElementExists) {
        console.log('Stat elements not found on this page');
        return;
    }
    
    try {
        const response = await api.getTransactions(1);
        
        if (response && response.success && response.data) {
            const transactions = response.data.transactions || [];
            
            // Calculate stats
            const stats = calculateStats(transactions);
            
            // Update elements if they exist
            if (elements.totalDeposits) {
                elements.totalDeposits.textContent = formatCurrency(stats.totalDeposits);
            }
            if (elements.totalWithdrawals) {
                elements.totalWithdrawals.textContent = formatCurrency(stats.totalWithdrawals);
            }
            if (elements.totalWinnings) {
                elements.totalWinnings.textContent = formatCurrency(stats.totalWinnings);
            }
            if (elements.matchesPlayed) {
                elements.matchesPlayed.textContent = stats.matchesPlayed;
            }
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
        
        // Set default values
        if (elements.totalDeposits) elements.totalDeposits.textContent = '₦0';
        if (elements.totalWithdrawals) elements.totalWithdrawals.textContent = '₦0';
        if (elements.totalWinnings) elements.totalWinnings.textContent = '₦0';
        if (elements.matchesPlayed) elements.matchesPlayed.textContent = '0';
    }
}

/**
 * Calculate statistics from transactions
 */
function calculateStats(transactions) {
    const stats = {
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalWinnings: 0,
        matchesPlayed: 0
    };
    
    if (!Array.isArray(transactions)) {
        return stats;
    }
    
    transactions.forEach(t => {
        if (!t || !t.transaction_type) return;
        
        const amount = parseFloat(t.amount) || 0;
        
        switch (t.transaction_type) {
            case 'DEPOSIT':
                if (t.status === 'SUCCESS') stats.totalDeposits += amount;
                break;
            case 'WITHDRAW':
                if (t.status === 'SUCCESS') stats.totalWithdrawals += amount;
                break;
            case 'WINNING':
                stats.totalWinnings += amount;
                stats.matchesPlayed++;
                break;
        }
    });
    
    return stats;
}

/**
 * Load transactions with pagination
 */
async function loadTransactions(page = 1) {
    const container = document.getElementById('transactionsList');
    if (!container) {
        console.log('Transactions container not found');
        return;
    }
    
    try {
        // Show loading state
        container.innerHTML = '<div class="loading">Loading transactions...</div>';
        
        const response = await api.getTransactions(page);
        
        if (!response || !response.success) {
            throw new Error('Failed to load transactions');
        }
        
        const transactions = response.data?.transactions || [];
        const pagination = response.data?.pagination || { total: 0, pages: 1, page: 1 };
        
        if (transactions.length === 0) {
            container.innerHTML = '<div class="no-transactions">No transactions yet</div>';
        } else {
            container.innerHTML = transactions.map(t => createTransactionHTML(t)).join('');
        }
        
        // Update pagination
        updatePagination(pagination);
        
    } catch (error) {
        console.error('Failed to load transactions:', error);
        if (container) {
            container.innerHTML = '<div class="error-message">Failed to load transactions. <button onclick="location.reload()">Retry</button></div>';
        }
    }
}

/**
 * Create HTML for a single transaction
 */
function createTransactionHTML(transaction) {
    if (!transaction) return '';
    
    const type = transaction.transaction_type || 'UNKNOWN';
    const amount = parseFloat(transaction.amount) || 0;
    const status = transaction.status || 'PENDING';
    const date = transaction.created_at ? new Date(transaction.created_at) : new Date();
    
    // Determine icon and class based on type
    let icon = '💰';
    let typeClass = '';
    let amountClass = '';
    let amountPrefix = '';
    
    switch (type) {
        case 'DEPOSIT':
            icon = '💳';
            typeClass = 'deposit';
            amountClass = 'positive';
            amountPrefix = '+';
            break;
        case 'WITHDRAW':
            icon = '💸';
            typeClass = 'withdraw';
            amountClass = 'negative';
            amountPrefix = '-';
            break;
        case 'WINNING':
            icon = '🏆';
            typeClass = 'winning';
            amountClass = 'positive';
            amountPrefix = '+';
            break;
        case 'STAKE':
            icon = '🎮';
            typeClass = 'stake';
            amountClass = 'negative';
            amountPrefix = '-';
            break;
        case 'REFUND':
            icon = '↩️';
            typeClass = 'refund';
            amountClass = 'positive';
            amountPrefix = '+';
            break;
        default:
            icon = '📝';
    }
    
    // Format date
    const dateStr = formatDate(date);
    
    // Status class
    const statusClass = status === 'SUCCESS' ? 'status-success' : 
                        status === 'PENDING' ? 'status-pending' : 'status-failed';
    
    // Get title based on type and metadata
    let title = type.charAt(0) + type.slice(1).toLowerCase();
    if (transaction.match_id) {
        title += ` - Match #${transaction.match_id}`;
    }
    
    return `
        <div class="transaction-item ${typeClass}" data-id="${transaction.id || ''}">
            <div class="transaction-icon">${icon}</div>
            <div class="transaction-details">
                <div class="transaction-title">${title}</div>
                <div class="transaction-meta">
                    ${dateStr} • Ref: ${transaction.paystack_reference ? transaction.paystack_reference.substring(0, 8) + '...' : 'N/A'}
                </div>
            </div>
            <div class="transaction-amount ${amountClass}">
                ${amountPrefix}${formatCurrency(amount)}
            </div>
            <div class="transaction-status ${statusClass}">${status}</div>
        </div>
    `;
}

/**
 * Update pagination controls
 */
function updatePagination(pagination) {
    const container = document.getElementById('transactionPagination');
    if (!container) return;
    
    const currentPage = pagination.page || 1;
    const totalPages = pagination.pages || 1;
    const hasNext = pagination.hasNext || currentPage < totalPages;
    const hasPrev = pagination.hasPrev || currentPage > 1;
    
    let html = '<div class="pagination">';
    
    // Previous button
    html += `<button class="page-btn prev-btn" ${!hasPrev ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">←</button>`;
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    
    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
    }
    
    // Next button
    html += `<button class="page-btn next-btn" ${!hasNext ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">→</button>`;
    
    // Page info
    html += `<span class="page-info">Page ${currentPage} of ${totalPages}</span>`;
    
    html += '</div>';
    
    container.innerHTML = html;
}

/**
 * Change page (make globally available)
 */
window.changePage = function(page) {
    loadTransactions(page);
};

/**
 * Load banks for withdrawal
 */
async function loadBanks() {
    const bankSelect = document.getElementById('bankSelect');
    if (!bankSelect) return;
    
    try {
        const response = await api.getBanks();
        
        if (response && response.success && response.data) {
            const banks = response.data || [];
            
            bankSelect.innerHTML = '<option value="">Select your bank</option>' +
                banks.map(bank => `<option value="${bank.code}">${bank.name}</option>`).join('');
        } else {
            bankSelect.innerHTML = '<option value="">Banks unavailable</option>';
        }
    } catch (error) {
        console.error('Failed to load banks:', error);
        if (bankSelect) {
            bankSelect.innerHTML = '<option value="">Error loading banks</option>';
        }
    }
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    console.log('Setting up wallet event listeners...');
    
    // Deposit button
    const depositBtn = document.getElementById('depositBtn');
    if (depositBtn) {
        depositBtn.addEventListener('click', showDepositForm);
    }
    
    // Withdraw button
    const withdrawBtn = document.getElementById('withdrawBtn');
    if (withdrawBtn) {
        withdrawBtn.addEventListener('click', showWithdrawForm);
    }
    
    // Cancel buttons
    const cancelDeposit = document.getElementById('cancelDepositBtn');
    if (cancelDeposit) {
        cancelDeposit.addEventListener('click', hideForms);
    }
    
    const cancelWithdraw = document.getElementById('cancelWithdrawBtn');
    if (cancelWithdraw) {
        cancelWithdraw.addEventListener('click', hideForms);
    }
    
    // Process deposit
    const processDeposit = document.getElementById('processDepositBtn');
    if (processDeposit) {
        processDeposit.addEventListener('click', processDeposit);
    }
    
    // Process withdraw
    const processWithdraw = document.getElementById('processWithdrawBtn');
    if (processWithdraw) {
        processWithdraw.addEventListener('click', processWithdraw);
    }
    
    // Amount presets
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            const amount = this.getAttribute('data-amount');
            const input = document.getElementById('depositAmount') || document.getElementById('withdrawAmount');
            if (input) {
                input.value = amount;
                
                // Remove active class from all presets
                this.parentElement.querySelectorAll('.preset-btn').forEach(b => {
                    b.classList.remove('active');
                });
                
                // Add active class to clicked
                this.classList.add('active');
            }
        });
    });
    
    // Payment method selection
    document.querySelectorAll('.method-card').forEach(card => {
        card.addEventListener('click', function() {
            this.parentElement.querySelectorAll('.method-card').forEach(c => {
                c.classList.remove('active');
            });
            this.classList.add('active');
        });
    });
    
    // Filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const filter = this.getAttribute('data-filter');
            
            // Update active tab
            this.parentElement.querySelectorAll('.filter-tab').forEach(t => {
                t.classList.remove('active');
            });
            this.classList.add('active');
            
            // Filter transactions (would need to reimplement based on your data structure)
            filterTransactions(filter);
        });
    });
    
    // Account number input for name lookup
    const accountInput = document.getElementById('accountNumber');
    if (accountInput) {
        accountInput.addEventListener('blur', lookupAccountName);
    }
}

/**
 * Show deposit form
 */
function showDepositForm() {
    const forms = document.getElementById('transactionForms');
    const depositForm = document.getElementById('depositForm');
    const withdrawForm = document.getElementById('withdrawForm');
    
    if (forms) forms.style.display = 'block';
    if (depositForm) depositForm.style.display = 'block';
    if (withdrawForm) withdrawForm.style.display = 'none';
    
    // Scroll to form
    if (forms) {
        forms.scrollIntoView({ behavior: 'smooth' });
    }
}

/**
 * Show withdraw form
 */
function showWithdrawForm() {
    const forms = document.getElementById('transactionForms');
    const depositForm = document.getElementById('depositForm');
    const withdrawForm = document.getElementById('withdrawForm');
    
    if (forms) forms.style.display = 'block';
    if (depositForm) depositForm.style.display = 'none';
    if (withdrawForm) withdrawForm.style.display = 'block';
    
    // Scroll to form
    if (forms) {
        forms.scrollIntoView({ behavior: 'smooth' });
    }
}

/**
 * Hide all forms
 */
function hideForms() {
    const forms = document.getElementById('transactionForms');
    if (forms) forms.style.display = 'none';
}

/**
 * Process deposit
 */
async function processDeposit() {
    const amountInput = document.getElementById('depositAmount');
    if (!amountInput) return;
    
    const amount = parseFloat(amountInput.value);
    
    if (isNaN(amount) || amount < 100) {
        showNotification('Please enter a valid amount (minimum ₦100)', 'error');
        return;
    }
    
    if (amount > 50000) {
        showNotification('Maximum deposit is ₦50,000', 'error');
        return;
    }
    
    const btn = document.getElementById('processDepositBtn');
    if (!btn) return;
    
    try {
        btn.disabled = true;
        btn.textContent = 'Processing...';
        
        const response = await api.initializeDeposit(amount);
        
        if (response && response.success && response.data) {
            // Redirect to Paystack
            window.location.href = response.data.authorization_url;
        } else {
            throw new Error('Failed to initialize deposit');
        }
    } catch (error) {
        console.error('Deposit error:', error);
        showNotification(error.message || 'Deposit failed', 'error');
        btn.disabled = false;
        btn.textContent = 'Proceed to Payment';
    }
}

/**
 * Process withdrawal
 */
async function processWithdraw() {
    const amountInput = document.getElementById('withdrawAmount');
    const bankSelect = document.getElementById('bankSelect');
    const accountInput = document.getElementById('accountNumber');
    const nameInput = document.getElementById('accountName');
    
    if (!amountInput || !bankSelect || !accountInput || !nameInput) return;
    
    const amount = parseFloat(amountInput.value);
    const bankCode = bankSelect.value;
    const accountNumber = accountInput.value;
    const accountName = nameInput.value;
    
    // Validate
    if (isNaN(amount) || amount < 1000) {
        showNotification('Minimum withdrawal is ₦1,000', 'error');
        return;
    }
    
    if (!bankCode) {
        showNotification('Please select a bank', 'error');
        return;
    }
    
    if (!accountNumber || accountNumber.length !== 10) {
        showNotification('Please enter a valid 10-digit account number', 'error');
        return;
    }
    
    if (!accountName) {
        showNotification('Please verify account name', 'error');
        return;
    }
    
    const btn = document.getElementById('processWithdrawBtn');
    if (!btn) return;
    
    try {
        btn.disabled = true;
        btn.textContent = 'Processing...';
        
        const response = await api.withdraw(amount, bankCode, accountNumber, accountName);
        
        if (response && response.success) {
            showNotification('Withdrawal initiated successfully', 'success');
            hideForms();
            loadBalance();
            loadTransactions(1);
        } else {
            throw new Error(response?.message || 'Withdrawal failed');
        }
    } catch (error) {
        console.error('Withdrawal error:', error);
        showNotification(error.message || 'Withdrawal failed', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Withdraw Funds';
    }
}

/**
 * Lookup account name from bank and account number
 */
async function lookupAccountName() {
    const accountInput = document.getElementById('accountNumber');
    const bankSelect = document.getElementById('bankSelect');
    const nameInput = document.getElementById('accountName');
    
    if (!accountInput || !bankSelect || !nameInput) return;
    
    const accountNumber = accountInput.value;
    const bankCode = bankSelect.value;
    
    if (!accountNumber || accountNumber.length !== 10 || !bankCode) return;
    
    try {
        nameInput.value = 'Verifying...';
        nameInput.readOnly = true;
        
        // In a real implementation, you would call Paystack API to resolve account
        // For now, simulate a delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mock response - in production, this would come from Paystack
        nameInput.value = 'STAGES OF WAR'; // This would be the actual account name
        
    } catch (error) {
        console.error('Account lookup error:', error);
        nameInput.value = 'Unable to verify';
        showNotification('Could not verify account name', 'error');
    }
}

/**
 * Filter transactions by type
 */
function filterTransactions(filter) {
    const items = document.querySelectorAll('.transaction-item');
    
    if (!items.length) return;
    
    items.forEach(item => {
        if (filter === 'all') {
            item.style.display = 'flex';
            return;
        }
        
        const type = item.classList.contains(filter) ? 'show' : 'hide';
        
        if (type === 'show') {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

/**
 * Check URL parameters (for deposit return)
 */
function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const reference = urlParams.get('reference');
    
    if (success === 'true' && reference) {
        showNotification('Deposit successful!', 'success');
        loadBalance();
        loadTransactions(1);
        
        // Clean URL
        window.history.replaceState({}, document.title, '/wallet.html');
    } else if (success === 'false') {
        showNotification('Deposit was cancelled or failed', 'warning');
        window.history.replaceState({}, document.title, '/wallet.html');
    }
}

/**
 * Format currency
 */
function formatCurrency(amount) {
    if (amount === undefined || amount === null) return '₦0.00';
    return `₦${parseFloat(amount).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`;
}

/**
 * Format date
 */
function formatDate(date) {
    if (!date) return 'Unknown date';
    
    const d = new Date(date);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return d.toLocaleDateString('en-NG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Show notification toast
 */
function showNotification(message, type = 'info') {
    // Check if showToast function exists from main.js
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
        return;
    }
    
    // Fallback notification
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#3b82f6'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 9999;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
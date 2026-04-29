// Main application functionality
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication status
    checkAuth();

    // Update stats if on homepage
    if (window.location.pathname === '/') {
        loadStats();
    }

    // Initialize mobile menu
    initMobileMenu();

    // Handle active navigation
    setActiveNavLink();

    // Initialize forms if present
    initForms();

    // Initialize user menu if logged in
    initUserMenu();
});

function checkAuth() {
    const token = localStorage.getItem('token');
    const userMenu = document.querySelector('.user-menu');
    const authButtons = document.querySelectorAll('.nav-actions .btn:not(.theme-toggle)');

    if (token && userMenu) {
        // Show user menu, hide auth buttons
        userMenu.style.display = 'flex';
        authButtons.forEach(btn => btn.style.display = 'none');

        // Load user data
        loadUserData();
    }
}

async function loadUserData() {
    try {
        const { data } = await api.getProfile();
        const balanceEl = document.querySelector('.balance');
        if (balanceEl) {
            balanceEl.textContent = `₦${data.balance.toLocaleString()}`;
        }
    } catch (error) {
        console.error('Failed to load user data:', error);
        // Token might be invalid
        api.removeToken();
        window.location.href = '../pages/login.htm,';
    }
}

async function loadStats() {
    try {
        // These would come from your backend
        document.querySelector('.stat-value:nth-child(1)').textContent = '₦0+';
        document.querySelector('.stat-value:nth-child(2)').textContent = '0';
        document.querySelector('.stat-value:nth-child(3)').textContent = '0';
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

function initMobileMenu() {
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    
    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('show');
        });
    }
}

function setActiveNavLink() {
    const path = window.location.pathname;
    const links = document.querySelectorAll('.nav-links a');
    
    links.forEach(link => {
        const href = link.getAttribute('href');
        if (path === href || (path === '/' && href === '/')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

function initForms() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Register form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    // Verification form
    const verifyForm = document.getElementById('verifyForm');
    if (verifyForm) {
        verifyForm.addEventListener('submit', handleVerification);
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const identifier = document.getElementById('identifier').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (!identifier || !password) {
        errorEl.textContent = 'Please enter email/phone and password';
        errorEl.style.display = 'block';
        return;
    }

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Logging in...';

        const response = await api.login(identifier, password);
        
        // ✅ SUCCESS - redirect to dashboard directly (no phone verification)
        if (response && response.success) {
            // Save token (if your api.login doesn't already do this)
            if (response.data && response.data.token) {
                localStorage.setItem('token', response.data.token);
                localStorage.setItem('user', JSON.stringify(response.data.user));
            }
            
            // Redirect to dashboard
            window.location.href = '../pages/dashboard.html';
        } else {
            throw new Error(response.message || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        errorEl.textContent = error.message || 'Login failed. Please check your credentials.';
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const formData = {
        username: document.getElementById('username').value,
        email: document.getElementById('email').value,
        phone_number: document.getElementById('phone').value,
        password: document.getElementById('password').value,
        confirmPassword: document.getElementById('confirmPassword').value
    };

    const errorEl = document.getElementById('registerError');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account...';

        const response = await api.register(formData);
        
        // Store phone for verification
        sessionStorage.setItem('pendingPhone', response.data.phone);
        
        // Redirect to verification
        window.location.href = '../pages/verify.html';
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
    }
}

async function handleVerification(e) {
    e.preventDefault();
    
    const code = document.getElementById('code').value;
    const phone = sessionStorage.getItem('pendingPhone');
    const errorEl = document.getElementById('verifyError');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (!phone) {
        window.location.href = '../pages/login.html';
        return;
    }

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying...';

        await api.verifyPhone(phone, code);
        
        // Clear pending phone
        sessionStorage.removeItem('pendingPhone');
        
        // Redirect to dashboard
        window.location.href = '../pages/dashboard.html';
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Verify';
    }
}

function initUserMenu() {
    const avatar = document.querySelector('.avatar');
    if (avatar) {
        avatar.addEventListener('click', () => {
            window.location.href = '/profile.html';
        });
    }
}

// Logout functionality
document.addEventListener('click', (e) => {
    if (e.target.closest('#logoutBtn')) {
        e.preventDefault();
        api.logout();
        window.location.href = '/';
    }
});

// Format currency
function formatCurrency(amount) {
    return `₦${amount.toLocaleString()}`;
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-NG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Show toast notification
function showToast(message, type = 'info') {
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
function togglePassword(fieldId) {
    const field = document.getElementById(fieldId);
    const toggle = event.target;
    
    if (field.type === 'password') {
        field.type = 'text';
        toggle.textContent = '🙈';
    } else {
        field.type = 'password';
        toggle.textContent = '👁️';
    }
}
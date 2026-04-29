// Theme management
class ThemeManager {
    constructor() {
        this.theme = localStorage.getItem('theme') || 'light';
        this.init();
    }

    init() {
        // Set initial theme
        document.documentElement.setAttribute('data-theme', this.theme);
        document.body.className = this.theme + '-mode';
        
        // Update toggle button if exists
        const toggle = document.getElementById('themeToggle');
        if (toggle) {
            toggle.classList.toggle('dark', this.theme === 'dark');
        }

        // Listen for toggle clicks
        document.addEventListener('click', (e) => {
            if (e.target.closest('#themeToggle')) {
                this.toggle();
            }
        });

        // Watch system preference changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('theme')) {
                this.theme = e.matches ? 'dark' : 'light';
                this.applyTheme();
            }
        });
    }

    toggle() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', this.theme);
        this.applyTheme();
    }

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
        document.body.className = this.theme + '-mode';
        
        const toggle = document.getElementById('themeToggle');
        if (toggle) {
            toggle.classList.toggle('dark', this.theme === 'dark');
        }

        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent('themeChanged', { 
            detail: { theme: this.theme } 
        }));
    }
}

// Mobile menu toggle
const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
const navLinks = document.querySelector('.nav-links');

if (mobileMenuBtn && navLinks) {
    mobileMenuBtn.addEventListener('click', function() {
        navLinks.classList.toggle('show');
    });
}

// Initialize theme manager
const themeManager = new ThemeManager();

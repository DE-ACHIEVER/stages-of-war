// frontend/js/config.js
const API_CONFIG = {
    // Development
    dev: {
        BASE_URL: 'http://localhost:5000/api'
    },
    // Production (change when deploying)
    prod: {
        BASE_URL: 'https://your-app.onrender.com/api'
    }
};


// Automatically use dev or prod based on hostname
const isProduction = window.location.hostname !== 'localhost' && 
                     !window.location.hostname.includes('127.0.0.1');

// ✅ Also make it available globally (for non-module scripts)
window.API_URL = API_URL;

export const API_URL = isProduction ? API_CONFIG.prod.BASE_URL : API_CONFIG.dev.BASE_URL;
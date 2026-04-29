// frontend/js/auth.js
import { authAPI, userAPI } from './api.js';

// Auth state
let currentUser = null;
let authToken = null;

// Initialize auth from localStorage
export function initAuth() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (token && user) {
        authToken = token;
        currentUser = JSON.parse(user);
        return true;
    }
    return false;
}

// Login user
export async function login(email, password) {
    try {
        const response = await authAPI.login({ email, password });
        
        if (response.success) {
            authToken = response.data.token;
            currentUser = response.data.user;
            
            localStorage.setItem('token', authToken);
            localStorage.setItem('user', JSON.stringify(currentUser));
            
            return { success: true, user: currentUser };
        }
        return { success: false, message: response.message };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// Register user
export async function register(userData) {
    try {
        const response = await authAPI.register(userData);
        
        if (response.success) {
            return { success: true, message: 'Registration successful! Please login.' };
        }
        return { success: false, message: response.message };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// Logout user
export async function logout() {
    try {
        await authAPI.logout();
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        authToken = null;
        currentUser = null;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/index.html';
    }
}

// Get current user
export function getCurrentUser() {
    return currentUser;
}

// Check if logged in
export function isLoggedIn() {
    return !!authToken && !!currentUser;
}

// Get auth header for manual requests
export function getAuthHeader() {
    return authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
}
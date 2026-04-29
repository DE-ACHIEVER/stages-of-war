// ============================================
// REPORT RESULT PAGE - DIRECT FETCH
// ============================================

const API_URL = 'http://localhost:5000/api';

// Get match ID from URL
const urlParams = new URLSearchParams(window.location.search);
const matchId = urlParams.get('id');

console.log('🔍 Match ID from URL:', matchId);

// Global variable
let uploadedScreenshot = null;
let matchData = null;

// ============================================
// PAGE LOAD
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📄 Report result page loaded');
    
    // Check login
    const token = localStorage.getItem('token');
    if (!token) {
        alert('Please login first');
        window.location.href = '../pages/login.html';
        return;
    }
    
    if (!matchId) {
        alert('No match specified');
        window.location.href = 'dashboard.html';
        return;
    }
    
    // Load match data
    await loadMatchDetails();
    
    // Setup file upload
    setupFileUpload();
    
    // Setup submit button
    const submitBtn = document.getElementById('submitResultBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', submitResult);
    }
});

// ============================================
// LOAD MATCH DETAILS
// ============================================

async function loadMatchDetails() {
    try {
        console.log('📡 Fetching match data for ID:', matchId);
        
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/matches/${matchId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('📡 Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('📡 Response data:', result);
        
        if (result.success && result.data) {
            matchData = result.data;
            updatePageWithMatchData(matchData);
        } else {
            throw new Error(result.message || 'No match data');
        }
        
    } catch (error) {
        console.error('❌ Error loading match:', error);
        document.getElementById('stakeAmount').textContent = 'Error';
        document.getElementById('platformFee').textContent = 'Error';
        document.getElementById('winnerPayout').textContent = 'Error';
        alert('Failed to load match: ' + error.message);
    }
}

function updatePageWithMatchData(match) {
    console.log('📊 Updating page with match data:', match);
    
    // Update match ID
    const matchIdEl = document.getElementById('matchId');
    if (matchIdEl) matchIdEl.textContent = match.id;
    
    // Calculate values
    const stakeAmount = parseFloat(match.stake_amount) || 0;
    const totalPool = stakeAmount * 2;
    const platformFee = totalPool * 0.05;
    const winnerPayout = totalPool * 0.95;
    
    // Update display
    const stakeEl = document.getElementById('stakeAmount');
    if (stakeEl) stakeEl.textContent = `₦${stakeAmount.toLocaleString()}`;
    
    const feeEl = document.getElementById('platformFee');
    if (feeEl) feeEl.textContent = `₦${platformFee.toLocaleString()}`;
    
    const winnerEl = document.getElementById('winnerPayout');
    if (winnerEl) winnerEl.textContent = `₦${winnerPayout.toLocaleString()}`;
    
    // Display players
    displayPlayers(match);
    
    // Populate winner dropdown
    populateWinnerDropdown(match);
}

function displayPlayers(match) {
    const playersGrid = document.getElementById('playersGrid');
    if (!playersGrid) return;
    
    // Get current user
    const token = localStorage.getItem('token');
    let currentUserId = null;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        currentUserId = payload.userId || payload.id;
    } catch (e) {}
    
    const players = [
        { id: match.created_by, name: match.creator_name || 'Creator' }
    ];
    
    // Add opponent if exists
    if (match.opponent_id) {
        players.push({ id: match.opponent_id, name: match.opponent_name || 'Opponent' });
    }
    
    playersGrid.innerHTML = players.map(player => `
        <div class="player-card">
            <div class="player-avatar">${player.id === currentUserId ? '👤' : '⚔️'}</div>
            <div class="player-name">
                ${escapeHtml(player.name)}
                ${player.id === currentUserId ? ' (You)' : ''}
            </div>
        </div>
    `).join('');
}

function populateWinnerDropdown(match) {
    const winnerSelect = document.getElementById('winnerId');
    if (!winnerSelect) return;
    
    const token = localStorage.getItem('token');
    let currentUserId = null;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        currentUserId = payload.userId || payload.id;
    } catch (e) {}
    
    const players = [
        { id: match.created_by, name: match.creator_name || 'Creator' }
    ];
    
    if (match.opponent_id) {
        players.push({ id: match.opponent_id, name: match.opponent_name || 'Opponent' });
    }
    
    let options = '<option value="">Select winner</option>';
    players.forEach(player => {
        if (player.id) {
            const isYou = player.id === currentUserId;
            options += `<option value="${player.id}">${player.name} ${isYou ? '(You)' : ''}</option>`;
        }
    });
    
    winnerSelect.innerHTML = options;
}

// ============================================
// FILE UPLOAD
// ============================================

function setupFileUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const previewContainer = document.getElementById('previewContainer');
    const previewImage = document.getElementById('previewImage');
    const removeImageBtn = document.getElementById('removeImageBtn');
    
    if (!uploadArea) return;
    
    uploadArea.addEventListener('click', () => fileInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleFile(file);
        }
    });
    
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) handleFile(e.target.files[0]);
        });
    }
    
    if (removeImageBtn) {
        removeImageBtn.addEventListener('click', () => {
            uploadedScreenshot = null;
            previewContainer.style.display = 'none';
            fileInput.value = '';
            
            const icon = uploadArea.querySelector('.upload-icon');
            const text = uploadArea.querySelector('p');
            if (icon) icon.innerHTML = '📷';
            if (text) text.innerHTML = 'Click or drag screenshot here';
        });
    }
}

function handleFile(file) {
    if (file.size > 5 * 1024 * 1024) {
        alert('File too large. Max 5MB.');
        return;
    }
    
    if (!file.type.match('image.*')) {
        alert('Please upload an image file (PNG, JPG, JPEG)');
        return;
    }
    
    uploadedScreenshot = file;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const previewImage = document.getElementById('previewImage');
        const previewContainer = document.getElementById('previewContainer');
        if (previewImage && previewContainer) {
            previewImage.src = e.target.result;
            previewContainer.style.display = 'block';
            
            const uploadArea = document.getElementById('uploadArea');
            if (uploadArea) {
                const icon = uploadArea.querySelector('.upload-icon');
                const text = uploadArea.querySelector('p');
                if (icon) icon.innerHTML = '✅';
                if (text) text.innerHTML = 'Evidence uploaded!';
            }
        }
    };
    reader.readAsDataURL(file);
}

// ============================================
// SUBMIT RESULT
// ============================================

async function submitResult() {
    const score = document.getElementById('finalScore')?.value;
    const winnerId = document.getElementById('winnerId')?.value;
    
    if (!score) {
        alert('Please enter the final score');
        return;
    }
    
    if (!winnerId) {
        alert('Please select the winner');
        return;
    }
    
    if (!uploadedScreenshot) {
        alert('Please upload a screenshot as evidence');
        return;
    }
    
    const confirmed = confirm(
        '⚠️ IMPORTANT!\n\n' +
        'By submitting this result, you confirm that:\n' +
        '✓ You actually played this match\n' +
        '✓ The evidence is genuine\n' +
        '✓ False submissions may lead to account suspension\n\n' +
        'Proceed to submit result?'
    );
    
    if (!confirmed) return;
    
    const submitBtn = document.getElementById('submitResultBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    
    try {
        const response = await fetch(`${API_URL}/matches/${matchId}/results`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                score: score,
                screenshots: [],
                winnerId: parseInt(winnerId)
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(`✅ Results submitted! Prize: ₦${data.data.prize.toLocaleString()}`);
            window.location.href = 'dashboard.html';
        } else {
            alert(data.message || 'Failed to submit results');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Result';
        }
    } catch (error) {
        console.error('Submit error:', error);
        alert('Error submitting results. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Result';
    }
}

// ============================================
// TIMER
// ============================================

function startTimer(minutes) {
alert('⏰ Starting dispute timer: ' + minutes + ' minutes');


    let timeLeft = minutes * 60;
    const timerElement = document.getElementById('timer');
    if (!timerElement) return;
    
    const interval = setInterval(() => {
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        timerElement.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        if (timeLeft <= 0) {
            clearInterval(interval);
            timerElement.textContent = 'Expired';
            timerElement.style.color = 'red';
        }
        timeLeft--;
    }, 1000);
}

// ============================================
// HELPERS
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
// ============================================
// FFA RESULT SUBMISSION - WORKING VERSION
// ============================================

const API_URL = 'http://localhost:5000/api';
const urlParams = new URLSearchParams(window.location.search);
const matchId = urlParams.get('id');

console.log('FFA Page loaded, Match ID:', matchId);

let matchData = null;
let uploadedScreenshot = null;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded');
    
    const token = localStorage.getItem('token');
    if (!token) {
        alert('Please login');
        window.location.href = '../pages/login.html';
        return;
    }
    
    if (!matchId) {
        alert('No match specified');
        window.location.href = 'dashboard.html';
        return;
    }
    
    await loadMatchDetails();
    setupFileUpload();
    
    const submitBtn = document.getElementById('submitResultBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', submitFFAResult);
    }
});

async function loadMatchDetails() {
    try {
        console.log('Loading match details...');
        
        const response = await fetch(`${API_URL}/matches/${matchId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const data = await response.json();
        console.log('Match data:', data);
        
        if (data.success) {
            matchData = data.data;
            displayMatchInfo();
            populateRankings();
            calculatePrizes();
        } else {
            alert('Failed to load match');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error loading match');
    }
}

function displayMatchInfo() {
    document.getElementById('matchId').textContent = matchId;
    document.getElementById('stakeAmount').textContent = `₦${matchData.stake_amount}`;
}

function populateRankings() {
    // This is a simplified version - you'll need to get actual players
    const firstSelect = document.getElementById('firstPlace');
    const secondSelect = document.getElementById('secondPlace');
    const thirdSelect = document.getElementById('thirdPlace');
    
    // Example players - replace with actual match players
    const players = [
        { id: 5, name: 'ProPlayer' },
        { id: 6, name: 'Challenger' },
        { id: 7, name: 'Player3' }
    ];
    
    let options = '<option value="">Select</option>';
    players.forEach(p => {
        options += `<option value="${p.id}">${p.name}</option>`;
    });
    
    if (firstSelect) firstSelect.innerHTML = options;
    if (secondSelect) secondSelect.innerHTML = options;
    if (thirdSelect) thirdSelect.innerHTML = options;
}

function calculatePrizes() {
    const stake = parseFloat(matchData?.stake_amount || 0);
    const totalPool = stake * 8;
    const prizePool = totalPool * 0.95; // 5% fee
    
    document.getElementById('firstPrize').textContent = `₦${(prizePool * 0.5).toLocaleString()}`;
    document.getElementById('secondPrize').textContent = `₦${(prizePool * 0.3).toLocaleString()}`;
    document.getElementById('thirdPrize').textContent = `₦${(prizePool * 0.2).toLocaleString()}`;
}

function setupFileUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    
    if (!uploadArea) return;
    
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => e.preventDefault());
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) handleFile(e.target.files[0]);
    });
}

function handleFile(file) {
    if (!file.type.match('image.*')) {
        alert('Please upload an image');
        return;
    }
    uploadedScreenshot = file;
    alert('Screenshot uploaded!');
}

async function submitFFAResult() {
    const firstPlace = document.getElementById('firstPlace')?.value;
    const secondPlace = document.getElementById('secondPlace')?.value;
    const thirdPlace = document.getElementById('thirdPlace')?.value;
    
    if (!firstPlace || !secondPlace || !thirdPlace) {
        alert('Please select 1st, 2nd, and 3rd place');
        return;
    }
    
    if (!uploadedScreenshot) {
        alert('Please upload evidence screenshot');
        return;
    }
    
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
                score: `${firstPlace} won`,
                screenshots: [],
                winnerId: parseInt(firstPlace)
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('FFA results submitted successfully!');
            window.location.href = 'dashboard.html';
        } else {
            alert(data.message || 'Submission failed');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Result';
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error submitting results');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Result';
    }
}
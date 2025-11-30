import { supabase } from './supabaseClient.js';

// Initialize Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();

// Game State
let score = 0;
const scoreElement = document.getElementById('score');
const contentArea = document.getElementById('app-content');

// --- ROUTING LOGIC ---
const routes = {
    'nav-home': 'screens/home.html',
    'nav-upgrade': 'screens/upgrade.html',
    'nav-skins': 'screens/skins.html'
};

// Load Screen Function
async function loadScreen(screenUrl) {
    try {
        const response = await fetch(screenUrl);
        if (!response.ok) throw new Error('Screen not found');
        const html = await response.text();
        contentArea.innerHTML = html;
        
        // Re-attach event listeners for dynamic content
        if (screenUrl.includes('home.html')) {
            attachHomeListeners();
        } else if (screenUrl.includes('upgrade.html')) {
            // attachUpgradeListeners();
        } else if (screenUrl.includes('skins.html')) {
            // attachSkinsListeners();
        }
    } catch (error) {
        console.error('Error loading screen:', error);
        contentArea.innerHTML = '<p>Error loading content.</p>';
    }
}

// Initialize App
async function initApp() {
    // 1. Load User Data from Supabase (or local fallback)
    await loadUserData();
    
    // 2. Load Home Screen by default
    await loadScreen(routes['nav-home']);
    
    // 3. Setup Navigation
    setupNavigation();
}

// Navigation Setup
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const routeKey = item.id;
            const screenUrl = routes[routeKey];
            
            if (screenUrl) {
                // UI Update
                navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');
                
                // Load Content
                loadScreen(screenUrl);
                
                // Haptic
                if (tg.HapticFeedback) {
                    tg.HapticFeedback.selectionChanged();
                }
            }
        });
    });
}

// --- HOME SCREEN LOGIC ---
function attachHomeListeners() {
    const characterBtn = document.getElementById('character-btn');
    if (characterBtn) {
        characterBtn.addEventListener('pointerdown', handleTap);
    }
}

function handleTap(e) {
    e.preventDefault();
    
    // Increment Score
    score++;
    updateScoreDisplay();
    saveScoreDebounced(); // Save to DB
    
    // Haptic
    if (tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('medium');
    }

    // Animation
    showFloatingText(e.clientX, e.clientY);
}

// --- DATA & STATE ---
async function loadUserData() {
    // Fallback to local storage first
    const localScore = localStorage.getItem('tapalka_score');
    if (localScore) score = parseInt(localScore);
    updateScoreDisplay();

    // Try loading from Supabase
    if (supabase) {
        const user = tg.initDataUnsafe?.user;
        if (user) {
            const { data, error } = await supabase
                .from('users')
                .select('balance')
                .eq('telegram_id', user.id)
                .single();
            
            if (data) {
                score = data.balance;
                updateScoreDisplay();
                localStorage.setItem('tapalka_score', score);
            } else if (error && error.code === 'PGRST116') {
                // User doesn't exist, create them
                await supabase.from('users').insert([
                    { telegram_id: user.id, username: user.username, balance: score }
                ]);
            }
        }
    }
}

function updateScoreDisplay() {
    scoreElement.innerText = score.toLocaleString();
}

// Debounce save to not spam DB
let saveTimeout;
function saveScoreDebounced() {
    // Save to Local immediately
    localStorage.setItem('tapalka_score', score);
    
    // Save to DB after delay
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        if (supabase) {
            const user = tg.initDataUnsafe?.user;
            if (user) {
                await supabase
                    .from('users')
                    .update({ balance: score })
                    .eq('telegram_id', user.id);
            }
        }
    }, 1000); // Sync every 1 second of inactivity
}

// Helper: Floating Text
function showFloatingText(x, y) {
    const floatingText = document.createElement('div');
    floatingText.className = 'floating-text';
    floatingText.innerText = '+1';
    
    if (x === 0 && y === 0) {
        const btn = document.getElementById('character-btn');
        if (btn) {
            const rect = btn.getBoundingClientRect();
            x = rect.left + rect.width / 2;
            y = rect.top + rect.height / 2;
        }
    }
    
    floatingText.style.left = `${x}px`;
    floatingText.style.top = `${y}px`;
    
    document.body.appendChild(floatingText);
    
    setTimeout(() => {
        floatingText.remove();
    }, 1000);
}

// Start
initApp();

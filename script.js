import { supabase } from './supabaseClient.js';

// Initialize Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();

// Game State
let score = 0;
let maxEnergy = 30;
let currentEnergy = maxEnergy;
let isExhausted = false;
const REGEN_RATE = maxEnergy / 10; // Restore full energy in 10 seconds

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
            updateEnergyDisplay(); // Initial update for home screen
            updateCharacterState(); // Ensure correct state
        } else if (screenUrl.includes('upgrade.html')) {
            // attachUpgradeListeners();
        } else if (screenUrl.includes('skins.html')) {
            attachSkinsListeners();
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
    
    // 4. Start Energy Regen Loop
    startEnergyRegen();
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
    
    if (isExhausted) {
        if (tg.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('error');
        }
        return;
    }

    if (currentEnergy >= 1) {
        // Decrement Energy
        currentEnergy--;
        
        if (currentEnergy <= 0) {
            currentEnergy = 0;
            isExhausted = true;
            updateCharacterState();
        }
        
        updateEnergyDisplay();
        
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
        
        // Character Animation
        const charContainer = document.getElementById('character-btn');
        if (charContainer) {
            charContainer.style.transform = 'scale(0.95)';
            setTimeout(() => {
                charContainer.style.transform = 'scale(1)';
            }, 100);
        }
    }
}

// --- ENERGY LOGIC ---
function startEnergyRegen() {
    setInterval(() => {
        if (currentEnergy < maxEnergy) {
            currentEnergy += REGEN_RATE * 0.1; // 0.1s interval
            
            // Check exhaustion recovery
            if (isExhausted && currentEnergy >= maxEnergy / 2) {
                isExhausted = false;
                updateCharacterState();
            }
            
            if (currentEnergy > maxEnergy) currentEnergy = maxEnergy;
            updateEnergyDisplay();
        }
    }, 100);
}

function updateCharacterState() {
    const charContainer = document.getElementById('character-btn');
    if (charContainer) {
        if (isExhausted) {
            charContainer.classList.add('disabled');
        } else {
            charContainer.classList.remove('disabled');
        }
    }
}

function updateEnergyDisplay() {
    const fill = document.getElementById('energy-fill');
    const currentEl = document.getElementById('current-energy');
    const maxEl = document.getElementById('max-energy');
    
    if (fill && currentEl && maxEl) {
        const percentage = (currentEnergy / maxEnergy) * 100;
        fill.style.width = `${percentage}%`;
        currentEl.innerText = Math.floor(currentEnergy);
        maxEl.innerText = maxEnergy;
    }
}

// --- SKINS LOGIC ---
function attachSkinsListeners() {
    const skins = document.querySelectorAll('.skin-card');
    skins.forEach(skin => {
        skin.addEventListener('click', () => {
            // Remove active class from all
            skins.forEach(s => s.classList.remove('active'));
            skins.forEach(s => {
                const btn = s.querySelector('.skin-btn');
                if (btn) {
                    const price = s.dataset.price;
                    btn.innerText = price ? price : 'Выбрать';
                    btn.disabled = false;
                }
            });
            
            // Add active to clicked
            skin.classList.add('active');
            const btn = skin.querySelector('.skin-btn');
            if (btn) {
                btn.innerText = 'выбран';
                btn.disabled = true;
            }
            
            // Haptic
            if (tg.HapticFeedback) {
                tg.HapticFeedback.selectionChanged();
            }
            
            // Logic to save selected skin would go here
        });
    });
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

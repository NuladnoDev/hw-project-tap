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
            contentArea.classList.add('home');
            attachHomeListeners();
            updateEnergyDisplay(); // Initial update for home screen
            updateCharacterState(); // Ensure correct state
        } else if (screenUrl.includes('upgrade.html')) {
            contentArea.classList.remove('home');
            // attachUpgradeListeners();
        } else if (screenUrl.includes('skins.html')) {
            contentArea.classList.remove('home');
            attachSkinsListeners();
        } else if (screenUrl.includes('top_users.html')) {
            contentArea.classList.remove('home');
            loadTopUsers();
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
    
    // 3. Setup Navigation & header actions
    setupNavigation();
    setupHeaderActions();
    // Apply saved theme
    const savedTheme = localStorage.getItem('tapalka_theme') || 'dark';
    applyTheme(savedTheme);
    
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

        // Effects
        showTapEffects(e.clientX, e.clientY);
        
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

// Header buttons (top, settings, agreement)
function setupHeaderActions() {
    const leaderboardBtn = document.getElementById('btn-leaderboard');
    const settingsBtn = document.getElementById('btn-settings');
    const agreementBtn = document.getElementById('btn-agreement');
    const agreementLabel = document.querySelector('.score-agreement-label');
    if (leaderboardBtn) {
        leaderboardBtn.addEventListener('click', () => {
            loadScreen('screens/top_users.html');
            if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
        });
    }
    if (settingsBtn && !settingsBtn.disabled) {
        settingsBtn.addEventListener('click', () => {
            const current = document.body.classList.contains('theme-light') ? 'light' : 'dark';
            const next = current === 'light' ? 'dark' : 'light';
            applyTheme(next);
            if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
        });
    }
    const openAgreement = () => {
        const url = 'https://telegra.ph/KONFIDENCIALNOE-SOGLASHENIE-NDA-11-30';
        if (tg.openLink) tg.openLink(url); else window.open(url, '_blank');
        if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
    };
    if (agreementBtn) agreementBtn.addEventListener('click', openAgreement);
    if (agreementLabel) agreementLabel.addEventListener('click', openAgreement);
}

function applyTheme(theme) {
    document.body.classList.toggle('theme-light', theme === 'light');
    document.body.classList.toggle('theme-dark', theme === 'dark');
    localStorage.setItem('tapalka_theme', theme);
}

// Load leaderboard from Supabase
async function loadTopUsers() {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;
    list.innerHTML = '<div class="leaderboard-empty">Загрузка...</div>';
    try {
        if (supabase) {
            let resp = await supabase
                .from('users')
                .select('username, balance, telegram_id, avatar_url')
                .order('balance', { ascending: false })
                .limit(50);
            if (resp.error) {
                resp = await supabase
                    .from('users')
                    .select('username, balance, telegram_id')
                    .order('balance', { ascending: false })
                    .limit(50);
            }
            const data = resp.data;
            if (data && data.length) {
                list.innerHTML = '';
                const meId = tg.initDataUnsafe?.user?.id;
                data.forEach((u, i) => {
                    const item = document.createElement('div');
                    item.className = 'leaderboard-item';
                    const hasUsername = typeof u.username === 'string' && u.username.trim().length > 0;
                    const display = hasUsername ? `@${u.username.trim()}` : `@id${u.telegram_id}`;
                    const profileUrl = hasUsername ? `https://t.me/${u.username.trim()}` : `tg://user?id=${u.telegram_id}`;
                    const avatarHtml = u.avatar_url 
                        ? `<img class="leaderboard-avatar" src="${u.avatar_url}" alt="avatar">`
                        : '';
                    item.innerHTML = `
                        <div class="leaderboard-rank">${i + 1}</div>
                        <div class="leaderboard-user">${display}${avatarHtml}</div>
                        <div class="leaderboard-balance">${Number(u.balance || 0).toLocaleString()}</div>
                    `;
                    if (meId && Number(u.telegram_id) === Number(meId)) {
                        item.classList.add('me');
                    }
                    item.addEventListener('click', () => {
                        if (tg.openTelegramLink && profileUrl.startsWith('tg://')) {
                            tg.openTelegramLink(profileUrl);
                        } else if (tg.openLink) {
                            tg.openLink(profileUrl);
                        } else {
                            try { window.open(profileUrl, '_blank'); } catch (_) {}
                        }
                        if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
                    });
                    list.appendChild(item);
                });
                return;
            }
        }
        list.innerHTML = '<div class="leaderboard-empty">Нет данных</div>';
    } catch (e) {
        list.innerHTML = '<div class="leaderboard-empty">Ошибка загрузки</div>';
    }
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
                .select('balance, username')
                .eq('telegram_id', user.id)
                .single();
            
            if (data) {
                score = data.balance;
                updateScoreDisplay();
                localStorage.setItem('tapalka_score', score);
                const tgUsername = user.username;
                const tgPhotoUrl = user.photo_url;
                if (!data.username && tgUsername) {
                    await supabase
                        .from('users')
                        .update({ username: tgUsername })
                        .eq('telegram_id', user.id);
                }
                if (tgPhotoUrl) {
                    try {
                        await supabase
                            .from('users')
                            .update({ avatar_url: tgPhotoUrl })
                            .eq('telegram_id', user.id);
                    } catch (_) {}
                }
            } else if (error && error.code === 'PGRST116') {
                // User doesn't exist, create them
                await supabase.from('users').insert([
                    { telegram_id: user.id, username: user.username, balance: score, avatar_url: user.photo_url }
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

function showTapEffects(x, y) {
    if (x === 0 && y === 0) {
        const btn = document.getElementById('character-btn');
        if (btn) {
            const rect = btn.getBoundingClientRect();
            x = rect.left + rect.width / 2;
            y = rect.top + rect.height / 2;
        }
    }

    // Ripple
    const ripple = document.createElement('div');
    ripple.className = 'tap-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 520);

    // Sparkles
    const count = 8;
    for (let i = 0; i < count; i++) {
        const sparkle = document.createElement('div');
        sparkle.className = 'tap-sparkle';
        const angle = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 30;
        const size = 6 + Math.random() * 6;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        sparkle.style.left = `${x}px`;
        sparkle.style.top = `${y}px`;
        sparkle.style.setProperty('--dx', `${dx}px`);
        sparkle.style.setProperty('--dy', `${dy}px`);
        sparkle.style.setProperty('--size', `${size}px`);
        document.body.appendChild(sparkle);
        setTimeout(() => sparkle.remove(), 700);
    }

    // Floating +1
    showFloatingText(x, y);

    // Score bounce
    if (scoreElement) {
        scoreElement.classList.add('score-pop');
        setTimeout(() => scoreElement.classList.remove('score-pop'), 360);
    }
}

// Start
initApp();

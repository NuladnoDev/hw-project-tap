import { supabase } from './supabaseClient.js';

// Initialize Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();

// Game State
let score = 0;
let maxEnergy = 30;
let currentEnergy = maxEnergy;
let isExhausted = false;
let regenMultiplier = 1;
const BASE_REGEN_PER_SEC = 3;
let tapPower = 1;

const scoreElement = document.getElementById('score');
const contentArea = document.getElementById('app-content');

// --- ROUTING LOGIC ---
const routes = {
    'nav-home': 'screens/home.html',
    'nav-upgrade': 'screens/upgrade.html',
    'nav-skins': 'screens/skins.html'
};

let homeScrollLockHandler = null;
let homeWheelLockHandler = null;
let homeTouchLockHandler = null;

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
            contentArea.scrollTop = 0;
            if (!homeScrollLockHandler) {
                homeScrollLockHandler = () => {
                    if (contentArea.classList.contains('home')) contentArea.scrollTop = 0;
                };
                contentArea.addEventListener('scroll', homeScrollLockHandler, { passive: true });
            }
            if (!homeWheelLockHandler) {
                homeWheelLockHandler = (e) => {
                    if (contentArea.classList.contains('home')) e.preventDefault();
                };
                contentArea.addEventListener('wheel', homeWheelLockHandler, { passive: false });
            }
            if (!homeTouchLockHandler) {
                homeTouchLockHandler = (e) => {
                    if (contentArea.classList.contains('home')) e.preventDefault();
                };
                contentArea.addEventListener('touchmove', homeTouchLockHandler, { passive: false });
            }
        } else if (screenUrl.includes('upgrade.html')) {
            contentArea.classList.remove('home');
            attachUpgradeListeners();
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
    applyUpgradesFromState();
    
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
        showNotify('Недостаточно энергии');
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
        score += tapPower;
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
            currentEnergy += BASE_REGEN_PER_SEC * regenMultiplier * 0.1;
            
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

const UPGRADE_BASE = {
    energy: {1: 30, 2: 60, 3: 100},
    speed: {1: 1.0, 2: 1.5, 3: 2.5},
    multitap: {1: 1, 2: 2, 3: 4}
};

const UPGRADE_COST = {
    energy: {2: 500, 3: 2500},
    speed: {2: 1000, 3: 5000},
    multitap: {2: 2000, 3: 10000}
};

function getUpgradeState() {
    try {
        const raw = localStorage.getItem('tapalka_upgrades');
        if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { energy: 1, speed: 1, multitap: 1 };
}

function saveUpgradeState(state) {
    localStorage.setItem('tapalka_upgrades', JSON.stringify(state));
}

function applyUpgradesFromState() {
    const state = getUpgradeState();
    maxEnergy = UPGRADE_BASE.energy[state.energy];
    regenMultiplier = UPGRADE_BASE.speed[state.speed];
    tapPower = UPGRADE_BASE.multitap[state.multitap];
    if (currentEnergy > maxEnergy) currentEnergy = maxEnergy;
    updateEnergyDisplay();
}

function attachUpgradeListeners() {
    applyUpgradesFromState();
    renderUpgradeUI();
    const buttons = contentArea.querySelectorAll('.upgrade-item .upgrade-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const parent = btn.closest('.upgrade-item');
            if (!parent) return;
            const type = parent.dataset.upgrade;
            const state = getUpgradeState();
            if (state[type] >= 3) {
                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
                showNotify('уже MAX уровень');
                return;
            }
            purchaseUpgrade(type);
        });
    });
}

function renderUpgradeUI() {
    const state = getUpgradeState();
    ['energy','speed','multitap'].forEach(type => {
        const item = contentArea.querySelector(`.upgrade-item[data-upgrade="${type}"]`);
        if (!item) return;
        const title = item.querySelector('.upgrade-info h3');
        const desc = item.querySelector('.upgrade-info p');
        const btn = item.querySelector('.upgrade-btn');
        const levels = item.querySelectorAll('.upgrade-levels .level-box');
        const currentLevel = state[type];
        const nextLevel = Math.min(currentLevel + 1, 3);
        if (title) title.innerHTML = `${mapTitle(type)} <span class="level-badge">${currentLevel}</span>`;
        if (desc) desc.innerText = mapDescription(type, nextLevel);
        item.classList.toggle('max', currentLevel >= 3);
        const levelsWrap = item.querySelector('.upgrade-levels');
        if (levelsWrap) levelsWrap.classList.toggle('max', currentLevel >= 3);
        if (currentLevel >= 3) {
            btn.innerHTML = '<span class="badge-max">MAX</span> уровень';
            btn.classList.add('max');
            btn.disabled = false;
            btn.dataset.max = 'true';
        } else {
            const price = UPGRADE_COST[type][nextLevel];
            btn.innerText = `купить за ${price.toLocaleString()}`;
            btn.disabled = false;
            btn.classList.remove('max');
            btn.dataset.max = 'false';
        }
        if (levels && levels.length === 3) {
            levels.forEach((el, idx) => {
                el.textContent = '';
                el.classList.remove('active','next');
                if (idx < currentLevel) el.classList.add('active');
            });
        }
    });
}

function mapTitle(type) {
    if (type === 'energy') return 'Энергия';
    if (type === 'speed') return 'Скорость';
    if (type === 'multitap') return 'Мультитап';
    return type;
}

function mapDescription(type, level) {
    if (type === 'energy') {
        const target = UPGRADE_BASE.energy[level];
        return `лимит ${target}`;
    }
    if (type === 'speed') {
        const mult = UPGRADE_BASE.speed[level];
        return `восстановление x${mult}`;
    }
    if (type === 'multitap') {
        const val = UPGRADE_BASE.multitap[level];
        return `за тап +${val}`;
    }
    return '';
}

function purchaseUpgrade(type) {
    const state = getUpgradeState();
    const currentLevel = state[type];
    if (currentLevel >= 3) return;
    const nextLevel = currentLevel + 1;
    const price = UPGRADE_COST[type][nextLevel];
    if (score < price) {
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        showNotify('Недостаточно баланса', 'icons/etc/Money_fill.svg');
        return;
    }
    score -= price;
    updateScoreDisplay();
    saveScoreDebounced();
    state[type] = nextLevel;
    saveUpgradeState(state);
    applyUpgradesFromState();
    renderUpgradeUI();
    if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
}

let notifyLastTs = 0;
function showNotify(text, icon) {
    const root = document.getElementById('notify-root');
    if (!root) return;
    const now = Date.now();
    if (now - notifyLastTs < 800) return;
    notifyLastTs = now;
    const el = document.createElement('div');
    el.className = 'notify-banner';
    el.innerHTML = icon ? `<img class="notify-icon" src="${icon}" alt=""> <span>${text}</span>` : text;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 200);
    }, 1400);
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
    floatingText.innerText = `+${tapPower}`;
    
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

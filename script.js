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
const ENERGY_KEY = 'tapalka_energy_current';
let lastEnergySaveTs = 0;
let incomePerMin = 50;
let passiveTimerId = null;
let passiveSaveTs = 0;

const scoreElement = document.getElementById('score');
const contentArea = document.getElementById('app-content');

// --- ROUTING LOGIC ---
const routes = {
    'nav-home': 'screens/home.html',
    'nav-upgrade': 'screens/upgrade.html',
    'nav-skins': 'screens/skins.html',
    'nav-cases': null
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
        } else if (screenUrl.includes('cases.html')) {
            contentArea.classList.remove('home');
            attachCasesListeners();
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
    await loadUserData();
    const savedTheme = localStorage.getItem('tapalka_theme') || 'dark';
    applyTheme(savedTheme);
    applyUpgradesFromState();
    const savedEnergyRaw = localStorage.getItem(ENERGY_KEY);
    const savedEnergy = savedEnergyRaw ? Number(savedEnergyRaw) : NaN;
    currentEnergy = Number.isFinite(savedEnergy)
        ? Math.min(Math.max(0, savedEnergy), maxEnergy)
        : maxEnergy;
    await loadScreen(routes['nav-home']);
    setupNavigation();
    setupHeaderActions();
    updateEnergyDisplay();
    startEnergyRegen();
    startPassiveIncomeTick();
}

// Navigation Setup
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const routeKey = item.id;
            if (routeKey === 'nav-cases') {
                showNotify('Кейсы пока не доступны');
                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
                return;
            }
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
            const now = Date.now();
            if (now - lastEnergySaveTs > 1000) {
                localStorage.setItem(ENERGY_KEY, String(Math.floor(currentEnergy)));
                lastEnergySaveTs = now;
            }
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

function attachCasesListeners() {
    const cards = contentArea.querySelectorAll('.case-card');
    cards.forEach(card => initCaseCard(card));
    const backdrop = contentArea.querySelector('#case-modal-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', (e) => {
            const modal = backdrop.querySelector('.case-modal');
            if (!modal) return;
            if (!modal.contains(e.target)) hideCaseModal();
        });
    }
}

function initCaseCard(card) {
    const id = card.dataset.case;
    const btn = card.querySelector('.case-btn');
    const cooldown = Number(card.dataset.cooldown || 30);
    const min = Number(card.dataset.min || 0);
    const max = Number(card.dataset.max || 0);
    const type = card.dataset.type || 'money';
    const key = `case_last_${id}`;
    const last = Number(localStorage.getItem(key) || 0);
    const now = Date.now();
    const remain = Math.max(0, Math.ceil((last + cooldown * 1000 - now) / 1000));
    if (remain > 0) {
        setCaseBtnCountdown(btn, remain);
        startCaseCooldownTimer(btn, key, cooldown);
        btn.disabled = true;
    } else {
        btn.innerText = 'открыть';
        btn.disabled = false;
    }
    btn.addEventListener('click', () => {
        const lastOpen = Number(localStorage.getItem(key) || 0);
        const nowTs = Date.now();
        if (nowTs - lastOpen < cooldown * 1000) return;
        showCasePreview(card, { key, cooldown, min, max, type });
    });
}

function setCaseBtnCountdown(btn, sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    btn.innerText = `${m}:${String(s).padStart(2, '0')}`;
}

function startCaseCooldownTimer(btn, key, cooldown) {
    const timer = setInterval(() => {
        const last = Number(localStorage.getItem(key) || 0);
        const now = Date.now();
        const remain = Math.max(0, Math.ceil((last + cooldown * 1000 - now) / 1000));
        if (remain <= 0) {
            clearInterval(timer);
            btn.innerText = 'открыть';
            btn.disabled = false;
        } else {
            setCaseBtnCountdown(btn, remain);
        }
    }, 250);
}

function showCasePreview(card, meta) {
    const backdrop = contentArea.querySelector('#case-modal-backdrop');
    if (!backdrop) return;
    const modal = backdrop.querySelector('.case-modal');
    const img = card.querySelector('.case-preview img');
    const title = card.querySelector('.case-title')?.innerText || 'Кейс';
    const skins = getCaseSkinsFor(card.dataset.case);
    const chips = skins.map(s => `<span class="skin-chip ${skinChipClass(s)}">${s}</span>`).join('');
    modal.innerHTML = `
        <div class="case-modal-header">
            <img class="case-modal-icon" src="${img?.src || ''}" alt="${title}">
            <div class="case-modal-title">${title}</div>
        </div>
        <div class="case-modal-body">
            <div class="case-modal-range"><img src="icons/etc/Money_fill.svg" alt=""> <span>от ${meta.min} до ${meta.max}</span></div>
            <div class="case-modal-skins">${chips}</div>
        </div>
        <div class="case-modal-actions">
            <button id="case-confirm" class="case-btn">открыть</button>
            <button id="case-cancel" class="skin-btn">закрыть</button>
        </div>
    `;
    backdrop.hidden = false;
    const confirm = modal.querySelector('#case-confirm');
    const cancel = modal.querySelector('#case-cancel');
    const btn = card.querySelector('.case-btn');
    confirm?.addEventListener('click', () => {
        localStorage.setItem(meta.key, String(Date.now()));
        startCaseCooldownTimer(btn, meta.key, meta.cooldown);
        btn.disabled = true;
        grantCaseReward(meta.type, meta.min, meta.max, card.dataset.case);
        hideCaseModal();
    });
    cancel?.addEventListener('click', hideCaseModal);
}

function hideCaseModal() {
    const backdrop = contentArea.querySelector('#case-modal-backdrop');
    if (backdrop) backdrop.hidden = true;
}

function grantCaseReward(type, min, max, id) {
    if (type === 'money') {
        const amount = Math.floor(min + Math.random() * (max - min + 1));
        score += amount;
        updateScoreDisplay();
        saveScoreDebounced();
        showNotify(`+${amount}`, 'icons/etc/Money_fill.svg');
        return;
    }
    const roll = Math.random();
    const moneyChance = id === 'legend' ? 0.5 : id === 'premium' ? 0.6 : 0.7;
    if (roll < moneyChance) {
        const amount = Math.floor(min + Math.random() * (max - min + 1));
        score += amount;
        updateScoreDisplay();
        saveScoreDebounced();
        showNotify(`+${amount}`, 'icons/etc/Money_fill.svg');
    } else {
        const skins = getCaseSkinsFor(id);
        const picked = skins[Math.floor(Math.random() * skins.length)];
        showNotify(`выпал скин: ${picked}`);
    }
}

function getCaseSkinsFor(id) {
    if (id === 'standard') return ['Базовый','Продвинутый'];
    if (id === 'premium') return ['Продвинутый','PRO'];
    if (id === 'legend') return ['PRO','ULTRA'];
    return ['Базовый'];
}

function skinChipClass(name) {
    if (name === 'Базовый') return 'chip-base';
    if (name === 'Продвинутый') return 'chip-adv';
    if (name === 'PRO') return 'chip-pro';
    if (name === 'ULTRA') return 'chip-ultra';
    return 'chip-base';
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
        showNotify('Недостаточно баланса', 'icons/etc/Remove.svg');
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
            const me = tg.initDataUnsafe?.user;
            if (me) {
                try {
                    await supabase
                        .from('users')
                        .update({ username: me.username || null, avatar_url: me.photo_url || null })
                        .eq('telegram_id', me.id);
                } catch (_) {}
            }
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
            let { data, error } = await supabase
                .from('users')
                .select('balance, username, avatar_url, income_per_min, last_income_at')
                .eq('telegram_id', user.id)
                .single();
            
            if (!data && error) {
                const resp2 = await supabase
                    .from('users')
                    .select('balance, username, avatar_url')
                    .eq('telegram_id', user.id)
                    .single();
                data = resp2.data;
                error = resp2.error;
            }
            
            if (data) {
                incomePerMin = Number(data.income_per_min || 50);
                const now = Date.now();
                const last = data.last_income_at ? new Date(data.last_income_at).getTime() : now;
                const mins = Math.floor((now - last) / 60000);
                score = Number(data.balance || 0) + Math.max(0, mins) * incomePerMin;
                updateScoreDisplay();
                localStorage.setItem('tapalka_score', score);
                try {
                    await supabase
                        .from('users')
                        .update({ balance: score, last_income_at: new Date(now).toISOString(), income_per_min: incomePerMin })
                        .eq('telegram_id', user.id);
                } catch (_) {}
                const tgUsername = user.username || null;
                const tgPhotoUrl = user.photo_url || null;
                const updates = {};
                if (data.username !== tgUsername) updates.username = tgUsername;
                if (data.avatar_url !== tgPhotoUrl) updates.avatar_url = tgPhotoUrl;
                if (Object.keys(updates).length) {
                    try {
                        await supabase
                            .from('users')
                            .update(updates)
                            .eq('telegram_id', user.id);
                    } catch (_) {}
                }
            } else if (error && error.code === 'PGRST116') {
                await supabase.from('users').insert([
                    { telegram_id: user.id, username: user.username, balance: score, avatar_url: user.photo_url, income_per_min: incomePerMin, last_income_at: new Date().toISOString() }
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
                const nowIso = new Date().toISOString();
                await supabase
                    .from('users')
                    .update({ balance: score, last_income_at: nowIso })
                    .eq('telegram_id', user.id);
            }
        }
    }, 1000); // Sync every 1 second of inactivity
}

function startPassiveIncomeTick() {
    if (passiveTimerId) clearInterval(passiveTimerId);
    const msPerCoin = incomePerMin > 0 ? Math.max(200, Math.floor(60000 / incomePerMin)) : 0;
    if (msPerCoin > 0) {
        passiveTimerId = setInterval(async () => {
            score += 1;
            updateScoreDisplay();
            localStorage.setItem('tapalka_score', score);
            const now = Date.now();
            if (supabase) {
                const user = tg.initDataUnsafe?.user;
                if (user && now - passiveSaveTs >= 60000) {
                    passiveSaveTs = now;
                    try {
                        await supabase
                            .from('users')
                            .update({ balance: score, last_income_at: new Date().toISOString() })
                            .eq('telegram_id', user.id);
                    } catch (_) {}
                }
            }
        }, msPerCoin);
    }
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

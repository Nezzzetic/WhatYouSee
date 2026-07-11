// progression.js — meta score, atlas pages, created shapes, XP (legacy)

// =============================================================================
// STATE
// =============================================================================

let totalXP = 0;
let playerLevel = 1;
let metaScore = 0;
let unlockedPageIndices = new Set();
let createdShapes = new Set();
let favoriteShapes = new Set();
let playerId = '';
let devDayOffset = 0;

// Legacy (migration only)
let globalDiscoveredShapes = new Set();
let atlasClaimedShapes = new Set();

// Версия каталога фигур в сейве. 1 = каталог-29 (топологический режим).
// Сейвы без поля catalogVersion — с геометрического демо: прогрессия по
// фигурам сбрасывается при загрузке (demo-to-graph-catalog).
const CATALOG_SAVE_VERSION = 1;

// =============================================================================
// HELPERS
// =============================================================================

function normalizeShapeName(shapeName) {
    if (typeof shapeName !== 'string') return null;
    const trimmed = shapeName.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function ensurePlayerId() {
    if (playerId) return playerId;
    try {
        const stored = localStorage.getItem('starsReborn_playerId');
        if (stored) {
            playerId = stored;
            return playerId;
        }
    } catch (e) { /* ignore */ }
    playerId = 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    try {
        localStorage.setItem('starsReborn_playerId', playerId);
    } catch (e) { /* ignore */ }
    return playerId;
}

function getMetaScore() {
    return metaScore;
}

function awardMetaScore(amount) {
    const n = Math.max(0, Math.floor(amount));
    if (n <= 0) return 0;
    metaScore += n;
    maybeAutoUnlockAtlasPages();
    saveProgression();
    return n;
}

/** S-01: страницы атласа открываются автоматически, как только хватает ✦. */
function maybeAutoUnlockAtlasPages() {
    let unlockedAny = false;
    let next = getNextLockedAtlasPageIndex();
    while (next >= 0 && metaScore >= getAtlasPageUnlockCost(next)) {
        metaScore -= getAtlasPageUnlockCost(next);
        unlockedPageIndices.add(next);
        unlockedAny = true;
        if (typeof showInfoToast === 'function') {
            showInfoToast('📖', 'Открыта страница атласа', `Страница ${next + 1} — новые фигуры в наборе`);
        }
        next = getNextLockedAtlasPageIndex();
    }
    if (unlockedAny) {
        if (typeof raiseUndoFloor === 'function') raiseUndoFloor();
        if (typeof updateProgressionUI === 'function') updateProgressionUI();
        if (typeof refreshConstellationHintsIfLevelComplete === 'function') refreshConstellationHintsIfLevelComplete();
        if (typeof document !== 'undefined') {
            const atlasOverlay = document.getElementById('atlasOverlay');
            if (atlasOverlay && atlasOverlay.classList.contains('visible')
                && typeof renderAtlasOverlay === 'function') {
                renderAtlasOverlay();
            }
        }
        saveProgression();
    }
    return unlockedAny;
}

// =============================================================================
// ATLAS PAGES
// =============================================================================

function isAtlasPageUnlocked(pageIndex) {
    return unlockedPageIndices.has(pageIndex);
}

function getAtlasPageUnlockCost(pageIndex) {
    if (pageIndex < 0 || pageIndex >= ATLAS_PAGE_COSTS.length) return 9999;
    return ATLAS_PAGE_COSTS[pageIndex];
}

function getNextLockedAtlasPageIndex() {
    for (let i = 0; i < ATLAS_PAGE_COUNT; i++) {
        if (!isAtlasPageUnlocked(i)) return i;
    }
    return -1;
}

function canUnlockAtlasPage(pageIndex) {
    if (pageIndex < 0 || pageIndex >= ATLAS_PAGE_COUNT) return false;
    if (isAtlasPageUnlocked(pageIndex)) return false;
    return metaScore >= getAtlasPageUnlockCost(pageIndex);
}

function unlockAtlasPage(pageIndex) {
    if (!canUnlockAtlasPage(pageIndex)) return false;
    const cost = getAtlasPageUnlockCost(pageIndex);
    metaScore -= cost;
    unlockedPageIndices.add(pageIndex);
    saveProgression();
    return true;
}

function getAtlasPageForShape(shapeName) {
    const normalized = normalizeShapeName(shapeName);
    if (!normalized) return -1;
    for (let i = 0; i < ATLAS_PAGES.length; i++) {
        if (ATLAS_PAGES[i].includes(normalized)) return i;
    }
    return -1;
}

function isShapeOnAtlas(shapeName) {
    return getAtlasPageForShape(shapeName) >= 0;
}

function isShapeVisibleInAtlas(shapeName) {
    const page = getAtlasPageForShape(shapeName);
    if (page < 0) return false;
    return isAtlasPageUnlocked(page);
}

/** Атласная фигура с закрытой страницы не показывается и не идёт в итоги уровня. */
function clampShapeToAtlasVisibility(shapeName) {
    const normalized = normalizeShapeName(shapeName);
    if (!normalized || normalized === 'Фигура') return 'Фигура';
    if (isShapeOnAtlas(normalized) && !isShapeVisibleInAtlas(normalized)) return 'Фигура';
    return normalized;
}

/** Созвездие — первая на поле копия атласной фигуры с открытой страницы (дубликаты не подсвечиваем). */
function isShapeRecognizedOnUnlockedAtlas(constellation) {
    if (!constellation) return false;
    const name = normalizeShapeName(constellation.shape || constellation.name);
    if (!name || name === 'Фигура') return false;
    if (!isShapeVisibleInAtlas(name)) return false;

    const committed = Array.isArray(constellations) ? constellations : [];
    for (const c of committed) {
        if (!c) continue;
        const cn = normalizeShapeName(c.shape || c.name);
        if (cn !== name) continue;
        if (!isShapeVisibleInAtlas(cn)) continue;
        return c === constellation;
    }
    return false;
}

function getUnlockedAtlasShapeNames() {
    const names = [];
    for (let i = 0; i < ATLAS_PAGES.length; i++) {
        if (!isAtlasPageUnlocked(i)) continue;
        names.push(...ATLAS_PAGES[i]);
    }
    return names;
}

function getUncreatedUnlockedShapeNames() {
    return getUnlockedAtlasShapeNames().filter(name => !isShapeCreated(name));
}

// =============================================================================
// CREATED SHAPES
// =============================================================================

function isShapeCreated(shapeName) {
    const normalized = normalizeShapeName(shapeName);
    if (!normalized) return false;
    return createdShapes.has(normalized);
}

function markShapeCreated(shapeName) {
    const normalized = normalizeShapeName(shapeName);
    if (!normalized) return false;
    if (createdShapes.has(normalized)) return false;
    createdShapes.add(normalized);
    globalDiscoveredShapes.add(normalized);
    saveProgression();
    return true;
}

function revertShapeCreated(shapeName) {
    const normalized = normalizeShapeName(shapeName);
    if (!normalized) return false;
    if (!createdShapes.has(normalized)) return false;
    createdShapes.delete(normalized);
    globalDiscoveredShapes.delete(normalized);
    saveProgression();
    return true;
}

/** @deprecated use markShapeCreated */
function markShapeDiscovered(shapeName) {
    return markShapeCreated(shapeName);
}

// =============================================================================
// DEV DAY OFFSET
// =============================================================================

function getDevDayOffset() {
    return devDayOffset;
}

function incrementDevDayOffset() {
    devDayOffset += 1;
    saveProgression();
    return devDayOffset;
}

// =============================================================================
// LEGACY XP (atlas claim — UI removed; kept for saves)
// =============================================================================

function isAtlasXpClaimed(shapeName) {
    const normalized = normalizeShapeName(shapeName);
    if (!normalized) return false;
    return atlasClaimedShapes.has(normalized);
}

function canClaimAtlasXP(shapeName) {
    return false;
}

function hasClaimableAtlasXP() {
    return false;
}

function claimAtlasXP(shapeName) {
    return { xpGained: 0, leveledUp: false, newLevel: playerLevel };
}

function awardXP(shapeName) {
    return claimAtlasXP(shapeName);
}

function awardXPForFieldGoal(amount) {
    const result = { xpGained: 0, leveledUp: false, newLevel: playerLevel };
    if (amount <= 0) return result;
    totalXP += amount;
    result.xpGained = amount;
    const newLevel = computeLevel(totalXP);
    if (newLevel > playerLevel) {
        playerLevel = newLevel;
        result.leveledUp = true;
        result.newLevel = newLevel;
    }
    saveProgression();
    return result;
}

function computeLevel(xp) {
    let level = 1;
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
        if (xp >= LEVEL_THRESHOLDS[i]) {
            level = i + 1;
        }
    }
    return level;
}

function getNextLevelThreshold() {
    if (playerLevel >= LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    return LEVEL_THRESHOLDS[playerLevel];
}

function getCurrentLevelThreshold() {
    return LEVEL_THRESHOLDS[playerLevel - 1] || 0;
}

function getLevelName(level) {
    if (level < 1) return LEVEL_NAMES[0];
    if (level > LEVEL_NAMES.length) return LEVEL_NAMES[LEVEL_NAMES.length - 1];
    return LEVEL_NAMES[level - 1];
}

function isFavoriteShape(shapeName) {
    const normalized = normalizeShapeName(shapeName);
    if (!normalized) return false;
    return favoriteShapes.has(normalized);
}

function toggleFavoriteShape(shapeName) {
    const normalized = normalizeShapeName(shapeName);
    if (!normalized) return false;
    if (favoriteShapes.has(normalized)) {
        favoriteShapes.delete(normalized);
        saveProgression();
        return false;
    }
    favoriteShapes.add(normalized);
    saveProgression();
    return true;
}

/**
 * Миграция сейва на каталог-29 (demo-to-graph-catalog, решение заказчика: сброс).
 * Сбрасываем прогрессию по ФИГУРАМ (созданные фигуры, пер-фигурные цепочки,
 * особые достижения страниц, atlasCollected — самозаживает через createdShapes).
 * Сохраняем: ✦, открытые страницы, уровень, не-фигурные достижения,
 * закоммиченное поле игрока и его подписи (историю не трогаем).
 */
function migrateSaveToCatalog29() {
    createdShapes = new Set();
    globalDiscoveredShapes = new Set();
    atlasClaimedShapes = new Set();
    favoriteShapes = new Set();
    if (typeof resetShapeAchievementsForCatalogMigration === 'function') {
        resetShapeAchievementsForCatalogMigration();
    }
    saveProgression();
}

function resetProgressionForFullReset() {
    totalXP = 0;
    playerLevel = 1;
    metaScore = 0;
    unlockedPageIndices = new Set();
    createdShapes = new Set();
    favoriteShapes = new Set();
    globalDiscoveredShapes = new Set();
    atlasClaimedShapes = new Set();
    devDayOffset = 0;
    if (typeof resetAchievementsForFullReset === 'function') resetAchievementsForFullReset();
}

// =============================================================================
// PERSISTENCE
// =============================================================================

const PROGRESSION_SAVE_KEY = 'starsReborn_progression';

function saveProgression() {
    try {
        const state = {
            totalXP,
            playerLevel,
            metaScore,
            unlockedPageIndices: [...unlockedPageIndices],
            createdShapes: [...createdShapes],
            favoriteShapes: [...favoriteShapes],
            playerId: ensurePlayerId(),
            devDayOffset,
            catalogVersion: CATALOG_SAVE_VERSION
        };
        if (typeof getAchievementSaveData === 'function') {
            Object.assign(state, getAchievementSaveData());
        }
        localStorage.setItem(PROGRESSION_SAVE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('Progression save failed:', e);
    }
}

function loadProgression() {
    try {
        ensurePlayerId();
        const raw = localStorage.getItem(PROGRESSION_SAVE_KEY);

        if (!raw) {
            if (typeof applyAchievementSaveData === 'function') applyAchievementSaveData(null);
            saveProgression();
            return false;
        }

        const state = JSON.parse(raw);
        totalXP = state.totalXP || 0;
        playerLevel = state.playerLevel || 1;
        metaScore = state.metaScore || 0;
        devDayOffset = state.devDayOffset || 0;

        if (state.playerId) playerId = state.playerId;

        unlockedPageIndices = new Set(
            Array.isArray(state.unlockedPageIndices) ? state.unlockedPageIndices : []
        );

        createdShapes = new Set(state.createdShapes || []);
        favoriteShapes = new Set(Array.isArray(state.favoriteShapes) ? state.favoriteShapes : []);

        if (Array.isArray(state.globalDiscoveredShapes) && createdShapes.size === 0) {
            createdShapes = new Set(state.globalDiscoveredShapes);
        }
        globalDiscoveredShapes = new Set(createdShapes);
        atlasClaimedShapes = new Set(state.atlasClaimedShapes || [...createdShapes]);

        if (typeof applyAchievementSaveData === 'function') applyAchievementSaveData(state);

        // Каталог-29: старый (геометрический) сейв → сброс прогрессии по фигурам.
        if ((Number(state.catalogVersion) || 0) < CATALOG_SAVE_VERSION) {
            migrateSaveToCatalog29();
        }

        playerLevel = computeLevel(totalXP);
        ensurePlayerId();

        // S-01: если накопленных ✦ уже хватает — страница открывается сразу
        maybeAutoUnlockAtlasPages();
        return true;
    } catch (e) {
        console.warn('Progression load failed:', e);
        return false;
    }
}

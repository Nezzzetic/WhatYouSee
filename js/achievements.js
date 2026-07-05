// achievements.js — Страница достижений (V-06): цепочки квестов, проверки, прогресс, оверлей 🏆

// =============================================================================
// КОНСТАНТЫ
// =============================================================================

const ACHIEVEMENT_STEP_REWARD = 5; // плоско: 5 ✦ за каждый шаг

// colorValue тира → внутреннее имя цвета
const ACHIEVEMENT_BUCKET_BY_VALUE = { '-100': 'red', '-50': 'orange', '0': 'yellow', '50': 'white', '100': 'blue' };
const ACHIEVEMENT_COLOR_KEYS = ['red', 'orange', 'yellow', 'white', 'blue'];
const ACHIEVEMENT_COLOR_RU = { red: 'красный', orange: 'оранжевый', yellow: 'жёлтый', white: 'белый', blue: 'голубой' };
const ACHIEVEMENT_COLOR_TITLE = { red: 'Багровые', orange: 'Янтарные', yellow: 'Золотые', white: 'Жемчужные', blue: 'Лазурные' };
const ACHIEVEMENT_COLOR_ICON = { red: '🔴', orange: '🟠', yellow: '🟡', white: '⚪', blue: '🔵' };
const ACHIEVEMENT_SIZE_ICON = { 3: '3️⃣', 4: '4️⃣', 5: '5️⃣', 6: '6️⃣', 7: '7️⃣' };
const ACHIEVEMENT_SIZE_KEYS = ['3', '4', '5', '6', '7', '8plus'];

// =============================================================================
// ОПРЕДЕЛЕНИЕ ЦЕПОЧЕК (17 слотов)
// =============================================================================

function buildColorChain(color) {
    const tiers = [1, 5, 15, 30, 60];
    return {
        id: 'color_' + color,
        title: ACHIEVEMENT_COLOR_TITLE[color],
        icon: ACHIEVEMENT_COLOR_ICON[color],
        steps: tiers.map(n => ({
            id: `color_${color}_${n}`,
            desc: `${n} созвездий цвета «${ACHIEVEMENT_COLOR_RU[color]}»`,
            check: { type: 'colorTotal', color, n }
        }))
    };
}

function buildExactSizeChain(size) {
    const tiers = [1, 5, 15, 30, 60];
    return {
        id: 'size_' + size,
        title: `${size}★`,
        icon: ACHIEVEMENT_SIZE_ICON[size],
        steps: tiers.map(n => ({
            id: `size_${size}_${n}`,
            desc: `${n} созвездий по ${size}★`,
            check: { type: 'starCountTotal', mode: 'exact', size, n }
        }))
    };
}

/** S-01: пер-фигурная цепочка (по одной на каждую фигуру атласа). */
function buildShapeChain(shapeName) {
    return {
        id: 'shape_' + shapeName,
        title: shapeName,
        icon: '✨',
        isShapeChain: true,
        shapeName,
        stepReward: SHAPE_CHAIN_STEP_REWARD,
        steps: SHAPE_CHAIN_TIERS.map((n, i) => ({
            id: `shape_${shapeName}_${n}`,
            desc: i === 0
                ? `Создай «${shapeName}» впервые`
                : `«${shapeName}» — ${n} созданий`,
            check: { type: 'shapeTotal', shape: shapeName, n }
        }))
    };
}

const ACHIEVEMENT_ALL_ATLAS_SHAPES = ATLAS_PAGES.flat();

const ACHIEVEMENT_CHAINS = [
    ...ACHIEVEMENT_COLOR_KEYS.map(buildColorChain),
    ...[3, 4, 5, 6, 7].map(buildExactSizeChain),
    {
        id: 'size_8plus',
        title: '8★+',
        icon: '✴️',
        steps: [1, 3, 8, 15, 25].map(n => ({
            id: `size_8plus_${n}`,
            desc: `${n} созвездий от 8★`,
            check: { type: 'starCountTotal', mode: 'gte', size: 8, n }
        }))
    },
    {
        id: 'rainbow',
        title: 'Радуга',
        icon: '🌈',
        requiresPageComplete: 0, // S-01: особенное достижение страницы 0
        steps: [1, 3, 7, 15, 30].map(n => ({
            id: `rainbow_${n}`,
            desc: `${n} ночей с полной радугой (все 5 цветов за ночь)`,
            check: { type: 'rainbowNights', n }
        }))
    },
    {
        id: 'nights',
        title: 'Странник ночей',
        icon: '🌙',
        steps: [1, 5, 25, 100, 250].map(n => ({
            id: `nights_${n}`,
            desc: `${n} завершённых ночей`,
            check: { type: 'levelsCompleted', n }
        }))
    },
    {
        id: 'constellations',
        title: 'Зодчий небес',
        icon: '🏛️',
        steps: [10, 50, 250, 1000, 5000].map(n => ({
            id: `constellations_${n}`,
            desc: `${n} созвездий создано всего`,
            check: { type: 'totalConstellations', n }
        }))
    },
    {
        id: 'mosaic',
        title: 'Мозаика',
        icon: '🧩',
        requiresPageComplete: 1, // S-01: особенное достижение страницы 1
        steps: [1, 3, 7, 15, 30].map(n => ({
            id: `mosaic_${n}`,
            desc: `${n} ночей с полной мозаикой (созвездия 2★,3★,4★,5★,6★,7★ и 8★+ на одном поле)`,
            check: { type: 'mosaicNights', n }
        }))
    },
    {
        id: 'minimalism',
        title: 'Минимализм',
        icon: '🔷',
        steps: [{ id: 'minimalism_1', desc: 'Заверши ночь одним созвездием', check: { type: 'singleConstellation' } }]
    },
    {
        id: 'unite_all',
        title: 'Созвездие-всё',
        icon: '🌌',
        steps: [{ id: 'unite_all_1', desc: 'Объедини все звёзды поля в одно созвездие', check: { type: 'uniteAll' } }]
    },
    ...ACHIEVEMENT_ALL_ATLAS_SHAPES.map(buildShapeChain)
];

function getAchievementChainById(chainId) {
    return ACHIEVEMENT_CHAINS.find(c => c.id === chainId) || null;
}

function getShapeChainForShape(shapeName) {
    const normalized = typeof normalizeShapeName === 'function' ? normalizeShapeName(shapeName) : shapeName;
    if (!normalized) return null;
    return getAchievementChainById('shape_' + normalized);
}

function getAchievementChainStepReward(chain) {
    return chain && typeof chain.stepReward === 'number' ? chain.stepReward : ACHIEVEMENT_STEP_REWARD;
}

/** S-01: полный комплект страницы — все фигуры страницы созданы. */
function isAtlasPageSetComplete(pageIndex) {
    if (pageIndex < 0 || pageIndex >= ATLAS_PAGES.length) return false;
    return ATLAS_PAGES[pageIndex].every(name => isShapeCreated(name));
}

/**
 * Видимость цепочки:
 * - пер-фигурная — после первого создания фигуры (живёт на карточке атласа);
 * - Радуга/Мозаика — за полный комплект страницы 0/1;
 * - остальные — всегда.
 */
function isAchievementChainVisible(chain) {
    if (!chain) return false;
    if (chain.isShapeChain) return isShapeCreated(chain.shapeName);
    if (typeof chain.requiresPageComplete === 'number') {
        return isAtlasPageSetComplete(chain.requiresPageComplete);
    }
    return true;
}

// =============================================================================
// СОСТОЯНИЕ
// =============================================================================

// achievementProgress[chainId] = { stepIndex, claimable }
let achievementProgress = {};
let achievementCounters = null;
let rainbowCountedThisNight = false;
let mosaicCountedThisNight = false;
// S-01: фигуры, засчитанные в пер-фигурные цепочки этой ночью (анти-гринд ≤1/ночь)
let shapesCountedThisNight = new Set();
// S-01: особые достижения (Радуга/Мозаика), о доступности которых уже оповестили
let announcedSpecialChains = new Set();

// Версия схемы достижений (S-01: сброс Радуги/Мозаики при миграции старых сейвов)
const ACHIEVEMENTS_SAVE_VERSION = 2;

// Размерные бакеты, нужные для «Мозаики» (все должны присутствовать на поле)
const MOSAIC_REQUIRED_BUCKETS = ['2', '3', '4', '5', '6', '7', '8plus'];

function makeDefaultAchievementCounters() {
    return {
        levelsCompleted: 0,
        totalConstellations: 0,
        colorTotals: { red: 0, orange: 0, yellow: 0, white: 0, blue: 0 },
        starCountTotals: { 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, '8plus': 0 },
        rainbowNights: 0,
        mosaicNights: 0,
        shapeTotals: {} // S-01: имя фигуры → всего засчитанных созданий (≤1/ночь)
    };
}

function initAchievementState() {
    achievementProgress = {};
    for (const chain of ACHIEVEMENT_CHAINS) {
        achievementProgress[chain.id] = { stepIndex: 0, claimable: false };
    }
    achievementCounters = makeDefaultAchievementCounters();
    rainbowCountedThisNight = false;
    mosaicCountedThisNight = false;
    shapesCountedThisNight = new Set();
    announcedSpecialChains = new Set();
}

function resetAchievementsForFullReset() {
    initAchievementState();
}

function resetPerNightAchievementFlags() {
    rainbowCountedThisNight = false;
    mosaicCountedThisNight = false;
    shapesCountedThisNight = new Set();
}

// =============================================================================
// ПЕРСИСТЕНТНОСТЬ (встраивается в starsReborn_progression)
// =============================================================================

function getAchievementSaveData() {
    const progress = {};
    for (const chain of ACHIEVEMENT_CHAINS) {
        const p = achievementProgress[chain.id];
        progress[chain.id] = { stepIndex: p ? p.stepIndex : 0 };
    }
    return {
        achievementsVersion: ACHIEVEMENTS_SAVE_VERSION,
        achievementProgress: progress,
        achievementCounters,
        rainbowCountedThisNight,
        mosaicCountedThisNight,
        shapesCountedThisNight: [...shapesCountedThisNight],
        announcedSpecialChains: [...announcedSpecialChains]
    };
}

function applyAchievementSaveData(state) {
    initAchievementState();
    if (!state || typeof state !== 'object') return;

    // Счётчики (с миграцией дефолтами)
    if (state.achievementCounters && typeof state.achievementCounters === 'object') {
        const def = makeDefaultAchievementCounters();
        const s = state.achievementCounters;
        achievementCounters = {
            levelsCompleted: Number(s.levelsCompleted) || 0,
            totalConstellations: Number(s.totalConstellations) || 0,
            colorTotals: Object.assign({}, def.colorTotals, s.colorTotals || {}),
            starCountTotals: Object.assign({}, def.starCountTotals, s.starCountTotals || {}),
            rainbowNights: Number(s.rainbowNights) || 0,
            mosaicNights: Number(s.mosaicNights) || 0,
            shapeTotals: Object.assign({}, s.shapeTotals || {})
        };
    }

    // Прогресс по цепочкам
    if (state.achievementProgress && typeof state.achievementProgress === 'object') {
        for (const chain of ACHIEVEMENT_CHAINS) {
            const saved = state.achievementProgress[chain.id];
            const idx = saved && Number.isFinite(saved.stepIndex) ? saved.stepIndex : 0;
            achievementProgress[chain.id].stepIndex = Math.max(0, Math.min(chain.steps.length, idx));
        }
    }

    rainbowCountedThisNight = !!state.rainbowCountedThisNight;
    mosaicCountedThisNight = !!state.mosaicCountedThisNight;
    shapesCountedThisNight = new Set(Array.isArray(state.shapesCountedThisNight) ? state.shapesCountedThisNight : []);
    announcedSpecialChains = new Set(Array.isArray(state.announcedSpecialChains) ? state.announcedSpecialChains : []);

    migrateAchievementsToSpiral(state);

    // Уже видимые особые достижения не анонсируем повторно при загрузке
    for (const chain of ACHIEVEMENT_CHAINS) {
        if (typeof chain.requiresPageComplete !== 'number') continue;
        if (isAchievementChainVisible(chain)) announcedSpecialChains.add(chain.id);
    }
}

/**
 * S-01: миграция сейвов до «спирали».
 * - Радуга/Мозаика переезжают в особенные достижения страниц — прогресс сбрасывается (решение заказчика).
 * - Фигурам из createdShapes (созданным при старой системе) даётся stepIndex=1 и счётчик 1
 *   без награды: 25 ✦ за них уже были выплачены через SHAPE_OPEN_POINTS.
 */
function migrateAchievementsToSpiral(state) {
    const version = Number(state.achievementsVersion) || 1;
    if (version >= ACHIEVEMENTS_SAVE_VERSION) return;

    if (achievementProgress.rainbow) achievementProgress.rainbow.stepIndex = 0;
    if (achievementProgress.mosaic) achievementProgress.mosaic.stepIndex = 0;
    if (achievementCounters) {
        achievementCounters.rainbowNights = 0;
        achievementCounters.mosaicNights = 0;
    }
    rainbowCountedThisNight = false;
    mosaicCountedThisNight = false;

    for (const chain of ACHIEVEMENT_CHAINS) {
        if (!chain.isShapeChain) continue;
        if (typeof isShapeCreated !== 'function' || !isShapeCreated(chain.shapeName)) continue;
        const p = achievementProgress[chain.id];
        if (p && p.stepIndex === 0) p.stepIndex = 1;
        if (achievementCounters && !(achievementCounters.shapeTotals[chain.shapeName] > 0)) {
            achievementCounters.shapeTotals[chain.shapeName] = 1;
        }
    }
}

// =============================================================================
// ВЫЧИСЛЕНИЕ ЦВЕТА СОЗВЕЗДИЯ (мягкое: ближайший тир)
// =============================================================================

function constellationColorBucket(starIds) {
    const ids = Array.isArray(starIds) ? starIds : [...starIds];
    const mean = getMeanColorValue(ids);
    let best = STAR_COLOR_VALUES[0];
    for (const v of STAR_COLOR_VALUES) {
        if (Math.abs(v - mean) < Math.abs(best - mean)) best = v; // ничья → меньший тир (детерминированно)
    }
    return ACHIEVEMENT_BUCKET_BY_VALUE[String(best)];
}

function constellationSizeKey(starCount) {
    const n = typeof starCount === 'number' ? starCount : 0;
    if (n >= 8) return '8plus';
    if (n >= 3 && n <= 7) return String(n);
    return null; // 2★ и меньше — нет цепочки размеров
}

/** Бакет для «Мозаики»: включает 2★ (в отличие от цепочек размеров). */
function mosaicSizeBucket(starCount) {
    const n = typeof starCount === 'number' ? starCount : 0;
    if (n >= 8) return '8plus';
    if (n >= 2 && n <= 7) return String(n);
    return null;
}

// =============================================================================
// СЧЁТЧИКИ: инкремент при коммите / декремент при откате
// =============================================================================

function applyConstellationToCounters(constellation, sign) {
    if (!constellation || !achievementCounters) return;
    const ids = collectStarIdsFromLines(constellation.lines);
    const bucket = constellationColorBucket([...ids]);
    const sizeKey = constellationSizeKey(constellation.starCount);

    achievementCounters.totalConstellations = Math.max(0, achievementCounters.totalConstellations + sign);
    if (bucket && achievementCounters.colorTotals[bucket] !== undefined) {
        achievementCounters.colorTotals[bucket] = Math.max(0, achievementCounters.colorTotals[bucket] + sign);
    }
    if (sizeKey && achievementCounters.starCountTotals[sizeKey] !== undefined) {
        achievementCounters.starCountTotals[sizeKey] = Math.max(0, achievementCounters.starCountTotals[sizeKey] + sign);
    }
}

// =============================================================================
// ПРОВЕРКИ
// =============================================================================

/** Текущее состояние поля для field/терминальных проверок. */
function getFieldAchievementSnapshot() {
    const list = Array.isArray(constellations) ? constellations : [];
    const starCounts = list.map(c => (typeof c.starCount === 'number' ? c.starCount : 0));
    const colorsPresent = new Set();
    const sizeBucketsPresent = new Set();
    for (const c of list) {
        const ids = collectStarIdsFromLines(c.lines);
        colorsPresent.add(constellationColorBucket([...ids]));
        const mb = mosaicSizeBucket(c.starCount);
        if (mb) sizeBucketsPresent.add(mb);
    }
    const totalFieldStars = Array.isArray(fieldStars) ? fieldStars.length : 0;
    return {
        count: list.length,
        starCounts,
        colorsPresent,
        sizeBucketsPresent,
        totalFieldStars,
        revealed: !!constellationArtRevealed
    };
}

function isMosaicComplete(snap) {
    return MOSAIC_REQUIRED_BUCKETS.every(b => snap.sizeBucketsPresent.has(b));
}

function evaluateAchievementCheck(check, snap) {
    if (!check || !achievementCounters) return false;
    const c = achievementCounters;
    switch (check.type) {
        case 'colorTotal':
            return (c.colorTotals[check.color] || 0) >= check.n;
        case 'starCountTotal': {
            const key = check.mode === 'gte' ? '8plus' : String(check.size);
            return (c.starCountTotals[key] || 0) >= check.n;
        }
        case 'rainbowNights':
            return c.rainbowNights >= check.n;
        case 'mosaicNights':
            return c.mosaicNights >= check.n;
        case 'levelsCompleted':
            return c.levelsCompleted >= check.n;
        case 'totalConstellations':
            return c.totalConstellations >= check.n;
        case 'shapeTotal':
            return (c.shapeTotals[check.shape] || 0) >= check.n;
        case 'singleConstellation':
            return snap.revealed && snap.count === 1;
        case 'uniteAll':
            return snap.totalFieldStars > 0 && snap.starCounts.some(n => n === snap.totalFieldStars);
        default:
            return false;
    }
}

/** Прогресс «текущее / цель» для числовых проверок (для карточки). */
function getAchievementStepProgress(check) {
    if (!check || !achievementCounters) return null;
    const c = achievementCounters;
    switch (check.type) {
        case 'colorTotal': return { current: c.colorTotals[check.color] || 0, target: check.n };
        case 'starCountTotal': {
            const key = check.mode === 'gte' ? '8plus' : String(check.size);
            return { current: c.starCountTotals[key] || 0, target: check.n };
        }
        case 'rainbowNights': return { current: c.rainbowNights, target: check.n };
        case 'mosaicNights': return { current: c.mosaicNights, target: check.n };
        case 'levelsCompleted': return { current: c.levelsCompleted, target: check.n };
        case 'totalConstellations': return { current: c.totalConstellations, target: check.n };
        case 'shapeTotal': return { current: c.shapeTotals[check.shape] || 0, target: check.n };
        default: return null;
    }
}

// =============================================================================
// ПЕРЕСЧЁТ CLAIMABLE
// =============================================================================

/**
 * @param {boolean} [notify] — если true, при переходе шага в «выполнен» (false→true)
 *        показывается тост. Пассивные пересчёты (загрузка, рендер) вызывают без notify.
 */
function recomputeAchievementsClaimable(notify) {
    const snap = getFieldAchievementSnapshot();
    for (const chain of ACHIEVEMENT_CHAINS) {
        const p = achievementProgress[chain.id];
        if (!p) continue;
        if (p.stepIndex >= chain.steps.length) {
            p.claimable = false; // цепочка завершена
            continue;
        }
        // S-01: скрытые цепочки не набирают claimable и не тостятся
        if (!isAchievementChainVisible(chain)) {
            p.claimable = false;
            continue;
        }
        const step = chain.steps[p.stepIndex];
        const wasClaimable = p.claimable;
        p.claimable = evaluateAchievementCheck(step.check, snap);
        if (notify && p.claimable && !wasClaimable) {
            showAchievementToast(chain);
        }
    }
}

/** Claimable в сетке 🏆 (пер-фигурные живут на карточках атласа — не учитываются). */
function hasClaimableAchievements() {
    return ACHIEVEMENT_CHAINS.some(chain => {
        if (chain.isShapeChain) return false;
        const p = achievementProgress[chain.id];
        return p && p.claimable;
    });
}

/** S-01: есть ли забираемый шаг у пер-фигурных цепочек (подсветка кнопки атласа). */
function hasClaimableShapeChains() {
    return ACHIEVEMENT_CHAINS.some(chain => {
        if (!chain.isShapeChain) return false;
        const p = achievementProgress[chain.id];
        return p && p.claimable;
    });
}

// =============================================================================
// ХУКИ ОЦЕНКИ (вызываются из drawing.js)
// =============================================================================

function recordAchievementCommit(constellation) {
    applyConstellationToCounters(constellation, +1);
    recordShapeCommitForChains(constellation);
    afterAchievementStateChanged();
}

function recordAchievementUndo(constellation) {
    applyConstellationToCounters(constellation, -1);
    recordShapeUndoForChains(constellation);
    afterAchievementStateChanged();
}

// =============================================================================
// S-01: ПЕР-ФИГУРНЫЕ ЦЕПОЧКИ — СЧЁТ НА КОММИТЕ (≤1/ночь) И ОТКАТ
// =============================================================================

function getCommittedAtlasShapeName(constellation) {
    if (!constellation || !achievementCounters) return null;
    const name = normalizeShapeName(constellation.shape);
    if (!name || name === 'Фигура') return null;
    if (typeof isShapeVisibleInAtlas === 'function' && !isShapeVisibleInAtlas(name)) return null;
    return name;
}

function recordShapeCommitForChains(constellation) {
    const name = getCommittedAtlasShapeName(constellation);
    if (!name) return;
    if (shapesCountedThisNight.has(name)) return; // анти-гринд: ≤1 за ночь

    shapesCountedThisNight.add(name);
    achievementCounters.shapeTotals[name] = (achievementCounters.shapeTotals[name] || 0) + 1;

    // Сюрприз-момент: первое создание фигуры — имя раскрыто на коммите.
    // Награда шага 1 собирается вручную с карточки атласа (флоу как у остальных).
    const chain = getShapeChainForShape(name);
    const p = chain ? achievementProgress[chain.id] : null;
    if (chain && p && p.stepIndex === 0 && achievementCounters.shapeTotals[name] === 1) {
        showShapeRevealToast(name);
    }

    announceNewlyAvailableSpecialChains();
}

/** S-01: оповещение о ставших доступными особых достижениях (полный комплект страницы). */
function announceNewlyAvailableSpecialChains() {
    for (const chain of ACHIEVEMENT_CHAINS) {
        if (typeof chain.requiresPageComplete !== 'number') continue;
        if (announcedSpecialChains.has(chain.id)) continue;
        if (!isAchievementChainVisible(chain)) continue;
        announcedSpecialChains.add(chain.id);
        showInfoToast(chain.icon, 'Новое достижение доступно',
            `${chain.title} — коллекция страницы ${chain.requiresPageComplete + 1} собрана`);
    }
}

function recordShapeUndoForChains(constellation) {
    const name = getCommittedAtlasShapeName(constellation);
    if (!name) return;
    if (!shapesCountedThisNight.has(name)) return;
    shapesCountedThisNight.delete(name);
    achievementCounters.shapeTotals[name] = Math.max(0, (achievementCounters.shapeTotals[name] || 0) - 1);
}


function recordAchievementReveal() {
    if (!achievementCounters) return;
    achievementCounters.levelsCompleted += 1;

    // Радуга и Мозаика — не чаще 1 раза за небо
    const snap = getFieldAchievementSnapshot();
    if (!rainbowCountedThisNight && snap.colorsPresent.size >= ACHIEVEMENT_COLOR_KEYS.length) {
        achievementCounters.rainbowNights += 1;
        rainbowCountedThisNight = true;
    }
    if (!mosaicCountedThisNight && isMosaicComplete(snap)) {
        achievementCounters.mosaicNights += 1;
        mosaicCountedThisNight = true;
    }
    afterAchievementStateChanged();
}

function afterAchievementStateChanged() {
    recomputeAchievementsClaimable(true);
    saveProgression();
    updateAchievementsButtonState();
    if (typeof updateAtlasButtonState === 'function') updateAtlasButtonState();
    const overlay = document.getElementById('achievementsOverlay');
    if (overlay && overlay.classList.contains('visible')) {
        renderAchievementsOverlay();
    }
    // S-01: прогресс пер-фигурных цепочек живёт на карточках атласа
    const atlasOverlay = document.getElementById('atlasOverlay');
    if (atlasOverlay && atlasOverlay.classList.contains('visible')
        && typeof renderAtlasOverlay === 'function') {
        renderAtlasOverlay();
    }
}

// =============================================================================
// ЗАБОР НАГРАДЫ
// =============================================================================

function claimAchievementStep(chainId) {
    const chain = getAchievementChainById(chainId);
    const p = achievementProgress[chainId];
    if (!chain || !p || !p.claimable) return false;
    if (p.stepIndex >= chain.steps.length) return false;

    awardMetaScore(getAchievementChainStepReward(chain));
    p.stepIndex += 1;
    p.claimable = false;

    // Забор — необратимое событие: блокируем откат
    if (typeof raiseUndoFloor === 'function') raiseUndoFloor();

    // Следующий шаг может оказаться сразу выполнен → тост об этом (notify=true)
    recomputeAchievementsClaimable(true);
    saveProgression();

    updateProgressionUI();
    updateAchievementsButtonState();
    if (typeof updateUndoConstellationButtonState === 'function') updateUndoConstellationButtonState();
    renderAchievementsOverlay();
    // S-01: клейм пер-фигурной цепочки происходит из атласа — обновить его
    const atlasOverlay = document.getElementById('atlasOverlay');
    if (atlasOverlay && atlasOverlay.classList.contains('visible')
        && typeof renderAtlasOverlay === 'function') {
        renderAtlasOverlay();
    }
    return true;
}

// =============================================================================
// ТОСТ «ДОСТИЖЕНИЕ ПОЛУЧЕНО» (правый верхний угол, стек)
// =============================================================================

/** Общий инфо-тост в стеке достижений (правый верхний угол). */
function showInfoToast(iconText, title, sub) {
    const stack = document.getElementById('achvToastStack');
    if (!stack) return;

    const el = document.createElement('div');
    el.className = 'achv-toast';

    const icon = document.createElement('span');
    icon.className = 'achv-toast-icon';
    icon.textContent = iconText || '🏆';

    const body = document.createElement('span');
    body.className = 'achv-toast-body';
    const t1 = document.createElement('span');
    t1.className = 'achv-toast-title';
    t1.textContent = title;
    const t2 = document.createElement('span');
    t2.className = 'achv-toast-sub';
    t2.textContent = sub;
    body.appendChild(t1);
    body.appendChild(t2);

    el.appendChild(icon);
    el.appendChild(body);
    stack.appendChild(el);

    if (typeof playAchievementGet === 'function') playAchievementGet();

    const remove = () => { if (el.parentNode) el.parentNode.removeChild(el); };
    el.addEventListener('animationend', remove);
    setTimeout(remove, 4200);
}

function showAchievementToast(chain) {
    showInfoToast(chain.icon || '🏆', 'Достижение выполнено', chain.title);
}

/** S-01: сюрприз-момент — первое создание фигуры атласа (раскрытие имени). */
function showShapeRevealToast(shapeName) {
    showInfoToast('📖', 'Новая фигура атласа!', `«${shapeName}»`);
}

// =============================================================================
// ОВЕРЛЕЙ UI
// =============================================================================

function buildAchievementTooltipText(chain, p, done) {
    if (done) return 'Выполнено — все ступени пройдены';
    const step = chain.steps[p.stepIndex];
    const prog = getAchievementStepProgress(step.check);
    return step.desc + (prog ? ` (${Math.min(prog.current, prog.target)}/${prog.target})` : '');
}

function createAchievementSlot(chain) {
    const p = achievementProgress[chain.id] || { stepIndex: 0, claimable: false };
    const total = chain.steps.length;
    const done = p.stepIndex >= total;

    const slot = document.createElement('div');
    slot.className = 'achv-slot'
        + (done ? ' achv-slot-done' : '')
        + (p.claimable ? ' achv-slot-claimable' : '');

    // --- иконка + кнопка-оверлей ---
    const iconWrap = document.createElement('div');
    iconWrap.className = 'achv-icon-wrap';

    const icon = document.createElement('div');
    icon.className = 'achv-icon';
    icon.textContent = chain.icon || '❓';
    iconWrap.appendChild(icon);

    if (p.claimable && !done) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'achv-claim-overlay';
        btn.textContent = `+${getAchievementChainStepReward(chain)}✦`;
        btn.title = 'Забрать награду';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            claimAchievementStep(chain.id);
        });
        iconWrap.appendChild(btn);
    }
    slot.appendChild(iconWrap);

    // --- ряд звёзд (по одной на шаг цепочки) ---
    const stars = document.createElement('div');
    stars.className = 'achv-stars';
    for (let i = 0; i < total; i++) {
        const s = document.createElement('span');
        const filled = i < p.stepIndex;
        s.className = 'achv-star' + (filled ? ' achv-star-filled' : '');
        s.textContent = filled ? '★' : '☆';
        stars.appendChild(s);
    }
    slot.appendChild(stars);

    // --- тултип ---
    const tip = document.createElement('div');
    tip.className = 'achv-tooltip';
    const tipTitle = document.createElement('div');
    tipTitle.className = 'achv-tooltip-title';
    tipTitle.textContent = chain.title;
    tip.appendChild(tipTitle);
    const tipText = document.createElement('div');
    tipText.className = 'achv-tooltip-text';
    tipText.textContent = buildAchievementTooltipText(chain, p, done);
    tip.appendChild(tipText);
    slot.appendChild(tip);

    icon.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAchievementTooltip(slot);
    });

    return slot;
}

function toggleAchievementTooltip(slot) {
    const list = document.getElementById('achievementsList');
    const wasOpen = slot.classList.contains('tip-open');
    if (list) list.querySelectorAll('.achv-slot.tip-open').forEach(s => s.classList.remove('tip-open'));
    if (!wasOpen) slot.classList.add('tip-open');
}

function closeAllAchievementTooltips() {
    const list = document.getElementById('achievementsList');
    if (list) list.querySelectorAll('.achv-slot.tip-open').forEach(s => s.classList.remove('tip-open'));
}

function renderAchievementsList() {
    const list = document.getElementById('achievementsList');
    if (!list) return;
    list.innerHTML = '';
    for (const chain of ACHIEVEMENT_CHAINS) {
        // S-01: пер-фигурные цепочки живут на карточках атласа;
        // Радуга/Мозаика появляются только при полном комплекте страницы
        if (chain.isShapeChain) continue;
        if (!isAchievementChainVisible(chain)) continue;
        list.appendChild(createAchievementSlot(chain));
    }
}

function renderAchievementsOverlay() {
    updateProgressionUI();
    const metaEl = document.getElementById('achievementsMetaScoreDisplay');
    if (metaEl) metaEl.textContent = String(getMetaScore());
    recomputeAchievementsClaimable();
    renderAchievementsList();
}

function showAchievementsOverlay() {
    renderAchievementsOverlay();
    const overlay = document.getElementById('achievementsOverlay');
    if (overlay) overlay.classList.add('visible');
}

function hideAchievementsOverlay() {
    closeAllAchievementTooltips();
    const overlay = document.getElementById('achievementsOverlay');
    if (overlay) overlay.classList.remove('visible');
}

function onAchievementsOverlayClick(event) {
    if (event.target && event.target.id === 'achievementsOverlay') {
        hideAchievementsOverlay();
    }
}

function updateAchievementsButtonState() {
    const btn = document.getElementById('achievementsBtn');
    if (!btn) return;
    const claimable = hasClaimableAchievements();
    btn.classList.toggle('achv-btn-claimable', claimable);
    const label = claimable ? 'Достижения — есть награда' : 'Достижения';
    btn.title = label;
    btn.setAttribute('aria-label', label);
}

// Инициализация дефолтами при загрузке модуля (до loadProgression).
initAchievementState();

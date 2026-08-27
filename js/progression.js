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
// K-11: закладка-цель — одна фигура, её чертёж ждёт в углу неба. Терпимое
// поле: отсутствие в сейве значит «закладки нет», версию не поднимаем.
let bookmarkedShape = null;
let playerId = '';
let devDayOffset = 0;

// B-02: параллельный накопитель обсерватории. `lifetimeMetaEarned` растёт вместе
// с каждым начислением ✦ и НЕ уменьшается никогда — в отличие от metaScore,
// который обнуляется автосписанием страниц атласа.
// Счётчика «сколько звёзд уже выдано» здесь намеренно НЕТ: он считается по
// самому холсту (см. getObservatoryStarsDue).
let lifetimeMetaEarned = 0;

// Legacy (migration only)
let globalDiscoveredShapes = new Set();
let atlasClaimedShapes = new Set();

// Версия каталога фигур в сейве. 1 = каталог-29 (топологический режим),
// 2 = тот же каталог, но ключи — ASCII-ID вместо русских имён (L-01).
// Сейвы без поля catalogVersion — с геометрического демо: прогрессия по
// фигурам сбрасывается при загрузке (demo-to-graph-catalog).
const CATALOG_SAVE_VERSION = 2;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * L-01: в реестре ID есть встроенные фигуры (ключи SHAPES), sentinel и ID
 * fallback-имён. Пользовательские виды сюда тоже попадают: registerCustomType
 * кладёт их в SHAPES (customTypes.js).
 */
function isKnownShapeId(id) {
    if (id === SHAPE_UNRECOGNIZED) return true;
    if (typeof FALLBACK_NAME_IDS !== 'undefined' && FALLBACK_NAME_IDS.includes(id)) return true;
    return typeof SHAPES === 'object' && SHAPES !== null
        && Object.prototype.hasOwnProperty.call(SHAPES, id);
}

/**
 * Единственная точка нормализации имени фигуры. Она же страхует от сейва,
 * проскочившего мимо версии: значение вне реестра ID (например, кириллическое
 * имя из сейва до L-01) превращается в null, а не расползается по счётчикам.
 */
function normalizeShapeName(shapeName) {
    if (typeof shapeName !== 'string') return null;
    const trimmed = shapeName.trim();
    if (trimmed.length === 0) return null;
    return isKnownShapeId(trimmed) ? trimmed : null;
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
    // B-02: копилку наращиваем ДО автосписания страниц — иначе те же ✦, что
    // молча ушли на страницу атласа, до накопителя бы не доехали.
    lifetimeMetaEarned += n;
    const wasObservatoryUnlocked = observatoryUnlockedNotified;
    maybeAutoUnlockAtlasPages();
    if (typeof grantObservatoryStarsDue === 'function') grantObservatoryStarsDue();
    if (!wasObservatoryUnlocked) notifyObservatoryUnlockedIfNeeded();
    saveProgression();
    return n;
}

// =============================================================================
// OBSERVATORY ACCUMULATOR (B-02)
// =============================================================================

/** Одноразовый флаг тоста «Обсерватория открыта» (живёт в сейве прогрессии). */
let observatoryUnlockedNotified = false;

function getLifetimeMetaEarned() {
    return lifetimeMetaEarned;
}

/** Порог — условие, а не цена: ✦ за него не списываются. */
function isObservatoryUnlocked() {
    return lifetimeMetaEarned >= OBSERVATORY_UNLOCK_COST;
}

/**
 * Сколько звёзд холст ещё не получил.
 *
 * ⚠ Выданное считается ПО САМОМУ ХОЛСТУ, а не отдельным счётчиком в сейве
 * прогрессии. Отдельный счётчик здесь уже был и породил двойную выдачу:
 * холст и прогрессия лежат в РАЗНЫХ ключах localStorage и пишутся в разные
 * моменты (холст — дебаунсом 500 мс, прогрессия — из awardMetaScore). Стоило
 * вкладке закрыться между двумя записями, как счётчик уезжал назад, а звёзды
 * на холсте оставались — и следующая загрузка выдавала их заново поверх.
 *
 * Звёзды с холста не исчезают никогда, поэтому их количество — точный и
 * единственный ответ на вопрос «сколько уже выдано». Рассинхрону взяться
 * неоткуда: считаем по тому же файлу, в который кладём.
 */
function getObservatoryStarsDue() {
    const earned = Math.floor(lifetimeMetaEarned / OBSERVATORY_STAR_COST);
    const granted = typeof getObservatoryGrantedStarCount === 'function'
        ? getObservatoryGrantedStarCount()
        : 0;
    return Math.max(0, earned - granted);
}

/**
 * Тост показывается ровно один раз — в момент, когда порог взят. Высечка Ex Libris
 * при этом уже перерисована (renderBookTabs вызывается из renderBook).
 */
function notifyObservatoryUnlockedIfNeeded() {
    if (observatoryUnlockedNotified || !isObservatoryUnlocked()) return false;
    observatoryUnlockedNotified = true;
    if (typeof showInfoToast === 'function') {
        // Знак «поиск», а не свод: примета обсерватории во всём UI одна (см. ui.js)
        showInfoToast('tel', t('observatory.unlockedTitle'), t('observatory.unlockedSub'));
    }
    if (typeof refreshBookIfOpen === 'function') refreshBookIfOpen();
    if (typeof updateObservatoryUI === 'function') updateObservatoryUI();
    return true;
}

/**
 * Реконструкция накопителя для сейва, где поля ещё нет (миграции не будет).
 * ✦ покидают баланс единственным путём — оплатой страницы атласа
 * (`metaScore -=` встречается в коде дважды, оба раза это цена страницы),
 * поэтому сумма восстанавливается точно.
 */
function reconstructLifetimeMetaEarned() {
    let sum = metaScore;
    for (const pageIndex of unlockedPageIndices) {
        sum += getAtlasPageUnlockCost(pageIndex);
    }
    return sum;
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
            showInfoToast('knife', t('toast.atlasPageTitle'), t('toast.atlasPageSub', { n: next + 1 }));
        }
        // K-09: разрезанная глава — обязательное событие ленты «Сегодня».
        if (typeof addDailyNewsEvent === 'function') {
            addDailyNewsEvent('book.newsAtlasCut', { n: next + 1 });
        }
        next = getNextLockedAtlasPageIndex();
    }
    if (unlockedAny) {
        if (typeof raiseUndoFloor === 'function') raiseUndoFloor();
        if (typeof updateProgressionUI === 'function') updateProgressionUI();
        // Открытие страницы меняет и сетку атласа, и её строку в оглавлении
        if (typeof refreshBookIfOpen === 'function') refreshBookIfOpen();
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
    if (!normalized || normalized === SHAPE_UNRECOGNIZED) return SHAPE_UNRECOGNIZED;
    if (isShapeOnAtlas(normalized) && !isShapeVisibleInAtlas(normalized)) return SHAPE_UNRECOGNIZED;
    return normalized;
}

/** Созвездие — первая на поле копия атласной фигуры с открытой страницы (дубликаты не подсвечиваем). */
function isShapeRecognizedOnUnlockedAtlas(constellation) {
    if (!constellation) return false;
    const name = normalizeShapeName(constellation.shape || constellation.name);
    if (!name || name === SHAPE_UNRECOGNIZED) return false;
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

/**
 * Первое создание фигуры. Возвращает false, если фигура уже создавалась, —
 * поэтому это единственная точка «ровно один раз на фигуру за всю игру».
 *
 * Награда за открытие живёт в цепочке «Первооткрыватель» (страница «Огранка и путь»), а не
 * начисляется здесь молча: раньше ✦ капали без следа в Наградах, и событие
 * нельзя было ни увидеть заранее, ни отследить.
 *
 * Пересчёт цепочки здесь не нужен: этот же коммит доходит до
 * `recordAchievementCommit` (drawing.js), а он вызывает
 * `afterAchievementStateChanged` — к тому моменту фигура уже в `createdShapes`.
 */
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
    const index = Math.max(0, Math.min(LEVEL_NAME_COUNT - 1, Math.floor(level) - 1));
    return t('level.' + index);
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

function getBookmarkedShape() {
    return bookmarkedShape;
}

/**
 * K-11: закладка одна — новый выбор заменяет прежний. Повторный тап по уже
 * заложенной фигуре снимает закладку. Строить уже найденную фигуру снова
 * разрешено (огранка), поэтому normalizeShapeName — единственная проверка.
 */
function toggleShapeBookmark(shapeName) {
    const normalized = normalizeShapeName(shapeName);
    if (!normalized) return null;
    bookmarkedShape = bookmarkedShape === normalized ? null : normalized;
    saveProgression();
    return bookmarkedShape;
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
    bookmarkedShape = null;
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
    bookmarkedShape = null;
    globalDiscoveredShapes = new Set();
    atlasClaimedShapes = new Set();
    devDayOffset = 0;
    // B-02: полный сброс — это вайп, холст уходит вместе с остальным.
    // Ключ хранения удаляет performFullReset (sketch.js).
    lifetimeMetaEarned = 0;
    observatoryUnlockedNotified = false;
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
            bookmarkedShape,
            playerId: ensurePlayerId(),
            devDayOffset,
            catalogVersion: CATALOG_SAVE_VERSION,
            // B-02: накопитель обсерватории. Версию сейва не поднимаем —
            // отсутствие полей чинится реконструкцией, а не миграцией.
            // observatoryStarsGranted здесь больше нет: выданное считается по холсту.
            lifetimeMetaEarned,
            observatoryUnlockedNotified
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
            if (typeof ensureDailyQuestsForToday === 'function') ensureDailyQuestsForToday();
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
        // K-11: терпимое поле — старый сейв без него просто не имеет закладки.
        bookmarkedShape = normalizeShapeName(state.bookmarkedShape);

        if (Array.isArray(state.globalDiscoveredShapes) && createdShapes.size === 0) {
            createdShapes = new Set(state.globalDiscoveredShapes);
        }
        globalDiscoveredShapes = new Set(createdShapes);
        atlasClaimedShapes = new Set(state.atlasClaimedShapes || [...createdShapes]);

        // B-02: поля нет (сейв до обсерватории) — восстанавливаем точно, без
        // миграции и без сброса прогресса. Считается один раз: дальше поле живёт само.
        lifetimeMetaEarned = Number.isFinite(Number(state.lifetimeMetaEarned))
            ? Math.max(0, Math.floor(Number(state.lifetimeMetaEarned)))
            : reconstructLifetimeMetaEarned();
        // Старый сейв, где порог уже взят: тост не показываем задним числом —
        // игрок увидит ожившую кнопку обсерватории и без него.
        observatoryUnlockedNotified = state.observatoryUnlockedNotified !== undefined
            ? !!state.observatoryUnlockedNotified
            : isObservatoryUnlocked();

        if (typeof applyAchievementSaveData === 'function') applyAchievementSaveData(state);

        // U-09: сейв старше v4 (цвета стали огранкой, награды за них убраны) —
        // пересчитывать нечего, сбрасываем весь прогресс: ✦, страницы, фигуры.
        if (typeof consumeAchievementsFullResetFlag === 'function'
            && consumeAchievementsFullResetFlag()) {
            resetProgressionForFullReset();
            if (typeof ensureDailyQuestsForToday === 'function') ensureDailyQuestsForToday();
            saveProgression();
            return true;
        }

        // Каталог-29: старый (геометрический) сейв → сброс прогрессии по фигурам.
        if ((Number(state.catalogVersion) || 0) < CATALOG_SAVE_VERSION) {
            migrateSaveToCatalog29();
        }

        playerLevel = computeLevel(totalXP);
        ensurePlayerId();

        // M-05: сутки сверяем после того, как устоялся devDayOffset — от него
        // зависит getEffectiveSkyDateInt(). Игрок, не заходивший неделю, получает
        // свежую пару квестов; зашедший второй раз за вечер — свои забранные.
        if (typeof ensureDailyQuestsForToday === 'function') ensureDailyQuestsForToday();

        // S-01: если накопленных ✦ уже хватает — страница открывается сразу
        maybeAutoUnlockAtlasPages();
        return true;
    } catch (e) {
        console.warn('Progression load failed:', e);
        return false;
    }
}

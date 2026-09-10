// progression.js — meta score, atlas pages, created shapes, levels (S-03)

// =============================================================================
// STATE
// =============================================================================

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

// S-03: последняя ступень лестницы уровней, о которой уже сказано в ленте
// «Сегодня» (maybeAnnounceLevelUp). Нужна только затем, чтобы ступень хвоста
// объявлялась ровно один раз и не задним числом.
let levelAnnounced = 1;

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
    // B-02: накопитель «за всё время». S-03: по нему меряется уровень — им
    // открываются и главы атласа, и Экслибрис; баланс не тратится вовсе.
    lifetimeMetaEarned += n;
    const wasObservatoryUnlocked = observatoryUnlockedNotified;
    maybeAutoUnlockAtlasPages();
    maybeAnnounceLevelUp();
    if (typeof grantObservatoryStarsDue === 'function') grantObservatoryStarsDue();
    if (!wasObservatoryUnlocked) notifyObservatoryUnlockedIfNeeded();
    saveProgression();
    return n;
}

// =============================================================================
// OBSERVATORY ACCUMULATOR (B-02)
// =============================================================================

/** Одноразовый флаг события «Обсерватория открыта» (живёт в сейве прогрессии). */
let observatoryUnlockedNotified = false;

function getLifetimeMetaEarned() {
    return lifetimeMetaEarned;
}

/** S-03: Экслибрис открывается уровнем (OBSERVATORY_UNLOCK_LEVEL), а не своим числом. */
function isObservatoryUnlocked() {
    return getPlayerLevel() >= OBSERVATORY_UNLOCK_LEVEL;
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
 * Событие мира показывается ровно один раз — в момент, когда порог взят. Высечка
 * Ex Libris при этом уже перерисована (renderBookTabs вызывается из renderBook).
 * K-15: тоста нет — строка уходит в новости «Сегодня», как открытие главы атласа.
 */
function notifyObservatoryUnlockedIfNeeded() {
    if (observatoryUnlockedNotified || !isObservatoryUnlocked()) return false;
    observatoryUnlockedNotified = true;
    if (typeof addDailyNewsEvent === 'function') {
        addDailyNewsEvent('book.newsObservatoryOpen',
            { n: Math.floor(OBSERVATORY_UNLOCK_COST / OBSERVATORY_STAR_COST) });
    }
    if (typeof refreshBookIfOpen === 'function') refreshBookIfOpen();
    if (typeof updateObservatoryUI === 'function') updateObservatoryUI();
    // K-13: порог мог взяться, пока игрок уже сидит на запертой странице
    // Ex Libris — холст обязан ожить в ту же секунду, без повторного тапа.
    if (typeof syncExLibrisAppMode === 'function') syncExLibrisAppMode();
    return true;
}

/**
 * Реконструкция накопителя для сейва, где поля ещё нет (миграции не будет).
 * Такой сейв записан до B-02, когда ✦ покидали баланс единственным путём —
 * оплатой страницы атласа, поэтому сумма восстанавливается точно. S-03
 * списание сняло вовсе, но старые сейвы по-прежнему описывают ту модель.
 */
function reconstructLifetimeMetaEarned() {
    let sum = metaScore;
    for (const pageIndex of unlockedPageIndices) {
        sum += ATLAS_PAGE_COSTS[pageIndex] || 0;
    }
    return sum;
}

/**
 * S-01: главы атласа открываются автоматически. S-03: по уровню, а не по
 * балансу — глава с индексом i открывается на уровне i + 1, то есть когда
 * `lifetimeMetaEarned` проходит её ступень лестницы. ✦ при этом больше не
 * списываются: `metaScore` стал просто счётчиком заработанного.
 */
function maybeAutoUnlockAtlasPages() {
    let unlockedAny = false;
    let next = getNextLockedAtlasPageIndex();
    while (next >= 0 && lifetimeMetaEarned >= getAtlasCumulativeCost(next)) {
        unlockedPageIndices.add(next);
        unlockedAny = true;
        // K-09/K-15: разрезанная глава — обязательное событие ленты «Сегодня», без тоста.
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

/**
 * K-12 / S-03: порог главы атласа в ✦ за всё время — ступень лестницы уровней,
 * на которой глава открывается (кумулятивная сумма ATLAS_PAGE_COSTS[0..index]).
 * Главы штампов режутся на том же ряду — общем, а не своём собственном.
 */
function getAtlasCumulativeCost(index) {
    return getLevelThreshold(getAtlasChapterLevel(index));
}

/** S-03: глава с индексом i открывается на уровне i + 1. */
function getAtlasChapterLevel(index) {
    return Math.max(0, Math.floor(index)) + 1;
}

function getNextLockedAtlasPageIndex() {
    for (let i = 0; i < ATLAS_PAGE_COUNT; i++) {
        if (!isAtlasPageUnlocked(i)) return i;
    }
    return -1;
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
// LEVELS (S-03)
// =============================================================================

/**
 * Порог уровня в ✦ за всё время. Уровень 1 — с нуля; первые ступени —
 * кумулятив цен глав атласа (уровень N открывает главу N), дальше каждые
 * LEVEL_TAIL_STEP без потолка. Единственное место, где считается лестница:
 * шкала у корешка, замки книги, Экслибрис и лента читают её отсюда.
 */
function getLevelThreshold(level) {
    const n = Math.max(1, Math.floor(level));
    const chapters = ATLAS_PAGE_COSTS.length;
    let sum = 0;
    for (let i = 0; i < Math.min(n, chapters); i++) sum += ATLAS_PAGE_COSTS[i];
    if (n > chapters) sum += (n - chapters) * LEVEL_TAIL_STEP;
    return sum;
}

/** Уровень, который дают `earned` ✦ за всё время. */
function getLevelForEarned(earned) {
    const e = Math.max(0, Math.floor(Number(earned) || 0));
    const chapters = ATLAS_PAGE_COSTS.length;
    const lastChapter = getLevelThreshold(chapters);
    if (e >= lastChapter) return chapters + Math.floor((e - lastChapter) / LEVEL_TAIL_STEP);
    let level = 1;
    while (level < chapters && e >= getLevelThreshold(level + 1)) level++;
    return level;
}

function getPlayerLevel() {
    return getLevelForEarned(lifetimeMetaEarned);
}

/** Ступень хвоста — уровень, у которого нет своей главы атласа. */
function isTailLevel(level) {
    return Math.floor(level) > ATLAS_PAGE_COSTS.length;
}

/**
 * Снимок для шкалы у корешка и строки «Сегодня»: пороги текущего и следующего
 * уровня и доля добора между ними. Потолка нет — следующий уровень есть всегда.
 */
function getLevelProgress() {
    const earned = lifetimeMetaEarned;
    const level = getLevelForEarned(earned);
    const floor = getLevelThreshold(level);
    const ceil = getLevelThreshold(level + 1);
    const span = ceil - floor;
    return {
        earned, level, name: getLevelName(level),
        floor, ceil, left: Math.max(0, ceil - earned),
        ratio: span > 0 ? Math.max(0, Math.min(1, (earned - floor) / span)) : 0
    };
}

/**
 * S-03: ступень хвоста объявляется одной строкой ленты «Сегодня» — у неё нет
 * разреза главы и баннера V-16, которые объявили бы её иначе, а без строки
 * опустевшая шкала читалась бы как потерянный прогресс. Ступени глав здесь
 * молчат: их объявляет `book.newsAtlasCut`. Каждая ступень — ровно один раз.
 */
function maybeAnnounceLevelUp() {
    const level = getPlayerLevel();
    if (level <= levelAnnounced) return false;
    for (let lv = levelAnnounced + 1; lv <= level; lv++) {
        if (isTailLevel(lv) && typeof addDailyNewsEvent === 'function') {
            addDailyNewsEvent('book.newsLevelUp', { n: lv, name: getLevelName(lv) });
        }
    }
    levelAnnounced = level;
    return true;
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
    levelAnnounced = 1;
    if (typeof resetAchievementsForFullReset === 'function') resetAchievementsForFullReset();
}

// =============================================================================
// PERSISTENCE
// =============================================================================

const PROGRESSION_SAVE_KEY = 'starsReborn_progression';

function saveProgression() {
    try {
        const state = {
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
            observatoryUnlockedNotified,
            // S-03: последняя объявленная ступень лестницы. Поле аддитивное —
            // версия сейва не поднимается.
            levelAnnounced
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
            // B-04: глава I стоит 0 ✦ намеренно — игрок без единого ✦ обязан
            // увидеть её открытой сразу, а не после первого начисления.
            maybeAutoUnlockAtlasPages();
            saveProgression();
            return false;
        }

        const state = JSON.parse(raw);
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
        // Старый сейв, где порог уже взят: новость не пишем задним числом —
        // игрок увидит ожившую страницу обсерватории и без неё.
        observatoryUnlockedNotified = state.observatoryUnlockedNotified !== undefined
            ? !!state.observatoryUnlockedNotified
            : isObservatoryUnlocked();
        // S-03: сейв до уровней — всё, что уже взято, считаем объявленным:
        // строки «новый уровень» в ленту задним числом не пишем.
        levelAnnounced = Number.isFinite(Number(state.levelAnnounced))
            ? Math.max(1, Math.floor(Number(state.levelAnnounced)))
            : getPlayerLevel();

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

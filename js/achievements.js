// achievements.js — Страница достижений (V-06): цепочки квестов, проверки, прогресс, оверлей 🏆

// =============================================================================
// КОНСТАНТЫ
// =============================================================================

// B-01: награда за шаг растёт вместе с тиром, по индексу шага в цепочке.
// До перекалибровки ставка была плоской (5 ✦), и первый тир «1 созвездие цвета»
// платил столько же, сколько пятый «60 созвездий цвета» — достижения работали
// стартовым бонусом и выгорали за месяц. Теперь шаг пятого тира стоит больше
// трёх ночей, и цепочки становятся долгим доходом.
const ACHIEVEMENT_STEP_REWARDS = [10, 20, 30, 45, 70];
// Запасное значение для цепочек короче/длиннее пяти шагов (сейчас таких нет).
const ACHIEVEMENT_STEP_REWARD_FALLBACK = 10;

// B-01: объёмные цепочки (цвета и размеры) — пороги ×8 от исходных [1,5,15,30,60].
// Награды перераспределяют ценность, но не время: без этого шаг всё равно берётся
// в первый месяц (при 30 созвездиях за ночь жёлтый выбирал свои 60 к пятой ночи).
// НЕ применять к «Зодчему небес»: его тиры [10,50,250,1000,5000] и так тянутся
// до 167-й ночи, ×8 дал бы 40 000 созвездий — три с половиной года.
const ACHIEVEMENT_VOLUME_TIERS = [8, 40, 120, 240, 480];

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
    const tiers = ACHIEVEMENT_VOLUME_TIERS;
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
    const tiers = ACHIEVEMENT_VOLUME_TIERS;
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

const ACHIEVEMENT_ALL_ATLAS_SHAPES = ATLAS_PAGES.flat();

// S-01 / atlas-pages-graph: особые достижения страниц 2–6 (у страниц 0/1 —
// Радуга/Мозаика ниже). Каждое — ночная коллекция (≤1/ночь, тиры 1→3→7→15→30),
// со своей осью, видимость по полному комплекту созданных фигур страницы.
const ATLAS_PAGE_SPECIALS = [
    { page: 2, id: 'vitrazh', title: 'Витраж', icon: '🪟', mechanic: 'pageColors',
      desc: 'фигуры стр. 3 на поле во всех 5 цветах' },
    { page: 3, id: 'kaleidoscope', title: 'Калейдоскоп', icon: '🔮', mechanic: 'pageAllOnField',
      desc: 'все 5 фигур стр. 4 на поле' },
    { page: 4, id: 'gobelen', title: 'Гобелен', icon: '🧶', mechanic: 'pageCountOnField', k: 3,
      desc: '3+ фигуры стр. 5 на поле' },
    { page: 5, id: 'orchestra', title: 'Оркестр', icon: '🎻', mechanic: 'pageAllCreatedNight',
      desc: 'создай все 5 фигур стр. 6 за ночь' },
    { page: 6, id: 'symphony', title: 'Симфония', icon: '🎼', mechanic: 'shapeCreatedNight', shape: 'Перфекционист',
      desc: 'создай Перфекциониста за ночь' }
];

const ATLAS_PAGE_SPECIAL_TIERS = [1, 3, 7, 15, 30];

function buildPageSpecialChain(spec) {
    return {
        id: spec.id,
        title: spec.title,
        icon: spec.icon,
        requiresPageComplete: spec.page,
        pageSpecial: spec,
        steps: ATLAS_PAGE_SPECIAL_TIERS.map(n => ({
            id: `${spec.id}_${n}`,
            desc: `${n} ноч(ей): ${spec.desc}`,
            check: { type: 'pageSpecialNights', id: spec.id, n }
        }))
    };
}

function getPageSpecialForPage(pageIndex) {
    return ATLAS_PAGE_SPECIALS.find(s => s.page === pageIndex) || null;
}

const ACHIEVEMENT_CHAINS = [
    ...ACHIEVEMENT_COLOR_KEYS.map(buildColorChain),
    ...[3, 4, 5, 6, 7].map(buildExactSizeChain),
    {
        id: 'size_8plus',
        title: '8★+',
        icon: '✴️',
        // B-01: тоже объёмная цепочка — ×8 от прежних [1,3,8,15,25].
        // Своя шкала (не ACHIEVEMENT_VOLUME_TIERS): 8★+ созвездия редки сами по себе.
        steps: [8, 24, 64, 120, 200].map(n => ({
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
    // atlas-pages-graph: особые достижения страниц 2–6
    ...ATLAS_PAGE_SPECIALS.map(buildPageSpecialChain),
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
    // U-10: награда за огранку — ОДНОЙ цепочкой, а не 29 записями «Огранка: Чипсина».
    // Так «унести награду в ачивки» стоит +1 слот: список остаётся читаемым,
    // атлас остаётся коллекцией, фигура держит только состояние (грани и венец) —
    // кнопок забора на карточках нет. Пороги подтверждены прогоном; между 15-й и
    // 29-й фигурой цепочка молчит долго — это принято: огранка не часть основного
    // пути (3 месяца), а слой мастерства (год).
    {
        id: 'ogranshchik',
        title: 'Огранщик',
        icon: '💎',
        steps: [1, 3, 7, 15, 29].map(n => ({
            id: `ogranshchik_${n}`,
            desc: n === 29
                ? 'Огранить все 29 фигур атласа'
                : `${n} огранённых фигур (все 5 цветов у каждой)`,
            check: { type: 'facetedShapes', n }
        }))
    }
    // U-09: пер-фигурные цепочки shape_* удалены. Огранка — свойство фигуры
    // (isShapeFaceted), а не достижение; награда за неё — цепочка «Огранщик» выше.
];

function getAchievementChainById(chainId) {
    return ACHIEVEMENT_CHAINS.find(c => c.id === chainId) || null;
}

/**
 * B-01: награда за шаг — по индексу шага в цепочке, а не плоская ставка.
 * Раньше функция принимала только цепочку и умела подменять ставку через
 * chain.stepReward (этим пользовались удалённые в U-09 цепочки shape_*);
 * подмены больше нет ни у одной цепочки, поле не читается.
 */
function getAchievementChainStepReward(chain, stepIndex) {
    const i = Number(stepIndex);
    if (!Number.isInteger(i) || i < 0 || i >= ACHIEVEMENT_STEP_REWARDS.length) {
        return ACHIEVEMENT_STEP_REWARD_FALLBACK;
    }
    return ACHIEVEMENT_STEP_REWARDS[i];
}

/** S-01: полный комплект страницы — все фигуры страницы созданы. */
function isAtlasPageSetComplete(pageIndex) {
    if (pageIndex < 0 || pageIndex >= ATLAS_PAGES.length) return false;
    return ATLAS_PAGES[pageIndex].every(name => isShapeCreated(name));
}

/**
 * Видимость цепочки: страничные особые «просыпаются» за полный комплект своей
 * страницы, остальные видны всегда.
 *
 * U-09: невидимая цепочка больше не исчезает из списка — она рисуется замком
 * с условием (см. getChainLockReason). Эта функция по-прежнему решает, набирает
 * ли цепочка claimable и тостится ли она.
 */
function isAchievementChainVisible(chain) {
    if (!chain) return false;
    if (typeof chain.requiresPageComplete === 'number') {
        return isAtlasPageSetComplete(chain.requiresPageComplete);
    }
    return true;
}

/**
 * U-09: почему запись на странице «Особые» показана замком, а не собой.
 * Два вида замка — страница атласа ещё не открыта, либо открыта, но комплект
 * фигур не собран. Возвращает null, если цепочка открыта.
 */
function getChainLockReason(chain) {
    if (!chain || typeof chain.requiresPageComplete !== 'number') return null;
    const page = chain.requiresPageComplete;
    if (isAtlasPageSetComplete(page)) return null;
    const pageUnlocked = typeof isAtlasPageUnlocked === 'function' ? isAtlasPageUnlocked(page) : true;
    return pageUnlocked
        ? `Соберите все фигуры страницы ${page + 1}`
        : `Страница ${page + 1} ещё не открыта`;
}

// =============================================================================
// СОСТОЯНИЕ
// =============================================================================

// achievementProgress[chainId] = { stepIndex, claimable }
let achievementProgress = {};
let achievementCounters = null;
let rainbowCountedThisNight = false;
let mosaicCountedThisNight = false;
// atlas-pages-graph: id особых достижений страниц 2–6, засчитанных этой ночью (≤1/ночь)
let pageSpecialsCountedThisNight = new Set();
// S-01: фигуры, засчитанные в огранку этой ночью (анти-гринд ≤1/ночь)
let shapesCountedThisNight = new Set();
// S-01: особые достижения (Радуга/Мозаика), о доступности которых уже оповестили
let announcedSpecialChains = new Set();

// Версия схемы достижений (S-01: сброс Радуги/Мозаики; S-02 v3: пер-фигурные
// цепочки переведены на цвета; U-09 v4: цепочки shape_* удалены, цвета стали
// огранкой; B-01 v5: пороги объёмных цепочек ×8 и ступенчатая награда за шаг —
// обе миграции сбрасывают ВЕСЬ прогресс, включая ✦ и страницы атласа).
const ACHIEVEMENTS_SAVE_VERSION = 5;

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
        // atlas-pages-graph: id особого достижения страницы → всего засчитанных ночей
        pageSpecialNights: { vitrazh: 0, kaleidoscope: 0, gobelen: 0, orchestra: 0, symphony: 0 },
        // U-09: имя фигуры → { color: число засчитанных созданий } (≤1/ночь на фигуру).
        // Ненулевой счётчик = грань горит; число нужно только для корректного отката.
        shapeColors: {}
    };
}

/** S-02: нормализует сохранённую карту цветов фигуры до полного набора ключей. */
function sanitizeShapeColorMap(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const name of Object.keys(raw)) {
        const src = raw[name] || {};
        const rec = {};
        for (const color of ACHIEVEMENT_COLOR_KEYS) {
            rec[color] = Math.max(0, Number(src[color]) || 0);
        }
        out[name] = rec;
    }
    return out;
}

/**
 * U-09: сколько граней фигуры горит. Квот больше нет — грань загорается
 * с первого создания фигуры в этом цвете, поэтому считаем ненулевые бакеты.
 */
function shapeFacetCount(shapeName) {
    if (!achievementCounters || !achievementCounters.shapeColors) return 0;
    const normalized = typeof normalizeShapeName === 'function' ? normalizeShapeName(shapeName) : shapeName;
    const counts = achievementCounters.shapeColors[normalized];
    if (!counts) return 0;
    let done = 0;
    for (const color of ACHIEVEMENT_COLOR_KEYS) {
        if ((counts[color] || 0) > 0) done++;
    }
    return done;
}

/** U-09: горит ли конкретная грань (фигура создавалась в этом цвете). */
function isShapeFacetLit(shapeName, color) {
    if (!achievementCounters || !achievementCounters.shapeColors) return false;
    const normalized = typeof normalizeShapeName === 'function' ? normalizeShapeName(shapeName) : shapeName;
    const counts = achievementCounters.shapeColors[normalized];
    return !!(counts && (counts[color] || 0) > 0);
}

/** U-09: фигура огранена — собрана во всех пяти цветах. */
function isShapeFaceted(shapeName) {
    return shapeFacetCount(shapeName) >= ACHIEVEMENT_COLOR_KEYS.length;
}

/** U-09: сколько фигур атласа огранено (пригодится «Огранщику» в U-10). */
function getFacetedShapeCount() {
    return ACHIEVEMENT_ALL_ATLAS_SHAPES.filter(isShapeFaceted).length;
}

function initAchievementState() {
    achievementProgress = {};
    for (const chain of ACHIEVEMENT_CHAINS) {
        achievementProgress[chain.id] = { stepIndex: 0, claimable: false };
    }
    achievementCounters = makeDefaultAchievementCounters();
    rainbowCountedThisNight = false;
    mosaicCountedThisNight = false;
    pageSpecialsCountedThisNight = new Set();
    shapesCountedThisNight = new Set();
    announcedSpecialChains = new Set();
}

function resetAchievementsForFullReset() {
    initAchievementState();
}

/**
 * Каталог-29: сброс достижений, завязанных на состав фигур/страниц
 * (пер-фигурные цепочки, Радуга/Мозаика). Не-фигурные цепочки (цвета,
 * размеры, ночи, всего созвездий, минимализм) и их счётчики сохраняются.
 * Вызывается из migrateSaveToCatalog29 (progression.js).
 */
function resetShapeAchievementsForCatalogMigration() {
    if (achievementCounters) {
        achievementCounters.shapeColors = {};
        achievementCounters.rainbowNights = 0;
        achievementCounters.mosaicNights = 0;
        achievementCounters.pageSpecialNights = makeDefaultAchievementCounters().pageSpecialNights;
    }
    for (const chain of ACHIEVEMENT_CHAINS) {
        if (!achievementProgress[chain.id]) continue;
        if (typeof chain.requiresPageComplete === 'number') {
            achievementProgress[chain.id].stepIndex = 0;
            achievementProgress[chain.id].claimable = false;
        }
    }
    rainbowCountedThisNight = false;
    mosaicCountedThisNight = false;
    pageSpecialsCountedThisNight = new Set();
    shapesCountedThisNight = new Set();
    announcedSpecialChains = new Set();
}

function resetPerNightAchievementFlags() {
    rainbowCountedThisNight = false;
    mosaicCountedThisNight = false;
    pageSpecialsCountedThisNight = new Set();
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
        pageSpecialsCountedThisNight: [...pageSpecialsCountedThisNight],
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
            pageSpecialNights: Object.assign({}, def.pageSpecialNights, s.pageSpecialNights || {}),
            shapeColors: sanitizeShapeColorMap(s.shapeColors)
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
    pageSpecialsCountedThisNight = new Set(Array.isArray(state.pageSpecialsCountedThisNight) ? state.pageSpecialsCountedThisNight : []);
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
 * U-09: выставляется миграцией, когда сейв старше v4. Читается в loadProgression
 * (progression.js) — сброс всего прогресса делается там, потому что ✦, страницы
 * атласа и createdShapes живут вне этого модуля.
 */
let achievementsMigrationNeedsFullReset = false;

/**
 * Миграция сейвов достижений.
 * - v<2 (S-01): Радуга/Мозаика переехали в особые достижения страниц — сброс.
 * - v<3 (S-02): пер-фигурные цепочки переведены со счётчика повторов на цвета.
 * - v<4 (U-09): цепочки shape_* удалены, цвета стали огранкой, награды за цвета
 *   убраны. Пересчитывать старый прогресс бессмысленно (решение заказчика):
 *   **полный сброс всего прогресса**, включая ✦ и открытые страницы атласа.
 * - v<5 (B-01): пороги объёмных цепочек ×8 и ступенчатая награда за шаг. Без
 *   сброса игрок с «60 жёлтых» стоял бы на пятом тире, а после правки откатился
 *   на второй, сохранив уже забранные ✦ — это не миграция, а обесценивание.
 *   Совместить со сбросом U-09 не вышло: она вышла отдельным релизом и заняла v4.
 *
 * Home Demo, живых игроков нет — честный старт с нуля дешевле пересчёта.
 */
function migrateAchievementsToSpiral(state) {
    const version = Number(state.achievementsVersion) || 1;
    if (version >= ACHIEVEMENTS_SAVE_VERSION) return;

    if (version < 5) {
        // Сбрасывать по шагам смысла нет — обнуляем всё разом.
        initAchievementState();
        achievementsMigrationNeedsFullReset = true;
    }
}

/** U-09: одноразовый флаг — читается и гасится в loadProgression. */
function consumeAchievementsFullResetFlag() {
    const needed = achievementsMigrationNeedsFullReset;
    achievementsMigrationNeedsFullReset = false;
    return needed;
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
    // atlas-pages-graph: присутствие и цвета атласных фигур по страницам
    const pageShapesOnField = {}; // pageIdx → Set имён фигур
    const pageColorBuckets = {};  // pageIdx → Set цветовых тиров
    for (const c of list) {
        const ids = collectStarIdsFromLines(c.lines);
        const bucket = constellationColorBucket([...ids]);
        colorsPresent.add(bucket);
        const mb = mosaicSizeBucket(c.starCount);
        if (mb) sizeBucketsPresent.add(mb);

        const name = typeof normalizeShapeName === 'function'
            ? normalizeShapeName(c.shape || c.name) : (c.shape || c.name);
        if (!name || name === 'Фигура') continue;
        const pageIdx = typeof getAtlasPageForShape === 'function' ? getAtlasPageForShape(name) : -1;
        if (pageIdx < 0) continue;
        if (!pageShapesOnField[pageIdx]) pageShapesOnField[pageIdx] = new Set();
        pageShapesOnField[pageIdx].add(name);
        if (!pageColorBuckets[pageIdx]) pageColorBuckets[pageIdx] = new Set();
        pageColorBuckets[pageIdx].add(bucket);
    }
    const totalFieldStars = Array.isArray(fieldStars) ? fieldStars.length : 0;
    return {
        count: list.length,
        starCounts,
        colorsPresent,
        sizeBucketsPresent,
        pageShapesOnField,
        pageColorBuckets,
        totalFieldStars,
        revealed: !!constellationArtRevealed
    };
}

function isMosaicComplete(snap) {
    return MOSAIC_REQUIRED_BUCKETS.every(b => snap.sizeBucketsPresent.has(b));
}

/** atlas-pages-graph: выполнено ли ночное условие особого достижения страницы. */
function isPageSpecialNightSatisfied(spec, snap) {
    if (!spec) return false;
    const page = spec.page;
    const onField = (snap.pageShapesOnField && snap.pageShapesOnField[page]) || new Set();
    const pageFigs = Array.isArray(ATLAS_PAGES[page]) ? ATLAS_PAGES[page] : [];
    switch (spec.mechanic) {
        case 'pageColors': {
            const buckets = (snap.pageColorBuckets && snap.pageColorBuckets[page]) || new Set();
            return buckets.size >= ACHIEVEMENT_COLOR_KEYS.length; // все 5 цветов
        }
        case 'pageAllOnField':
            return pageFigs.length > 0 && pageFigs.every(n => onField.has(n));
        case 'pageCountOnField':
            return onField.size >= (spec.k || pageFigs.length);
        case 'pageAllCreatedNight':
            return pageFigs.length > 0 && pageFigs.every(n => shapesCountedThisNight.has(n));
        case 'shapeCreatedNight':
            return shapesCountedThisNight.has(spec.shape);
        default:
            return false;
    }
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
        // U-10: огранка — производное свойство, счётчика в сейве нет.
        // Считаем по shapeColors тем же предикатом, что рисует венец на карточке.
        case 'facetedShapes':
            return getFacetedShapeCount() >= check.n;
        case 'rainbowNights':
            return c.rainbowNights >= check.n;
        case 'mosaicNights':
            return c.mosaicNights >= check.n;
        case 'pageSpecialNights':
            return (c.pageSpecialNights[check.id] || 0) >= check.n;
        case 'levelsCompleted':
            return c.levelsCompleted >= check.n;
        case 'totalConstellations':
            return c.totalConstellations >= check.n;
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
        case 'facetedShapes': return { current: getFacetedShapeCount(), target: check.n };
        case 'rainbowNights': return { current: c.rainbowNights, target: check.n };
        case 'mosaicNights': return { current: c.mosaicNights, target: check.n };
        case 'pageSpecialNights': return { current: c.pageSpecialNights[check.id] || 0, target: check.n };
        case 'levelsCompleted': return { current: c.levelsCompleted, target: check.n };
        case 'totalConstellations': return { current: c.totalConstellations, target: check.n };
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

/** Есть ли где-нибудь в Наградах забираемый шаг (бейдж на peek-строке). */
function hasClaimableAchievements() {
    return ACHIEVEMENT_CHAINS.some(chain => {
        const p = achievementProgress[chain.id];
        return p && p.claimable;
    });
}

// =============================================================================
// ХУКИ ОЦЕНКИ (вызываются из drawing.js)
// =============================================================================

function recordAchievementCommit(constellation) {
    applyConstellationToCounters(constellation, +1);
    recordShapeCommitForFacets(constellation);
    afterAchievementStateChanged();
}

function recordAchievementUndo(constellation) {
    applyConstellationToCounters(constellation, -1);
    recordShapeUndoForFacets(constellation);
    afterAchievementStateChanged();
}

// =============================================================================
// U-09: ОГРАНКА — СЧЁТ ГРАНЕЙ НА КОММИТЕ (≤1/ночь на фигуру) И ОТКАТ
// =============================================================================

function getCommittedAtlasShapeName(constellation) {
    if (!constellation || !achievementCounters) return null;
    const name = normalizeShapeName(constellation.shape);
    if (!name || name === 'Фигура') return null;
    if (typeof isShapeVisibleInAtlas === 'function' && !isShapeVisibleInAtlas(name)) return null;
    return name;
}

/** Суммарно засчитанных созданий фигуры (по всем цветам). */
function shapeTotalCreations(counts) {
    if (!counts) return 0;
    let total = 0;
    for (const color of ACHIEVEMENT_COLOR_KEYS) total += counts[color] || 0;
    return total;
}

function recordShapeCommitForFacets(constellation) {
    const name = getCommittedAtlasShapeName(constellation);
    if (!name) return;
    if (shapesCountedThisNight.has(name)) return; // анти-гринд: ≤1 засчёт на фигуру за ночь

    // U-09: цвет зажигает свою грань с первого раза (квот нет); красный и синий
    // банан за одну ночь получить нельзя — только +1 грань на фигуру за небо.
    const ids = collectStarIdsFromLines(constellation.lines);
    const bucket = constellationColorBucket([...ids]);
    if (!bucket) return;

    shapesCountedThisNight.add(name);
    if (!achievementCounters.shapeColors[name]) {
        achievementCounters.shapeColors[name] = { red: 0, orange: 0, yellow: 0, white: 0, blue: 0 };
    }
    const counts = achievementCounters.shapeColors[name];
    counts[bucket] = (counts[bucket] || 0) + 1;

    // Сюрприз-момент: самое первое создание фигуры (в любом цвете) — имя раскрыто.
    if (shapeTotalCreations(counts) === 1) {
        showShapeRevealToast(name);
    }

    // U-09: тоста огранки в этой задаче нет — фигура молча золотится в атласе.
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

function recordShapeUndoForFacets(constellation) {
    const name = getCommittedAtlasShapeName(constellation);
    if (!name) return;
    if (!shapesCountedThisNight.has(name)) return;
    shapesCountedThisNight.delete(name);
    // Откат того же созвездия → тот же бакет, что был засчитан на коммите.
    const ids = collectStarIdsFromLines(constellation.lines);
    const bucket = constellationColorBucket([...ids]);
    const counts = achievementCounters.shapeColors[name];
    if (counts && bucket) counts[bucket] = Math.max(0, (counts[bucket] || 0) - 1);
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
    // atlas-pages-graph: особые достижения страниц 2–6 (каждое ≤1 раз за небо)
    for (const spec of ATLAS_PAGE_SPECIALS) {
        if (pageSpecialsCountedThisNight.has(spec.id)) continue;
        if (!isPageSpecialNightSatisfied(spec, snap)) continue;
        achievementCounters.pageSpecialNights[spec.id] =
            (achievementCounters.pageSpecialNights[spec.id] || 0) + 1;
        pageSpecialsCountedThisNight.add(spec.id);
    }
    afterAchievementStateChanged();
}

function afterAchievementStateChanged() {
    recomputeAchievementsClaimable(true);
    saveProgression();
    // U-09: обе половины живут в шторке — перерисовываем её, если открыта
    if (typeof updatePeekBar === 'function') updatePeekBar();
    if (typeof refreshSheetIfOpen === 'function') refreshSheetIfOpen();
}

// =============================================================================
// ЗАБОР НАГРАДЫ
// =============================================================================

function claimAchievementStep(chainId) {
    const chain = getAchievementChainById(chainId);
    const p = achievementProgress[chainId];
    if (!chain || !p || !p.claimable) return false;
    if (p.stepIndex >= chain.steps.length) return false;

    // B-01: платим за тот шаг, который забирают, — до сдвига индекса
    awardMetaScore(getAchievementChainStepReward(chain, p.stepIndex));
    p.stepIndex += 1;
    p.claimable = false;

    // Забор — необратимое событие: блокируем откат
    if (typeof raiseUndoFloor === 'function') raiseUndoFloor();

    // Следующий шаг может оказаться сразу выполнен → тост об этом (notify=true)
    recomputeAchievementsClaimable(true);
    saveProgression();

    updateProgressionUI();
    if (typeof updateUndoConstellationButtonState === 'function') updateUndoConstellationButtonState();
    if (typeof refreshSheetIfOpen === 'function') refreshSheetIfOpen();
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

// =============================================================================
// U-09: НАГРАДЫ — 4 СТРАНИЦЫ СТРОК В ШТОРКЕ
// =============================================================================

/**
 * Порядок фиксирован и не зависит от наличия забора: игрок ищет готовое
 * по бейджу на иконке рельса, а не по перескакивающим строкам.
 */
const REWARD_PAGES = [
    {
        id: 'colors', icon: '🎨', title: 'Цвета',
        chainIds: ['color_red', 'color_orange', 'color_yellow', 'color_white', 'color_blue']
    },
    {
        id: 'sizes', icon: '★', title: 'Размеры',
        chainIds: ['size_3', 'size_4', 'size_5', 'size_6', 'size_7', 'size_8plus']
    },
    {
        id: 'specials', icon: '🌈', title: 'Особые',
        chainIds: ['rainbow', 'mosaic', 'vitrazh', 'kaleidoscope', 'gobelen', 'orchestra', 'symphony']
    },
    {
        // U-10: «Огранщик» встаёт первой записью, страница переименована
        id: 'path', icon: '💎', title: 'Огранка и путь',
        chainIds: ['ogranshchik', 'nights', 'constellations', 'minimalism', 'unite_all']
    }
];

const REWARD_PAGE_COUNT = REWARD_PAGES.length;

function getRewardPageChains(pageIndex) {
    const page = REWARD_PAGES[pageIndex];
    if (!page) return [];
    return page.chainIds.map(getAchievementChainById).filter(Boolean);
}

/** U-09: бейдж на иконке рельса — на этой странице есть что забрать. */
function rewardPageHasClaimable(pageIndex) {
    return getRewardPageChains(pageIndex).some(chain => {
        const p = achievementProgress[chain.id];
        return p && p.claimable;
    });
}

/** Текст текущего шага: описание + «12 / 15» или «готово». */
function buildAchievementStepText(chain, p) {
    const step = chain.steps[p.stepIndex];
    const prog = getAchievementStepProgress(step.check);
    if (p.claimable) return `${step.desc} · готово`;
    if (!prog) return step.desc;
    return `${step.desc} · ${Math.min(prog.current, prog.target)} / ${prog.target}`;
}

function createAchievementStarsRow(chain, p) {
    const stars = document.createElement('div');
    stars.className = 'achv-stars';
    for (let i = 0; i < chain.steps.length; i++) {
        const s = document.createElement('span');
        const filled = i < p.stepIndex;
        s.className = 'achv-star' + (filled ? ' achv-star-filled' : '');
        s.textContent = filled ? '★' : '☆';
        stars.appendChild(s);
    }
    return stars;
}

/** U-09: строка-замок — цепочка есть, но имя и иконка ещё скрыты. */
function createAchievementLockedRow(reason) {
    const row = document.createElement('div');
    row.className = 'achv-row achv-row-locked';

    const icon = document.createElement('div');
    icon.className = 'achv-row-icon';
    icon.textContent = '🔒';
    row.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'achv-row-body';

    const title = document.createElement('div');
    title.className = 'achv-row-title achv-row-title-hidden';
    title.textContent = '? ? ?';
    body.appendChild(title);

    const text = document.createElement('div');
    text.className = 'achv-row-step';
    text.textContent = reason;
    body.appendChild(text);

    row.appendChild(body);
    return row;
}

function createAchievementRow(chain) {
    const lockReason = getChainLockReason(chain);
    if (lockReason) return createAchievementLockedRow(lockReason);

    const p = achievementProgress[chain.id] || { stepIndex: 0, claimable: false };
    const done = p.stepIndex >= chain.steps.length;

    const row = document.createElement('div');
    row.className = 'achv-row'
        + (done ? ' achv-row-done' : '')
        + (p.claimable ? ' achv-row-claimable' : '');

    const icon = document.createElement('div');
    icon.className = 'achv-row-icon';
    icon.textContent = chain.icon || '❓';
    row.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'achv-row-body';

    const head = document.createElement('div');
    head.className = 'achv-row-head';
    const title = document.createElement('span');
    title.className = 'achv-row-title';
    title.textContent = chain.title;
    head.appendChild(title);
    head.appendChild(createAchievementStarsRow(chain, p));
    body.appendChild(head);

    const step = document.createElement('div');
    step.className = 'achv-row-step';
    step.textContent = done ? 'Все ступени пройдены' : buildAchievementStepText(chain, p);
    body.appendChild(step);

    if (!done) {
        const prog = getAchievementStepProgress(chain.steps[p.stepIndex].check);
        const bar = document.createElement('div');
        bar.className = 'achv-row-bar';
        const fill = document.createElement('i');
        const ratio = p.claimable ? 1
            : (prog && prog.target > 0 ? Math.min(1, prog.current / prog.target) : 0);
        fill.style.width = `${Math.round(ratio * 100)}%`;
        bar.appendChild(fill);
        body.appendChild(bar);
    }

    row.appendChild(body);

    const tail = document.createElement('div');
    tail.className = 'achv-row-tail';
    if (p.claimable && !done) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'achv-claim-btn';
        // B-01: подпись должна совпадать с тем, что реально начислится за этот шаг
        btn.textContent = `+${getAchievementChainStepReward(chain, p.stepIndex)} ✦`;
        btn.title = 'Забрать награду';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            claimAchievementStep(chain.id);
        });
        tail.appendChild(btn);
    }
    row.appendChild(tail);

    return row;
}

function renderAchievementsList() {
    const list = document.getElementById('achievementsList');
    if (!list) return;
    list.innerHTML = '';
    for (const chain of getRewardPageChains(getSheetPageIndex('rewards'))) {
        list.appendChild(createAchievementRow(chain));
    }
}

// Инициализация дефолтами при загрузке модуля (до loadProgression).
initAchievementState();

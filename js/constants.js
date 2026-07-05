// constants.js — Shared constants and configuration

// =============================================================================
// FIELD DIMENSIONS (portrait orientation)
// =============================================================================

// Home demo field size in portrait orientation (P-01: transposed from the
// former 2400x1400 landscape field, no wrap on either axis; then scaled x1.5
// on both axes per заказчик request).
const FIELD_WIDTH = 2100;
const FIELD_HEIGHT = 3600;

// =============================================================================
// STAR GENERATION
// =============================================================================

const TOTAL_STAR_COUNT = 150;
const STAR_EDGE_MARGIN = 100;
const MIN_STAR_DISTANCE = 60;
const BACKGROUND_STAR_COUNT = 600;

/** Тест «усы»: на поле только 5 эталонных звёзд в центре. Включение: `index.html?mustache=1` при пустом сохранении, либо `true` здесь. */
const DEBUG_MUSTACHE_PRACTICE_FORCE = false;

/** M-03: вставлять якорные звёзды фигур в начало дня. false = скрытые подсказки отключены. */
const INJECT_ANCHOR_STARS = false;

// =============================================================================
// ZOOM PARAMETERS
// =============================================================================
// Minimum zoom is computed at runtime (see getMinZoomLevel in camera.js). Since
// the field is no longer wrapped on any axis, the min zoom now lets the player
// zoom out enough to see the ENTIRE field at once (with letterboxing on the
// shorter axis if the field/viewport aspect ratios don't match).

const MAX_ZOOM = 1.5;
const DEFAULT_ZOOM = 0.8;
const ZOOM_STEP = 0.05;
const ZOOM_BUTTON_FACTOR = 1.15; // D-01: мультипликативный шаг кнопок «+»/«−»
const DEV_TOGGLE_TAP_COUNT = 3; // D-01: тройной быстрый тап открывает dev-панель
const DEV_TOGGLE_TAP_WINDOW_MS = 400; // макс. пауза между тапами

// =============================================================================
// STAR VISUAL PARAMETERS
// =============================================================================

const STAR_SIZE = 8;
const STAR_COLOR = [255, 255, 255];
/** Stars locked into a constellation (constellation vertices). */
const USED_STAR_COLOR = [255, 200, 40];
const LOCKED_STAR_SIZE_MULTIPLIER = 1.38;
/** Skeleton under line-art overlay only (shapes with SHAPES[].image). */
const LINEART_SKELETON_STROKE_ALPHA = 42;
const LINEART_SKELETON_STROKE_WEIGHT = 0.65;
/** Committed constellation lines at level reveal (no PNG on field). */
const REVEALED_CONSTELLATION_STROKE_WEIGHT = 2.5;
const REVEALED_CONSTELLATION_LABEL_SIZE = 18;
/** Собранное созвездие из атласа до финала уровня: подпись, лайнарт, вспышка. */
const COLLECTED_ATLAS_LABEL_SIZE = 16;
const COLLECTED_ATLAS_BADGE = '★';
/** Иконка «из атласа» у черновика созвездия (экранные px, без названия фигуры). */
const DRAFT_ATLAS_HINT_BOOK_PX = 10;
const ATLAS_COLLECT_PULSE_MS = 2000;
const COLLECTED_ATLAS_GLOW_ALPHA = 72;
const COLLECTED_ATLAS_GLOW_STROKE_EXTRA = 3.5;
const LOCKED_STAR_GLOW_ALPHA = 88;
const LOCKED_STAR_HALO_WHITE_ALPHA = 34;
const SUPPRESSED_STAR_COLOR = [95, 95, 125];
const SUPPRESSED_STAR_SCALE = 0.6;
const STAR_SIZE_VARIATION_MIN = 0.88;
const STAR_SIZE_VARIATION_MAX = 1.15;
/** Discrete star temperature tiers (colorValue → RGB). */
const STAR_COLOR_TIERS = [
    { value: -100, rgb: [255, 90, 90] },
    { value: -50, rgb: [255, 160, 70] },
    { value: 0, rgb: [255, 230, 100] },
    { value: 50, rgb: [255, 255, 255] },
    { value: 100, rgb: [120, 210, 255] }
];
const STAR_COLOR_VALUES = STAR_COLOR_TIERS.map((t) => t.value);
const EXTINGUISHED_STAR_CHANCE = 0.16;
const EXTINGUISHED_STAR_COLOR = [100, 98, 118];
const EXTINGUISHED_STAR_SCALE = 0.58;
const STAR_SUPPRESSION_LINE_RADIUS = 104;
const STAR_SUPPRESSION_LOCKED_RADIUS = 144;
const LINE_COLOR = [255, 255, 140];

// =============================================================================
// CONSTELLATION LIMITS
// =============================================================================

const MIN_STARS_PER_CONSTELLATION = 2;
const MAX_STARS_PER_CONSTELLATION = 100;
/** Max share of field area (axis-aligned bbox of constellation stars) allowed before confirm is blocked. */
const MAX_CONSTELLATION_BBOX_AREA_FRACTION = 0.5;

// =============================================================================
// GEOMETRIC THRESHOLDS (strict recognition)
// =============================================================================

const SIDE_RATIO_THRESHOLD = 1.8;
const ANGLE_TOLERANCE = 25;
const COLLINEAR_HEIGHT = 15;
const CHAIN_MIN_ANGLE = 30;
// Банан: два внутренних угла цепочки из 4 звёзд (допустимый интервал [min, max]).
const SHAPE_BANANA_INTERIOR_MIN_DEG = 135;
const SHAPE_BANANA_INTERIOR_MAX_DEG = 170;
// Трусы (цепочка из 4 звёзд, 3 сегмента): два «развернутых» изгиба ~110°, боковые и средняя дуга близки по длине (не «только мешок»).
const TRUSY_CHAIN_ANGLE_CENTER = 103;
const TRUSY_CHAIN_ANGLE_TOLERANCE = 28;
const TRUSY_MAX_EDGE_LEN_RATIO = 1.6;
const TRUSY_MIN_CHAIN_ASPECT = 1.02;

// Гусеница: цепочка 3★, почти прямая — угол в средней звезде заметно тупой (не V и не ~90°).
const CATERPILLAR_MIN_CHAIN_ANGLE = 90 + ANGLE_TOLERANCE; // 115°

// Pizza slice (closed 3-star triangle): any triangle; reject needle tips (min interior angle).
const PIZZA_SLICE_MIN_MIN_ANGLE = 15;

// Кайт: замкнутый ромбовидный четырёхугольник (в т.ч. ромб ~82°/98° из SHAPE_PATTERNS).
const KITE_SIDE_RATIO_THRESHOLD = 3.5; // maxEdge/minEdge (у змея часто две короткие и две длинные)
const KITE_MIN_SPAN_MAJOR_OVER_MINOR = 1.05; // max(spanX,spanY)/min — любая ориентация
/** Квадрат: все углы близки к 90° (у эталонного кайта углы ~82°/98° — не квадрат). */
const SQUARE_ANGLE_TOLERANCE = 6;
const SQUARE_MAX_MAJOR_OVER_MINOR = 1.10;

// Усы: плоская M. getChainAngles даёт тупой угол между соседними рёбрами (~130–175°) для широкой M из SHAPE_PATTERNS.
/** M не должна быть сильно вытянута по вертикали: spanY/spanX не больше этого. */
const MUSTACHE_FLAT_MAX_SPAN_Y_OVER_X = 1.05;
/** Режим «плоская M» (как эталон mustache=1): все три угла тупые. */
const MUSTACHE_OBTUSE_MIN = 108;
const MUSTACHE_OBTUSE_MAX = 178;
/** Насколько средний угол может быть меньше боковых (впадина чуть «острее»). */
const MUSTACHE_OBTUSE_MIDDLE_MAX_BELOW_SIDES = 22;
const MUSTACHE_OBTUSE_SIDE_SYMMETRY_MAX = 48;
/** Режим с острыми боковыми углами (другой стиль рисования). */
const MUSTACHE_PEAK_ANGLE_MIN = 35;
const MUSTACHE_PEAK_ANGLE_MAX = 115;
const MUSTACHE_VALLEY_ANGLE_MIN = 75;
const MUSTACHE_VALLEY_ANGLE_MAX = 165;
const MUSTACHE_VALLEY_OVER_PEAK_MIN = 4;
const MUSTACHE_PEAK_SYMMETRY_MAX = 45;

// =============================================================================
// RECOGNITION SCORING (hybrid matcher)
// =============================================================================

const RECOG_WEIGHT_TOPO = 0.30;
const RECOG_WEIGHT_LEN = 0.20;
const RECOG_WEIGHT_ANG = 0.25;
const RECOG_WEIGHT_TURN = 0.15;
const RECOG_WEIGHT_GLOBAL = 0.10;

// Home demo tuning: slightly more forgiving to reduce false fallback.
const RECOG_ACCEPT_THRESHOLD = 0.70;
const RECOG_AMBIG_THRESHOLD = 0.55;
const RECOG_MARGIN_THRESHOLD = 0.05;
const RECOG_LEGACY_BONUS = 0.12;
/** Бонус кандидату с открытой страницы атласа (раньше «второй» 3★ не проходил порог). */
const RECOG_ATLAS_VISIBLE_BONUS = 0.10;

const RECOG_MIN_EDGE_LENGTH = 5;
const RECOG_MAX_CANDIDATES_TO_SHOW = 3;
/** Не участвуют в гибридном ранжировании (legacy и SHAPE_PATTERNS сохраняются). */
const RECOG_HYBRID_EXCLUDED_SHAPE_NAMES = new Set();

// =============================================================================
// ANIMATION PARAMETERS
// =============================================================================

const STAR_FADE_DURATION = 600;      // мс, длительность fade одной звезды
const STAR_APPEAR_DELAY_MAX = 1200;  // мс, макс задержка перед началом fade

const LABEL_FADE_DELAY    = 400;     // мс, задержка после reveal до начала волны подписей
const LABEL_FADE_DURATION = 500;     // мс, длительность fade одной подписи

const ATTACH_FLASH_DURATION_MS = 250;
const FLOATING_SCORE_DURATION_MS = 1500;
const FLOATING_SCORE_RISE = 40;

// =============================================================================
// CONSTELLATION IMAGE OVERLAY
// =============================================================================

const CONSTELLATION_IMAGE_OPACITY = 255;
const CONSTELLATION_IMAGE_PADDING = 1.2;
/** Цепочка 3★ / 2 ребра: нижняя граница extentV как доля extentU (хорда 1–3), чтобы min(scaleU,scaleV) не сжимал лайнарт. */
const CHAIN3_LINEART_MIN_V_RATIO = 0.35;
/** Трусы (ось вдоль «пояса»): не даём extentV просесть относительно ширины, иначе лайнарт сжимается и боковые линии визуально «тонкие». */
const TRUSY_LINEART_MIN_V_FROM_U_RATIO = 0.44;
const TRUSY_LINEART_MIN_V_FROM_PATH_RATIO = 0.30;
/** Сдвиг лайнарта относительно математической оси (как у пиццы). p5: положительный — по часовой. Подбирай ±90, 180 и т.д. под конкретный PNG. */
const BANANA_LINEART_ANGLE_OFFSET_DEG = 180;
/** Кайт: PNG был ориентирован на 90° относительно PCA-оси созвездия. */
const KITE_LINEART_ANGLE_OFFSET_DEG = -90;

// =============================================================================
// SHAPE DEFINITIONS
// =============================================================================

const SHAPES = {
    // 3 stars
    'Треугольник':     { color: [255, 200, 100], description: 'Замкнутый контур из 3 звёзд с близкими сторонами' },
    'Победа':          { color: [100, 255, 200], description: 'V-форма: два луча близкой длины под ~90°' },
    'Гусеница':         { color: [190, 255, 180], description: 'Три звезды в ряд с близкими расстояниями', image: 'caterpillar-lineart-transparent.png', imageArcSign: -1, imageScale: (12.5 / 3) * 0.75 },
    // 4 stars
    'Квадрат':         { color: [255, 150, 150], description: 'Четырёхугольник с равными сторонами и прямыми углами' },
    'Ромб':            { color: [255, 130, 180], description: 'Четырёхугольник с равными сторонами, но без прямых углов' },
    'Кайт':            {
        color: [255, 160, 200],
        description: 'Ромбовидный силуэт воздушного змея',
        image: 'kite-lineart-v2-classic-transparent2.png',
        imageArcSign: 1,
        imageScale: 1.15,
        imageAngleOffsetDeg: KITE_LINEART_ANGLE_OFFSET_DEG
    },
    'Четырёхугольник': { color: [180, 130, 130], description: 'Замкнутый неправильный четырёхугольник' },
    'Цепочка-4':       { color: [150, 200, 255], description: 'Четыре звезды в ряд' },
    'Вилка':           { color: [255, 255, 150], description: 'Три луча из центра' },
    'Зигзаг':          { color: [200, 255, 200], description: 'Ломаная линия с резкими поворотами' },
    'Песочные часы':   { color: [255, 180, 220], description: 'X-образная форма' },
    // 5 stars
    'Пентагон':        { color: [255, 220, 100], description: 'Правильный замкнутый пятиугольник с близкими сторонами' },
    'Пятиугольник':    { color: [200, 180, 80],  description: 'Замкнутый неправильный пятиугольник' },
    'Звезда':          { color: [255, 255, 200], description: 'Лучи из центра' },
    'Цепочка-5':       { color: [180, 180, 255], description: 'Пять звёзд в ряд' },
    'Дерево':          { color: [150, 255, 180], description: 'Ветвящаяся структура' },
    'Усы':              {
        color: [220, 180, 140],
        description: '5 звёзд, 4 ребра по цепочке: плоская M (левый низ — пик — впадина — пик — правый низ), чередующиеся повороты',
        image: 'mustache-lineart-transparent.png',
        imageArcSign: -1,
        imageScale: 1.75
    },
    'Банан':            {
        color: [255, 255, 100],
        description: 'Плавная дуга из 4 звёзд',
        image: 'banana-lineart-transparent.png',
        imageArcSign: 1,
        imageScale: 0.896,
        imageAngleOffsetDeg: BANANA_LINEART_ANGLE_OFFSET_DEG,
        // В долях extentV: «ниже» по исходнику (к низу PNG после finalAngle).
        imageOffsetV: 0.07
    },
    'Трусы':            {
        color: [200, 160, 255],
        description: 'U-образная дуга из 4 звёзд',
        image: 'trusy-lineart-transparent.png',
        imageArcSign: 1,
        imageScale: 1.55,
        imageOffsetV: 0.02
    },
    'Утюг':             { color: [255, 180, 120], description: 'Трапециевидный корпус с острым носиком', image: 'iron-lineart-transparent.png', imageArcSign: 1 },
    'Резиновая уточка': { color: [255, 220, 120], description: 'Туловище и шея утки', image: 'rubber-duck-lineart-transparent.png', imageArcSign: 1 },
    'Единорог':         { color: [230, 180, 255], description: 'Силуэт головы с длинным рогом', image: 'unicorn-lineart-transparent.png', imageArcSign: 1 },
    'Крюк':             { color: [210, 210, 230], description: 'Изогнутый крюк с плавным загибом', image: 'hook-lineart-transparent.png', imageArcSign: 1 },
    'Курсор мыши':      { color: [220, 220, 255], description: 'Указатель-стрелка', image: 'mouse-cursor-lineart-transparent.png', imageArcSign: -1 },
    'Сердечко':         { color: [255, 140, 180], description: 'Симметричное сердце с острым низом', image: 'heart-lineart-transparent.png', imageArcSign: -1 },
    'Мороженное':       { color: [255, 200, 160], description: 'Рожок с шариком', image: 'icecream-lineart-transparent.png', imageArcSign: 1 },
    'Кусок пиццы':      {
        color: [255, 190, 110],
        description: 'Треугольный кусок с широкой корочкой',
        image: 'pizza-slice-lineart-transparent.png',
        imageArcSign: 1,
        imageAngleOffsetDeg: 90,
        imageScale: 2.1,
        imageOffsetV: -0.14
    },
    'Очки':             { color: [210, 230, 255], description: 'Широкая оправа с двумя линзами', image: 'glasses-lineart-transparent.png', imageArcSign: -1 },
    'Носок':            { color: [230, 230, 255], description: 'Контур носка с выраженной пяткой', image: 'sock-lineart-transparent.png', imageArcSign: -1 },
    'Бабочка':          { color: [255, 190, 255], description: 'Силуэт крыльев с центром посередине', image: 'butterfly-lineart-transparent.png', imageArcSign: -1 },
    'Сосиска':          { color: [255, 170, 150], description: 'Плавная вытянутая дуга', image: 'sausage-lineart-transparent.png', imageArcSign: 1 },
    'Медуза':           { color: [190, 220, 255], description: 'Купол и свисающие щупальца', image: 'jellyfish-lineart-transparent.png', imageArcSign: 1 },
    // Fallback
    'Фигура':          { color: [200, 200, 200], description: 'Произвольная форма' }
};

// =============================================================================
// SCORING
// =============================================================================

const SHAPE_BASE_POINTS = {
    // 3 stars
    'Треугольник': 15,
    'Победа': 12,
    'Гусеница': 8,
    // 4 stars
    'Квадрат': 20,
    'Ромб': 18,
    'Кайт': 18,
    'Четырёхугольник': 12,
    'Цепочка-4': 10,
    'Вилка': 12,
    'Зигзаг': 10,
    'Песочные часы': 18,
    // 5 stars
    'Пентагон': 25,
    'Пятиугольник': 15,
    'Звезда': 30,
    'Цепочка-5': 12,
    'Дерево': 15,
    'Усы': 20,
    'Банан': 20,
    'Трусы': 20,
    'Утюг': 20,
    'Резиновая уточка': 20,
    'Единорог': 24,
    'Крюк': 18,
    'Курсор мыши': 18,
    'Сердечко': 22,
    'Мороженное': 18,
    'Кусок пиццы': 20,
    'Очки': 20,
    'Носок': 18,
    'Бабочка': 20,
    'Сосиска': 18,
    'Медуза': 22,
    // Fallback
    'Фигура': 8
};

const UNIQUE_DISCOVERY_BONUS = 50;

// =============================================================================
// CUSTOM CONSTELLATION TYPES
// =============================================================================

const CUSTOM_TYPE_BASE_POINTS = 12;
const SIGNATURE_ANGLE_TOLERANCE = 30;
const SIGNATURE_RATIO_TOLERANCE = 0.5;
const CUSTOM_MATCH_ACCEPT_THRESHOLD = 0.66;
const CUSTOM_MATCH_MARGIN_THRESHOLD = 0.06;

// =============================================================================
// FIELD GOALS — 3 этапа, при достижении каждого даётся XP
// =============================================================================

// Meta score: level complete bonus. (SHAPE_OPEN_POINTS удалён — S-01:
// первое создание фигуры вознаграждается шагом 1 её цепочки достижений.)
const LEVEL_COMPLETE_POINTS = 25;

// S-01: пер-фигурные цепочки достижений (спираль)
const SHAPE_CHAIN_TIERS = [1, 5, 15, 30, 60];
const SHAPE_CHAIN_STEP_REWARD = 10; // ✦ за каждый шаг пер-фигурной цепочки

// Atlas pages (2 × 3 demo shapes). Both pages purchasable with meta score.
const ATLAS_PAGES = [
    ['Гусеница', 'Кусок пиццы', 'Кайт'],
    ['Банан', 'Трусы', 'Усы']
];
const ATLAS_PAGE_COSTS = [40, 100];
const ATLAS_PAGE_COUNT = ATLAS_PAGES.length;

// Legacy field goals (unused in meta-score flow; kept for save compatibility).
const FIELD_GOAL_THRESHOLDS = [100, 250, 500];
const FIELD_GOAL_XP_REWARDS = [0, 0, 0];

// =============================================================================
// PROGRESSION (XP / LEVELS)
// =============================================================================

const SHAPE_XP = {
    'Треугольник': 10, 'Победа': 10, 'Гусеница': 10,
    'Квадрат': 10, 'Ромб': 10, 'Кайт': 10, 'Четырёхугольник': 10,
    'Цепочка-4': 10, 'Вилка': 10, 'Зигзаг': 10, 'Песочные часы': 10,
    'Пентагон': 10, 'Пятиугольник': 10, 'Звезда': 10,
    'Цепочка-5': 10, 'Дерево': 10, 'Усы': 10, 'Банан': 10, 'Трусы': 10,
    'Утюг': 10, 'Резиновая уточка': 10, 'Единорог': 10, 'Крюк': 10,
    'Курсор мыши': 10, 'Сердечко': 10, 'Мороженное': 10, 'Кусок пиццы': 10,
    'Очки': 10, 'Носок': 10, 'Бабочка': 10, 'Сосиска': 10, 'Медуза': 10,
    'Фигура': 10
};
const CUSTOM_TYPE_XP = 10;
const LEVEL_THRESHOLDS = [0, 20, 60, 130, 250, 400];
const LEVEL_NAMES = [
    'Начинающий', 'Наблюдатель', 'Звездочёт',
    'Астроном', 'Картограф неба', 'Мастер созвездий'
];

// Ordered list of all shape names (for UI checklist)
const ALL_SHAPE_NAMES = [
    'Треугольник', 'Победа', 'Гусеница',
    'Квадрат', 'Ромб', 'Кайт', 'Четырёхугольник', 'Цепочка-4', 'Вилка', 'Зигзаг', 'Песочные часы',
    'Пентагон', 'Пятиугольник', 'Звезда', 'Цепочка-5', 'Дерево', 'Усы', 'Банан', 'Трусы',
    'Утюг', 'Резиновая уточка', 'Единорог', 'Крюк', 'Курсор мыши', 'Сердечко', 'Мороженное',
    'Кусок пиццы', 'Очки', 'Носок', 'Бабочка', 'Сосиска', 'Медуза',
    'Фигура'
];

// Built-in shapes shown in UI collections (exclude generic fallback).
const BUILTIN_SHAPE_NAMES = ALL_SHAPE_NAMES.filter(name => name !== 'Фигура');

// Poetic fallback names for unrecognized constellations (shown instead of 'Фигура').
// Pool size must exceed max possible constellations on field (60 stars / 3 min = 20 max).
const FALLBACK_NAMES = [
    'Туманность', 'Искра', 'Тень', 'Эхо', 'Вихрь',
    'Осколок', 'Отблеск', 'Дрейф', 'Шёпот', 'Мерцание',
    'Полутень', 'Всплеск', 'Пылинка', 'Сполох', 'Завиток',
    'Призрак', 'Излучение', 'Зарево', 'Нить', 'Отражение',
    'Силуэт', 'Дымка', 'Волна', 'Коловорот', 'Трепет',
    'Брызги', 'Флюктуация', 'Переливы', 'Узор', 'Зигзаг',
    'Пятно', 'Мазок', 'Контур', 'Росчерк', 'Штрих',
    'Лоскут', 'Клуб', 'Мельтешение', 'Прожилка', 'Рябь',
    'Вспышка', 'Завеса', 'Ореол', 'Переход', 'Пульсация',
];
// Home demo shape whitelist: keep only the most stable set enabled.
const DEMO_ACTIVE_BUILTIN_SHAPES = new Set([
    'Гусеница',
    'Усы',
    'Кайт',
    'Кусок пиццы',
    'Банан',
    'Трусы'
]);
// All built-ins outside the home demo whitelist are soft-disabled.
const SOFT_DISABLED_BUILTIN_SHAPES = new Set(
    BUILTIN_SHAPE_NAMES.filter(name => !DEMO_ACTIVE_BUILTIN_SHAPES.has(name))
);
const ACTIVE_BUILTIN_SHAPE_NAMES = BUILTIN_SHAPE_NAMES.filter(name => !SOFT_DISABLED_BUILTIN_SHAPES.has(name));

function isBuiltinShapeName(shapeName) {
    return BUILTIN_SHAPE_NAMES.includes(shapeName);
}

function isBuiltinShapeEnabled(shapeName) {
    return !SOFT_DISABLED_BUILTIN_SHAPES.has(shapeName);
}

// =============================================================================
// SHAPE PATTERNS (idealized coordinates for UI hints)
// =============================================================================

const SHAPE_PATTERNS = {
    'Треугольник': {
        stars: [[0.5, 0.15], [0.15, 0.85], [0.85, 0.85]],
        lines: [[0, 1], [1, 2], [2, 0]]
    },
    'Победа': {
        stars: [[0.15, 0.2], [0.5, 0.8], [0.85, 0.2]],
        lines: [[0, 1], [1, 2]]
    },
    'Гусеница': {
        stars: [[0.15, 0.5], [0.5, 0.5], [0.85, 0.5]],
        lines: [[0, 1], [1, 2]]
    },
    'Квадрат': {
        stars: [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 0]]
    },
    'Ромб': {
        stars: [[0.5, 0.1], [0.85, 0.5], [0.5, 0.9], [0.15, 0.5]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 0]]
    },
    'Кайт': {
        stars: [[0.5, 0.06], [0.88, 0.5], [0.5, 0.94], [0.12, 0.5]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 0]]
    },
    'Четырёхугольник': {
        stars: [[0.3, 0.15], [0.85, 0.3], [0.7, 0.85], [0.15, 0.7]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 0]]
    },
    'Цепочка-4': {
        stars: [[0.1, 0.5], [0.37, 0.45], [0.63, 0.55], [0.9, 0.5]],
        lines: [[0, 1], [1, 2], [2, 3]]
    },
    'Вилка': {
        stars: [[0.5, 0.55], [0.5, 0.15], [0.15, 0.85], [0.85, 0.85]],
        lines: [[0, 1], [0, 2], [0, 3]]
    },
    'Зигзаг': {
        stars: [[0.1, 0.2], [0.4, 0.8], [0.6, 0.2], [0.9, 0.8]],
        lines: [[0, 1], [1, 2], [2, 3]]
    },
    'Песочные часы': {
        stars: [[0.2, 0.15], [0.8, 0.15], [0.2, 0.85], [0.8, 0.85]],
        lines: [[0, 3], [3, 1], [1, 2], [2, 0]]
    },
    'Пентагон': {
        stars: [[0.5, 0.1], [0.89, 0.38], [0.74, 0.88], [0.26, 0.88], [0.11, 0.38]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]]
    },
    'Пятиугольник': {
        stars: [[0.4, 0.12], [0.85, 0.3], [0.75, 0.85], [0.2, 0.78], [0.12, 0.35]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]]
    },
    'Звезда': {
        stars: [[0.5, 0.5], [0.5, 0.1], [0.88, 0.35], [0.73, 0.88], [0.27, 0.88], [0.12, 0.35]],
        lines: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]]
    },
    'Цепочка-5': {
        stars: [[0.06, 0.5], [0.28, 0.42], [0.5, 0.55], [0.72, 0.42], [0.94, 0.5]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 4]]
    },
    'Дерево': {
        stars: [[0.5, 0.5], [0.5, 0.1], [0.15, 0.85], [0.85, 0.85], [0.5, 0.9]],
        lines: [[0, 1], [0, 2], [0, 3], [0, 4]]
    },
    'Усы': {
        stars: [[0.05, 0.55], [0.28, 0.20], [0.50, 0.60], [0.72, 0.20], [0.95, 0.55]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
        imageAnchor: { mode: 'centroid' },
        imageDirection: { mode: 'mustacheEndpointsChord' }
    },
    'Банан': {
        // Горизонтальная дуга, выгнута вниз (как лежащий банан). C-01.
        stars: [[0.05, 0.35], [0.35, 0.65], [0.65, 0.65], [0.95, 0.35]],
        lines: [[0, 1], [1, 2], [2, 3]],
        imageAnchor: { mode: 'centroid' },
        imageDirection: { mode: 'bananaChordBulge' }
    },
    'Трусы': {
        // Более равные длины боков и низа (~max/min ≤ TRUSY_MAX_EDGE_LEN_RATIO), углы у внутренних вершин ~100–110°.
        stars: [[0.18, 0.22], [0.3, 0.74], [0.7, 0.74], [0.82, 0.22]],
        lines: [[0, 1], [1, 2], [2, 3]],
        imageAnchor: { mode: 'centroid' },
        imageDirection: { mode: 'trusyBottomEdge' }
    },
    'Утюг': {
        stars: [[0.15, 0.75], [0.25, 0.25], [0.72, 0.22], [0.9, 0.6]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 0]]
    },
    'Резиновая уточка': {
        stars: [[0.45, 0.58], [0.25, 0.78], [0.78, 0.62], [0.62, 0.25]],
        lines: [[0, 1], [0, 2], [0, 3]]
    },
    'Единорог': {
        stars: [[0.45, 0.55], [0.2, 0.72], [0.7, 0.74], [0.5, 0.88], [0.62, 0.08]],
        lines: [[0, 1], [0, 2], [0, 3], [0, 4]]
    },
    'Крюк': {
        stars: [[0.2, 0.2], [0.45, 0.22], [0.62, 0.45], [0.58, 0.82]],
        lines: [[0, 1], [1, 2], [2, 3]]
    },
    'Курсор мыши': {
        stars: [[0.2, 0.12], [0.22, 0.88], [0.82, 0.42]],
        lines: [[0, 1], [1, 2], [2, 0]]
    },
    'Сердечко': {
        stars: [[0.18, 0.22], [0.35, 0.12], [0.5, 0.82], [0.65, 0.12], [0.82, 0.22]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 4]]
    },
    'Мороженное': {
        stars: [[0.2, 0.2], [0.5, 0.9], [0.8, 0.25]],
        lines: [[0, 1], [1, 2]]
    },
    'Кусок пиццы': {
        stars: [[0.5, 0.12], [0.16, 0.86], [0.84, 0.86]],
        lines: [[0, 1], [1, 2], [2, 0]],
        imageAnchor: { mode: 'centroid' },
        imageDirection: { mode: 'triangleSharpTip' }
    },
    'Очки': {
        stars: [[0.12, 0.35], [0.38, 0.35], [0.62, 0.35], [0.88, 0.35]],
        lines: [[0, 1], [1, 2], [2, 3]]
    },
    'Носок': {
        stars: [[0.18, 0.78], [0.42, 0.42], [0.66, 0.56], [0.84, 0.2]],
        lines: [[0, 1], [1, 2], [2, 3]]
    },
    'Бабочка': {
        stars: [[0.2, 0.2], [0.8, 0.2], [0.2, 0.82], [0.8, 0.82]],
        lines: [[0, 3], [3, 1], [1, 2], [2, 0]]
    },
    'Сосиска': {
        stars: [[0.1, 0.66], [0.36, 0.46], [0.64, 0.46], [0.9, 0.64]],
        lines: [[0, 1], [1, 2], [2, 3]]
    },
    'Медуза': {
        stars: [[0.52, 0.45], [0.52, 0.16], [0.24, 0.8], [0.52, 0.9], [0.8, 0.8]],
        lines: [[0, 1], [0, 2], [0, 3], [0, 4]]
    }
};

// =============================================================================
// STAR COLOR TIER HELPERS
// =============================================================================

function pickRandomStarColorValue() {
    const idx = Math.floor(random(STAR_COLOR_VALUES.length));
    return STAR_COLOR_VALUES[idx];
}

function normalizeStarColorValue(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    const tiers = STAR_COLOR_TIERS;
    if (value <= tiers[0].value) return tiers[0].value;
    if (value >= tiers[tiers.length - 1].value) return tiers[tiers.length - 1].value;
    return value;
}

function lerpRgb(a, b, t) {
    const u = constrain(t, 0, 1);
    return [
        Math.round(a[0] + (b[0] - a[0]) * u),
        Math.round(a[1] + (b[1] - a[1]) * u),
        Math.round(a[2] + (b[2] - a[2]) * u)
    ];
}

function blendRgb(baseRgb, tintRgb, tintAmount) {
    const t = constrain(tintAmount, 0, 1);
    return lerpRgb(baseRgb, tintRgb, t);
}

function colorValueToRgb(value) {
    const v = normalizeStarColorValue(value);
    const tiers = STAR_COLOR_TIERS;
    for (let i = 0; i < tiers.length - 1; i++) {
        const lo = tiers[i];
        const hi = tiers[i + 1];
        if (v <= hi.value) {
            if (hi.value === lo.value) return lo.rgb.slice();
            const t = (v - lo.value) / (hi.value - lo.value);
            return lerpRgb(lo.rgb, hi.rgb, t);
        }
    }
    return tiers[tiers.length - 1].rgb.slice();
}

function getStarColorValue(star) {
    if (!star) return 0;
    if (typeof star.colorValue === 'number' && Number.isFinite(star.colorValue)) {
        return star.colorValue;
    }
    return 0;
}

function getMeanColorValue(starIds) {
    if (!Array.isArray(starIds) || starIds.length === 0) return 0;
    let sum = 0;
    let count = 0;
    for (const id of starIds) {
        if (typeof getStarById !== 'function') continue;
        const star = getStarById(id);
        if (!star) continue;
        sum += getStarColorValue(star);
        count++;
    }
    return count > 0 ? sum / count : 0;
}


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

// U-06: множитель хит-зоны звезды (в world-units, = STAR_SIZE * mult). Увеличен
// для уверенного попадания пальцем; getStarAt берёт ближайшую, перекрытие ок.
const STAR_HIT_RADIUS_MULT = 4;

// U-07: edge-panning при рисовании у края экрана.
// Ширина краевой полосы (доля от размера экрана) и макс. скорость пана (экранных px/кадр,
// достигается у самого края; в глубине полосы — линейная рампа от 0).
const EDGE_PAN_ZONE_FRAC = 0.12;
const EDGE_PAN_MAX_SPEED = 14;

// V-11: гашение подписей созвездий на дальнем зуме. Порог — не абсолютный зум,
// а доля пути t = (zoom − minZoom) / (DEFAULT_ZOOM − minZoom): getMinZoomLevel()
// зависит от размера экрана, поэтому фиксированное число означало бы на телефоне
// и на десктопе разное «издалека». Ниже LO подписей нет, выше HI — в полную силу,
// между — smoothstep (резкий порог давал бы мигание при пинче на границе).
// Числа визуальные, калибруются на устройстве; экономики не касаются.
const LABEL_ZOOM_FADE_LO = 0.10;
const LABEL_ZOOM_FADE_HI = 0.35;

// =============================================================================
// STAR VISUAL PARAMETERS
// =============================================================================

const STAR_SIZE = 8;
const STAR_COLOR = [255, 255, 255];
/** Stars locked into a constellation (constellation vertices). */
const USED_STAR_COLOR = [255, 200, 40];
const LOCKED_STAR_SIZE_MULTIPLIER = 1.38;
/** V-10: зазор между концом линии и звездой — доля от диаметра отрисовки звезды
 *  (baseStarDrawSize). Задаётся долей, а не world-числом, чтобы ехать за размером
 *  звезды на любом зуме (на отзуме звезда крупнее в world-юнитах — зазор тоже).
 *  Значение подобрано в браузере (2.0). Чисто визуально. */
const LINE_STAR_GAP_FACTOR = 2.00;
/** Skeleton under line-art overlay only (shapes with SHAPES[].image). */
const LINEART_SKELETON_STROKE_ALPHA = 42;
const LINEART_SKELETON_STROKE_WEIGHT = 0.65;
/** Committed constellation lines at level reveal (no PNG on field). */
const REVEALED_CONSTELLATION_STROKE_WEIGHT = 2.5;
const REVEALED_CONSTELLATION_LABEL_SIZE = 18;
/** Собранное созвездие из атласа до финала уровня: подпись простым текстом.
 *  V-12: кольцо collect-пульса снесено вместе с `ATLAS_COLLECT_PULSE_MS`; ★-бейдж
 *  и glow-константы, осиротевшие ещё в V-09, убраны там же. */
const COLLECTED_ATLAS_LABEL_SIZE = 16;
/** Иконка «из атласа» у черновика созвездия (экранные px, без названия фигуры). */
const DRAFT_ATLAS_HINT_BOOK_PX = 10;
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

// V-07: фидбэк-анимация соединения. Досягаемые от якоря звёзды коротко
// вспыхивают при каждом новом ребре; недосягаемые плавно гаснут (заменяет
// статичный дим U-03).
const FEEDBACK_DIM_MIN = 0.3;        // до какого alpha гаснут недосягаемые
const FEEDBACK_DIM_TAU_MS = 120;     // постоянная сглаживания дима (мс)
const FEEDBACK_PULSE_MS = 220;       // длительность импульса досягаемых (мс)
const FEEDBACK_PULSE_SCALE = 0.35;   // прибавка к размеру на пике импульса
const FEEDBACK_PULSE_BRIGHTEN = 0.45; // прибавка к яркости гало/свечения на пике

// V-12: волна создания созвездия. После коммита созвездие не появляется целиком —
// оно прочерчивается ребро за ребром в том порядке, в котором игрок вёл жест,
// а звезда переходит в locked-вид в момент, когда волна до неё дошла.
// Числа визуальные, калибруются свободно — экономики не касаются.
const COMMIT_WAVE_EDGE_MS = 130;        // волна идёт по одному ребру
const COMMIT_WAVE_STEP_MS = 55;         // задержка старта между соседними рёбрами
const COMMIT_WAVE_TOTAL_MAX_MS = 620;   // потолок всей волны — шаг ужимается под него
const COMMIT_WAVE_CREST = 0.45;         // длина светлого «огонька» на острие, доля ребра
const COMMIT_WAVE_STROKE_EXTRA = 2.2;   // прибавка к толщине огонька (экранные px)
const COMMIT_WAVE_WHITEN = 0.55;        // подмешивание белого в цвет линии на огоньке
const COMMIT_WAVE_STAR_FLASH_MS = 180;  // вспышка звезды на приходе волны
const COMMIT_WAVE_STAR_SCALE = 0.55;    // прибавка к размеру звезды на пике вспышки
const COMMIT_WAVE_STAR_BRIGHTEN = 0.6;  // прибавка к яркости гало/свечения на пике
const COMMIT_WAVE_LABEL_FADE_MS = 220;  // проявление подписи атласной после волны

// =============================================================================
// STAR SHAPE — «Искра ✦» (визуальный концепт 4, редизайн звёзд)
// Звезда рисуется как 4-лучевая искра с вогнутыми лучами (quadratic-безье).
// Размеры заданы относительно диаметра-ядра (starDrawSize), совместимо с
// прежней circle(x,y,d)-геометрией.
// =============================================================================

/** Длина луча искры = радиус до кончика, в долях от starDrawSize (диаметра
 *  прежнего круга). >0.5 → лучи выходят за габарит прежнего круга, давая
 *  «мерцающий» силуэт. */
const SPARK_RAY_LEN_MULT = 0.8;
/** «Талия» искры: доля длины луча, на которой сходятся вогнутые стороны у
 *  центра. Меньше → острее и тоньше лучи. */
const SPARK_WAIST = 0.16;
/** Ниже этого экранного диаметра (world-units × zoom) искра нечитаема —
 *  рисуем круг-точку как фолбэк (важно на минимальном зуме). */
const SPARK_MIN_SCREEN_DIAM = 3.2;
/** Twinkle-вспышка: редкая и кратковременная. У каждой звезды свой сдвиг фазы,
 *  так что в кадре сверкают лишь единицы. `PERIOD` — средний интервал между
 *  вспышками одной звезды, `BURST` — длительность вспышки (мс, плавная 0→1→0),
 *  `AMP` — прибавка длины лучей, `BRIGHTEN` — прибавка яркости свечения/гало. */
const SPARK_TWINKLE_PERIOD_MS = 45000;
const SPARK_TWINKLE_BURST_MS = 380;
const SPARK_TWINKLE_AMP = 0.21;
const SPARK_TWINKLE_BRIGHTEN = 0.35;
/** Atlas-collected: множитель длины лучей — чуть удлинённая «блик»-искра. */
const SPARK_ATLAS_RAY_MULT = 1.22;
/** Фоновые звёзды — плотные точки: минимальный экранный диаметр (px), чтобы
 *  суб-пиксельный антиалиасинг не превращал их в «полые» кольца. */
const BG_STAR_MIN_SCREEN_DIAM = 1.6;

// =============================================================================
// CONSTELLATION LIMITS
// =============================================================================

const MIN_STARS_PER_CONSTELLATION = 2;
// M-04: лимит площади bbox снят — потолок размера созвездия только этот.
const MAX_STARS_PER_CONSTELLATION = 100;

// =============================================================================
// RECOGNITION
// =============================================================================
//
// R-02: геометрический слой выведен целиком. Отсюда ушли пороги гибридного
// ранжирования (RECOG_WEIGHT_*, RECOG_ACCEPT/AMBIG/MARGIN_THRESHOLD,
// RECOG_LEGACY_BONUS, RECOG_ATLAS_VISIBLE_BONUS), пер-фигурные валидаторы
// (TRUSY_*, KITE_*, MUSTACHE_*, PIZZA_SLICE_*, CATERPILLAR_*, SQUARE_*,
// SHAPE_BANANA_INTERIOR_*), общие пороги углов (SIDE_RATIO_THRESHOLD,
// ANGLE_TOLERANCE, COLLINEAR_HEIGHT, CHAIN_MIN_ANGLE, RECOG_MIN_EDGE_LENGTH)
// и сам переключатель RECOGNITION_MODE — режим остался один.
// Ограничения §4 живут в topologyRecognition.js со своими числами.

/** Сколько кандидатов показывать в разборе. Живёт: customTypes.js. */
const RECOG_MAX_CANDIDATES_TO_SHOW = 3;

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
/** Сдвиг лайнарта относительно математической оси. p5: положительный — по часовой. Подбирай ±90, 180 и т.д. под конкретный PNG. */
const BANANA_LINEART_ANGLE_OFFSET_DEG = 180;

// =============================================================================
// SHAPE DEFINITIONS
// =============================================================================
//
// L-01: ключи — ASCII-ID, а не имена. Имя на экран берётся только через
// `shapeLabel(id)` (i18n.js); `description` — dev-текст, не переводится.

/** Sentinel «фигура не распознана». Раньше это был литерал SHAPE_UNRECOGNIZED в 48 местах. */
const SHAPE_UNRECOGNIZED = 'unknown';

// R-02: таблица сокращена до каталога-29 + sentinel. 31 фигура геометрического
// слоя (Треугольник, Квадрат, Усы, Сердце, Пицца и прочие) удалена вместе
// с самим слоем — топораспознаватель их не выдавал ни разу.
const SHAPES = {
    'banana':            {
        color: [255, 255, 100],
        description: 'Плавная дуга из 4 звёзд',
        image: 'banana-lineart-transparent.png',
        imageArcSign: 1,
        imageScale: 0.896,
        imageAngleOffsetDeg: BANANA_LINEART_ANGLE_OFFSET_DEG,
        // В долях extentV: «ниже» по исходнику (к низу PNG после finalAngle).
        imageOffsetV: 0.07
    },
    // Каталог-29 (топологический режим)
    'toothpick':       { color: [225, 225, 210], description: 'Две звезды, одна линия' },
    'checkmark':          { color: [140, 220, 255], description: 'Три звезды цепочкой (уголок)' },
    'chip':          { color: [255, 205, 120], description: 'Треугольник из трёх звёзд' },
    'cookie':         { color: [210, 170, 120], description: 'Замкнутый четырёхугольник' },
    'chicken-foot':    { color: [255, 180, 160], description: 'Три луча из одной звезды' },
    'earthworm':  { color: [180, 230, 170], description: 'Пять звёзд волнистой цепочкой' },
    // Каталог-29 (недемо-фигуры, страницы 2–6)
    'spatula':          { color: [200, 220, 160], description: 'Треугольник с ручкой' },
    'diamond':          { color: [130, 220, 235], description: 'Четырёхугольник с диагональю' },
    'envelope':        { color: [230, 200, 150], description: 'Треугольник со звездой внутри (K4)' },
    'fan':       { color: [160, 210, 255], description: 'Четыре луча из центра' },
    'radish':          { color: [235, 130, 150], description: 'Хвост из двух сегментов и две ветки' },
    'donut':           { color: [255, 190, 140], description: 'Замкнутый пятиугольник' },
    'flag':           { color: [255, 170, 120], description: 'Четырёхугольник с хвостиком' },
    'tadpole':       { color: [150, 220, 200], description: 'Треугольник с хвостом из двух сегментов' },
    'bunny':           { color: [235, 215, 235], description: 'Треугольник с двумя ушами из одной вершины' },
    'bull':            { color: [210, 180, 150], description: 'Треугольник с рогами из разных вершин' },
    'bow':           { color: [255, 160, 210], description: 'Два треугольника через общую вершину' },
    'house':            { color: [220, 190, 150], description: 'Пятиугольник с перекладиной' },
    'mace':           { color: [200, 200, 215], description: 'Алмазик-навершие с рукоятью' },
    'kite':   { color: [170, 220, 255], description: 'Алмазик с хвостом из острия' },
    'lantern':          { color: [255, 225, 150], description: 'Два полюса и три перемычки' },
    'hand-fan':             { color: [255, 200, 200], description: 'Дуга из четырёх и звезда-ручка' },
    'lollipop':        { color: [255, 150, 190], description: 'K4-конфета с палочкой' },
    'book':           { color: [190, 210, 240], description: 'Три страницы на общем корешке' },
    'origami':          { color: [220, 235, 200], description: 'Печенька с центром при трёх углах' },
    'wheel':           { color: [210, 210, 230], description: 'Печенька с центром при всех углах' },
    'hammock':            { color: [180, 210, 190], description: 'Подвес сверху и сетка снизу' },
    'perfectionist':    { color: [255, 235, 180], description: 'Почти полный граф пяти звёзд (K5−1)' },
    // Fallback
    [SHAPE_UNRECOGNIZED]:          { color: [200, 200, 200], description: 'Произвольная форма' }
};

// =============================================================================
// SCORING
// =============================================================================

const SHAPE_BASE_POINTS = {
    'banana': 20,
    // Каталог-29 (топологический режим)
    'toothpick': 6,
    'checkmark': 10,
    'chip': 12,
    'cookie': 16,
    'chicken-foot': 14,
    'earthworm': 16,
    // Каталог-29 (недемо-фигуры, страницы 2–6) — по числу линий/★
    'spatula': 16,
    'diamond': 18,
    'envelope': 22,
    'fan': 16,
    'radish': 16,
    'donut': 20,
    'flag': 18,
    'tadpole': 18,
    'bunny': 18,
    'bull': 18,
    'bow': 22,
    'house': 22,
    'mace': 22,
    'kite': 22,
    'lantern': 22,
    'hand-fan': 26,
    'lollipop': 26,
    'book': 26,
    'origami': 26,
    'wheel': 30,
    'hammock': 32,
    'perfectionist': 36,
    // Fallback
    [SHAPE_UNRECOGNIZED]: 8
};

// UNIQUE_DISCOVERY_BONUS удалён: разовое начисление за первое создание фигуры
// заменено цепочкой «Первооткрыватель» (achievements.js, страница 💎).
// Молчаливая награда не оставляла следа в Наградах — ни цели заранее, ни
// прогресса; теперь открытия видно строкой со ступенями и забором.

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

// M-05: LEVEL_COMPLETE_POINTS удалён (был 30 после B-01, до того 25). Завершение
// ночи больше не платит напрямую: те же 30 ✦ теперь приходят суточными квестами
// «Приход» (10) и «Ночь закрыта» (20) — см. DAILY_QUEST_*_REWARD в achievements.js.
// Доход перестал быть побочным эффектом завершения и стал видимой целью со
// строкой в Наградах. (SHAPE_OPEN_POINTS удалён раньше — S-01.)

// U-09: цвета фигуры больше не достижение, а ОГРАНКА — свойство самой фигуры.
// 5 граней по цветовым тирам, грань горит с первого создания фигуры в этом цвете
// (квоты SHAPE_COLOR_QUOTAS убраны). Цвет фигуры = ближайший тир к средней
// colorValue звёзд (constellationColorBucket). Наград за грани нет: огранка платит
// видом карточки. Темп держит анти-гринд ≤1 засчёт на фигуру за ночь → минимум
// 5 ночей на фигуру. Награда за огранку появится в U-10 цепочкой «Огранщик».

// U-09: запасная высота нижнего UI (свёрнутая шторка), когда померить нельзя —
// например, пока шторка открыта и полоса скрыта. Должна совпадать с --peek-h в CSS.
const BOTTOM_UI_FALLBACK_HEIGHT = 40;

// Atlas pages (каталог-29): страницы 0–1 — по 3 (демо), 2–5 — по 5, 6 (финал) — 3.
// Все 29 фигур каталога распределены; открываются автоматически при накоплении ✦.
const ATLAS_PAGES = [
    ['checkmark', 'chip', 'cookie'],
    ['banana', 'chicken-foot', 'earthworm'],
    ['toothpick', 'spatula', 'diamond', 'radish', 'fan'],
    ['donut', 'flag', 'tadpole', 'bunny', 'bull'],
    ['bow', 'house', 'mace', 'kite', 'lantern'],
    ['envelope', 'hand-fan', 'lollipop', 'book', 'origami'],
    ['wheel', 'hammock', 'perfectionist']
];
// B-01: цены подобраны решателем совместно с доходом (sim-balance.js) так, чтобы
// первые три страницы открывались по расписанию (ночи 1/3/7), а дальше шёл ровный
// шаг ~16 ночей вместо растущих до 33. Немонотонность (1110 → 1100 → 840 → 960)
// намеренна: доход к концу слегка замедляется, и ровный шаг требует, чтобы поздние
// страницы стоили меньше. Игроку это не видно — списание молчаливое, магазина нет.
// НЕ «исправлять» ради красоты ряда: сломается ритм.
const ATLAS_PAGE_COSTS = [80, 240, 380, 1110, 1100, 840, 960];
const ATLAS_PAGE_COUNT = ATLAS_PAGES.length;

// =============================================================================
// OBSERVATORY (B-02)
// =============================================================================
//
// ⚠️ Это НАКОПИТЕЛЬ, а не цена. Обе константы считаются от «✦, заработанных за
// всё время» (`lifetimeMetaEarned`), баланс `metaScore` они не трогают никогда:
// любое списание тормозило бы автооткрытие страниц атласа, и игрок не понял бы
// причину (см. maybeAutoUnlockAtlasPages — жадный while по balance).
//
// 700 = 80 + 240 + 380 = Σ цен первых ТРЁХ страниц атласа: порог намеренно
// совпадает с открытием 3-й страницы (ночь 4–9 по профилям sim-balance.js), но
// выражен числом, чтобы игроку показывать один понятный прогресс-бар.
// ⚠️ При следующей перекалибровке ATLAS_PAGE_COSTS порог должен поехать вместе
// с ними — иначе обсерватория разъедется с ритмом атласа.
const OBSERVATORY_UNLOCK_COST = 700;

// Одна звезда на каждые 100 ✦ за всё время. На открытии выходит ровно 700/100 = 7
// звёзд. Круглая цифра выбрана заказчиком осознанно вместо некруглых 140 ✦,
// которые дали бы ровно 5 звёзд.
const OBSERVATORY_STAR_COST = 100;

// Legacy field goals (unused in meta-score flow; kept for save compatibility).
const FIELD_GOAL_THRESHOLDS = [100, 250, 500];
const FIELD_GOAL_XP_REWARDS = [0, 0, 0];

// =============================================================================
// PROGRESSION (XP / LEVELS)
// =============================================================================

const SHAPE_XP = {
    'banana': 10,
    // Каталог-29 (топологический режим)
    'checkmark': 10, 'chip': 10, 'cookie': 10, 'chicken-foot': 10,
    'earthworm': 10, 'toothpick': 10,
    // Каталог-29 (недемо-фигуры, страницы 2–6)
    'spatula': 10, 'diamond': 10, 'envelope': 10, 'fan': 10, 'radish': 10,
    'donut': 10, 'flag': 10, 'tadpole': 10, 'bunny': 10, 'bull': 10,
    'bow': 10, 'house': 10, 'mace': 10, 'kite': 10, 'lantern': 10,
    'hand-fan': 10, 'lollipop': 10, 'book': 10, 'origami': 10,
    'wheel': 10, 'hammock': 10, 'perfectionist': 10,
    [SHAPE_UNRECOGNIZED]: 10
};
const CUSTOM_TYPE_XP = 10;
const LEVEL_THRESHOLDS = [0, 20, 60, 130, 250, 400];
// L-01: имена уровней живут в словарях (i18n.js, ключи level.0…level.5).
// Здесь остаётся только их количество — оно должно совпадать с LEVEL_THRESHOLDS.
const LEVEL_NAME_COUNT = LEVEL_THRESHOLDS.length;

// Ordered list of all shape names (for UI checklist)
const ALL_SHAPE_NAMES = [
    'banana',
    // Каталог-29 (топологический режим): активные демо-фигуры + Зубочистка (2★)
    'checkmark', 'chip', 'cookie', 'chicken-foot', 'earthworm', 'toothpick',
    // Каталог-29 (недемо-фигуры, страницы 2–6)
    'spatula', 'diamond', 'envelope', 'fan', 'radish',
    'donut', 'flag', 'tadpole', 'bunny', 'bull',
    'bow', 'house', 'mace', 'kite', 'lantern',
    'hand-fan', 'lollipop', 'book', 'origami',
    'wheel', 'hammock', 'perfectionist',
    SHAPE_UNRECOGNIZED
];

// Built-in shapes shown in UI collections (exclude generic fallback).
const BUILTIN_SHAPE_NAMES = ALL_SHAPE_NAMES.filter(name => name !== SHAPE_UNRECOGNIZED);

// Поэтичные fallback-имена для нераспознанных созвездий.
// L-01: в модели живёт ID вида `fb12`, слова — в словарях (ключи fallback.0…44).
// Наборы у локалей разные (английский не подстрочник), но длина обязана совпадать:
// индекс используется как есть. Размер пула должен превышать максимум созвездий
// на поле (150 звёзд / 2 минимум = 75).
const FALLBACK_NAME_COUNT = 45;
const FALLBACK_NAME_IDS = Array.from({ length: FALLBACK_NAME_COUNT }, (_, i) => 'fb' + i);
// Home demo shape whitelist: каталог-29, топологический режим.
// Все 29 фигур каталога активны (страницы атласа 0–6). Зубочистка (2★) —
// теперь атласная фигура страницы 2 с пер-фигурной цепочкой.
const DEMO_ACTIVE_BUILTIN_SHAPES = new Set([
    'checkmark',
    'chip',
    'cookie',
    'banana',
    'chicken-foot',
    'earthworm',
    'toothpick',
    // Недемо-фигуры каталога-29 (страницы 2–6)
    'spatula', 'diamond', 'envelope', 'fan', 'radish',
    'donut', 'flag', 'tadpole', 'bunny', 'bull',
    'bow', 'house', 'mace', 'kite', 'lantern',
    'hand-fan', 'lollipop', 'book', 'origami',
    'wheel', 'hammock', 'perfectionist'
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
    'banana': {
        // Каталог-29: цепочка-дуга (изгиб в одну сторону, §4/§5). C-01.
        stars: [[0.08, 0.38], [0.37, 0.62], [0.63, 0.62], [0.92, 0.38]],
        lines: [[0, 1], [1, 2], [2, 3]],
        imageAnchor: { mode: 'centroid' },
        imageDirection: { mode: 'bananaChordBulge' }
    },
    // --- Каталог-29: активные демо-фигуры (для карточек атласа / подсказок) ---
    'toothpick': {
        stars: [[0.15, 0.5], [0.85, 0.5]],
        lines: [[0, 1]]
    },
    'checkmark': {
        stars: [[0.15, 0.3], [0.5, 0.7], [0.85, 0.3]],
        lines: [[0, 1], [1, 2]]
    },
    'chip': {
        stars: [[0.5, 0.15], [0.15, 0.8], [0.85, 0.8]],
        lines: [[0, 1], [1, 2], [2, 0]]
    },
    'cookie': {
        stars: [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 0]]
    },
    'chicken-foot': {
        stars: [[0.5, 0.65], [0.2, 0.2], [0.5, 0.15], [0.8, 0.2]],
        lines: [[0, 1], [0, 2], [0, 3]]
    },
    'earthworm': {
        stars: [[0.06, 0.5], [0.28, 0.35], [0.5, 0.6], [0.72, 0.35], [0.94, 0.5]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 4]]
    },
    // --- Каталог-29: недемо-фигуры (страницы 2–6), координаты из §5 ---
    'spatula': {
        stars: [[0.35, 0.2], [0.65, 0.2], [0.5, 0.45], [0.5, 0.85]],
        lines: [[0, 1], [1, 2], [2, 0], [2, 3]]
    },
    'diamond': {
        stars: [[0.5, 0.1], [0.8, 0.5], [0.5, 0.9], [0.2, 0.5]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 0], [1, 3]]
    },
    'envelope': {
        stars: [[0.5, 0.1], [0.1, 0.85], [0.9, 0.85], [0.5, 0.55]],
        lines: [[0, 1], [1, 2], [2, 0], [3, 0], [3, 1], [3, 2]]
    },
    'fan': {
        stars: [[0.5, 0.5], [0.5, 0.08], [0.92, 0.5], [0.5, 0.92], [0.08, 0.5]],
        lines: [[0, 1], [0, 2], [0, 3], [0, 4]]
    },
    'radish': {
        stars: [[0.5, 0.45], [0.5, 0.72], [0.5, 0.95], [0.3, 0.12], [0.7, 0.12]],
        lines: [[0, 1], [1, 2], [0, 3], [0, 4]]
    },
    'donut': {
        stars: [[0.5, 0.1], [0.89, 0.38], [0.74, 0.88], [0.26, 0.88], [0.11, 0.38]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]]
    },
    'flag': {
        stars: [[0.3, 0.12], [0.7, 0.12], [0.7, 0.5], [0.3, 0.5], [0.7, 0.92]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 0], [2, 4]]
    },
    'tadpole': {
        stars: [[0.3, 0.15], [0.6, 0.1], [0.5, 0.35], [0.62, 0.62], [0.8, 0.85]],
        lines: [[0, 1], [1, 2], [2, 0], [2, 3], [3, 4]]
    },
    'bunny': {
        stars: [[0.5, 0.45], [0.3, 0.8], [0.7, 0.8], [0.3, 0.1], [0.7, 0.1]],
        lines: [[0, 1], [1, 2], [2, 0], [0, 3], [0, 4]]
    },
    'bull': {
        stars: [[0.25, 0.4], [0.75, 0.4], [0.5, 0.8], [0.12, 0.1], [0.88, 0.1]],
        lines: [[0, 1], [1, 2], [2, 0], [0, 3], [1, 4]]
    },
    'bow': {
        stars: [[0.5, 0.5], [0.1, 0.3], [0.1, 0.7], [0.9, 0.3], [0.9, 0.7]],
        lines: [[0, 1], [1, 2], [2, 0], [0, 3], [3, 4], [4, 0]]
    },
    'house': {
        stars: [[0.25, 0.9], [0.75, 0.9], [0.75, 0.45], [0.5, 0.12], [0.25, 0.45]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [2, 4]]
    },
    'mace': {
        stars: [[0.5, 0.08], [0.78, 0.45], [0.5, 0.8], [0.22, 0.45], [0.78, 0.9]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 0], [1, 3], [1, 4]]
    },
    'kite': {
        stars: [[0.5, 0.06], [0.72, 0.32], [0.5, 0.58], [0.28, 0.32], [0.5, 0.94]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 0], [1, 3], [2, 4]]
    },
    'lantern': {
        stars: [[0.5, 0.08], [0.5, 0.92], [0.15, 0.5], [0.5, 0.5], [0.85, 0.5]],
        lines: [[0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4]]
    },
    'hand-fan': {
        stars: [[0.1, 0.3], [0.37, 0.15], [0.63, 0.15], [0.9, 0.3], [0.5, 0.85]],
        lines: [[0, 1], [1, 2], [2, 3], [4, 0], [4, 1], [4, 2], [4, 3]]
    },
    'lollipop': {
        stars: [[0.25, 0.15], [0.75, 0.15], [0.5, 0.55], [0.5, 0.28], [0.5, 0.92]],
        lines: [[0, 1], [1, 2], [2, 0], [3, 0], [3, 1], [3, 2], [2, 4]]
    },
    'book': {
        stars: [[0.3, 0.15], [0.3, 0.85], [0.55, 0.5], [0.72, 0.5], [0.92, 0.5]],
        lines: [[0, 1], [0, 2], [1, 2], [0, 3], [1, 3], [0, 4], [1, 4]]
    },
    'origami': {
        stars: [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.5, 0.5]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 1], [4, 2], [4, 3]]
    },
    'wheel': {
        stars: [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.5, 0.5]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 0], [4, 1], [4, 2], [4, 3]]
    },
    'hammock': {
        stars: [[0.5, 0.04], [0.18, 0.35], [0.82, 0.35], [0.5, 0.92], [0.5, 0.55]],
        lines: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 3], [1, 4], [2, 4], [3, 4]]
    },
    'perfectionist': {
        stars: [[0.5, 0.2], [0.1, 0.75], [0.9, 0.75], [0.5, 0.55], [0.5, 0.02]],
        lines: [[0, 1], [0, 2], [1, 2], [3, 0], [3, 1], [3, 2], [4, 0], [4, 1], [4, 2]]
    }
};

// =============================================================================
// CATALOG-29 (топологический каталог: связные графы 2–5 звёзд)
// Источник: dev/docs/Созвездия-29-графов.md (§5 — паттерны, §4 — ограничения).
// Каждая запись: stars/lines — каноническое начертание без пересечений линий
// (для карточек; распознавание от координат не зависит);
// c — декларативные ограничения углов §4 (валидатор аккуратности, не селектор).
// Примитивы c: chainAngle:[min,max] · arc · cycleAngleMin · convex ·
//   centerInside · outwardTail · spreadMin · fanMax · earsBetween:[min,max].
// Ограничения «стороны»/«рога»/«крылья»/«страницы»/«крыша» (№12,17,18,19,25)
// пока сведены к базовому (принцип упрощения §4); фигуры не в демо —
// финальная настройка в задаче atlas-pages-graph.
// =============================================================================

const CATALOG_29 = {
    // 2 звезды
    'toothpick': { stars: [[0.15, 0.5], [0.85, 0.5]], lines: [[0, 1]], c: {} },
    // 3 звезды
    'checkmark': { stars: [[0.15, 0.3], [0.5, 0.7], [0.85, 0.3]], lines: [[0, 1], [1, 2]], c: { chainAngle: [25, 155] } },
    'chip': { stars: [[0.5, 0.15], [0.15, 0.8], [0.85, 0.8]], lines: [[0, 1], [1, 2], [2, 0]], c: { cycleAngleMin: 25 } },
    // 4 звезды
    'banana': { stars: [[0.08, 0.38], [0.37, 0.62], [0.63, 0.62], [0.92, 0.38]], lines: [[0, 1], [1, 2], [2, 3]], c: { arc: true, chainAngle: [100, 170] } },
    'chicken-foot': { stars: [[0.5, 0.65], [0.2, 0.2], [0.5, 0.15], [0.8, 0.2]], lines: [[0, 1], [0, 2], [0, 3]], c: {} },
    'cookie': { stars: [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]], lines: [[0, 1], [1, 2], [2, 3], [3, 0]], c: { convex: true } },
    'spatula': { stars: [[0.35, 0.2], [0.65, 0.2], [0.5, 0.45], [0.5, 0.85]], lines: [[0, 1], [1, 2], [2, 0], [2, 3]], c: { cycleAngleMin: 25, outwardTail: true } },
    'diamond': { stars: [[0.5, 0.1], [0.8, 0.5], [0.5, 0.9], [0.2, 0.5]], lines: [[0, 1], [1, 2], [2, 3], [3, 0], [1, 3]], c: { convex: true } },
    'envelope': { stars: [[0.5, 0.1], [0.1, 0.85], [0.9, 0.85], [0.5, 0.55]], lines: [[0, 1], [1, 2], [2, 0], [3, 0], [3, 1], [3, 2]], c: { cycleAngleMin: 25, centerInside: true } },
    // 5 звёзд — деревья
    'earthworm': { stars: [[0.06, 0.5], [0.28, 0.35], [0.5, 0.6], [0.72, 0.35], [0.94, 0.5]], lines: [[0, 1], [1, 2], [2, 3], [3, 4]], c: { chainAngle: [80, 180] } },
    'fan': { stars: [[0.5, 0.5], [0.5, 0.08], [0.92, 0.5], [0.5, 0.92], [0.08, 0.5]], lines: [[0, 1], [0, 2], [0, 3], [0, 4]], c: { spreadMin: 45 } },
    'radish': { stars: [[0.5, 0.45], [0.5, 0.72], [0.5, 0.95], [0.3, 0.12], [0.7, 0.12]], lines: [[0, 1], [1, 2], [0, 3], [0, 4]], c: {} },
    // 5 звёзд — один цикл
    'donut': { stars: [[0.5, 0.1], [0.89, 0.38], [0.74, 0.88], [0.26, 0.88], [0.11, 0.38]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]], c: {} },
    'flag': { stars: [[0.3, 0.12], [0.7, 0.12], [0.7, 0.5], [0.3, 0.5], [0.7, 0.92]], lines: [[0, 1], [1, 2], [2, 3], [3, 0], [2, 4]], c: { convex: true, outwardTail: true } },
    'tadpole': { stars: [[0.3, 0.15], [0.6, 0.1], [0.5, 0.35], [0.62, 0.62], [0.8, 0.85]], lines: [[0, 1], [1, 2], [2, 0], [2, 3], [3, 4]], c: { cycleAngleMin: 25, outwardTail: true } },
    'bunny': { stars: [[0.5, 0.45], [0.3, 0.8], [0.7, 0.8], [0.3, 0.1], [0.7, 0.1]], lines: [[0, 1], [1, 2], [2, 0], [0, 3], [0, 4]], c: { earsBetween: [20, 80] } },
    'bull': { stars: [[0.25, 0.4], [0.75, 0.4], [0.5, 0.8], [0.12, 0.1], [0.88, 0.1]], lines: [[0, 1], [1, 2], [2, 0], [0, 3], [1, 4]], c: {} },
    // 5 звёзд — два цикла
    'bow': { stars: [[0.5, 0.5], [0.1, 0.3], [0.1, 0.7], [0.9, 0.3], [0.9, 0.7]], lines: [[0, 1], [1, 2], [2, 0], [0, 3], [3, 4], [4, 0]], c: {} },
    'house': { stars: [[0.25, 0.9], [0.75, 0.9], [0.75, 0.45], [0.5, 0.12], [0.25, 0.45]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [2, 4]], c: {} },
    'mace': { stars: [[0.5, 0.08], [0.78, 0.45], [0.5, 0.8], [0.22, 0.45], [0.78, 0.9]], lines: [[0, 1], [1, 2], [2, 3], [3, 0], [1, 3], [1, 4]], c: { convex: true, outwardTail: true } },
    'kite': { stars: [[0.5, 0.06], [0.72, 0.32], [0.5, 0.58], [0.28, 0.32], [0.5, 0.94]], lines: [[0, 1], [1, 2], [2, 3], [3, 0], [1, 3], [2, 4]], c: { convex: true, outwardTail: true } },
    'lantern': { stars: [[0.5, 0.08], [0.5, 0.92], [0.15, 0.5], [0.5, 0.5], [0.85, 0.5]], lines: [[0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4]], c: {} },
    // 5 звёзд — плотные
    'hand-fan': { stars: [[0.1, 0.3], [0.37, 0.15], [0.63, 0.15], [0.9, 0.3], [0.5, 0.85]], lines: [[0, 1], [1, 2], [2, 3], [4, 0], [4, 1], [4, 2], [4, 3]], c: { fanMax: 180 } },
    'lollipop': { stars: [[0.25, 0.15], [0.75, 0.15], [0.5, 0.55], [0.5, 0.28], [0.5, 0.92]], lines: [[0, 1], [1, 2], [2, 0], [3, 0], [3, 1], [3, 2], [2, 4]], c: { cycleAngleMin: 25, centerInside: true, outwardTail: true } },
    'book': { stars: [[0.3, 0.15], [0.3, 0.85], [0.55, 0.5], [0.72, 0.5], [0.92, 0.5]], lines: [[0, 1], [0, 2], [1, 2], [0, 3], [1, 3], [0, 4], [1, 4]], c: { baseMin: 5 } },
    'origami': { stars: [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.5, 0.5]], lines: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 1], [4, 2], [4, 3]], c: { convex: true, centerInside: true } },
    'wheel': { stars: [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.5, 0.5]], lines: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 0], [4, 1], [4, 2], [4, 3]], c: { convex: true, centerInside: true } },
    'hammock': { stars: [[0.5, 0.04], [0.18, 0.35], [0.82, 0.35], [0.5, 0.92], [0.5, 0.55]], lines: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 3], [1, 4], [2, 4], [3, 4]], c: {} },
    'perfectionist': { stars: [[0.5, 0.2], [0.1, 0.75], [0.9, 0.75], [0.5, 0.55], [0.5, 0.02]], lines: [[0, 1], [0, 2], [1, 2], [3, 0], [3, 1], [3, 2], [4, 0], [4, 1], [4, 2]], c: { baseMin: 5 } }
};

// Порядок имён каталога = естественный ранг по числу линий (§6 п.3).
const CATALOG_29_NAMES = Object.keys(CATALOG_29);

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


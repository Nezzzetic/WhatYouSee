// achievements.js — Страница достижений (V-06): цепочки квестов, проверки, прогресс

// =============================================================================
// КОНСТАНТЫ
// =============================================================================

// B-04: общая лестница шага ужата вместе со всей экономикой окна «первая
// сессия → третий день» (масштаб ×¼ от B-01, решение заказчика). Кто задаёт
// свою шкалу через chain.stepRewards (ниже) — общую не использует.
const ACHIEVEMENT_STEP_REWARDS = [3, 6, 10, 16, 25];
// Запасное значение для цепочек короче/длиннее пяти шагов (сейчас таких нет).
const ACHIEVEMENT_STEP_REWARD_FALLBACK = 3;

// B-04: объёмные цепочки (цвета и размеры) больше не делят один ряд порогов —
// у цветов и у каждого размерного бакета свой, потому что бакеты наполняются
// с принципиально разной скоростью (см. B-04 task-док, шаг 3, замер моделью:
// четыре профиля × 800 прогонов × 26 ночей). Награда за шаг — общая лестница
// выше, если явно не сказано иное.
// Правка заказчика 2026-08-30: 20 на второй ступени было слишком жёстко для
// редких цветов (красный/голубой — единицы процентов созвездий) — снижено до 5.
const ACHIEVEMENT_COLOR_TIERS = [1, 5, 60, 150, 350];
const ACHIEVEMENT_SIZE_2_4_TIERS = [1, 25, 90, 250, 600];
const ACHIEVEMENT_SIZE_5_7_TIERS = [1, 12, 45, 130, 320];
// 8★+ реже остальных бакетов сам по себе — своя шкала наград, а не общая.
const ACHIEVEMENT_SIZE_8PLUS_TIERS = [1, 3, 8, 20, 50];
const ACHIEVEMENT_SIZE_8PLUS_STEP_REWARDS = [8, 14, 20, 30, 45];
// «Первооткрыватель» — на 24 фигуры атласа (было 29 до B-04, 5 фигур в резерве).
const RAZVEDKA_TIERS = [1, 4, 8, 14, 24];
const RAZVEDKA_STEP_REWARDS = [15, 25, 40, 65, 100];
// «Огранщик» — тоже на 24 фигуры, общая лестница.
const OGRANSHCHIK_TIERS = [1, 3, 6, 12, 24];

// M-05/B-04: суточные квесты. Раздача 5/10 — тот же принцип, что и в M-05
// (приход платит мало и сразу, закрытая ночь — больше и в конце), масштаб
// ужат вместе со всей общей лестницей ×¼.
const DAILY_QUEST_ENTRY_REWARD = 5;
const DAILY_QUEST_NIGHT_REWARD = 10;

// K-09: лента новостей мира на «Сегодня» — сколько строк держим за ночь про запас
// (реальных источников за ночь единицы, потолок только страхует от разрастания).
const DAILY_NEWS_LOG_MAX = 20;

// colorValue тира → внутреннее имя цвета
const ACHIEVEMENT_BUCKET_BY_VALUE = { '-100': 'red', '-50': 'orange', '0': 'yellow', '50': 'white', '100': 'blue' };
const ACHIEVEMENT_COLOR_KEYS = ['red', 'orange', 'yellow', 'white', 'blue'];
// L-01: названия цветов и заголовки цепочек переехали в словари (i18n.js).
// `ACHIEVEMENT_COLOR_RU` был картой «ключ → русское прилагательное»; теперь это
// `t('color.' + key)`, а заголовок цепочки — `t('chain.color_red.title')`.
/** Прилагательное цвета на языке игрока («red» / «красный»). */
function achievementColorLabel(color) {
    return t('color.' + color);
}
// K-33 (отменяет правило K-02 для цветовых цепочек): плашка марки — одного
// книжного цвета всегда, различает квесты знак, а не цвет. До K-33 у пяти
// цветовых цепочек был один знак (ромб грани `loz`), а плашку красил цвет
// тира — без цвета все пять читались одинаково (дальтонизм; заказчик отменил
// правило 2026-08-31, фидбек с Miro-доски, п. 22). `ACHIEVEMENT_COLOR_SIGN`
// остался генерик-знаком темы «огранка/цвет» — им по-прежнему помечены
// «Радуга» (цепочка по всем пяти цветам сразу, не про один) и страница
// The Cutter's Hand целиком; по самим цепочкам `color_*` он больше не ставится.
const ACHIEVEMENT_COLOR_SIGN = 'loz';
// K-33: свой знак на каждую цепочку — предмет по мотиву цвета (капля, огонёк,
// кольцо, шар, волна), не отвлечённая форма; различим без цвета на кегле
// марки (14 px). Правка заказчика 2026-09-01 — первая раскладка (формы
// огранки: круг/шестиугольник/восьмиугольник/маркиз/треугольник) читалась
// логично только на странице The Cutter's Hand, предметная понятнее сама
// по себе.
const ACHIEVEMENT_COLOR_CHAIN_SIGNS = {
    red: 'drop', orange: 'flame', yellow: 'ring', white: 'ball', blue: 'wave'
};
// Размерные цепочки, «Восьмёрка+», «Мозаика» и «Зодчий неба» — одна тема:
// построенные созвездия. K-19: заголовок строки — рабочее имя, а не ярлык
// размера («Пятёрка», не «5★»); знак говорит только о теме.
const ACHIEVEMENT_SIZE_SIGN = 'pillar';

// =============================================================================
// ОПРЕДЕЛЕНИЕ ЦЕПОЧЕК (17 слотов)
// =============================================================================

function buildColorChain(color) {
    const tiers = ACHIEVEMENT_COLOR_TIERS;
    return {
        id: 'color_' + color,
        title: t(`chain.color_${color}.title`),
        sign: ACHIEVEMENT_COLOR_CHAIN_SIGNS[color],
        // K-08: описание сцепки — что именно считается, без числа ступени.
        desc: t('chain.color.desc', { color: achievementColorLabel(color) }),
        steps: tiers.map(n => ({
            id: `color_${color}_${n}`,
            desc: tp('chain.color.step', n, { color: achievementColorLabel(color) }),
            check: { type: 'colorTotal', color, n }
        }))
    };
}

// B-04: шесть цепочек «ровно N★» заменены двумя диапазонами — 2–4★ и 5–7★
// (решение заказчика). check.bucket указывает прямо на ключ starCountTotals,
// чтобы evaluateAchievementCheck не гадала по min/max.
function buildSizeRangeChain(id, min, max, bucket, tiers) {
    return {
        id,
        title: t(`chain.${id}.title`),
        sign: ACHIEVEMENT_SIZE_SIGN,
        desc: t(`chain.${id}.desc`),
        steps: tiers.map(n => ({
            id: `${id}_${n}`,
            desc: tp(`chain.${id}.step`, n),
            check: { type: 'starCountTotal', mode: 'range', min, max, bucket, n }
        }))
    };
}

const ACHIEVEMENT_ALL_ATLAS_SHAPES = ATLAS_PAGES.flat();

// B-04: атлас сократился до 4 глав — «особых» на страницу теперь тоже четыре:
// Радуга (глава I) и Мозаика (глава II) остались отдельными цепочками ниже,
// а на главы III/IV достаточно двух записей здесь (было пять на семь старых
// страниц). Сняты gobelen/orchestra/symphony вместе с бывшими главами
// V/VI/VII; symphony к тому же завязана на Перфекциониста, который уехал
// в резерв. Каждое — ночная коллекция (≤1/ночь, тиры 1→3→7→15→30), со своей
// осью, видимость по полному комплекту созданных фигур страницы.
const ATLAS_PAGE_SPECIALS = [
    { page: 2, id: 'vitrazh', title: t('chain.vitrazh.title'), sign: 'comet', mechanic: 'pageColors',
      desc: t('chain.vitrazh.desc') },
    { page: 3, id: 'kaleidoscope', title: t('chain.kaleidoscope.title'), sign: 'comet', mechanic: 'pageAllOnField',
      desc: t('chain.kaleidoscope.desc') }
];

const ATLAS_PAGE_SPECIAL_TIERS = [1, 3, 7, 15, 30];

function buildPageSpecialChain(spec) {
    return {
        id: spec.id,
        title: spec.title,
        sign: spec.sign,
        requiresPageComplete: spec.page,
        pageSpecial: spec,
        // K-08: у страничных особых desc уже был на спеке (использовался внутри
        // текста шага) — здесь он же становится описанием сцепки.
        desc: spec.desc,
        steps: ATLAS_PAGE_SPECIAL_TIERS.map(n => ({
            id: `${spec.id}_${n}`,
            desc: tp('chain.pageSpecial.step', n, { desc: spec.desc }),
            check: { type: 'pageSpecialNights', id: spec.id, n }
        }))
    };
}

function getPageSpecialForPage(pageIndex) {
    return ATLAS_PAGE_SPECIALS.find(s => s.page === pageIndex) || null;
}

const ACHIEVEMENT_CHAINS = [
    // M-05/K-22: суточный квест — единственная бесконечная цепочка. Две ступени —
    // «Приход» и «Ночь закрыта» — вместо прежних двух отдельных цепочек по одному
    // шагу (концепт «Альманаха ночей», издание второе, свёл их в один вечерний
    // обряд). `stepIndex` не хранится: выводится на лету из `entryClaimed`/
    // `nightClaimed` в `deriveDailyStepIndex()` при каждом recompute — источник
    // истины остаётся `achievementCounters.daily`, обнуляется вместе со сменой
    // неба, а не по часам (ensureDailyQuestsForToday). Вторая марка недоступна,
    // пока не прижата первая — это не отдельное правило, а обычная механика
    // сцепки (`isCurrent = stepIndex === p.stepIndex`); игрока не наказывает,
    // потому что «Приход» физически не может не случиться раньше «Ночи».
    {
        id: 'evening_rite',
        title: t('chain.evening_rite.title'),
        sign: 'crescent',
        daily: true,
        desc: t('chain.evening_rite.desc'),
        stepRewards: [DAILY_QUEST_ENTRY_REWARD, DAILY_QUEST_NIGHT_REWARD],
        steps: [
            { id: 'evening_rite_entry', desc: t('chain.evening_rite.stepEntry'), check: { type: 'dailyEntry' } },
            { id: 'evening_rite_night', desc: t('chain.evening_rite.stepNight'), check: { type: 'dailyNight' } }
        ]
    },
    ...ACHIEVEMENT_COLOR_KEYS.map(buildColorChain),
    // B-04: шесть цепочек «ровно N★» заменены двумя диапазонами (решение
    // заказчика) — квесты больше не запираются очками, три диапазона вместо
    // шести точных размеров.
    buildSizeRangeChain('size_2_4', 2, 4, 's24', ACHIEVEMENT_SIZE_2_4_TIERS),
    buildSizeRangeChain('size_5_7', 5, 7, 's57', ACHIEVEMENT_SIZE_5_7_TIERS),
    {
        id: 'size_8plus',
        // K-19: было голым ярлыком «8★+» — рабочее литературное имя.
        title: t('chain.size8plus.title'),
        sign: ACHIEVEMENT_SIZE_SIGN,
        desc: t('chain.size8plus.desc'),
        // Своя шкала: 8★+ созвездия редки сами по себе, и в каталоге нет фигур
        // больше пяти звёзд — эта цепочка не приносит атласных находок никогда.
        steps: ACHIEVEMENT_SIZE_8PLUS_TIERS.map(n => ({
            id: `size_8plus_${n}`,
            desc: tp('chain.size8plus.step', n),
            check: { type: 'starCountTotal', mode: 'gte', bucket: 's8plus', size: 8, n }
        })),
        stepRewards: ACHIEVEMENT_SIZE_8PLUS_STEP_REWARDS
    },
    {
        id: 'rainbow',
        title: t('chain.rainbow.title'),
        sign: ACHIEVEMENT_COLOR_SIGN,
        desc: t('chain.rainbow.desc'),
        requiresPageComplete: 0, // S-01: особенное достижение страницы 0
        steps: [1, 3, 7, 15, 30].map(n => ({
            id: `rainbow_${n}`,
            desc: tp('chain.rainbow.step', n),
            check: { type: 'rainbowNights', n }
        }))
    },
    {
        id: 'nights',
        title: t('chain.nights.title'),
        sign: 'crescent',
        desc: t('chain.nights.desc'),
        steps: [1, 5, 25, 100, 250].map(n => ({
            id: `nights_${n}`,
            desc: tp('chain.nights.step', n),
            check: { type: 'levelsCompleted', n }
        }))
    },
    {
        id: 'constellations',
        title: t('chain.constellations.title'),
        sign: ACHIEVEMENT_SIZE_SIGN,
        desc: t('chain.constellations.desc'),
        steps: [10, 50, 250, 1000, 5000].map(n => ({
            id: `constellations_${n}`,
            desc: tp('chain.constellations.step', n),
            check: { type: 'totalConstellations', n }
        }))
    },
    {
        id: 'mosaic',
        title: t('chain.mosaic.title'),
        sign: ACHIEVEMENT_SIZE_SIGN,
        desc: t('chain.mosaic.desc'),
        requiresPageComplete: 1, // S-01: особенное достижение страницы 1
        steps: [1, 3, 7, 15, 30].map(n => ({
            id: `mosaic_${n}`,
            desc: tp('chain.mosaic.step', n),
            check: { type: 'mosaicNights', n }
        }))
    },
    // atlas-pages-graph: особые достижения страниц 2–6
    ...ATLAS_PAGE_SPECIALS.map(buildPageSpecialChain),
    {
        id: 'minimalism',
        title: t('chain.minimalism.title'),
        sign: 'loz',
        // K-08: единственный шаг цепочки уже сформулирован без числа — он же
        // и есть описание сцепки.
        desc: t('chain.minimalism.step'),
        steps: [{ id: 'minimalism_1', desc: t('chain.minimalism.step'), check: { type: 'singleConstellation' } }]
    },
    {
        id: 'unite_all',
        title: t('chain.unite_all.title'),
        sign: 'arc',
        desc: t('chain.unite_all.desc'),
        steps: [{ id: 'unite_all_1', desc: t('chain.unite_all.step'), check: { type: 'uniteAll' } }]
    },
    // Разведка атласа: награда за первое создание фигуры переехала сюда из разового
    // начисления в markShapeCreated. Раньше каждое открытие молча капало ✦ — событие
    // было, а следа в Наградах не оставалось. Теперь это видимая цель с прогрессом.
    {
        id: 'razvedka',
        title: t('chain.razvedka.title'),
        sign: 'tel',
        desc: t('chain.razvedka.desc'),
        // B-04: атлас сократился до 24 фигур (было 29) — пороги и своя шкала
        // пересчитаны под новый потолок, сумма Σ 245 ✦ (было 1015).
        stepRewards: RAZVEDKA_STEP_REWARDS,
        steps: RAZVEDKA_TIERS.map(n => ({
            id: `razvedka_${n}`,
            desc: n === RAZVEDKA_TIERS[RAZVEDKA_TIERS.length - 1]
                ? t('chain.razvedka.stepAll')
                : tp('chain.razvedka.step', n),
            check: { type: 'createdAtlasShapes', n }
        }))
    },
    // U-10: награда за огранку — ОДНОЙ цепочкой, а не 29 записями «Огранка: Чипсина».
    // Так «унести награду в ачивки» стоит +1 слот: список остаётся читаемым,
    // атлас остаётся коллекцией, фигура держит только состояние (грани и венец) —
    // кнопок забора на карточках нет. Пороги подтверждены прогоном; между 15-й и
    // 29-й фигурой цепочка молчит долго — это принято: огранка не часть основного
    // пути (3 месяца), а слой мастерства (год).
    {
        id: 'ogranshchik',
        title: t('chain.ogranshchik.title'),
        sign: 'gem',
        desc: t('chain.ogranshchik.desc'),
        // B-04: атлас сократился до 24 фигур (было 29) — пороги пересчитаны.
        steps: OGRANSHCHIK_TIERS.map(n => ({
            id: `ogranshchik_${n}`,
            desc: n === OGRANSHCHIK_TIERS[OGRANSHCHIK_TIERS.length - 1]
                ? t('chain.ogranshchik.stepAll')
                : tp('chain.ogranshchik.step', n),
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
 *
 * Цепочка может задать свою шкалу через `stepRewards` — это нужно там, где
 * награда не назначена, а распределена: «Первооткрыватель» делит между своими
 * ступенями ровно ту сумму, что раньше выдавалась по 35 ✦ за каждое открытие.
 * Общая шкала остаётся правилом, своя — обоснованным исключением.
 */
function getAchievementChainStepReward(chain, stepIndex) {
    const i = Number(stepIndex);
    if (!Number.isInteger(i) || i < 0) return ACHIEVEMENT_STEP_REWARD_FALLBACK;
    const own = chain && Array.isArray(chain.stepRewards) ? chain.stepRewards : null;
    if (own) return i < own.length ? own[i] : ACHIEVEMENT_STEP_REWARD_FALLBACK;
    if (i >= ACHIEVEMENT_STEP_REWARDS.length) return ACHIEVEMENT_STEP_REWARD_FALLBACK;
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
        ? t('rewards.lockCollectPage', { n: page + 1 })
        : t('rewards.lockPageLocked', { n: page + 1 });
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
// обе миграции сбрасывают ВЕСЬ прогресс, включая ✦ и страницы атласа;
// L-01 v6: имена фигур стали ASCII-ID, старые ключи shapeColors/createdShapes
// больше не резолвятся — сброс всего прогресса, решение заказчика 2026-08-03;
// B-04 v7: атлас сжат до 4×6, состав глав и цены переписаны, размерные цепочки
// сведены к трём диапазонам (ключи starCountTotals и id цепочек — другие),
// «Первооткрыватель»/«Огранщик» пересчитаны под 24 фигуры вместо 29 — мигрировать
// нечего, полный сброс прогресса, версия сейва объявляется отдельно до релиза).
const ACHIEVEMENTS_SAVE_VERSION = 7;

// Размерные бакеты, нужные для «Мозаики» (все должны присутствовать на поле)
const MOSAIC_REQUIRED_BUCKETS = ['2', '3', '4', '5', '6', '7', '8plus'];

function makeDefaultAchievementCounters() {
    return {
        levelsCompleted: 0,
        // O-02: сколько фиксированных картинок первых ночей уже показано (не
        // завершено) — 0/1/2, дальше воскресенье/обычный выбор как раньше.
        onboardingFieldsShown: 0,
        // O-01: тутор первых жестов. Хранится ОДИН бит — «отзум сделан, тутор
        // закрыт»; шаг соединения в сейве не живёт вовсе, он выводится из
        // constellations.length (заодно бесплатно верное поведение отката).
        tutorial: makeDefaultTutorialState(),
        totalConstellations: 0,
        colorTotals: { red: 0, orange: 0, yellow: 0, white: 0, blue: 0 },
        // B-04: три бакета вместо шести (диапазоны 2–4★/5–7★/8★+). 2★ раньше
        // не считался вообще (ключа «2» не было) — теперь попадает в s24.
        starCountTotals: { s24: 0, s57: 0, s8plus: 0 },
        rainbowNights: 0,
        mosaicNights: 0,
        // atlas-pages-graph: id особого достижения страницы → всего засчитанных ночей
        pageSpecialNights: { vitrazh: 0, kaleidoscope: 0, gobelen: 0, orchestra: 0, symphony: 0 },
        // U-09: имя фигуры → { color: число засчитанных созданий } (≤1/ночь на фигуру).
        // Ненулевой счётчик = грань горит; число нужно только для корректного отката.
        shapeColors: {},
        // M-05: состояние суточных квестов
        daily: makeDefaultDailyQuestState()
    };
}

/**
 * M-05: состояние пары суточных квестов.
 *
 * `date` — сутки, к которым относятся флаги (`getEffectiveSkyDateInt()`).
 * Расхождение с текущими сутками означает «пришло новое небо» и обнуляет блок.
 * Привязка к дате, а не к состоянию сессии, — это ещё и защита от повторной
 * оплаты: дев-сброс неба (`onResetSky`) даёт новое поле тех же суток, и старый
 * `levelCompletePointsAwarded` позволял забрать 30 ✦ заново.
 *
 * `*Done` — защёлки от событий, а не предикаты по текущему полю: откат созвездия
 * их не гасит. Именно поэтому забор суточного квеста не поднимает undoFloor.
 */
function makeDefaultDailyQuestState() {
    return {
        date: 0,
        entryDone: false,
        entryClaimed: false,
        nightDone: false,
        nightClaimed: false,
        // K-09: новости мира за текущую ночь — тот же терпимый блок, что и
        // защёлки квестов, обнуляется вместе с ним на смене суток.
        newsLog: [],
        // K-15: непрочитанное событие мира — второе условие капли сургуча на
        // ленте (`hasSkyWaxSignal`), не только готовая награда. Флаг, а не счёт
        // длины лога, — лог капается `DAILY_NEWS_LOG_MAX` и не годится в мерило.
        newsUnseen: false
    };
}

/**
 * O-01: состояние тутора первых жестов. Один бит — и намеренно один: шаг
 * соединения выводится из поля (`constellations.length`), а не хранится.
 */
function makeDefaultTutorialState() {
    return { done: false };
}

/**
 * O-01: тот же терпимый приём, что у блока суток, — в сейве до этой задачи
 * поля нет, берётся дефолт `{done:false}`, версия достижений НЕ поднимается.
 * Игроку с прогрессом это ничем не грозит: тутор отсечён счётчиком O-02
 * (`onboardingFieldsShown`), который у него давно израсходован.
 */
function sanitizeTutorialState(raw) {
    if (!raw || typeof raw !== 'object') return makeDefaultTutorialState();
    return { done: !!raw.done };
}

/** M-05: нормализует сохранённый блок суток (в старом сейве его просто нет). */
function sanitizeDailyQuestState(raw) {
    const def = makeDefaultDailyQuestState();
    if (!raw || typeof raw !== 'object') return def;
    return {
        date: Number(raw.date) || 0,
        entryDone: !!raw.entryDone,
        entryClaimed: !!raw.entryClaimed,
        nightDone: !!raw.nightDone,
        nightClaimed: !!raw.nightClaimed,
        // K-09: старый сейв блока не знает — пустая лента, версия не поднята.
        newsLog: Array.isArray(raw.newsLog)
            ? raw.newsLog
                .filter(e => e && typeof e.key === 'string')
                .slice(-DAILY_NEWS_LOG_MAX)
                .map(e => ({ key: e.key, params: (e.params && typeof e.params === 'object') ? e.params : {} }))
            : def.newsLog,
        // K-15: аддитивное поле, старый сейв его не знает — читается как «нет
        // непрочитанного», версия не поднята.
        newsUnseen: !!raw.newsUnseen
    };
}

/**
 * K-09: единственное место, где в игре появляется новость. Строка на «Сегодня»,
 * переписывается наутро вместе с сутками (та же `daily`, что и квесты M-05).
 * `params` уже содержит готовые к показу значения (имя фигуры через `shapeLabel`,
 * заголовок цепочки) — как и у тостов, локаль бакается в момент события, не рендера.
 */
function addDailyNewsEvent(key, params) {
    const daily = getDailyQuestState();
    if (!daily) return;
    if (!Array.isArray(daily.newsLog)) daily.newsLog = [];
    daily.newsLog.push({ key, params: params || {} });
    if (daily.newsLog.length > DAILY_NEWS_LOG_MAX) daily.newsLog.shift();
    // K-15: капля на ленте зовёт открыть книгу — гасится чтением «Сегодня».
    daily.newsUnseen = true;
}

/** K-15: второе условие капли сургуча — есть непрочитанное событие мира. */
function hasUnseenDailyNews() {
    const daily = achievementCounters && achievementCounters.daily;
    return !!(daily && daily.newsUnseen);
}

// =============================================================================
// M-05: СУТОЧНЫЕ КВЕСТЫ
// =============================================================================

function getDailyQuestState() {
    if (!achievementCounters) return null;
    if (!achievementCounters.daily) achievementCounters.daily = makeDefaultDailyQuestState();
    return achievementCounters.daily;
}

/**
 * Суточные квесты обновляются ВМЕСТЕ С НЕБОМ, а не по часам.
 *
 * Зовётся только оттуда, откуда небо и так меняется: хвост `loadProgression`,
 * `startNewDailySky`, `performFullReset`. Из `recomputeAchievementsClaimable`
 * — намеренно НЕТ.
 *
 * Так у игрока, сидящего в игре с 23:50, в полночь не переворачивается ничего —
 * ровно как не переворачивается небо (`isSavedSkyDateStale` срабатывает только
 * на загрузке). Обновляйся квесты по часам, а небо нет — защёлка `nightDone`
 * мгновенно оказалась бы снова выполненной на том же уже закрытом поле, и одна
 * ночь оплатилась бы дважды.
 *
 * Дев-обход по дням (`devDayOffset`) и харнесс (`setTestSkyDateOverride`) уже
 * сидят внутри `getEffectiveSkyDateInt()` — своего кода им здесь не нужно.
 */
function ensureDailyQuestsForToday() {
    const daily = getDailyQuestState();
    if (!daily) return false;
    const today = typeof getEffectiveSkyDateInt === 'function' ? getEffectiveSkyDateInt() : 0;
    if (daily.date === today) return false;
    achievementCounters.daily = makeDefaultDailyQuestState();
    achievementCounters.daily.date = today;
    return true;
}

/**
 * K-22: `stepIndex` цепочки `evening_rite` не хранится — выводится на лету из
 * защёлок суток при каждом recompute. 0 — ничего не забрано, 1 — «Приход» взят,
 * «Ночь» ещё нет, 2 — обе марки прижаты (цепочка «done» до конца суток).
 */
function deriveDailyStepIndex() {
    const daily = getDailyQuestState();
    if (!daily || !daily.entryClaimed) return 0;
    return daily.nightClaimed ? 2 : 1;
}

/** K-22: отмечает шаг суточного квеста забранным — 0 «Приход», 1 «Ночь закрыта». */
function markDailyQuestClaimed(stepIndex) {
    const daily = getDailyQuestState();
    if (!daily) return;
    if (stepIndex === 1) daily.nightClaimed = true;
    else daily.entryClaimed = true;
}

/**
 * Защёлка «в эти сутки игрок уже создал созвездие» — условие квеста «Приход».
 *
 * Именно созвездие, а не загрузка страницы: иначе это был бы единственный доход
 * в игре, не требующий игры. Откатом не гасится — заход состоялся.
 */
function markDailyQuestEntry() {
    const daily = getDailyQuestState();
    if (!daily || daily.entryDone) return;
    daily.entryDone = true;
}

/** Защёлка «небо этих суток закрыто» — ставится на раскрытии. */
function markDailyQuestNight() {
    const daily = getDailyQuestState();
    if (!daily || daily.nightDone) return;
    daily.nightDone = true;
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

/**
 * Сколько фигур атласа уже открыто — прогресс «Первооткрывателя».
 * Как и огранка, это производное свойство: считается по createdShapes,
 * своего счётчика в сейве нет.
 */
function getCreatedAtlasShapeCount() {
    if (typeof isShapeCreated !== 'function') return 0;
    return ACHIEVEMENT_ALL_ATLAS_SHAPES.filter(isShapeCreated).length;
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
            // O-02: в сейве до этой задачи поля нет — дефолт 0, версия не
            // поднята (активных игроков нет, мигрировать некого).
            onboardingFieldsShown: Number(s.onboardingFieldsShown) || 0,
            // O-01: аддитивное поле, версия достижений не поднимается
            tutorial: sanitizeTutorialState(s.tutorial),
            totalConstellations: Number(s.totalConstellations) || 0,
            colorTotals: Object.assign({}, def.colorTotals, s.colorTotals || {}),
            starCountTotals: Object.assign({}, def.starCountTotals, s.starCountTotals || {}),
            rainbowNights: Number(s.rainbowNights) || 0,
            mosaicNights: Number(s.mosaicNights) || 0,
            pageSpecialNights: Object.assign({}, def.pageSpecialNights, s.pageSpecialNights || {}),
            shapeColors: sanitizeShapeColorMap(s.shapeColors),
            // M-05: в сейве до этой задачи поля нет — берётся дефолт, версия
            // достижений не поднимается и прогресс не теряется.
            daily: sanitizeDailyQuestState(s.daily)
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
 * - v<6 (L-01): русские имена фигур перестали быть идентификаторами. Ключи
 *   `shapeColors`, `createdShapes`, `constellations[].shape` в старом сейве —
 *   кириллица, в реестре ID её нет: пересчитывать нечего, таблицу соответствия
 *   заводить ради одного релиза дороже, чем сбросить. Решение заказчика.
 * - v<7 (B-04): атлас сжат 7→4 главы (состав и цены другие), размерные цепочки
 *   сведены к трём диапазонам вместо шести точных размеров (id цепочек и ключи
 *   starCountTotals другие), «Первооткрыватель»/«Огранщик» пересчитаны под 24
 *   фигуры вместо 29. Пересчитывать нечего — полный сброс.
 *
 * Home Demo, живых игроков нет — честный старт с нуля дешевле пересчёта.
 */
function migrateAchievementsToSpiral(state) {
    const version = Number(state.achievementsVersion) || 1;
    if (version >= ACHIEVEMENTS_SAVE_VERSION) return;

    if (version < 7) {
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

// B-04: три диапазона вместо шести точных размеров — 2★ теперь тоже попадает
// в бакет (раньше 2★ не считался вообще).
function constellationSizeKey(starCount) {
    const n = typeof starCount === 'number' ? starCount : 0;
    if (n >= 8) return 's8plus';
    if (n >= 5) return 's57';
    if (n >= 2) return 's24';
    return null;
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
        if (!name || name === SHAPE_UNRECOGNIZED) continue;
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
        // B-04: ключ бакета лежит прямо в check (three-bucket range/gte).
        case 'starCountTotal':
            return (c.starCountTotals[check.bucket] || 0) >= check.n;
        // U-10: огранка — производное свойство, счётчика в сейве нет.
        // Считаем по shapeColors тем же предикатом, что рисует венец на карточке.
        case 'facetedShapes':
            return getFacetedShapeCount() >= check.n;
        case 'createdAtlasShapes':
            return getCreatedAtlasShapeCount() >= check.n;
        // M-05: обе проверки читают защёлки суток, а не состояние поля
        case 'dailyEntry':
            return !!(c.daily && c.daily.entryDone);
        case 'dailyNight':
            return !!(c.daily && c.daily.nightDone);
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
        case 'starCountTotal':
            return { current: c.starCountTotals[check.bucket] || 0, target: check.n };
        case 'facetedShapes': return { current: getFacetedShapeCount(), target: check.n };
        case 'createdAtlasShapes': return { current: getCreatedAtlasShapeCount(), target: check.n };
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

/** K-15: тостов больше нет — переход в claimable виден маркой и каплей на ленте. */
function recomputeAchievementsClaimable() {
    const snap = getFieldAchievementSnapshot();
    for (const chain of ACHIEVEMENT_CHAINS) {
        const p = achievementProgress[chain.id];
        if (!p) continue;
        // K-22: у суточной цепочки stepIndex не хранится — выводится из защёлок
        // суток перед общим расчётом, дальше она идёт тем же путём, что и любая
        // другая многошаговая цепочка.
        if (chain.daily) p.stepIndex = deriveDailyStepIndex();
        if (p.stepIndex >= chain.steps.length) {
            p.claimable = false; // цепочка завершена
            continue;
        }
        // S-01: скрытые цепочки не набирают claimable
        if (!isAchievementChainVisible(chain)) {
            p.claimable = false;
            continue;
        }
        const step = chain.steps[p.stepIndex];
        p.claimable = evaluateAchievementCheck(step.check, snap);
    }
}

/** Есть ли где-нибудь в Наградах забираемый шаг (капля сургуча на ленте, K-05). */
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
    // M-05: первое созвездие за сутки закрывает квест «Приход»
    markDailyQuestEntry();
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
    if (!name || name === SHAPE_UNRECOGNIZED) return null;
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
    const facetWasLit = (counts[bucket] || 0) > 0;
    counts[bucket] = (counts[bucket] || 0) + 1;

    // K-15: сюрприз-момент (самое первое создание фигуры, имя раскрыто) и первая
    // огранка последующей грани — разные новости; на первом создании они совпали
    // бы дословно, поэтому огранка молчит, если фигура открылась только что.
    if (shapeTotalCreations(counts) === 1) {
        addDailyNewsEvent('book.newsShapeOpened', { name: shapeLabel(name) });
    } else if (!facetWasLit) {
        addDailyNewsEvent('book.newsFacetLit', { name: shapeLabel(name) });
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
        // K-09/K-15: та же открывшаяся ступень — строкой в новостях «Сегодня», без тоста.
        addDailyNewsEvent('book.newsChainOpen', { title: chain.title });
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
    // M-05: закрытая ночь больше не платит напрямую — она закрывает суточный
    // квест, а ✦ приходят обычным забором в Наградах.
    markDailyQuestNight();

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
    recomputeAchievementsClaimable();
    saveProgression();
    // K-06: атлас и награды живут в книге — перерисовываем её, если открыта
    if (typeof updateRibbonSignal === 'function') updateRibbonSignal();
    if (typeof refreshBookIfOpen === 'function') refreshBookIfOpen();
}

// =============================================================================
// ЗАБОР НАГРАДЫ
// =============================================================================

/**
 * A-03/K-08: где сейчас стоит готовая к забору марка этой цепочки.
 *
 * Ищем по `data-chain-id`, а не через обработчик клика, — тогда точку старта
 * знает сам `claimAchievementStep`, и `__test.claim()` гоняет ровно ту же
 * анимацию, что палец: проверяется игра, а не копия правил. Кнопки забора
 * в игре больше нет — прижимается сама марка (`.achv-tile-ready`).
 */
function getClaimButtonRect(chainId) {
    const btn = document.querySelector(`.achv-tile-ready[data-chain-id="${chainId}"]`);
    return btn ? btn.getBoundingClientRect() : null;
}

function claimAchievementStep(chainId) {
    const chain = getAchievementChainById(chainId);
    const p = achievementProgress[chainId];
    if (!chain || !p || !p.claimable) return false;
    if (p.stepIndex >= chain.steps.length) return false;

    // B-01: платим за тот шаг, который забирают, — до сдвига индекса
    const reward = getAchievementChainStepReward(chain, p.stepIndex);

    // A-03: отклик снимается и запускается ДО начисления. Прямоугольник кнопки —
    // потому что хвост ниже зовёт `refreshBookIfOpen()` и узла кнопки не станет;
    // зажим счётчика — потому что `awardMetaScore` сам добирается до `updateScoreUI`,
    // если забор открыл страницу атласа.
    const fromRect = getClaimButtonRect(chainId);
    if (typeof initAudio === 'function') initAudio();
    if (typeof playClaim === 'function') playClaim(reward);
    if (typeof flyClaimReward === 'function') flyClaimReward(fromRect, reward);

    awardMetaScore(reward);
    if (chain.daily) {
        // K-22: stepIndex не хранится напрямую — «забрано» живёт в блоке суток
        // до прихода нового неба, следующий recompute выведет stepIndex заново.
        markDailyQuestClaimed(p.stepIndex);
    } else {
        p.stepIndex += 1;
    }
    p.claimable = false;

    // Забор — необратимое событие: блокируем откат.
    //
    // M-05: кроме суточных. undoFloor существует потому, что забор необратим,
    // а условие обратимо откатом; у суточных условия обратить нельзя — обе
    // защёлки не гаснут, а раскрытие ночи само уже подняло пол. Морозь их как
    // обычные цепочки — откат умер бы совсем: игрок забирает суточный квест
    // каждую ночь, и всё нарисованное до забора замерзало бы навсегда.
    if (!chain.daily && typeof raiseUndoFloor === 'function') raiseUndoFloor();

    // Следующий шаг может оказаться сразу выполнен — марка сама покажет рамку.
    recomputeAchievementsClaimable();
    saveProgression();

    updateProgressionUI();
    if (typeof refreshBookIfOpen === 'function') refreshBookIfOpen();
    return true;
}

// =============================================================================
// ОВЕРЛЕЙ UI
// =============================================================================

// =============================================================================
// U-09/K-06: НАГРАДЫ — 5 СТРАНИЦ СТРОК; «Сутки» живут на «Сегодня», не в Штампах
// =============================================================================

/**
 * Порядок фиксирован и не зависит от наличия забора: игрок ищет готовое
 * по капле сургуча на высечке «Stamps», а не по перескакивающим строкам.
 * REWARD_PAGES[0] («Сутки») сама книга (ui.js, renderBookToday) рендерит на
 * странице «Сегодня» отдельно — getBookPageIndex('rewards') по страницам
 * Штампов ходит с индекса 1, а не 0.
 *
 * K-12: главы 1..4 — те же четыре рубрики («Цвета»/«Размеры»/«Особые»/
 * «Огранка и путь»), но с литературными именами и рабочими названиями из
 * концепта. `unlockAtIndex` — индекс в ATLAS_PAGE_COSTS: глава разрезана,
 * когда `lifetimeMetaEarned` проходит кумулятивную сумму до этого индекса
 * включительно (getAtlasCumulativeCost) — тот же нож, что и у атласа, на том
 * же ряду чисел. `null` — глава открыта всегда, порог не существует.
 *
 * B-04: все главы Штампов открыты сразу (unlockAtIndex → null везде) — при
 * четырёх главах атласа прежние индексы 1/3/5 либо совпали бы с самим окном
 * первых дней, либо ушли за пределы ряда. Замки особых достижений
 * (requiresPageComplete/getChainLockReason) это решение не трогает.
 */
const REWARD_PAGES = [
    {
        // M-05: суточные квесты стоят первым элементом массива — так исторически
        // сложилось (page 0 самой шторки U-09), K-06 забрал их себе для «Сегодня».
        id: 'daily', sign: 'crescent', title: t('rewardPage.daily'),
        chainIds: ['evening_rite']
    },
    {
        id: 'first_light', sign: ACHIEVEMENT_SIZE_SIGN, title: t('rewardPage.firstLight'),
        chainIds: ['size_2_4', 'size_5_7', 'size_8plus'],
        unlockAtIndex: null
    },
    {
        // U-17: «Рука гранильщика» переехала на вторую страницу Штампов (после
        // «Первого света», перед «Долгим путём») — решение заказчика.
        id: 'cutters_hand', sign: ACHIEVEMENT_COLOR_SIGN, title: t('rewardPage.cuttersHand'),
        chainIds: ['color_red', 'color_orange', 'color_yellow', 'color_white', 'color_blue'],
        unlockAtIndex: null
    },
    {
        // U-10: «Огранщик» и «Первооткрыватель» — старая страница «Огранка и путь».
        id: 'long_walk', sign: 'gem', title: t('rewardPage.longWalk'),
        chainIds: ['razvedka', 'ogranshchik', 'nights', 'constellations', 'minimalism', 'unite_all'],
        unlockAtIndex: null
    },
    {
        // Особые достижения страниц атласа: у каждой уже есть свой замок
        // (requiresPageComplete/getChainLockReason) — этот порог лишь решает,
        // видна ли сама глава на оглавлении и в пейджере, замка не дублирует.
        // B-04: gobelen/orchestra/symphony сняты вместе с бывшими главами V/VI/VII.
        id: 'odd_nights', sign: 'comet', title: t('rewardPage.oddNights'),
        chainIds: ['rainbow', 'mosaic', 'vitrazh', 'kaleidoscope'],
        unlockAtIndex: null
    }
];

const REWARD_PAGE_COUNT = REWARD_PAGES.length;

function getRewardPageChains(pageIndex) {
    const page = REWARD_PAGES[pageIndex];
    if (!page) return [];
    return page.chainIds.map(getAchievementChainById).filter(Boolean);
}

/** K-12: глава штампов разрезана — как и у атласа, необратимо (порог не растёт). */
function isRewardPageUnlocked(pageIndex) {
    const page = REWARD_PAGES[pageIndex];
    if (!page || typeof page.unlockAtIndex !== 'number') return true;
    const earned = typeof getLifetimeMetaEarned === 'function' ? getLifetimeMetaEarned() : 0;
    return earned >= getAtlasCumulativeCost(page.unlockAtIndex);
}

function getRewardPageUnlockCost(pageIndex) {
    const page = REWARD_PAGES[pageIndex];
    if (!page || typeof page.unlockAtIndex !== 'number') return 0;
    return getAtlasCumulativeCost(page.unlockAtIndex);
}

/** U-09: бейдж на иконке рельса — на этой странице есть что забрать. */
function rewardPageHasClaimable(pageIndex) {
    return getRewardPageChains(pageIndex).some(chain => {
        const p = achievementProgress[chain.id];
        return p && p.claimable;
    });
}

/**
 * K-19: счёт главы штампов в оглавлении — прижатые марки, а не пройденные
 * цепочки: `stepIndex` каждой цепочки и есть число забранных марок в её
 * пятиклеточной полоске (K-08), сумма по главе складывается в «9 / 25».
 * «Сутки» в подсчёте не участвуют — они не входят ни в одну страницу REWARD_PAGES.
 */
function getRewardPagePressedStamps(pageIndex) {
    let pressed = 0;
    let total = 0;
    for (const chain of getRewardPageChains(pageIndex)) {
        const p = achievementProgress[chain.id];
        pressed += p ? p.stepIndex : 0;
        total += chain.steps.length;
    }
    return { pressed, total };
}

/**
 * K-08: счёт в шапке сцепки — «23 / 25», «ready» сургучом или «done», когда
 * цепочка пройдена целиком. У шагов суточного квеста прогресса нет (условие
 * бинарное) — вместо числа тире (K-22: тот же общий путь, `getAchievementStepProgress`
 * не знает проверок `dailyEntry`/`dailyNight` и честно отдаёт null).
 */
function buildAchievementHeadCount(chain, p, done) {
    if (done) return { text: t('rewards.headDone'), ready: false };
    if (p.claimable) return { text: t('rewards.headReady'), ready: true };
    const prog = getAchievementStepProgress(chain.steps[p.stepIndex].check);
    if (!prog) return { text: '—', ready: false };
    return { text: t('rewards.headProgress', { current: Math.min(prog.current, prog.target), target: prog.target }), ready: false };
}

/**
 * Одна марка сцепки. Три состояния и ни одного больше:
 * свет ждёт (число) → готово прижать (сургучная рамка, марка сама кликабельна)
 * → оттиск (число вылетело к корешку, на его месте знак цепочки).
 *
 * Прижимается сама марка — кнопки нет нигде. Зона касания шире марки на 6 pt
 * с каждой стороны (`.achv-tile-hit`): марка мелкая, палец крупный.
 */
function createAchievementTile(chain, stepIndex, p) {
    const tile = document.createElement('div');
    tile.className = 'achv-tile';

    // K-22: суточная цепочка идёт тем же путём — stepIndex у неё выведен
    // recompute'ом из защёлок суток, «текущий» шаг всегда ровно один.
    const pressed = stepIndex < p.stepIndex;
    const isCurrent = stepIndex === p.stepIndex;
    const ready = isCurrent && !pressed && p.claimable;

    if (pressed) {
        tile.classList.add('achv-tile-lit');
        tile.appendChild(glyphSign(chain.sign || 'arc', 14));
        return tile;
    }

    const amt = document.createElement('span');
    amt.className = 'achv-tile-amt';
    amt.textContent = `${getAchievementChainStepReward(chain, stepIndex)} ✦`;
    tile.appendChild(amt);

    if (ready) {
        tile.classList.add('achv-tile-ready');
        tile.dataset.chainId = chain.id;
        tile.setAttribute('role', 'button');
        tile.tabIndex = 0;
        tile.title = t('rewards.claim');
        const hit = document.createElement('span');
        hit.className = 'achv-tile-hit';
        hit.setAttribute('aria-hidden', 'true');
        // U-20: сетка всегда до пяти клеток (createAchievementTiles) — хит-зона
        // растягивается на соседей до краёв полоски через эти два безразмерных числа.
        hit.style.setProperty('--hit-l', stepIndex);
        hit.style.setProperty('--hit-r', 4 - stepIndex);
        tile.appendChild(hit);
        // A-03: по data-chain-id `claimAchievementStep` находит точку старта перелёта ✦
        tile.addEventListener('click', (e) => {
            e.stopPropagation();
            claimAchievementStep(chain.id);
        });
        tile.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            claimAchievementStep(chain.id);
        });
    } else {
        tile.title = t('rewards.claimIdle');
    }
    return tile;
}

/** Сетка на пять клеток всегда — столько же, сколько граней у фигуры атласа. */
function createAchievementTiles(chain, p) {
    const tiles = document.createElement('div');
    tiles.className = 'achv-row-tiles';
    const total = chain.steps.length;
    for (let i = 0; i < 5; i++) {
        if (i < total) {
            tiles.appendChild(createAchievementTile(chain, i, p));
        } else {
            const empty = document.createElement('div');
            empty.className = 'achv-tile achv-tile-empty';
            tiles.appendChild(empty);
        }
    }
    return tiles;
}

/** U-09: строка-замок — цепочка есть, но имя и знак ещё скрыты. */
function createAchievementLockedRow(reason) {
    const row = document.createElement('div');
    row.className = 'achv-row achv-row-locked';

    const icon = document.createElement('div');
    icon.className = 'achv-row-icon achv-row-icon-uncut';
    icon.appendChild(glyphSign('lock', 22));
    row.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'achv-row-body';

    const title = document.createElement('div');
    title.className = 'achv-row-title achv-row-title-hidden';
    title.textContent = t('achv.lockedTitle');
    body.appendChild(title);

    const text = document.createElement('div');
    text.className = 'achv-row-step';
    text.textContent = reason;
    body.appendChild(text);

    row.appendChild(body);
    return row;
}

/**
 * K-08: достижение — сцепка марок, как в альбоме филателиста. Одна строка:
 * имя с линейкой из точек и счётом текущей ступени, курсивное описание того,
 * что именно считается, и полоска из пяти клеток — по ней сразу видно,
 * сколько света уже в книге и сколько ещё ждёт (getAchievementChainStepReward
 * на каждой клетке, суммы нигде не пересчитываются заново).
 */
function createAchievementRow(chain) {
    const lockReason = getChainLockReason(chain);
    if (lockReason) return createAchievementLockedRow(lockReason);

    const p = achievementProgress[chain.id] || { stepIndex: 0, claimable: false };
    // K-22: суточная цепочка тоже уходит в «done» (обе марки прижаты), но
    // до конца суток, а не навсегда — recompute сбросит stepIndex сам,
    // как только придёт новое небо.
    const done = p.stepIndex >= chain.steps.length;

    const row = document.createElement('div');
    row.className = 'achv-row'
        + (done ? ' achv-row-done' : '')
        + (p.claimable ? ' achv-row-claimable' : '');
    row.dataset.chainId = chain.id;

    const head = document.createElement('div');
    head.className = 'achv-row-head';

    const title = document.createElement('span');
    title.className = 'achv-row-title';
    title.textContent = chain.title;
    head.appendChild(title);

    const dots = document.createElement('span');
    dots.className = 'achv-row-dots';
    head.appendChild(dots);

    const countInfo = buildAchievementHeadCount(chain, p, done);
    const count = document.createElement('span');
    count.className = 'achv-row-count' + (countInfo.ready ? ' achv-row-count-ready' : '');
    count.textContent = countInfo.text;
    head.appendChild(count);

    row.appendChild(head);

    // K-29: описание строки — текущий шаг, а не вся цепочка (chain.desc печатал
    // оба шага «Вечернего обряда» разом); пройденная цепочка (stepIndex вне
    // steps) описания не показывает — печатать нечего.
    const desc = document.createElement('div');
    desc.className = 'achv-row-desc';
    const stepEntry = chain.steps[p.stepIndex];
    desc.textContent = stepEntry ? stepEntry.desc : '';
    row.appendChild(desc);

    row.appendChild(createAchievementTiles(chain, p));

    return row;
}

/** K-12: неразрезанная глава штампов — тот же нож и та же заглушка, что у атласа. */
function createRewardPageLockedNotice(pageIndex) {
    const locked = document.createElement('div');
    locked.className = 'atlas-page-locked';
    const cost = getRewardPageUnlockCost(pageIndex);

    const lockedText = document.createElement('p');
    lockedText.textContent = t('stamps.chapterLocked', { n: cost });
    locked.appendChild(lockedText);

    const progressText = document.createElement('p');
    progressText.className = 'atlas-page-locked-progress';
    progressText.textContent = t('stamps.chapterLockedProgress', {
        current: Math.min(getLifetimeMetaEarned(), cost),
        target: cost
    });
    locked.appendChild(progressText);

    return locked;
}

function renderAchievementsList() {
    const list = document.getElementById('achievementsList');
    if (!list) return;
    list.innerHTML = '';
    const pageIndex = getBookPageIndex('rewards');
    if (!isRewardPageUnlocked(pageIndex)) {
        list.appendChild(createRewardPageLockedNotice(pageIndex));
        return;
    }
    for (const chain of getRewardPageChains(pageIndex)) {
        list.appendChild(createAchievementRow(chain));
    }
}

// Инициализация дефолтами при загрузке модуля (до loadProgression).
initAchievementState();

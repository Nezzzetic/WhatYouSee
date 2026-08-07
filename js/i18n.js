// i18n.js — слой локализации (L-01)
//
// Подключается ПЕРВЫМ скриптом проекта (до testApi.js и constants.js): словари
// нужны уже на этапе объявления констант, а `document.documentElement.lang`
// выставляется до первого кадра.
//
// Правило проекта: **в модель кладём ID, на экран — `shapeLabel()` / `t()`**.
// Комментарии, dev-панель, console-сообщения и ошибки харнесса остаются
// русскими — они до игрока не доходят (решения исполнителя, см. task-док L-01).

// =============================================================================
// ЯЗЫК
// =============================================================================

const DEFAULT_LOCALE = 'en';
const SUPPORTED_LOCALES = ['en', 'ru'];

let cachedLocale = null;

/** ?lang=en|ru → иначе DEFAULT_LOCALE. Невалидное значение молча игнорируется. */
function getLocale() {
    if (cachedLocale) return cachedLocale;
    cachedLocale = DEFAULT_LOCALE;
    try {
        if (typeof window !== 'undefined' && window.location) {
            const raw = new URLSearchParams(window.location.search).get('lang');
            if (raw && SUPPORTED_LOCALES.includes(raw)) cachedLocale = raw;
        }
    } catch (e) { /* ignore */ }
    return cachedLocale;
}

function isI18nDebugMode() {
    try {
        if (typeof window === 'undefined' || !window.location) return false;
        return new URLSearchParams(window.location.search).get('dev') === '1';
    } catch (e) {
        return false;
    }
}

// =============================================================================
// СЛОВАРИ
// =============================================================================
//
// Ключи плоские с точками. Значение — строка либо объект множественных форм
// ({one, other} для en; {one, few, many} для ru), который разбирает tp().

const LOCALES = {

// -----------------------------------------------------------------------------
// ENGLISH (язык по умолчанию)
// -----------------------------------------------------------------------------
en: {
    // --- Фигуры ---------------------------------------------------------------
    'shape.unknown': 'Shape',
    // Каталог-29
    'shape.toothpick': 'Toothpick',
    'shape.checkmark': 'Checkmark',
    'shape.chip': 'Chip',
    'shape.cookie': 'Cookie',
    'shape.banana': 'Banana',
    'shape.chicken-foot': 'Chicken Foot',
    'shape.earthworm': 'Earthworm',
    'shape.spatula': 'Spatula',
    'shape.diamond': 'Diamond',
    'shape.envelope': 'Envelope',
    'shape.fan': 'Fan',
    'shape.radish': 'Radish',
    'shape.donut': 'Donut',
    'shape.flag': 'Flag',
    'shape.tadpole': 'Tadpole',
    'shape.bunny': 'Bunny',
    'shape.bull': 'Bull',
    'shape.bow': 'Bow',
    'shape.house': 'House',
    'shape.mace': 'Mace',
    'shape.kite': 'Kite',
    'shape.lantern': 'Lantern',
    'shape.hand-fan': 'Hand Fan',
    'shape.lollipop': 'Lollipop',
    'shape.book': 'Book',
    'shape.origami': 'Origami',
    'shape.wheel': 'Wheel',
    'shape.hammock': 'Hammock',
    'shape.perfectionist': 'Perfectionist',
    // Legacy (вне каталога-29, soft-disabled — но имена нужны для UI и отладки)

    // --- Fallback-имена (45, порядок = индекс, набор свой, не перевод) --------
    'fallback.0': 'Nebula',      'fallback.1': 'Spark',       'fallback.2': 'Shadow',
    'fallback.3': 'Echo',        'fallback.4': 'Whirl',       'fallback.5': 'Shard',
    'fallback.6': 'Gleam',       'fallback.7': 'Drift',       'fallback.8': 'Whisper',
    'fallback.9': 'Shimmer',     'fallback.10': 'Penumbra',   'fallback.11': 'Splash',
    'fallback.12': 'Mote',       'fallback.13': 'Flare',      'fallback.14': 'Curl',
    'fallback.15': 'Phantom',    'fallback.16': 'Radiance',   'fallback.17': 'Afterglow',
    'fallback.18': 'Thread',     'fallback.19': 'Reflection', 'fallback.20': 'Silhouette',
    'fallback.21': 'Haze',       'fallback.22': 'Wave',       'fallback.23': 'Vortex',
    'fallback.24': 'Tremor',     'fallback.25': 'Spray',      'fallback.26': 'Flux',
    'fallback.27': 'Iridescence','fallback.28': 'Pattern',    'fallback.29': 'Tracery',
    'fallback.30': 'Blot',       'fallback.31': 'Stroke',     'fallback.32': 'Contour',
    'fallback.33': 'Flourish',   'fallback.34': 'Hatch',      'fallback.35': 'Patch',
    'fallback.36': 'Plume',      'fallback.37': 'Flicker',    'fallback.38': 'Vein',
    'fallback.39': 'Ripple',     'fallback.40': 'Flash',      'fallback.41': 'Veil',
    'fallback.42': 'Halo',       'fallback.43': 'Passage',    'fallback.44': 'Pulse',

    // --- Уровни (legacy XP) ---------------------------------------------------
    'level.0': 'Novice',
    'level.1': 'Observer',
    'level.2': 'Stargazer',
    'level.3': 'Astronomer',
    'level.4': 'Sky Cartographer',
    'level.5': 'Constellation Master',

    // --- Цвета ----------------------------------------------------------------
    'color.red': 'red',
    'color.orange': 'orange',
    'color.yellow': 'yellow',
    'color.white': 'white',
    'color.blue': 'blue',

    // --- Цепочки наград: заголовки -------------------------------------------
    'chain.color_red.title': 'Crimson',
    'chain.color_orange.title': 'Amber',
    'chain.color_yellow.title': 'Golden',
    'chain.color_white.title': 'Pearl',
    'chain.color_blue.title': 'Azure',
    'chain.rainbow.title': 'Rainbow',
    'chain.mosaic.title': 'Mosaic',
    'chain.vitrazh.title': 'Stained Glass',
    'chain.kaleidoscope.title': 'Kaleidoscope',
    'chain.gobelen.title': 'Tapestry',
    'chain.orchestra.title': 'Orchestra',
    'chain.symphony.title': 'Symphony',
    'chain.nights.title': 'Night Wanderer',
    'chain.constellations.title': 'Sky Architect',
    'chain.minimalism.title': 'Minimalism',
    'chain.unite_all.title': 'All-in-One',
    'chain.razvedka.title': 'Trailblazer',
    'chain.ogranshchik.title': 'Gem Cutter',

    // --- Цепочки наград: шаги -------------------------------------------------
    'chain.color.step': {
        one: '{n} {color} constellation',
        other: '{n} {color} constellations'
    },
    'chain.size.step': {
        one: '{n} constellation of {size}★',
        other: '{n} constellations of {size}★'
    },
    'chain.size8plus.step': {
        one: '{n} constellation of 8★+',
        other: '{n} constellations of 8★+'
    },
    'chain.rainbow.step': {
        one: '{n} night with a full rainbow (all 5 colors in one night)',
        other: '{n} nights with a full rainbow (all 5 colors in one night)'
    },
    'chain.mosaic.step': {
        one: '{n} night with a full mosaic (2★,3★,4★,5★,6★,7★ and 8★+ on one field)',
        other: '{n} nights with a full mosaic (2★,3★,4★,5★,6★,7★ and 8★+ on one field)'
    },
    'chain.pageSpecial.step': {
        one: '{n} night: {desc}',
        other: '{n} nights: {desc}'
    },
    'chain.vitrazh.desc': 'page 3 shapes on the field in all 5 colors',
    'chain.kaleidoscope.desc': 'all 5 shapes of page 4 on the field',
    'chain.gobelen.desc': '3+ shapes of page 5 on the field',
    'chain.orchestra.desc': 'create all 5 shapes of page 6 in one night',
    'chain.symphony.desc': 'create the Perfectionist in one night',
    'chain.nights.step': {
        one: '{n} completed night',
        other: '{n} completed nights'
    },
    'chain.constellations.step': {
        one: '{n} constellation created in total',
        other: '{n} constellations created in total'
    },
    'chain.minimalism.step': 'Finish a night with a single constellation',
    'chain.unite_all.step': 'Join every star on the field into one constellation',
    'chain.razvedka.step': {
        one: '{n} atlas shape discovered',
        other: '{n} atlas shapes discovered'
    },
    'chain.razvedka.stepAll': 'Discover all 29 atlas shapes',
    'chain.ogranshchik.step': {
        one: '{n} faceted shape (all 5 colors each)',
        other: '{n} faceted shapes (all 5 colors each)'
    },
    'chain.ogranshchik.stepAll': 'Facet all 29 atlas shapes',

    // --- Страницы наград ------------------------------------------------------
    'rewardPage.colors': 'Colors',
    'rewardPage.sizes': 'Sizes',
    'rewardPage.specials': 'Special',
    'rewardPage.path': 'Facets & Path',

    // --- Награды: строки и замки ---------------------------------------------
    'rewards.stepReady': '{desc} · ready',
    'rewards.stepProgress': '{desc} · {current} / {target}',
    'rewards.allDone': 'All steps completed',
    'rewards.claim': 'Claim reward',
    'rewards.claimIdle': 'Reward for the current step — meet its condition',
    'rewards.lockCollectPage': 'Collect every shape on page {n}',
    'rewards.lockPageLocked': 'Page {n} is not unlocked yet',

    // --- Тосты ----------------------------------------------------------------
    'toast.achievement': 'Achievement unlocked',
    'toast.newShapeTitle': 'New atlas shape!',
    'toast.newShapeSub': '«{name}»',
    'toast.newChainTitle': 'New achievement available',
    'toast.newChainSub': '{title} — page {n} collection complete',
    'toast.atlasPageTitle': 'Atlas page unlocked',
    'toast.atlasPageSub': 'Page {n} — new shapes in the set',
    'toast.levelComplete': 'Night complete',
    'toast.levelPoints': '+{n} for the night',
    'toast.close': 'Close',

    // --- Шторка ---------------------------------------------------------------
    'sheet.atlasTitle': 'ATLAS · <b>Page {n}</b>',
    'sheet.rewardsTitle': 'REWARDS · <b>{title}</b>',
    'sheet.page': 'Page {n}',
    'sheet.segAtlas': 'Atlas',
    'sheet.segRewards': 'Rewards',
    'sheet.collapse': 'Collapse',
    'sheet.score': 'Score',
    'sheet.open': 'Open atlas and rewards',

    // --- Атлас ----------------------------------------------------------------
    'atlas.unknownCard': '? ? ?',
    'atlas.pageLocked': 'This page opens on its own once you have {n} ✦.',
    'atlas.pageLockedProgress': 'Now: {current} / {target} ✦',

    // --- Подсказки (левая панель) --------------------------------------------
    'hints.title': 'Patterns',
    'hints.unknownConstellation': 'Unknown constellation',
    'hints.filterKnown': 'Collected constellations',
    'hints.filterStars': { one: '{n} star', other: '{n} stars' },
    'hints.filterUndiscovered': 'Not collected yet (unlocked atlas pages)',
    'hints.filterFavorite': 'Favorites only',
    'hints.emptyUndiscovered': 'All shapes on unlocked pages are collected',
    'hints.emptyKnown': 'No collected constellations yet',

    // --- Поле -----------------------------------------------------------------
    'field.renamePrompt': 'Rename constellation:',
    'field.constellation': 'Constellation',
    'field.undoLast': 'Undo last constellation',

    // --- Обсерватория (B-02) --------------------------------------------------
    'observatory.toObservatory': 'Go to the observatory',
    'observatory.toField': 'Back to tonight’s sky',
    'observatory.modeConnect': 'Connect stars',
    'observatory.modeMove': 'Move and recolour stars',
    'observatory.lockedTitle': 'Observatory — a sky of your own',
    'observatory.lockedSub': 'Stars you can move, connect and recolour. It never resets.',
    'observatory.lockedProgress': '{current} / {target} ✦ earned all-time',
    'observatory.unlockedTitle': 'Observatory unlocked',
    'observatory.unlockedSub': '7 stars are waiting for you',
    'observatory.renamePrompt': 'Name this constellation:'
},

// -----------------------------------------------------------------------------
// РУССКИЙ (полноценный второй словарь; переключателя в UI нет, только ?lang=ru)
// -----------------------------------------------------------------------------
ru: {
    // --- Фигуры ---------------------------------------------------------------
    'shape.unknown': 'Фигура',
    // Каталог-29
    'shape.toothpick': 'Зубочистка',
    'shape.checkmark': 'Галочка',
    'shape.chip': 'Чипсина',
    'shape.cookie': 'Печенька',
    'shape.banana': 'Банан',
    'shape.chicken-foot': 'Куриная лапка',
    'shape.earthworm': 'Дождевой червяк',
    'shape.spatula': 'Лопатка',
    'shape.diamond': 'Алмазик',
    'shape.envelope': 'Конвертик',
    'shape.fan': 'Вентилятор',
    'shape.radish': 'Редиска',
    'shape.donut': 'Пончик',
    'shape.flag': 'Флажок',
    'shape.tadpole': 'Головастик',
    'shape.bunny': 'Зайчик',
    'shape.bull': 'Бычок',
    'shape.bow': 'Бантик',
    'shape.house': 'Домик',
    'shape.mace': 'Булава',
    'shape.kite': 'Воздушный змей',
    'shape.lantern': 'Фонарик',
    'shape.hand-fan': 'Веер',
    'shape.lollipop': 'Чупа-чупс',
    'shape.book': 'Книжка',
    'shape.origami': 'Оригами',
    'shape.wheel': 'Колесо',
    'shape.hammock': 'Гамак',
    'shape.perfectionist': 'Перфекционист',
    // Legacy

    // --- Fallback-имена (45) --------------------------------------------------
    'fallback.0': 'Туманность', 'fallback.1': 'Искра',       'fallback.2': 'Тень',
    'fallback.3': 'Эхо',        'fallback.4': 'Вихрь',       'fallback.5': 'Осколок',
    'fallback.6': 'Отблеск',    'fallback.7': 'Дрейф',       'fallback.8': 'Шёпот',
    'fallback.9': 'Мерцание',   'fallback.10': 'Полутень',   'fallback.11': 'Всплеск',
    'fallback.12': 'Пылинка',   'fallback.13': 'Сполох',     'fallback.14': 'Завиток',
    'fallback.15': 'Призрак',   'fallback.16': 'Излучение',  'fallback.17': 'Зарево',
    'fallback.18': 'Нить',      'fallback.19': 'Отражение',  'fallback.20': 'Силуэт',
    'fallback.21': 'Дымка',     'fallback.22': 'Волна',      'fallback.23': 'Коловорот',
    'fallback.24': 'Трепет',    'fallback.25': 'Брызги',     'fallback.26': 'Флюктуация',
    'fallback.27': 'Переливы',  'fallback.28': 'Узор',       'fallback.29': 'Вязь',
    'fallback.30': 'Пятно',     'fallback.31': 'Мазок',      'fallback.32': 'Контур',
    'fallback.33': 'Росчерк',   'fallback.34': 'Штрих',      'fallback.35': 'Лоскут',
    'fallback.36': 'Клуб',      'fallback.37': 'Мельтешение','fallback.38': 'Прожилка',
    'fallback.39': 'Рябь',      'fallback.40': 'Вспышка',    'fallback.41': 'Завеса',
    'fallback.42': 'Ореол',     'fallback.43': 'Переход',    'fallback.44': 'Пульсация',

    // --- Уровни ---------------------------------------------------------------
    'level.0': 'Начинающий',
    'level.1': 'Наблюдатель',
    'level.2': 'Звездочёт',
    'level.3': 'Астроном',
    'level.4': 'Картограф неба',
    'level.5': 'Мастер созвездий',

    // --- Цвета ----------------------------------------------------------------
    'color.red': 'красный',
    'color.orange': 'оранжевый',
    'color.yellow': 'жёлтый',
    'color.white': 'белый',
    'color.blue': 'голубой',

    // --- Цепочки наград: заголовки -------------------------------------------
    'chain.color_red.title': 'Багровые',
    'chain.color_orange.title': 'Янтарные',
    'chain.color_yellow.title': 'Золотые',
    'chain.color_white.title': 'Жемчужные',
    'chain.color_blue.title': 'Лазурные',
    'chain.rainbow.title': 'Радуга',
    'chain.mosaic.title': 'Мозаика',
    'chain.vitrazh.title': 'Витраж',
    'chain.kaleidoscope.title': 'Калейдоскоп',
    'chain.gobelen.title': 'Гобелен',
    'chain.orchestra.title': 'Оркестр',
    'chain.symphony.title': 'Симфония',
    'chain.nights.title': 'Странник ночей',
    'chain.constellations.title': 'Зодчий небес',
    'chain.minimalism.title': 'Минимализм',
    'chain.unite_all.title': 'Созвездие-всё',
    'chain.razvedka.title': 'Первооткрыватель',
    'chain.ogranshchik.title': 'Огранщик',

    // --- Цепочки наград: шаги -------------------------------------------------
    'chain.color.step': {
        one: '{n} созвездие цвета «{color}»',
        few: '{n} созвездия цвета «{color}»',
        many: '{n} созвездий цвета «{color}»'
    },
    'chain.size.step': {
        one: '{n} созвездие по {size}★',
        few: '{n} созвездия по {size}★',
        many: '{n} созвездий по {size}★'
    },
    'chain.size8plus.step': {
        one: '{n} созвездие от 8★',
        few: '{n} созвездия от 8★',
        many: '{n} созвездий от 8★'
    },
    'chain.rainbow.step': {
        one: '{n} ночь с полной радугой (все 5 цветов за ночь)',
        few: '{n} ночи с полной радугой (все 5 цветов за ночь)',
        many: '{n} ночей с полной радугой (все 5 цветов за ночь)'
    },
    'chain.mosaic.step': {
        one: '{n} ночь с полной мозаикой (созвездия 2★,3★,4★,5★,6★,7★ и 8★+ на одном поле)',
        few: '{n} ночи с полной мозаикой (созвездия 2★,3★,4★,5★,6★,7★ и 8★+ на одном поле)',
        many: '{n} ночей с полной мозаикой (созвездия 2★,3★,4★,5★,6★,7★ и 8★+ на одном поле)'
    },
    'chain.pageSpecial.step': {
        one: '{n} ночь: {desc}',
        few: '{n} ночи: {desc}',
        many: '{n} ночей: {desc}'
    },
    'chain.vitrazh.desc': 'фигуры стр. 3 на поле во всех 5 цветах',
    'chain.kaleidoscope.desc': 'все 5 фигур стр. 4 на поле',
    'chain.gobelen.desc': '3+ фигуры стр. 5 на поле',
    'chain.orchestra.desc': 'создай все 5 фигур стр. 6 за ночь',
    'chain.symphony.desc': 'создай Перфекциониста за ночь',
    'chain.nights.step': {
        one: '{n} завершённая ночь',
        few: '{n} завершённые ночи',
        many: '{n} завершённых ночей'
    },
    'chain.constellations.step': {
        one: '{n} созвездие создано всего',
        few: '{n} созвездия создано всего',
        many: '{n} созвездий создано всего'
    },
    'chain.minimalism.step': 'Заверши ночь одним созвездием',
    'chain.unite_all.step': 'Объедини все звёзды поля в одно созвездие',
    'chain.razvedka.step': {
        one: '{n} открытая фигура атласа',
        few: '{n} открытые фигуры атласа',
        many: '{n} открытых фигур атласа'
    },
    'chain.razvedka.stepAll': 'Открыть все 29 фигур атласа',
    'chain.ogranshchik.step': {
        one: '{n} огранённая фигура (все 5 цветов у каждой)',
        few: '{n} огранённые фигуры (все 5 цветов у каждой)',
        many: '{n} огранённых фигур (все 5 цветов у каждой)'
    },
    'chain.ogranshchik.stepAll': 'Огранить все 29 фигур атласа',

    // --- Страницы наград ------------------------------------------------------
    'rewardPage.colors': 'Цвета',
    'rewardPage.sizes': 'Размеры',
    'rewardPage.specials': 'Особые',
    'rewardPage.path': 'Огранка и путь',

    // --- Награды --------------------------------------------------------------
    'rewards.stepReady': '{desc} · готово',
    'rewards.stepProgress': '{desc} · {current} / {target}',
    'rewards.allDone': 'Все ступени пройдены',
    'rewards.claim': 'Забрать награду',
    'rewards.claimIdle': 'Награда за текущую ступень — выполните её условие',
    'rewards.lockCollectPage': 'Соберите все фигуры страницы {n}',
    'rewards.lockPageLocked': 'Страница {n} ещё не открыта',

    // --- Тосты ----------------------------------------------------------------
    'toast.achievement': 'Достижение выполнено',
    'toast.newShapeTitle': 'Новая фигура атласа!',
    'toast.newShapeSub': '«{name}»',
    'toast.newChainTitle': 'Новое достижение доступно',
    'toast.newChainSub': '{title} — коллекция страницы {n} собрана',
    'toast.atlasPageTitle': 'Открыта страница атласа',
    'toast.atlasPageSub': 'Страница {n} — новые фигуры в наборе',
    'toast.levelComplete': 'Уровень завершён',
    'toast.levelPoints': '+{n} за уровень',
    'toast.close': 'Закрыть',

    // --- Шторка ---------------------------------------------------------------
    'sheet.atlasTitle': 'АТЛАС · <b>Страница {n}</b>',
    'sheet.rewardsTitle': 'НАГРАДЫ · <b>{title}</b>',
    'sheet.page': 'Страница {n}',
    'sheet.segAtlas': 'Атлас',
    'sheet.segRewards': 'Награды',
    'sheet.collapse': 'Свернуть',
    'sheet.score': 'Очки',
    'sheet.open': 'Открыть атлас и награды',

    // --- Атлас ----------------------------------------------------------------
    'atlas.unknownCard': '? ? ?',
    'atlas.pageLocked': 'Страница откроется сама, когда накопится {n} ✦.',
    'atlas.pageLockedProgress': 'Сейчас: {current} / {target} ✦',

    // --- Подсказки ------------------------------------------------------------
    'hints.title': 'Паттерны',
    'hints.unknownConstellation': 'Неизвестное созвездие',
    'hints.filterKnown': 'Собранные созвездия',
    'hints.filterStars': { one: '{n} звезда', few: '{n} звезды', many: '{n} звёзд' },
    'hints.filterUndiscovered': 'Ещё не собранные (открытые страницы атласа)',
    'hints.filterFavorite': 'Только избранные',
    'hints.emptyUndiscovered': 'Все формы на открытых страницах собраны',
    'hints.emptyKnown': 'Пока нет собранных созвездий',

    // --- Поле -----------------------------------------------------------------
    'field.renamePrompt': 'Переименовать созвездие:',
    'field.constellation': 'Созвездие',
    'field.undoLast': 'Отменить последнее созвездие',

    // --- Обсерватория (B-02) --------------------------------------------------
    'observatory.toObservatory': 'Перейти в обсерваторию',
    'observatory.toField': 'Вернуться на небо',
    'observatory.modeConnect': 'Соединять звёзды',
    'observatory.modeMove': 'Перемещать и красить звёзды',
    'observatory.lockedTitle': 'Обсерватория — своё небо, которое можно переставлять',
    'observatory.lockedSub': 'Звёзды, которые можно двигать, соединять и красить. Она не сбрасывается.',
    'observatory.lockedProgress': '{current} / {target} ✦ за всё время',
    'observatory.unlockedTitle': 'Обсерватория открыта',
    'observatory.unlockedSub': '7 звёзд ждут',
    'observatory.renamePrompt': 'Назвать созвездие:'
}

};

// =============================================================================
// API
// =============================================================================

const I18N_PARAM_RE = /\{(\w+)\}/g;

function formatI18nTemplate(template, params) {
    if (typeof template !== 'string') return '';
    if (!params) return template;
    return template.replace(I18N_PARAM_RE, (whole, key) =>
        (params[key] !== undefined && params[key] !== null ? String(params[key]) : whole));
}

/**
 * Ищет ключ в текущей локали. Отсутствующий — молча падает на английскую
 * строку (в проде игрок увидит текст, а не пустоту), в `?dev=1` ещё и ругается
 * в консоль: это единственный способ поймать забытый ключ автотестом.
 */
function lookupI18nEntry(key) {
    const locale = getLocale();
    const dict = LOCALES[locale] || LOCALES[DEFAULT_LOCALE];
    if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];

    const base = LOCALES[DEFAULT_LOCALE];
    if (Object.prototype.hasOwnProperty.call(base, key)) {
        if (isI18nDebugMode()) console.warn('[i18n] нет ключа в локали ' + locale + ': ' + key);
        return base[key];
    }
    if (isI18nDebugMode()) console.warn('[i18n] ключ не найден нигде: ' + key);
    return null;
}

/** t('atlas.pageLocked', {n: 80}). Нет ключа → возвращается сам ключ. */
function t(key, params) {
    const entry = lookupI18nEntry(key);
    if (entry === null || entry === undefined) return key;
    if (typeof entry === 'object') return formatI18nTemplate(entry.other || entry.many || entry.one, params);
    return formatI18nTemplate(entry, params);
}

let pluralRulesCache = null;
function getI18nPluralRules() {
    if (pluralRulesCache && pluralRulesCache.locale === getLocale()) return pluralRulesCache.rules;
    let rules = null;
    try {
        rules = new Intl.PluralRules(getLocale());
    } catch (e) {
        rules = { select: (n) => (n === 1 ? 'one' : 'other') };
    }
    pluralRulesCache = { locale: getLocale(), rules };
    return rules;
}

/**
 * Множественное число: tp('chain.nights.step', 5) → «5 завершённых ночей».
 * `n` всегда доступен в шаблоне как {n}; остальные параметры — из `params`.
 */
function tp(key, n, params) {
    const entry = lookupI18nEntry(key);
    if (entry === null || entry === undefined) return key;
    const all = Object.assign({ n }, params || {});
    if (typeof entry !== 'object') return formatI18nTemplate(entry, all);

    const category = getI18nPluralRules().select(Number(n));
    const template = entry[category]
        || entry.other || entry.many || entry.few || entry.one;
    return formatI18nTemplate(template, all);
}

/** Fallback-имена живут отдельным пространством ключей: 'fb12' → t('fallback.12'). */
const FALLBACK_NAME_ID_RE = /^fb(\d+)$/;

/**
 * Имя фигуры на экран. Принимает ID фигуры ('banana'), ID fallback-имени ('fb7')
 * либо имя пользовательского вида (его вводит игрок — возвращается как есть).
 * Фолбэк — сам id: лучше показать «banana», чем пустоту.
 */
function shapeLabel(id) {
    if (typeof id !== 'string' || id.length === 0) return '';
    const fb = FALLBACK_NAME_ID_RE.exec(id);
    if (fb) {
        const entry = lookupI18nEntry('fallback.' + fb[1]);
        return entry === null ? id : String(entry);
    }
    const entry = lookupI18nEntry('shape.' + id);
    return entry === null ? id : String(entry);
}

/**
 * Подпись созвездия на экране. `customName` — то, что ввёл игрок, оно не
 * переводится; иначе `name` (ID фигуры либо ID fallback-имени) идёт в shapeLabel.
 * Единственная точка, из которой имя созвездия попадает на канвас и в промпт.
 */
function getConstellationDisplayName(constellation) {
    if (!constellation) return '';
    if (constellation.customName) return constellation.customName;
    return shapeLabel(constellation.name || constellation.shape || '');
}

// =============================================================================
// РАЗМЕТКА
// =============================================================================
//
// В index.html переводимые узлы помечены data-i18n / data-i18n-title /
// data-i18n-aria. Dev-панель не помечена — она не переводится (см. L-01).

function applyHtmlI18n(root) {
    const scope = root || document;
    if (!scope || typeof scope.querySelectorAll !== 'function') return;

    for (const el of scope.querySelectorAll('[data-i18n]')) {
        el.textContent = t(el.getAttribute('data-i18n'));
    }
    for (const el of scope.querySelectorAll('[data-i18n-title]')) {
        el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    }
    for (const el of scope.querySelectorAll('[data-i18n-aria]')) {
        el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    }
}

function initI18n() {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = getLocale();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => applyHtmlI18n());
    } else {
        applyHtmlI18n();
    }
}

initI18n();

// Node (dev-скрипты docs/tools): словари и хелперы без DOM.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        LOCALES, DEFAULT_LOCALE, SUPPORTED_LOCALES,
        t, tp, shapeLabel, getLocale, getConstellationDisplayName
    };
}

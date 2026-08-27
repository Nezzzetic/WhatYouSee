// ui.js — UI rendering for the book (K-06), progression and atlas

// =============================================================================
// SCORE UI
// =============================================================================

/**
 * K-06: числового ✦-счётчика в игре больше нет — его роль забрала шкала света
 * у корешка книги (renderBookGauge, за lifetimeMetaEarned, а не за metaScore).
 * Саму отрисовку убирать некуда, но вызовы остаются: это по-прежнему точка,
 * которую держит зажим A-03 (`_scoreHoldCount`), пока летит монета награды.
 */
function updateScoreUI() {
    // A-03: пока к счётчику летит награда, зажим не даёт снять его раньше приезда.
    if (_scoreHoldCount > 0) return;
}

// =============================================================================
// A-03: ЗАЖИМ СЧЁТЧИКА ✦ И ПЕРЕЛЁТ НАГРАДЫ
// =============================================================================
//
// Зажим — счётчик, а не флаг, по двум причинам. Первая: к `updateScoreUI` ведут
// ДВА независимых пути — хвост `claimAchievementStep` и `updateProgressionUI`
// изнутри самого `awardMetaScore` (открытие страницы атласа, progression.js).
// Вторая: монет в воздухе бывает несколько, и число должно приехать после последней.
//
// ⚠ Главный риск всей задачи — застрявший зажим: несостоявшийся прилёт заморозил бы
// счётчик навсегда. Страховок три: release идемпотентен, таймер снимает зажим
// безусловно, и `visibilitychange` сбрасывает его в ноль при уходе вкладки в фон.

let _scoreHoldCount = 0;
let _scoreHoldTimer = null;

function holdScoreDisplay() {
    _scoreHoldCount++;
    if (_scoreHoldTimer) clearTimeout(_scoreHoldTimer);
    _scoreHoldTimer = setTimeout(() => releaseScoreDisplay(true),
        CLAIM_COIN_MS + CLAIM_COIN_SAFETY_MS);
}

/** @param {boolean} [all] — снять зажим целиком (страховка), а не одну монету. */
function releaseScoreDisplay(all) {
    if (_scoreHoldCount <= 0) return;
    _scoreHoldCount = all ? 0 : _scoreHoldCount - 1;
    if (_scoreHoldCount > 0) return;
    if (_scoreHoldTimer) {
        clearTimeout(_scoreHoldTimer);
        _scoreHoldTimer = null;
    }
    updateScoreUI();
    pulseScoreDisplay();
}

/** K-06: лента коротко вздрагивает — награда доехала именно сюда. */
function pulseScoreDisplay() {
    const el = document.querySelector('.ribbon-tail');
    if (!el) return;
    el.style.setProperty('--score-pulse-ms', `${CLAIM_SCORE_PULSE_MS}ms`);
    el.classList.remove('score-pulse');
    void el.offsetWidth; // reflow — иначе повторный пульс в серии не запустится
    el.classList.add('score-pulse');
    setTimeout(() => el.classList.remove('score-pulse'), CLAIM_SCORE_PULSE_MS);
}

function prefersReducedMotion() {
    try {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
        return false;
    }
}

/**
 * K-04: последний замер ленты-закладки. Пока книга открыта, ленты в разметке нет
 * (`display: none` — правило `.book-open-body .ribbon`), а лететь всё равно есть
 * куда: угол, в котором она лежит, никуда не делся. Тот же приём, которым K-05
 * держит резерв камеры, — последний ненулевой замер.
 */
let lastRibbonFlightRect = null;

/** Цель полёта награды: лента-закладка, а не счётчик в шапке. */
function getClaimFlightTargetRect() {
    const ribbon = document.getElementById('skyRibbon');
    if (ribbon) {
        const rect = ribbon.getBoundingClientRect();
        if (rect.width || rect.height) lastRibbonFlightRect = rect;
    }
    return lastRibbonFlightRect;
}

/**
 * «Монета» с наградой летит от кнопки забора к ленте-закладке — в книгу, на
 * корешок (K-04). Раньше целью был счётчик ✦ в шапке шторки; счётчика на небе
 * нет, и единственная цифра, которую небо показывает, уходит туда же, куда
 * ведёт единственный вход в книгу.
 *
 * @param {DOMRect|null} fromRect — прямоугольник кнопки, снятый ДО начисления:
 *        хвост забора зовёт `refreshBookIfOpen()`, и к моменту полёта самого
 *        узла кнопки уже не существует.
 * @param {number} amount — размер награды. Летит именно она; счётчик на прилёте
 *        покажет реальный `getMetaScore()`, который после списания за страницу
 *        атласа бывает и меньше прежнего.
 * @returns {boolean} — взят ли зажим счётчика (false → число обновляется сразу).
 */
function flyClaimReward(fromRect, amount) {
    const toRect = getClaimFlightTargetRect();
    if (!fromRect || !toRect || prefersReducedMotion()) return false;
    if (document.querySelectorAll('.claim-coin').length >= CLAIM_COIN_MAX) return false;

    // Нулевой прямоугольник даёт скрытый элемент (свёрнутая dev-панель, строка
    // цепочки с другой страницы Наград). Лететь из угла экрана хуже, чем не лететь.
    if (!fromRect.width && !fromRect.height) return false;

    const fromX = fromRect.left + fromRect.width / 2;
    const fromY = fromRect.top + fromRect.height / 2;

    const coin = document.createElement('div');
    coin.className = 'claim-coin';
    coin.style.left = `${fromX}px`;
    coin.style.top = `${fromY}px`;
    coin.style.setProperty('--claim-dx', `${toRect.left + toRect.width / 2 - fromX}px`);
    coin.style.setProperty('--claim-dy', `${toRect.top + toRect.height / 2 - fromY}px`);
    // Единственный источник длительности — константа: CSS её наследует, а уборка
    // узла считает от неё же, иначе анимация и `setTimeout` разъедутся.
    coin.style.setProperty('--claim-ms', `${CLAIM_COIN_MS}ms`);

    // Дуга без покадровки на JS: внешний узел едет по X линейно, средний —
    // по Y с ease-in. Сумма двух независимых осей и даёт параболу.
    const yAxis = document.createElement('div');
    yAxis.className = 'claim-coin-y';
    const pill = document.createElement('span');
    pill.className = 'claim-coin-pill';
    // Та же подпись, что на кнопке: она словно отрывается от неё и улетает.
    pill.textContent = `+${amount} ✦`;

    yAxis.appendChild(pill);
    coin.appendChild(yAxis);
    document.body.appendChild(coin);

    holdScoreDisplay();

    let done = false;
    const land = () => {
        if (done) return;
        done = true;
        if (coin.parentNode) coin.parentNode.removeChild(coin);
        releaseScoreDisplay();
    };
    // Как в `showInfoToast`: событие плюс страховочный таймер — `animationend`
    // не приходит, если узел снесли или вкладка ушла в фон.
    coin.addEventListener('animationend', (e) => { if (e.target === coin) land(); });
    setTimeout(land, CLAIM_COIN_MS + CLAIM_COIN_SAFETY_MS);
    return true;
}

// Вкладка ушла в фон — анимации замирают, `animationend` может не прийти вовсе.
// Счётчик оттаивает сразу: показать актуальное число важнее, чем долететь.
if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) releaseScoreDisplay(true);
    });
}

function updateMetaPageProgressUI() {
    /* progress to atlas pages shown only inside atlas overlay */
}

function updateFieldGoalsUI() {
    /* legacy — field goals disabled */
}

function renderFieldGoalClaimButtons() {
    /* legacy — field goals disabled */
}

// =============================================================================
// PROGRESSION UI
// =============================================================================

function updateProgressionUI() {
    updateScoreUI();
    updateRibbonSignal();
}

// V-13: showLevelCompleteToast() удалена вместе с узлом, стилем и ключом
// `toast.levelComplete`. Тост висел ровно в центре кадра — там, куда приезжает
// камера финала ночи, — а сообщать факт завершения теперь сама сцена. Если на
// устройстве окажется, что факт всё-таки нужно проговорить, дешёвый откат —
// вернуть вызов ПОСЛЕ конца сцены, а не в её начале.

// =============================================================================
// НАЗВАНИЯ И ЦВЕТА ФИГУР
// =============================================================================

/**
 * L-01: на вход идёт ID фигуры или fallback-имени, на выход — локализованное имя.
 * Пользовательские виды (их вводит игрок) shapeLabel возвращает как есть.
 */
function getDisplayShapeName(shapeName) {
    if (typeof shapeName !== 'string') return t('atlas.unknownConstellation');
    const trimmed = shapeName.trim();
    if (trimmed.length === 0) return t('atlas.unknownConstellation');
    return shapeLabel(trimmed);
}

function getShapeColor(shapeName) {
    const shapeInfo = SHAPES[shapeName] || SHAPES[SHAPE_UNRECOGNIZED];
    return shapeInfo && Array.isArray(shapeInfo.color) ? shapeInfo.color : SHAPES[SHAPE_UNRECOGNIZED].color;
}

function onConstellationCreated(shapeName) {
    if (!shapeName) return;
    updateRibbonSignal();
    refreshBookIfOpen();
}

// =============================================================================
// K-02: ДВА РЕГИСТРА — гравёрные знаки и созвездные глифы
// =============================================================================
//
// Регистр первый — знак: действие, раздел, тема штампа. Восемнадцать штук,
// спрайт лежит в index.html, своего цвета у знака нет.
// Регистр второй — глиф: форма конкретной фигуры, точки и линии из
// SHAPE_PATTERNS. Глиф — это чертёж, только маленький, поэтому он всегда честен.
//
// Правило двух регистров: знак и глиф НЕ встречаются в одной строке, и знак
// НИКОГДА не обозначает конкретную фигуру. Строка либо про путь игрока,
// либо про фигуру.

/** Все восемнадцать имён кассы — чтобы опечатка в имени падала, а не молчала. */
const GLYPH_SIGNS = [
    'undo', 'knife', 'press', 'ribbon', 'tel', 'crescent', 'nightstar', 'spark',
    'gem', 'pillar', 'comet', 'loz', 'link', 'hand', 'pen', 'leaf', 'corona', 'arc'
];

/**
 * Знак из кассы как DOM-узел. `size` — сторона в px; ниже 17 штрих тоньше
 * (1.1 против 1.4 — правило концепта). Корона шире прочих: у неё свой viewBox.
 */
function glyphSign(name, size = 24, className = '') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    if (!GLYPH_SIGNS.includes(name)) {
        console.error('K-02: знака «' + name + '» в кассе нет');
        name = 'arc';
    }
    const wide = name === 'corona';
    svg.setAttribute('class', 'ic' + (size <= 16 ? ' ic-sm' : '') + (className ? ' ' + className : ''));
    svg.setAttribute('width', wide ? Math.round(size * 26 / 16) : size);
    svg.setAttribute('height', wide ? Math.round(size * 16 / 16) : size);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
}

/**
 * Книжные кегли глифа. Ниже строки не опускаемся: на 12 px точки сливаются
 * с линиями и фигура перестаёт быть узнаваемой (риск 3 в доке K-02).
 */
const GLYPH_SIZES = { row: 16, card: 30, spread: 76 };

/**
 * Глиф фигуры на канвасе. Размер канваса задаёт вызывающий; отступ, толщина
 * штриха и радиус точки едут за ним, но не ужимаются ниже читаемого предела —
 * иначе разворот и строка расходятся не масштабом, а видом.
 */
function drawShapeGlyph(canvas, pattern, color) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const side = Math.min(w, h);
    // Всё, что ниже — доли от стороны с полом: на строке (16 px) пол и работает.
    const pad = Math.max(2, side * 0.105);
    const dot = Math.max(1.4, side * 0.033);
    const halo = Math.max(2.6, side * 0.066);
    const iw = w - pad * 2;
    const ih = h - pad * 2;

    ctx.clearRect(0, 0, w, h);

    const pts = pattern.stars.map(([nx, ny]) => [pad + nx * iw, pad + ny * ih]);

    ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},0.7)`;
    ctx.lineWidth = Math.max(1, side * 0.02);
    ctx.lineCap = 'round';
    for (const [a, b] of pattern.lines) {
        ctx.beginPath();
        ctx.moveTo(pts[a][0], pts[a][1]);
        ctx.lineTo(pts[b][0], pts[b][1]);
        ctx.stroke();
    }

    for (const [px, py] of pts) {
        ctx.beginPath();
        ctx.arc(px, py, dot, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, halo, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},0.15)`;
        ctx.fill();
    }
}

/**
 * Глиф фигуры готовым узлом: канвас нужного кегля с уже нарисованной формой.
 * `size` — имя книжного кегля ('row' | 'card' | 'spread') или число px.
 */
function shapeGlyphNode(shapeId, size = 'row', color = INK_MUTED_RGB) {
    const px = typeof size === 'number' ? size : (GLYPH_SIZES[size] || GLYPH_SIZES.row);
    const canvas = document.createElement('canvas');
    canvas.className = 'shape-glyph';
    canvas.width = px;
    canvas.height = px;
    const pattern = (typeof SHAPE_PATTERNS !== 'undefined' && SHAPE_PATTERNS[shapeId]) || null;
    if (pattern) drawShapeGlyph(canvas, pattern, color);
    return canvas;
}

/** Совместимость: прежнее имя рисовалки подсказок. */
function drawHintPattern(canvas, pattern, color) {
    drawShapeGlyph(canvas, pattern, color);
}

// =============================================================================
// ATLAS DATA
// =============================================================================

function getFallbackPatternFromSignature(signature) {
    const starCount = Math.max(3, Math.min(6, signature?.starCount || 4));
    const lineCount = Math.max(2, signature?.lineCount || (starCount - 1));

    const stars = [];
    for (let i = 0; i < starCount; i++) {
        const angle = (-Math.PI / 2) + (2 * Math.PI * i / starCount);
        stars.push([
            0.5 + Math.cos(angle) * 0.35,
            0.5 + Math.sin(angle) * 0.35
        ]);
    }

    const lines = [];
    const closedEdges = lineCount >= starCount;
    const maxEdges = closedEdges ? starCount : Math.min(lineCount, starCount - 1);
    for (let i = 0; i < maxEdges; i++) {
        const a = i;
        const b = (i + 1) % starCount;
        lines.push([a, b]);
    }

    return { stars, lines };
}

function getCustomPattern(customType) {
    if (customType && customType.patternSnapshot &&
        Array.isArray(customType.patternSnapshot.stars) &&
        Array.isArray(customType.patternSnapshot.lines)) {
        return customType.patternSnapshot;
    }
    return getFallbackPatternFromSignature(customType?.signature);
}

function getShapeXP(shapeName) {
    return SHAPE_XP[shapeName] !== undefined ? SHAPE_XP[shapeName] : CUSTOM_TYPE_XP;
}

function getAtlasEntryForShape(name) {
    const pattern = SHAPE_PATTERNS[name];
    const created = isShapeCreated(name);
    return {
        name,
        color: getShapeColor(name),
        pattern,
        starCount: pattern?.stars?.length || 0,
        isCustom: false,
        isCreated: created,
        atlasState: created ? 'known' : 'unknown'
    };
}

function getAtlasPageEntries(pageIndex) {
    if (pageIndex < 0 || pageIndex >= ATLAS_PAGE_COUNT) return [];
    return ATLAS_PAGES[pageIndex].map(name => getAtlasEntryForShape(name));
}

/** U-09: цвет карточки — золото у огранённой фигуры, иначе цвет из SHAPES. */
const ATLAS_FACETED_COLOR = [255, 211, 92];

/**
 * K-11: разворот-определитель — карточка `???` больше не существует.
 * Неразгаданная фигура рисуется тем же глифом, что и разгаданная (просто
 * бледнее целиком через `.atlas-card-unknown`), и подписывается «not yet
 * traced» вместо имени — имя остаётся сюрпризом до первого создания.
 */
function createAtlasEntryCard(entry) {
    const faceted = entry.isCreated && typeof isShapeFaceted === 'function' && isShapeFaceted(entry.name);
    const drawColor = faceted ? ATLAS_FACETED_COLOR : entry.color;
    const bookmarked = typeof getBookmarkedShape === 'function' && getBookmarkedShape() === entry.name;

    const card = document.createElement('div');
    card.className = 'atlas-card'
        + (entry.isCreated ? ' atlas-card-known' : ' atlas-card-unknown')
        + (faceted ? ' atlas-card-faceted' : '');

    if (faceted) {
        const crown = glyphSign('corona', 16, 'atlas-card-crown');
        card.appendChild(crown);
    }

    // Булавка-закладка: разрешена и на уже найденной фигуре — строить её
    // снова ради огранки законно (риск 1/2 дока K-11: спойлер принят).
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'atlas-pin' + (bookmarked ? ' atlas-pin-on' : '');
    pin.dataset.shapeId = entry.name;
    pin.setAttribute('aria-pressed', String(bookmarked));
    pin.setAttribute('aria-label', t(bookmarked ? 'atlas.pinOff' : 'atlas.pinOn'));
    pin.appendChild(document.createElement('i'));
    pin.addEventListener('click', (event) => {
        event.stopPropagation();
        if (typeof toggleShapeBookmark === 'function') toggleShapeBookmark(entry.name);
        renderAtlasList();
        if (typeof renderSkyBookmark === 'function') renderSkyBookmark();
    });
    card.appendChild(pin);

    const canvas = document.createElement('canvas');
    canvas.className = 'atlas-card-canvas';
    canvas.width = 76;
    canvas.height = 76;
    card.appendChild(canvas);

    const title = document.createElement('div');
    if (entry.isCreated) {
        title.className = 'atlas-card-title';
        title.textContent = getDisplayShapeName(entry.name);
        title.style.color = `rgb(${drawColor[0]},${drawColor[1]},${drawColor[2]})`;
    } else {
        // Имя фигуры — сюрприз до первого создания; чертёж и число звёзд — нет.
        title.className = 'atlas-card-title atlas-card-title-unknown';
        title.textContent = t('atlas.notYetTraced');
    }
    card.appendChild(title);

    if (entry.isCreated) {
        // U-09: 5 граней. Ни цифр, ни кнопок — грань просто горит или нет.
        const facets = document.createElement('div');
        facets.className = 'atlas-facets';
        for (const color of ACHIEVEMENT_COLOR_KEYS) {
            const lit = typeof isShapeFacetLit === 'function' && isShapeFacetLit(entry.name, color);
            const gem = document.createElement('span');
            gem.className = `atlas-facet atlas-facet-${color}` + (lit ? ' atlas-facet-lit' : '');
            gem.title = achievementColorLabel(color);
            facets.appendChild(gem);
        }
        card.appendChild(facets);
    } else {
        const note = document.createElement('div');
        note.className = 'atlas-card-note';
        note.textContent = tp('atlas.notYetTracedStars', entry.starCount);
        card.appendChild(note);
    }

    if (entry.pattern) drawHintPattern(canvas, entry.pattern, drawColor);

    return card;
}

function renderAtlasList() {
    const list = document.getElementById('atlasList');
    if (!list) return;
    list.innerHTML = '';

    const pageIndex = getBookPageIndex('atlas');

    if (!isAtlasPageUnlocked(pageIndex)) {
        // Страницы открываются автоматически при накоплении ✦
        const locked = document.createElement('div');
        locked.className = 'atlas-page-locked';
        const cost = getAtlasPageUnlockCost(pageIndex);

        const lockedText = document.createElement('p');
        lockedText.textContent = t('atlas.pageLocked', { n: cost });
        locked.appendChild(lockedText);

        const progressText = document.createElement('p');
        progressText.className = 'atlas-page-locked-progress';
        progressText.textContent = t('atlas.pageLockedProgress', {
            current: Math.min(getMetaScore(), cost),
            target: cost
        });
        locked.appendChild(progressText);

        list.appendChild(locked);
        return;
    }

    for (const entry of getAtlasPageEntries(pageIndex)) {
        list.appendChild(createAtlasEntryCard(entry));
    }
}

// =============================================================================
// K-06: КНИГА — общий каркас (пять высечек, шкала света у корешка)
// =============================================================================
//
// Шторка U-09 (85vh, рельс страниц, сегмент Atlas/Rewards/Observatory) стала
// полноэкранной книгой. Навигация плоская: любая высечка из любой, без
// промежуточных разделов. Под-страницы атласа (7 глав) и наград (4 главы —
// «Сутки» переехали на «Сегодня», см. ниже) листаются пейджер-кнопками, а не
// свайпом: горизонтальных свайпов страниц (SHEET_SWIPE_MIN_PX и компания)
// K-06 убрал совсем.

const BOOK_CUT_LIST = ['today', 'index', 'atlas', 'stamps', 'exlibris'];

let bookCut = 'today';
let bookOpen = false;
// U-10/M-05: «Сутки» (REWARD_PAGES[0]) — на «Сегодня», а не в Штампах, поэтому
// bookPageIndices.rewards ходит по [1, REWARD_PAGE_COUNT - 1].
let bookPageIndices = { atlas: 0, rewards: 1 };
let bookHandlersBound = false;

function getBookPageCount(section) {
    if (section === 'rewards') return REWARD_PAGE_COUNT - 1;
    return ATLAS_PAGE_COUNT;
}

function getBookPageIndex(section) {
    if (section === 'rewards') {
        return Math.max(1, Math.min(REWARD_PAGE_COUNT - 1, bookPageIndices.rewards || 1));
    }
    return Math.max(0, Math.min(ATLAS_PAGE_COUNT - 1, bookPageIndices.atlas || 0));
}

function setBookPageIndex(section, index) {
    if (section === 'rewards') {
        bookPageIndices.rewards = Math.max(1, Math.min(REWARD_PAGE_COUNT - 1, index));
        return;
    }
    bookPageIndices.atlas = Math.max(0, Math.min(ATLAS_PAGE_COUNT - 1, index));
}

function isBookOpen() {
    return bookOpen;
}

/**
 * K-10: модель нумерации страниц — единая формула, общая для шапки книги и
 * оглавления. Считается детерминированно от состава глав, в сейве не живёт.
 */
function getAtlasChapterFolio(idx) {
    return 3 + idx;
}

function getStampsChapterFolio(idx) {
    return 3 + ATLAS_PAGE_COUNT + (idx - 1);
}

function getExLibrisFolio() {
    return 3 + ATLAS_PAGE_COUNT + (REWARD_PAGE_COUNT - 1);
}

/** Шапка страницы: над-заголовок, титул, колонцифра — синтетическая, но сквозная. */
function renderBookHead() {
    const eyebrowEl = document.getElementById('bookEyebrow');
    const titleEl = document.getElementById('bookTitle');
    const folioEl = document.getElementById('bookFolio');
    if (!eyebrowEl || !titleEl || !folioEl) return;

    let eyebrow = '';
    let title = '';
    let folioN = 1;

    if (bookCut === 'today') {
        // K-09: «Night 213 · August 23» — номер ночи (текущая, ещё не завершённая)
        // и дата эффективных суток; титул страницы остаётся «Tonight».
        const nightNo = (achievementCounters ? achievementCounters.levelsCompleted : 0) + 1;
        const dateStr = typeof getEffectiveSkyDateInt === 'function' && typeof formatSkyDateLong === 'function'
            ? formatSkyDateLong(getEffectiveSkyDateInt())
            : '';
        eyebrow = t('book.eyebrowToday', { n: nightNo, date: dateStr });
        title = t('book.headToday');
        folioN = 1;
    } else if (bookCut === 'index') {
        title = t('book.headIndex');
        folioN = 2;
    } else if (bookCut === 'atlas') {
        // K-11: заголовок страницы стал литературным названием главы;
        // «Chapter N of M» уехало в надзаголовок.
        const idx = getBookPageIndex('atlas');
        eyebrow = t('book.eyebrowAtlasChapter', { n: idx + 1, count: ATLAS_PAGE_COUNT });
        title = t('atlas.chapterTitle' + idx);
        folioN = getAtlasChapterFolio(idx);
    } else if (bookCut === 'stamps') {
        // K-12: то же «Chapter N of M», что у атласа — главы штампов теперь
        // такая же нумерованная последовательность, а не плоский список тем.
        const idx = getBookPageIndex('rewards');
        const page = REWARD_PAGES[idx];
        eyebrow = t('book.eyebrowStampsChapter', { n: idx, count: REWARD_PAGE_COUNT - 1 });
        title = page ? page.title : '';
        folioN = getStampsChapterFolio(idx);
    } else if (bookCut === 'exlibris') {
        title = t('book.headExLibris');
        folioN = getExLibrisFolio();
    }

    eyebrowEl.textContent = eyebrow;
    titleEl.textContent = title;
    folioEl.textContent = t('book.folio', { n: folioN });
}

/**
 * Шкала света у корешка (риск 3 дока K-06): окно из двух засечек-сотен вокруг
 * `lifetimeMetaEarned` — пройденная сотня и ближайшая, а не вся дорога.
 * Нож у засечки (глава режется здесь) в шкалу пока не идёт: порог такой главы
 * в игре не существует (страницы атласа открываются по своим неровным ценам,
 * не по сотням) — решение остаётся за K-10/K-15, когда появится сама механика.
 */
function renderBookGauge() {
    const el = document.getElementById('bookGauge');
    if (!el) return;
    el.innerHTML = '';

    const earned = typeof getLifetimeMetaEarned === 'function' ? getLifetimeMetaEarned() : 0;
    const floor = Math.floor(earned / BOOK_GAUGE_WINDOW) * BOOK_GAUGE_WINDOW;
    const ceil = floor + BOOK_GAUGE_WINDOW;
    const ratio = (earned - floor) / BOOK_GAUGE_WINDOW;

    const fill = document.createElement('div');
    fill.className = 'book-gauge-fill';
    fill.style.height = `${Math.round(ratio * 100)}%`;
    el.appendChild(fill);

    const topTick = document.createElement('div');
    topTick.className = 'book-gauge-tick book-gauge-tick-top';
    topTick.textContent = String(ceil);
    el.appendChild(topTick);

    const bottomTick = document.createElement('div');
    bottomTick.className = 'book-gauge-tick book-gauge-tick-bottom';
    bottomTick.textContent = String(floor);
    el.appendChild(bottomTick);

    const flag = document.createElement('div');
    flag.className = 'book-gauge-flag';
    flag.style.bottom = `${Math.round(ratio * 100)}%`;
    flag.textContent = String(earned);
    el.appendChild(flag);
}

/**
 * Штампы, кроме суточных — те живут на «Сегодня» и точку высечки не зажигают.
 * K-12: неразрезанная глава в счёт не идёт — до неё нельзя долистать и нечего
 * прижать, капля сургуча звала бы туда, куда сама книга ещё не пускает.
 */
function stampsHaveClaimable() {
    if (typeof rewardPageHasClaimable !== 'function') return false;
    for (let i = 1; i < REWARD_PAGE_COUNT; i++) {
        if (!isRewardPageUnlocked(i)) continue;
        if (rewardPageHasClaimable(i)) return true;
    }
    return false;
}

/** Пять высечек: подсветка активной и капля сургуча на Штампах (концепт, Табл. III-VI). */
function renderBookTabs() {
    document.querySelectorAll('.book-tab').forEach(btn => {
        btn.classList.toggle('book-tab-on', btn.dataset.cut === bookCut);
    });
    const wax = document.getElementById('bookTabStampsWax');
    if (wax) wax.hidden = !stampsHaveClaimable();
}

/** «Сегодня»: ежедневка — то же достижение на две ступени, что и штампы (REWARD_PAGES[0]). */
function renderBookToday() {
    const list = document.getElementById('bookTodayList');
    if (list) {
        list.innerHTML = '';
        for (const chain of getRewardPageChains(0)) {
            list.appendChild(createAchievementRow(chain));
        }
    }
    renderBookTodayNews();
}

/**
 * K-09: события мира обычной строкой — единственное место, где игра рассказывает
 * новости. Список ведётся за текущую ночь (`achievementCounters.daily.newsLog`)
 * и переписывается наутро вместе с сутками; до первого события список пуст —
 * это нормальная пустая ночь, не сломанная вёрстка (риск 3 дока).
 */
function renderBookTodayNews() {
    const el = document.getElementById('bookTodayNews');
    if (!el) return;
    el.innerHTML = '';
    const daily = (achievementCounters && achievementCounters.daily) || null;
    const log = daily && Array.isArray(daily.newsLog) ? daily.newsLog : [];
    for (const entry of log) {
        const row = document.createElement('div');
        row.className = 'book-news-row';
        row.textContent = t(entry.key, entry.params);
        el.appendChild(row);
    }
}

/**
 * «Оглавление»: временный плоский список вместо разворота-определителя (K-10).
 * Строка тапабельна — прыгает сразу на нужную главу, это и есть «объём решают
 * главы, а не длина свитка» из концепта.
 */
/**
 * K-10: строка главы — имя с линейкой из точек (как в сцепке K-08), счёт и
 * колонцифра. Неразрезанная глава несёт знак ножа и порог в ✦ вместо счёта и
 * колонцифры (страница недостижима постранично, но пейджер её уже показывает
 * заглушкой `atlas.pageLocked` — сюда ведёт тот же тап). Сургучная точка —
 * только там, где есть настоящее «взять» (Штампы); у атласа нет кнопки забора,
 * поэтому просто вести не при чём.
 */
function createBookIndexRow(title, folioN, countText, opts) {
    const o = opts || {};
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'book-index-row';

    if (o.locked) {
        const icon = document.createElement('span');
        icon.className = 'book-index-row-icon achv-row-icon-uncut';
        icon.appendChild(glyphSign('knife', 16));
        row.appendChild(icon);
    }

    const head = document.createElement('span');
    head.className = 'book-index-row-head';

    if (o.wax) {
        const wax = document.createElement('span');
        wax.className = 'book-index-row-wax';
        head.appendChild(wax);
    }

    const label = document.createElement('span');
    label.className = 'book-index-row-title';
    label.textContent = title;
    head.appendChild(label);

    const dots = document.createElement('span');
    dots.className = 'book-index-row-dots';
    head.appendChild(dots);

    const count = document.createElement('span');
    count.className = 'book-index-row-status';
    count.textContent = countText;
    head.appendChild(count);

    row.appendChild(head);

    if (folioN !== null) {
        const folio = document.createElement('span');
        folio.className = 'book-index-row-folio';
        folio.textContent = t('book.folio', { n: folioN });
        row.appendChild(folio);
    }

    return row;
}

function renderBookIndex() {
    const el = document.getElementById('bookIndex');
    if (!el) return;
    el.innerHTML = '';

    const atlasSec = document.createElement('div');
    atlasSec.className = 'book-index-sec';
    const atlasTitle = document.createElement('div');
    atlasTitle.className = 'book-index-sec-title';
    atlasTitle.textContent = t('book.cutAtlas');
    atlasSec.appendChild(atlasTitle);
    for (let i = 0; i < ATLAS_PAGE_COUNT; i++) {
        const name = t('book.headAtlas', { n: i + 1, count: ATLAS_PAGE_COUNT });
        const unlocked = isAtlasPageUnlocked(i);
        const row = unlocked
            ? createBookIndexRow(
                name,
                getAtlasChapterFolio(i),
                `${ATLAS_PAGES[i].filter(isShapeCreated).length} / ${ATLAS_PAGES[i].length}`
            )
            : createBookIndexRow(
                name,
                null,
                t('book.indexLocked', { n: getAtlasPageUnlockCost(i) }),
                { locked: true }
            );
        row.addEventListener('click', () => {
            setBookPageIndex('atlas', i);
            switchBookCut('atlas');
        });
        atlasSec.appendChild(row);
    }
    el.appendChild(atlasSec);

    const stampsSec = document.createElement('div');
    stampsSec.className = 'book-index-sec';
    const stampsTitle = document.createElement('div');
    stampsTitle.className = 'book-index-sec-title';
    stampsTitle.textContent = t('book.cutStamps');
    stampsSec.appendChild(stampsTitle);
    for (let i = 1; i < REWARD_PAGE_COUNT; i++) {
        const page = REWARD_PAGES[i];
        const unlocked = isRewardPageUnlocked(i);

        let row;
        if (unlocked) {
            const chains = getRewardPageChains(i);
            const done = chains.filter(chain => {
                const p = achievementProgress[chain.id];
                return p && p.stepIndex >= chain.steps.length;
            }).length;
            row = createBookIndexRow(
                page.title,
                getStampsChapterFolio(i),
                `${done} / ${chains.length}`,
                { wax: rewardPageHasClaimable(i) }
            );
        } else {
            row = createBookIndexRow(
                page.title,
                null,
                t('book.indexLocked', { n: getRewardPageUnlockCost(i) }),
                { locked: true }
            );
        }
        row.addEventListener('click', () => {
            setBookPageIndex('rewards', i);
            switchBookCut('stamps');
        });
        stampsSec.appendChild(row);
    }
    el.appendChild(stampsSec);

    const exSec = document.createElement('div');
    exSec.className = 'book-index-sec';
    const exUnlocked = typeof isObservatoryUnlocked === 'function' && isObservatoryUnlocked();
    const exRow = createBookIndexRow(
        t('book.cutExLibris'),
        getExLibrisFolio(),
        exUnlocked ? '☾' : t('book.indexUncut')
    );
    exRow.addEventListener('click', () => switchBookCut('exlibris'));
    exSec.appendChild(exRow);
    el.appendChild(exSec);
}

/** Пейджер атласа: пока без свайпа — рельс страниц U-09 убран целиком. */
function renderBookAtlasPager() {
    const idx = getBookPageIndex('atlas');
    const label = document.getElementById('atlasPagerLabel');
    if (label) label.textContent = `${idx + 1} / ${ATLAS_PAGE_COUNT}`;
    const prevBtn = document.querySelector('#atlasPager .book-pager-btn[data-dir="-1"]');
    const nextBtn = document.querySelector('#atlasPager .book-pager-btn[data-dir="1"]');
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx >= ATLAS_PAGE_COUNT - 1;
}

function renderBookStampsPager() {
    const idx = getBookPageIndex('rewards');
    const label = document.getElementById('stampsPagerLabel');
    if (label) label.textContent = `${idx} / ${REWARD_PAGE_COUNT - 1}`;
    const prevBtn = document.querySelector('#stampsPager .book-pager-btn[data-dir="-1"]');
    const nextBtn = document.querySelector('#stampsPager .book-pager-btn[data-dir="1"]');
    if (prevBtn) prevBtn.disabled = idx <= 1;
    if (nextBtn) nextBtn.disabled = idx >= REWARD_PAGE_COUNT - 1;
}

function stepBookPage(delta) {
    if (bookCut === 'atlas') {
        const idx = getBookPageIndex('atlas') + delta;
        if (idx < 0 || idx >= ATLAS_PAGE_COUNT) return false;
        setBookPageIndex('atlas', idx);
        renderBook();
        return true;
    }
    if (bookCut === 'stamps') {
        const idx = getBookPageIndex('rewards') + delta;
        if (idx < 1 || idx >= REWARD_PAGE_COUNT) return false;
        setBookPageIndex('rewards', idx);
        renderBook();
        return true;
    }
    return false;
}

// =============================================================================
// B-02/K-13: ОБСЕРВАТОРИЯ В КНИГЕ — страница «Ex Libris»
// =============================================================================
//
// K-13: страница и обсерватория — одно состояние, отдельного входа/выхода
// больше нет. Открыл высечку «Ex Libris» (и обсерватория уже разряжена) —
// холст ожил прямо в рамке страницы; ушёл на другую высечку или закрыл книгу —
// вернулся на поле. Синхронизирует это syncExLibrisAppMode().

function renderBookExLibris() {
    const unlocked = typeof isObservatoryUnlocked === 'function' && isObservatoryUnlocked();
    const lockedEl = document.getElementById('exLibrisLocked');
    const plateEl = document.getElementById('exLibrisPlate');
    if (lockedEl) lockedEl.hidden = unlocked;
    if (plateEl) plateEl.hidden = !unlocked;

    if (!unlocked) {
        const current = typeof getLifetimeMetaEarned === 'function' ? getLifetimeMetaEarned() : 0;
        const target = OBSERVATORY_UNLOCK_COST;
        const titleEl = document.getElementById('exLibrisLockTitle');
        const subEl = document.getElementById('exLibrisLockSub');
        const fillEl = document.getElementById('exLibrisLockBarFill');
        const progressEl = document.getElementById('exLibrisLockProgress');
        if (titleEl) titleEl.textContent = t('observatory.lockedTitle');
        if (subEl) subEl.textContent = t('observatory.lockedSub');
        if (fillEl) {
            const ratio = target > 0 ? Math.max(0, Math.min(1, current / target)) : 0;
            fillEl.style.width = (ratio * 100).toFixed(1) + '%';
        }
        if (progressEl) progressEl.textContent = t('observatory.lockedProgress', { current, target });
        return;
    }

    renderExLibrisCaption();
}

/**
 * K-13: «когда лист начат и сколько на нём групп», курсивом под оттиском —
 * ровно так подписывали таблицы в старых атласах. Ночь — та, в которую холст
 * получил первую звезду (getObservatoryBeganNight, observatory.js); групп —
 * столько, сколько подписанных созвездий держит сам холст (U-12).
 */
function renderExLibrisCaption() {
    const el = document.getElementById('exLibrisCaptionSub');
    if (!el) return;
    const night = (typeof getObservatoryBeganNight === 'function' && getObservatoryBeganNight())
        || (achievementCounters ? achievementCounters.levelsCompleted : 0) + 1;
    const groups = typeof observatoryNames !== 'undefined' ? observatoryNames.length : 0;
    el.textContent = tp('observatory.beganCaption', groups, { night });
}

/**
 * K-13: держит appMode в паре с высечкой «Ex Libris» — единственное место,
 * где что-то решает, быть ли сейчас обсерватории. Вызывается после каждого
 * изменения состояния книги (открыть/закрыть/переключить высечку).
 */
function syncExLibrisAppMode() {
    const shouldBeObservatory = bookOpen && bookCut === 'exlibris'
        && typeof isObservatoryUnlocked === 'function' && isObservatoryUnlocked();
    const inObservatory = typeof isObservatoryMode === 'function' && isObservatoryMode();
    if (shouldBeObservatory !== inObservatory) {
        // setAppMode() сам зовёт updateObservatoryUI() → updateExLibrisEmbedding()
        setAppMode(shouldBeObservatory ? 'observatory' : 'field');
    } else if (typeof updateExLibrisEmbedding === 'function') {
        // Режим не поменялся, но резервированный прямоугольник мог протухнуть
        // (resize, смена высечки туда-обратно) — освежаем его на всякий случай.
        updateExLibrisEmbedding();
    }
}

/** Тумблер «соединять»/«двигать»; красить — тапом в «двигать» (без смены). */
function updateObservatoryUI() {
    const inObservatory = typeof isObservatoryMode === 'function' && isObservatoryMode();

    const seg = document.getElementById('observatoryModeSeg');
    if (seg) seg.hidden = !inObservatory;

    if (inObservatory) {
        const mode = typeof getObservatoryMode === 'function' ? getObservatoryMode() : 'connect';
        const connectBtn = document.getElementById('obsModeConnectBtn');
        const moveBtn = document.getElementById('obsModeMoveBtn');
        // Активное положение подсвечено всегда: в «перемещать» тап красит звезду,
        // а в «соединять» нет, и перепутать это дорого.
        if (connectBtn) connectBtn.classList.toggle('seg-btn-on', mode === 'connect');
        if (moveBtn) moveBtn.classList.toggle('seg-btn-on', mode === 'move');
    }

    if (bookOpen && bookCut === 'exlibris') renderBookExLibris();

    // K-11: обсерватория — не то небо, для которого закладывают фигуру.
    renderSkyBookmark();

    if (typeof updateExLibrisEmbedding === 'function') updateExLibrisEmbedding();
}

// =============================================================================
// K-06: РЕНДЕР И ОТКРЫТИЕ/ЗАКРЫТИЕ КНИГИ
// =============================================================================

function renderBook() {
    const sections = {
        today: document.getElementById('bookToday'),
        index: document.getElementById('bookIndex'),
        atlas: document.getElementById('bookAtlasSection'),
        stamps: document.getElementById('bookStampsSection'),
        exlibris: document.getElementById('bookExLibris')
    };
    for (const cut in sections) {
        if (sections[cut]) sections[cut].hidden = cut !== bookCut;
    }

    recomputeAchievementsClaimable();

    if (bookCut === 'today') {
        renderBookToday();
    } else if (bookCut === 'index') {
        renderBookIndex();
    } else if (bookCut === 'atlas') {
        renderAtlasList();
        renderBookAtlasPager();
    } else if (bookCut === 'stamps') {
        renderAchievementsList();
        renderBookStampsPager();
    } else if (bookCut === 'exlibris') {
        renderBookExLibris();
    }

    renderBookHead();
    renderBookGauge();
    renderBookTabs();
    updateScoreUI();
    updateRibbonSignal();

    const body = document.getElementById('bookBody');
    if (body) body.scrollTop = 0;
}

function refreshBookIfOpen() {
    if (bookOpen) renderBook();
}

function openBook(cut) {
    if (BOOK_CUT_LIST.includes(cut)) bookCut = cut;
    bookOpen = true;
    const book = document.getElementById('book');
    if (book) book.hidden = false;
    if (document.body) document.body.classList.add('book-open-body');
    renderBook();
    syncExLibrisAppMode();
}

function closeBook() {
    if (!bookOpen) return;
    bookOpen = false;
    const book = document.getElementById('book');
    if (book) {
        book.style.transform = '';
        book.hidden = true;
    }
    if (document.body) document.body.classList.remove('book-open-body');
    syncExLibrisAppMode();
}

function switchBookCut(cut) {
    if (!BOOK_CUT_LIST.includes(cut) || bookCut === cut) return;
    bookCut = cut;
    renderBook();
    syncExLibrisAppMode();
}

/**
 * K-05: единственный сигнал на небе. Один предикат на всю игру — сюда
 * [K-15](wax-signals) добавит события мира; сегодня событий, случающихся без
 * игрока, у неё нет, и условие равно прежнему условию бейджа.
 */
function hasSkyWaxSignal() {
    return typeof hasClaimableAchievements === 'function' && hasClaimableAchievements();
}

/** Капля сургуча на ленте-закладке: есть что прижать. Ни числа, ни цвета тревоги. */
function updateRibbonSignal() {
    // K-04: заодно освежаем замер ленты — пока небо на экране, она измерима,
    // а к моменту полёта награды книга уже открыта и прячет её.
    getClaimFlightTargetRect();
    const wax = document.getElementById('ribbonWax');
    if (wax) wax.hidden = !hasSkyWaxSignal();
    renderSkyBookmark();
}

/**
 * K-11: чертёж закладки-цели в верхнем левом углу неба — DOM-узел, как лента
 * (см. «Согласованный план» дока), не мировой объект на канвасе: ему незачем
 * ходить за зумом и паном, он стоит на месте экрана. Прячется, если закладки
 * нет, книга открыта (CSS-правило `.book-open-body .sky-bookmark`) или игрок
 * в обсерватории — там это не его небо.
 */
function renderSkyBookmark() {
    const el = document.getElementById('skyBookmark');
    if (!el) return;
    const shapeId = typeof getBookmarkedShape === 'function' ? getBookmarkedShape() : null;
    const inObservatory = typeof isObservatoryMode === 'function' && isObservatoryMode();
    el.hidden = !shapeId || inObservatory;
    if (!shapeId) return;

    const nameEl = document.getElementById('skyBookmarkName');
    if (nameEl) nameEl.textContent = getDisplayShapeName(shapeId);

    const canvas = document.getElementById('skyBookmarkCanvas');
    const pattern = typeof SHAPE_PATTERNS !== 'undefined' ? SHAPE_PATTERNS[shapeId] : null;
    if (canvas && pattern) drawShapeGlyph(canvas, pattern, getShapeColor(shapeId));
}

// =============================================================================
// K-06: ЖЕСТЫ КНИГИ
// =============================================================================

/** Единая точка координат: работает и для мыши, и для пальца. */
function getGesturePoint(event) {
    if (event.touches && event.touches.length) return event.touches[0];
    if (event.changedTouches && event.changedTouches.length) return event.changedTouches[0];
    if (typeof event.clientX === 'number') return event;
    return null;
}

function isMultiTouch(event) {
    return !!(event.touches && event.touches.length > 1);
}

/**
 * Единственный жест книги — потягивание вниз закрывает её с любой страницы
 * (риск 4 дока K-06: возврат на небо обязан быть таким же дешёвым, как вход).
 * Тянут вниз в самом верху прокрутки страницы — закрытие; тянут в середине
 * списка — обычная прокрутка. Горизонтальных свайпов страниц (SHEET_SWIPE_MIN_PX
 * и компания) в книге больше нет — под-страницы листает пейджер-кнопка.
 */
function setupBookCloseGesture() {
    if (bookHandlersBound) return;
    const book = document.getElementById('book');
    const body = document.getElementById('bookBody');
    const ribbon = document.getElementById('skyRibbon');
    if (!book || !body) return;

    let startY = 0;
    let decided = false;
    let closing = false;
    let tracking = false;

    const onStart = (event) => {
        if (isMultiTouch(event)) { tracking = false; return; }
        if (event.type === 'mousedown' && event.button !== 0) return;
        const p = getGesturePoint(event);
        if (!p) return;
        startY = p.clientY;
        decided = false;
        closing = false;
        tracking = true;
    };

    const onMove = (event) => {
        if (!tracking || isMultiTouch(event)) return;
        const p = getGesturePoint(event);
        if (!p) return;
        const dy = p.clientY - startY;

        if (!decided) {
            if (Math.abs(dy) < BOOK_AXIS_DECIDE_PX) return;
            decided = true;
            closing = dy > 0 && body.scrollTop <= 0;
        }

        if (!closing) return;
        if (event.cancelable) event.preventDefault();
        book.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };

    const onEnd = (event) => {
        if (!tracking) return;
        tracking = false;
        const p = getGesturePoint(event);
        const dy = p ? p.clientY - startY : 0;

        book.style.transform = '';
        if (closing && dy >= BOOK_CLOSE_SWIPE_MIN_PX) closeBook();
        closing = false;
    };

    book.addEventListener('touchstart', onStart, { passive: true });
    book.addEventListener('touchmove', onMove, { passive: false });
    book.addEventListener('touchend', onEnd);
    book.addEventListener('touchcancel', onEnd);
    book.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    // K-05: потягивание ленты вверх — обратный жест к открытию книги
    if (ribbon) setupRibbonPullGesture(ribbon);

    bookHandlersBound = true;
}

/** K-05: тянем ленту-закладку вверх — книга открывается на последней высечке. */
function setupRibbonPullGesture(ribbon) {
    let startY = 0;
    let startX = 0;
    let tracking = false;
    let pulled = false;

    const start = (event) => {
        if (isMultiTouch(event)) { tracking = false; return; }
        if (event.type === 'mousedown' && event.button !== 0) return;
        const p = getGesturePoint(event);
        if (!p) return;
        startY = p.clientY;
        startX = p.clientX;
        tracking = true;
        pulled = false;
    };

    const move = (event) => {
        if (!tracking || bookOpen || isMultiTouch(event)) return;
        const p = getGesturePoint(event);
        if (!p) return;
        const dy = startY - p.clientY;
        const dx = Math.abs(p.clientX - startX);
        if (dy >= BOOK_OPEN_SWIPE_MIN_PX && dy > dx) {
            pulled = true;
            tracking = false;
            openBook();
        }
    };

    const end = () => { tracking = false; };

    ribbon.addEventListener('touchstart', start, { passive: true });
    ribbon.addEventListener('touchmove', move, { passive: true });
    ribbon.addEventListener('touchend', end);
    ribbon.addEventListener('touchcancel', end);
    ribbon.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);

    // Потянули вверх — click по ленте под пальцем не должен переоткрыть книгу
    ribbon.addEventListener('click', (event) => {
        if (!pulled) return;
        pulled = false;
        event.stopPropagation();
        event.preventDefault();
    }, true);

    // Тап по ленте открывает книгу
    ribbon.addEventListener('click', () => {
        if (bookOpen) return;
        openBook();
    });
}

function setupBookControls() {
    // K-05: лента — единая цель: тап, потягивание вверх или Enter открывают
    // книгу на той высечке, где игрок был в прошлый раз.
    document.getElementById('skyRibbon')?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openBook();
    });

    document.querySelectorAll('.book-tab').forEach(btn => {
        btn.addEventListener('click', () => switchBookCut(btn.dataset.cut));
    });

    const onPagerClick = (event) => {
        const btn = event.target.closest('.book-pager-btn');
        if (!btn) return;
        stepBookPage(Number(btn.dataset.dir));
    };
    document.getElementById('atlasPager')?.addEventListener('click', onPagerClick);
    document.getElementById('stampsPager')?.addEventListener('click', onPagerClick);

    // K-06 риск 4: строка на «Сегодня» — второй, равноценный вход в тот же жест закрытия
    document.getElementById('bookReturnBtn')?.addEventListener('click', closeBook);

    // B-02: тумблер режима холста — тот же угол, где раньше жила кнопка отката (K-04)
    document.getElementById('obsModeConnectBtn')?.addEventListener('click', () => setObservatoryMode('connect'));
    document.getElementById('obsModeMoveBtn')?.addEventListener('click', () => setObservatoryMode('move'));

    setupBookCloseGesture();
}

function onGlobalPopupKeydown(event) {
    if (event.key === 'Escape') {
        closeBook();
        return;
    }
    if (!bookOpen) return;
    if (event.key === 'ArrowLeft') stepBookPage(-1);
    if (event.key === 'ArrowRight') stepBookPage(1);
}


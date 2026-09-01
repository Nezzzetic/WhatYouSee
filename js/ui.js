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

/**
 * K-06: цель коротко вздрагивает — награда доехала именно сюда.
 * K-17: цель у пульса та же, что у монеты, — флажок шкалы, пока книга открыта.
 */
function pulseScoreDisplay() {
    const el = (bookOpen && document.querySelector('#bookGauge .book-gauge-flag'))
        || document.querySelector('.ribbon-tail');
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

/**
 * K-17: тот же приём для флажка шкалы. Шкала пересобирается на каждом рендере
 * книги (`renderBookGauge` чистит узел целиком), и на смене высечки полёт
 * мог бы застать её между двумя кадрами — кэш последнего ненулевого замера
 * закрывает и это, и ресайз.
 */
let lastGaugeFlightRect = null;

/**
 * Цель полёта награды — флажок шкалы света у корешка: «число вылетает из клетки
 * и уходит к корешку, растворяется в позолоте» (концепт, Табл. III b). Лента-
 * закладка осталась запасной целью: пока книга закрыта, шкалы на экране нет.
 *
 * K-04 целился в ленту потому, что корешка тогда не было видно вовсе — шкалу
 * закрашивала страница; с K-17 он виден, и цель вернулась туда, где ей место.
 */
function getClaimFlightTargetRect() {
    const flag = document.querySelector('#bookGauge .book-gauge-flag');
    if (flag) {
        const rect = flag.getBoundingClientRect();
        if (rect.width || rect.height) lastGaugeFlightRect = rect;
    }
    const ribbon = document.getElementById('skyRibbon');
    if (ribbon) {
        const rect = ribbon.getBoundingClientRect();
        if (rect.width || rect.height) lastRibbonFlightRect = rect;
    }
    if (bookOpen && lastGaugeFlightRect) return lastGaugeFlightRect;
    return lastRibbonFlightRect || lastGaugeFlightRect;
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
    // Событие плюс страховочный таймер — `animationend` не приходит, если
    // узел снесли или вкладка ушла в фон.
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
// Регистр первый — знак: действие, раздел, тема штампа. Девятнадцать штук,
// спрайт лежит в index.html, своего цвета у знака нет.
// Регистр второй — глиф: форма конкретной фигуры, точки и линии из
// SHAPE_PATTERNS. Глиф — это чертёж, только маленький, поэтому он всегда честен.
//
// Правило двух регистров: знак и глиф НЕ встречаются в одной строке, и знак
// НИКОГДА не обозначает конкретную фигуру. Строка либо про путь игрока,
// либо про фигуру.

/** Все двадцать четыре имени кассы — чтобы опечатка в имени падала, а не молчала. */
const GLYPH_SIGNS = [
    'undo', 'knife', 'press', 'ribbon', 'tel', 'crescent', 'nightstar', 'spark',
    'gem', 'pillar', 'comet', 'loz', 'link', 'hand', 'pen', 'leaf', 'corona', 'arc', 'lock',
    // K-33: свой знак каждому цветовому квесту
    'round', 'hex', 'oct', 'marquise', 'trillion'
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
 * K-30: буфер канваса — в физических пикселях (`cssPx * devicePixelRatio`),
 * логический размер (для CSS и для формул `drawShapeGlyph`) кладём в
 * `dataset.glyphCssPx`. DPR читается заново при каждом вызове (не кэшируется) —
 * смена плотности на лету (другой монитор, зум браузера) подхватывается
 * следующей перерисовкой.
 *
 * `forceCssSize` пиннит видимый размер инлайн-стилем — нужно канвасам без
 * своего CSS-правила размера (`.shape-glyph`, `#skyBookmarkCanvas`). Для
 * `.atlas-card-canvas` (тянется `width:100%; max-width:76px` на узком экране)
 * передаём `false` — инлайн-стиль сломал бы отзывчивость, видимый размер
 * остаётся на совести CSS, буфер просто становится резче.
 */
function sizeGlyphCanvas(canvas, cssPx, forceCssSize = true) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssPx * dpr);
    canvas.height = Math.round(cssPx * dpr);
    canvas.dataset.glyphCssPx = cssPx;
    if (forceCssSize) {
        canvas.style.width = cssPx + 'px';
        canvas.style.height = cssPx + 'px';
    }
}

/**
 * Глиф фигуры на канвасе. Размер канваса задаёт вызывающий; отступ, толщина
 * штриха и радиус точки едут за ним, но не ужимаются ниже читаемого предела —
 * иначе разворот и строка расходятся не масштабом, а видом.
 *
 * K-18: `blueprint` включает режим чертежа для неразгаданной фигуры — пунктир,
 * полые точки без ореола, цвет фиксирован на --ink-faint (не спойлерит цвет
 * тира до находки). Применяется только на кегле разворота (76px) — риск 3
 * дока: пунктир на строке (16px) может выродиться в точки, там режим не используется.
 *
 * K-30: буфер канваса может быть больше CSS-размера (HiDPI, см. `sizeGlyphCanvas`).
 * Отступ/толщина/радиус считаются от **логической** стороны (CSS px), иначе
 * порог читаемости K-02 (мин. 1.4 px точки на строке) на большом DPR съезжает
 * вниз — контекст масштабируется один раз, дальше формулы не меняются.
 */
function drawShapeGlyph(canvas, pattern, color, blueprint) {
    const ctx = canvas.getContext('2d');
    const cssSize = Number(canvas.dataset.glyphCssPx) || canvas.width;
    const dpr = canvas.width / cssSize;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = cssSize;
    const h = cssSize;
    const side = Math.min(w, h);
    // Всё, что ниже — доли от стороны с полом: на строке (16 px) пол и работает.
    const pad = Math.max(2, side * 0.105);
    const dot = Math.max(1.4, side * 0.033);
    const halo = Math.max(2.6, side * 0.066);
    const iw = w - pad * 2;
    const ih = h - pad * 2;
    const inkFaint = blueprint ? INK_FAINT_RGB : color;

    ctx.clearRect(0, 0, w, h);

    const pts = pattern.stars.map(([nx, ny]) => [pad + nx * iw, pad + ny * ih]);

    // K-31: контур чертежа неразгаданной был бледен дважды — здесь и через
    // `.atlas-card-unknown` (снята). Альфа поднята с 0.7 до 0.85, вровень
    // с контуром точки ниже — сам чертёж теперь несёт весь контраст.
    ctx.strokeStyle = `rgba(${inkFaint[0]},${inkFaint[1]},${inkFaint[2]},${blueprint ? 0.85 : 0.7})`;
    ctx.lineWidth = Math.max(1, side * 0.02);
    ctx.lineCap = 'round';
    ctx.setLineDash(blueprint ? [dot * 1.4, dot * 1.4] : []);
    for (const [a, b] of pattern.lines) {
        ctx.beginPath();
        ctx.moveTo(pts[a][0], pts[a][1]);
        ctx.lineTo(pts[b][0], pts[b][1]);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const [px, py] of pts) {
        if (blueprint) {
            ctx.beginPath();
            ctx.arc(px, py, dot, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${inkFaint[0]},${inkFaint[1]},${inkFaint[2]},0.85)`;
            ctx.lineWidth = Math.max(0.8, side * 0.013);
            ctx.stroke();
            continue;
        }
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
    sizeGlyphCanvas(canvas, px);
    const pattern = (typeof SHAPE_PATTERNS !== 'undefined' && SHAPE_PATTERNS[shapeId]) || null;
    if (pattern) drawShapeGlyph(canvas, pattern, color);
    return canvas;
}

/** Совместимость: прежнее имя рисовалки подсказок. K-18: пробрасывает режим чертежа. */
function drawHintPattern(canvas, pattern, color, blueprint) {
    drawShapeGlyph(canvas, pattern, color, blueprint);
}

/**
 * K-18: грань фигуры как искра, а не ромбик — тот же контур, что звезда на
 * небе (`drawSparkleShape`, camera.js, тот же `SPARK_WAIST`), но портированный
 * с p5-`quadraticVertex` на SVG-путь: карточка рисуется обычным DOM/canvas 2D
 * без p5-инстанса. Цвет и заливка (горит/не горит) — на CSS `.atlas-facet path`.
 */
function createFacetSparkSvg() {
    const NS = 'http://www.w3.org/2000/svg';
    const R = 5;
    const w = R * SPARK_WAIST;
    const wd = w * Math.SQRT1_2;
    const d = `M 0 ${-R} Q ${wd} ${-wd} ${R} 0 Q ${wd} ${wd} 0 ${R} Q ${-wd} ${wd} ${-R} 0 Q ${-wd} ${-wd} 0 ${-R} Z`;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-6 -6 12 12');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    return svg;
}

/**
 * K-32: тот же ряд граней, что на карточке атласа (`createAtlasEntryCard`) —
 * нужен ещё и в окошке закладки на небе, вынесен сюда, чтобы не дублировать.
 */
function createFacetsRow(shapeName) {
    const facets = document.createElement('div');
    facets.className = 'atlas-facets';
    for (const color of ACHIEVEMENT_COLOR_KEYS) {
        const lit = typeof isShapeFacetLit === 'function' && isShapeFacetLit(shapeName, color);
        const gem = document.createElement('span');
        gem.className = `atlas-facet atlas-facet-${color}` + (lit ? ' atlas-facet-lit' : '');
        gem.title = achievementColorLabel(color);
        gem.appendChild(createFacetSparkSvg());
        facets.appendChild(gem);
    }
    return facets;
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
 * Неразгаданная фигура рисуется тем же глифом, что и разгаданная — чертежом
 * (K-18). K-31: подпись «not yet traced» и число звёзд убраны совсем — на их
 * месте одинокий знак «?»; фигура рассказывает о себе только контуром.
 */
function createAtlasEntryCard(entry) {
    const faceted = entry.isCreated && typeof isShapeFaceted === 'function' && isShapeFaceted(entry.name);
    const drawColor = faceted ? ATLAS_FACETED_COLOR : entry.color;
    const bookmarked = typeof getBookmarkedShape === 'function' && getBookmarkedShape() === entry.name;

    const card = document.createElement('div');
    card.className = 'atlas-card'
        + (entry.isCreated ? ' atlas-card-known' : ' atlas-card-unknown')
        + (faceted ? ' atlas-card-faceted' : '');

    // K-31: закладка тапом по любой части карточки, не только булавкой —
    // сама карточка становится доступной интерактивной целью (роль/фокус/aria).
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.setAttribute('aria-pressed', String(bookmarked));
    card.setAttribute('aria-label', t(bookmarked ? 'atlas.pinOff' : 'atlas.pinOn'));
    const togglePin = () => {
        if (typeof toggleShapeBookmark === 'function') toggleShapeBookmark(entry.name);
        renderAtlasList();
        if (typeof renderSkyBookmark === 'function') renderSkyBookmark();
    };
    card.addEventListener('click', togglePin);
    card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        togglePin();
    });

    if (faceted) {
        const crown = glyphSign('corona', 16, 'atlas-card-crown');
        card.appendChild(crown);
    }

    // Булавка остаётся видимым индикатором состояния (риск дока K-31), но
    // клик по карточке уже переключает закладку сам — булавка не дублирует
    // фокус клавиатуры и убрана из a11y-дерева, чтобы не звучать дважды.
    // `.atlas-pin[data-shape-id]` держит и харнесс (`__test.pin`).
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'atlas-pin' + (bookmarked ? ' atlas-pin-on' : '');
    pin.dataset.shapeId = entry.name;
    pin.tabIndex = -1;
    pin.setAttribute('aria-hidden', 'true');
    pin.appendChild(document.createElement('i'));
    pin.addEventListener('click', (event) => {
        event.stopPropagation();
        togglePin();
    });
    card.appendChild(pin);

    const canvas = document.createElement('canvas');
    canvas.className = 'atlas-card-canvas';
    sizeGlyphCanvas(canvas, GLYPH_SIZES.spread, false);
    card.appendChild(canvas);

    const title = document.createElement('div');
    if (entry.isCreated) {
        title.className = 'atlas-card-title';
        title.textContent = getDisplayShapeName(entry.name);
        title.style.color = `rgb(${drawColor[0]},${drawColor[1]},${drawColor[2]})`;
    } else {
        // Имя фигуры — сюрприз до первого создания; вместо него — «?».
        title.className = 'atlas-card-title atlas-card-title-unknown';
        title.textContent = '?';
    }
    card.appendChild(title);

    if (entry.isCreated) {
        // U-09: 5 граней. Ни цифр, ни кнопок — грань просто горит или нет.
        // K-18: искра тем же контуром, что звезда на небе, а не ромбик.
        card.appendChild(createFacetsRow(entry.name));
    }

    // K-18: режим чертежа для неразгаданной — пунктир, полые точки, нейтральный цвет.
    if (entry.pattern) drawHintPattern(canvas, entry.pattern, drawColor, !entry.isCreated);

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
// промежуточных разделов. Под-страницы атласа и наград листаются
// пейджер-кнопками в подвале и горизонтальным свайпом (K-28, вернул то, что
// K-06 когда-то убрал целиком) — оба пути ведут через один stepBookPage.
// Свайп же на краю раздела не останавливается, а переводит в соседнюю
// высечку (swipeBookPage) — сквозная последовательность страниц всей книги.

// K-14: 'settings' — валидная цель openBook/switchBookCut, но не шестая
// высечка — вход только строкой из «Index» (решение заказчика 2026-08-25:
// высечек пять, см. K-06). Своей кнопки в #bookTabs у неё нет и не будет.
const BOOK_CUT_LIST = ['today', 'index', 'atlas', 'stamps', 'exlibris', 'settings'];

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

/** K-19: римские цифры генерируются, не заводятся в словарь — до VII хватает. */
function toRoman(n) {
    const table = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let s = '';
    for (const [v, sym] of table) {
        while (n >= v) { s += sym; n -= v; }
    }
    return s;
}

/** K-19: строка оглавления — «Ch. <римская> · <имя>», одна форма для атласа и штампов. */
function formatChapterIndexTitle(chapterNo, name) {
    return t('book.indexChapterTitle', { n: toRoman(chapterNo), name });
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

/** K-14: настройки — последняя колонцифра книги, строкой после Ex Libris. */
function getSettingsFolio() {
    return getExLibrisFolio() + 1;
}

/** Шапка страницы: над-заголовок, титул, колонцифра — синтетическая, но сквозная. */
function renderBookHead() {
    const eyebrowEl = document.getElementById('bookEyebrow');
    const titleEl = document.getElementById('bookTitle');
    const footLeftEl = document.getElementById('bookFootLeft');
    const folioEl = document.getElementById('bookFolio');
    const prevBtn = document.getElementById('bookFootPrev');
    const nextBtn = document.getElementById('bookFootNext');
    if (!eyebrowEl || !titleEl || !footLeftEl || !folioEl) return;

    let eyebrow = '';
    let title = '';
    let folioN = 1;
    let footLeft = t('book.brand');
    // K-18: подвал атласа/штампов вместо ALMANAC несёт прогресс главы слева;
    // справа — колонцифра текущей страницы. K-28: стрелки пейджера теперь
    // видны на любом развороте (сквозной swipeBookPage), не только на атласе
    // и штампах — прячутся только на истинных краях книги (см. ниже).

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
        // нумерация уехала в надзаголовок. K-19: «of M» из надзаголовка снято
        // и номер стал римским — сколько всего, отвечает оглавление.
        const idx = getBookPageIndex('atlas');
        eyebrow = t('book.eyebrowAtlasChapter', { n: toRoman(idx + 1) });
        title = t('atlas.chapterTitle' + idx);
        folioN = getAtlasChapterFolio(idx);
        // K-31: счётчик «N of M traced» в подвале снят — счёт главы остался
        // только в оглавлении (K-19); подвал атласа падает на бренд, как у
        // Today/Index/Ex Libris/Settings.
    } else if (bookCut === 'stamps') {
        // K-12: главы штампов пронумерованы так же, как главы атласа.
        const idx = getBookPageIndex('rewards');
        const page = REWARD_PAGES[idx];
        eyebrow = t('book.eyebrowStampsChapter', { n: toRoman(idx) });
        title = page ? page.title : '';
        folioN = getStampsChapterFolio(idx);
        const { pressed, total } = getRewardPagePressedStamps(idx);
        footLeft = t('book.footStampsProgress', { current: pressed, total });
    } else if (bookCut === 'exlibris') {
        eyebrow = t('book.eyebrowExLibris');
        title = t('book.headExLibris');
        folioN = getExLibrisFolio();
    } else if (bookCut === 'settings') {
        title = t('book.headSettings');
        folioN = getSettingsFolio();
    }

    eyebrowEl.textContent = eyebrow;
    titleEl.textContent = title;
    footLeftEl.textContent = footLeft;
    folioEl.textContent = t('book.folio', { n: folioN });

    if (prevBtn && nextBtn) {
        // K-28: пейджер общий на всю книгу — data-pager называет текущий раздел
        // (verify-atlas-spread.js смотрит на 'atlas' при клике), сама стрелка
        // прячется только там, где swipeBookPage(±1) действительно некуда вести.
        const pagerAttr = bookCut === 'stamps' ? 'rewards' : bookCut;
        prevBtn.dataset.pager = pagerAttr;
        nextBtn.dataset.pager = pagerAttr;
        prevBtn.hidden = !canSwipeBookPage(-1);
        nextBtn.hidden = !canSwipeBookPage(1);
    }
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
    const trackH = el.getBoundingClientRect().height;
    el.innerHTML = '';

    const earned = typeof getLifetimeMetaEarned === 'function' ? getLifetimeMetaEarned() : 0;
    const floor = Math.floor(earned / BOOK_GAUGE_WINDOW) * BOOK_GAUGE_WINDOW;
    const ceil = floor + BOOK_GAUGE_WINDOW;
    const ratio = (earned - floor) / BOOK_GAUGE_WINDOW;

    const fill = document.createElement('div');
    fill.className = 'book-gauge-fill';
    // K-25: заливка перекрывает обе риски запасом BOOK_GAUGE_OVERSHOOT_PX
    // вместо того, чтобы упираться точно в их координату.
    fill.style.bottom = `-${BOOK_GAUGE_OVERSHOOT_PX}px`;
    fill.style.height = `calc(${Math.round(ratio * 100)}% + ${BOOK_GAUGE_OVERSHOOT_PX * 2}px)`;
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
    // На нуле флажку нечего показывать — «● 0» рядом с нижней риской выглядит
    // как случайная деталь, а не как метка прогресса, которого ещё нет. Узел
    // остаётся в разметке (visibility, не display/innerHTML) — на нём стоит
    // getClaimFlightTargetRect(), и первый в жизни игрока забор не должен
    // целиться в устаревший (и уже скрытый книгой) прямоугольник ленты.
    flag.className = earned > 0 ? 'book-gauge-flag' : 'book-gauge-flag book-gauge-flag-empty';
    // K-25: честная ratio-координата, но не ближе BOOK_GAUGE_FLAG_MIN_GAP_PX
    // к любой из рисок — иначе цифра нижнего значения садится на риску текстом.
    const minRatio = trackH > 0 ? Math.min(0.5, BOOK_GAUGE_FLAG_MIN_GAP_PX / trackH) : 0;
    const flagRatio = Math.min(Math.max(ratio, minRatio), 1 - minRatio);
    flag.style.bottom = `${flagRatio * 100}%`;
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

/**
 * K-17: второй раздел с настоящим «взять» — «Сегодня». Готовая суточная марка
 * (REWARD_PAGES[0]) и непрочитанное событие мира — те же два условия, что
 * поднимают каплю на ленте (`hasSkyWaxSignal`), но теперь видно и где именно.
 */
function todayHasSignal() {
    return (typeof rewardPageHasClaimable === 'function' && rewardPageHasClaimable(0))
        || (typeof hasUnseenDailyNews === 'function' && hasUnseenDailyNews());
}

/**
 * Пять высечек: подсветка активной и капля сургуча там, где есть готовое
 * (концепт, Табл. III-VI). У «Атласа» и «Оглавления» забора нет — точка им
 * не полагается никогда: она зовёт прижать, а прижимать там нечего.
 */
function renderBookTabs() {
    document.querySelectorAll('.book-tab').forEach(btn => {
        btn.classList.toggle('book-tab-on', btn.dataset.cut === bookCut);
    });
    const stampsWax = document.getElementById('bookTabStampsWax');
    if (stampsWax) stampsWax.hidden = !stampsHaveClaimable();
    const todayWax = document.getElementById('bookTabTodayWax');
    if (todayWax) todayWax.hidden = !todayHasSignal();
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
    renderBookTodayState();
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
    // K-15: страница прочитана — капля сургуча на ленте гаснет по этой причине.
    if (daily) daily.newsUnseen = false;
}

/**
 * K-17: две строки состояния страницы — сколько звёзд на небе ещё не соединено
 * и что заложено закладкой. В концепте они стоят на «Сегодня» рядом с событиями
 * ночи, но событиями не являются: в `newsLog` не пишутся, в сейв не идут и
 * считаются заново на каждом рендере — поэтому и блок у них свой.
 *
 * Номер главы здесь арабский (`book.todayBookmark`) — это отсылка к главе
 * внутри предложения, не заголовок; римской цифрой (K-19) набираются только
 * надзаголовок разворота и строка оглавления.
 */
function renderBookTodayState() {
    const el = document.getElementById('bookTodayState');
    if (!el) return;
    el.innerHTML = '';

    const addRow = (text) => {
        const row = document.createElement('div');
        row.className = 'book-state-row';
        row.textContent = text;
        el.appendChild(row);
    };

    const free = typeof getPlayableStars === 'function' ? getPlayableStars().length : 0;
    addRow(tp('book.todayStarsLeft', free));

    const shapeId = typeof getBookmarkedShape === 'function' ? getBookmarkedShape() : null;
    if (!shapeId) return; // закладки нет — строки тоже нет, пустой строкой не занимаем
    const name = getDisplayShapeName(shapeId);
    const pattern = typeof SHAPE_PATTERNS !== 'undefined' ? SHAPE_PATTERNS[shapeId] : null;
    const starCount = pattern && Array.isArray(pattern.stars) ? pattern.stars.length : 0;
    const chapter = typeof getAtlasPageForShape === 'function' ? getAtlasPageForShape(shapeId) : -1;
    // Закладку ставят с карточки разворота, то есть у фигуры всегда есть и
    // чертёж, и глава; страховка — на случай закладки из будущего источника.
    if (starCount > 0 && chapter >= 0) {
        addRow(tp('book.todayBookmark', starCount, { name, ch: chapter + 1 }));
    } else {
        addRow(t('book.todayBookmarkPlain', { name }));
    }
}

/**
 * «Оглавление»: временный плоский список вместо разворота-определителя (K-10).
 * Строка тапабельна — прыгает сразу на нужную главу, это и есть «объём решают
 * главы, а не длина свитка» из концепта.
 */
/**
 * K-10: строка главы — имя с линейкой из точек (как в сцепке K-08), счёт и
 * колонцифра. Неразрезанная глава несёт знак замка (K-24, был нож — эта роль
 * ножа осталась только за разрезанием страниц) и порог в ✦ вместо счёта, но
 * с той же колонцифрой, что у разрезанной (страница недостижима постранично,
 * но пейджер её уже показывает заглушкой `atlas.pageLocked` — сюда ведёт тот
 * же тап). Сургучная точка — только там, где есть настоящее «взять» (Штампы);
 * у атласа нет кнопки забора, поэтому просто вести не при чём.
 */
function createBookIndexRow(title, folioN, countText, opts) {
    const o = opts || {};
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'book-index-row';

    // K-23: жёлоб держит место у ЛЮБОЙ строки оглавления — не только затем,
    // чтобы разрезанная и запертая глава не отличались геометрией, но и
    // чтобы заголовки всех строк (включая Ex Libris и Настройки, ни замка,
    // ни точки не знающие) лежали на одной вертикали, а не рвали список
    // вразнобой (фидбек с телефона 2026-08-31). K-24: замок и сургучная точка
    // на одной строке никогда не встречаются (замок — атлас/штампы взаперти,
    // точка — только разрезанные штампы с чем взять) — жёлоб на двоих один,
    // не два: второй пустой слот только раздвигал бы список зазором без смысла.
    const icon = document.createElement('span');
    icon.className = 'book-index-row-icon';
    if (o.locked) {
        icon.classList.add('achv-row-icon-uncut');
        icon.appendChild(glyphSign('lock', 16));
    } else if (o.wax) {
        const wax = document.createElement('span');
        wax.className = 'book-index-row-wax book-index-row-wax-lit';
        icon.appendChild(wax);
    }
    row.appendChild(icon);

    const head = document.createElement('span');
    head.className = 'book-index-row-head';

    const label = document.createElement('span');
    label.className = 'book-index-row-title';
    label.textContent = title;
    head.appendChild(label);

    const dots = document.createElement('span');
    dots.className = 'book-index-row-dots';
    head.appendChild(dots);

    const count = document.createElement('span');
    count.className = 'book-index-row-status';
    // K-16: в статусе строки может стоять не число, а знак кассы (K-02) — эмодзи
    // в игре нет ни одного, а «открыто» у Ex Libris нечем считать.
    if (o.countSign) count.appendChild(glyphSign(o.countSign, 16));
    else count.textContent = countText;
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
        const unlocked = isAtlasPageUnlocked(i);
        // K-19: неразрезанная глава не раскрывает литературное имя — «?».
        const title = formatChapterIndexTitle(i + 1, unlocked ? t('atlas.chapterTitle' + i) : '?');
        const row = unlocked
            ? createBookIndexRow(
                title,
                getAtlasChapterFolio(i),
                `${ATLAS_PAGES[i].filter(isShapeCreated).length} / ${ATLAS_PAGES[i].length}`
            )
            : createBookIndexRow(
                title,
                getAtlasChapterFolio(i),
                t('book.indexOpensAt', { n: getAtlasPageUnlockCost(i) }),
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
        // K-19: неразрезанная глава не раскрывает литературное имя — «?».
        const title = formatChapterIndexTitle(i, unlocked ? page.title : '?');

        let row;
        if (unlocked) {
            // K-19: счёт главы — прижатые марки (сумма stepIndex) из общего
            // числа марок главы, а не пройденные цепочки целиком.
            const { pressed, total } = getRewardPagePressedStamps(i);
            row = createBookIndexRow(
                title,
                getStampsChapterFolio(i),
                `${pressed} / ${total}`,
                { wax: rewardPageHasClaimable(i) }
            );
        } else {
            row = createBookIndexRow(
                title,
                getStampsChapterFolio(i),
                t('book.indexOpensAt', { n: getRewardPageUnlockCost(i) }),
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
        exUnlocked ? '' : t('book.indexOpensAt', { n: OBSERVATORY_UNLOCK_COST }),
        exUnlocked ? { countSign: 'crescent' } : undefined
    );
    exRow.addEventListener('click', () => switchBookCut('exlibris'));
    exSec.appendChild(exRow);
    el.appendChild(exSec);

    // K-14: настройки — строкой в конце оглавления, единственный вход
    // (страница не висит на своей высечке). Ни счёта, ни замка — доступна
    // всегда, у неё нет условия открытия.
    const settingsSec = document.createElement('div');
    settingsSec.className = 'book-index-sec';
    const settingsRow = createBookIndexRow(t('book.cutSettings'), getSettingsFolio(), '');
    settingsRow.addEventListener('click', () => switchBookCut('settings'));
    settingsSec.appendChild(settingsRow);
    el.appendChild(settingsSec);
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

/**
 * K-28: горизонтальный переход по книге — общий и для свайпа, и для кнопок
 * пейджера в подвале. Внутри атласа/штампов — то же самое, что было раньше:
 * stepBookPage. На краю раздела — или там, где страниц нет вовсе («Today»/
 * «Index»/«Ex Libris») — переходит в соседнюю высечку по порядку
 * BOOK_CUT_LIST, входя в атлас/штампы с той стороны, откуда пришли, чтобы
 * номера страниц шли подряд по всей книге. «Settings» в эту цепочку не входит
 * (K-14, решение заказчика — высечек пять); край книги (до «Today», после
 * «Ex Libris») жест молчит, без зацикливания.
 */
function swipeBookPage(delta) {
    if (stepBookPage(delta)) return;
    const order = BOOK_CUT_LIST.filter(cut => cut !== 'settings');
    const i = order.indexOf(bookCut);
    if (i === -1) return; // 'settings' — вне сквозного порядка, свайп молчит
    const nextCut = order[i + delta];
    if (!nextCut) return;
    if (nextCut === 'atlas') setBookPageIndex('atlas', delta > 0 ? 0 : ATLAS_PAGE_COUNT - 1);
    else if (nextCut === 'stamps') setBookPageIndex('rewards', delta > 0 ? 1 : REWARD_PAGE_COUNT - 1);
    switchBookCut(nextCut);
}

/**
 * K-28: было бы swipeBookPage(delta) сейчас куда-то вести, без побочных
 * эффектов — только чтобы решить, показывать ли стрелку пейджера. Логика
 * зеркалит stepBookPage/swipeBookPage: внутри атласа/штампов смотрит на
 * границы главы, иначе — на порядок высечек (BOOK_CUT_LIST без 'settings').
 */
function canSwipeBookPage(delta) {
    if (bookCut === 'atlas') {
        const idx = getBookPageIndex('atlas') + delta;
        if (idx >= 0 && idx < ATLAS_PAGE_COUNT) return true;
    } else if (bookCut === 'stamps') {
        const idx = getBookPageIndex('rewards') + delta;
        if (idx >= 1 && idx < REWARD_PAGE_COUNT) return true;
    }
    const order = BOOK_CUT_LIST.filter(cut => cut !== 'settings');
    const i = order.indexOf(bookCut);
    return i !== -1 && !!order[i + delta];
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
        closeObservatoryRenameField();
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

// =============================================================================
// K-21: КНИЖНОЕ ПЕРЕИМЕНОВАНИЕ НА ЭКСЛИБРИСЕ (замена openObservatoryRenamePrompt)
// =============================================================================
//
// Тап по подписи созвездия на холсте (или по знаку пера рядом с ней) больше не
// зовёт системный prompt() — открывается эта строка на бумаге, рядом с
// подписью «ex libris». Отмены нет: пустой ввод и Esc имя не меняют, Enter и
// потеря фокуса коммитят непустое значение.

/** Запись обсерватории (observatory.js), которую сейчас редактирует строка ввода. */
let observatoryRenameEntry = null;

function openObservatoryRenameField(entry) {
    if (!entry) return false;
    const row = document.getElementById('exLibrisRenameRow');
    const input = document.getElementById('exLibrisRenameInput');
    if (!row || !input) return false;
    observatoryRenameEntry = entry;
    input.value = typeof getObservatoryLabelText === 'function' ? getObservatoryLabelText(entry) : '';
    row.hidden = false;
    input.focus();
    input.select();
    return true;
}

function closeObservatoryRenameField() {
    const row = document.getElementById('exLibrisRenameRow');
    if (row) row.hidden = true;
    observatoryRenameEntry = null;
}

/** Непустое значение уходит в entry.custom; пустое — имя остаётся прежним. */
function commitObservatoryRenameField() {
    const entry = observatoryRenameEntry;
    const input = document.getElementById('exLibrisRenameInput');
    if (!entry || !input) return;
    const value = input.value.trim();
    if (value !== '') {
        entry.custom = value;
        if (typeof saveObservatoryNow === 'function') saveObservatoryNow();
    }
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
// K-14: НАСТРОЙКИ — страница книги, первый тумблер (звук)
// =============================================================================
//
// Вход только строкой из «Index» (BOOK_CUT_LIST выше) — своей высечки нет.
// Тумблер книжный: пустая клетка / оттиск, как марка K-08 (`.achv-tile`),
// а не системный чекбокс (риск 2 дока). Список рассчитан на второй тумблер —
// вибро приедет с A-05/U-14 такой же строкой, без переверстки страницы.

function createSettingsToggleRow(labelKey, getOn, onToggle) {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const label = document.createElement('span');
    label.className = 'settings-row-label';
    label.textContent = t(labelKey);
    row.appendChild(label);

    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'settings-toggle achv-tile';

    // «press» (K-02, до сих пор нигде не занят) — оттиск в буквальном смысле:
    // прижатая марка. Пустая клетка обходится вовсе без знака, как и у
    // неиспользованных клеток сцепки K-08 (achv-tile-empty).
    const sync = () => {
        const on = getOn();
        tile.classList.toggle('achv-tile-lit', on);
        tile.classList.toggle('achv-tile-empty', !on);
        tile.innerHTML = '';
        if (on) tile.appendChild(glyphSign('press', 16));
        tile.setAttribute('aria-pressed', String(on));
        tile.setAttribute('aria-label', `${t(labelKey)}: ${t(on ? 'settings.toggleOn' : 'settings.toggleOff')}`);
    };
    sync();

    tile.addEventListener('click', () => {
        onToggle(!getOn());
        sync();
    });

    row.appendChild(tile);
    return row;
}

function renderBookSettings() {
    const el = document.getElementById('bookSettingsList');
    if (!el) return;
    el.innerHTML = '';
    el.appendChild(createSettingsToggleRow('settings.sound', isSoundEnabled, setSoundEnabled));
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
        exlibris: document.getElementById('bookExLibris'),
        settings: document.getElementById('bookSettingsSection')
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
    } else if (bookCut === 'stamps') {
        renderAchievementsList();
    } else if (bookCut === 'exlibris') {
        renderBookExLibris();
    } else if (bookCut === 'settings') {
        renderBookSettings();
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
    closeObservatoryRenameField();
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
    closeObservatoryRenameField();
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
    closeObservatoryRenameField();
    bookCut = cut;
    renderBook();
    syncExLibrisAppMode();
}

/**
 * K-05/K-15: единственный сигнал на небе. «В книге что-то есть» — готовая
 * награда ИЛИ непрочитанное событие мира (запись в новостях «Сегодня»).
 */
function hasSkyWaxSignal() {
    return (typeof hasClaimableAchievements === 'function' && hasClaimableAchievements())
        || (typeof hasUnseenDailyNews === 'function' && hasUnseenDailyNews());
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

    // K-31: имя — сюрприз до первого создания фигуры, как на карточке атласа
    // («?» вместо текста); чертёж рядом уже рисуется блупринтом (см. ниже).
    const created = isShapeCreated(shapeId);
    const nameEl = document.getElementById('skyBookmarkName');
    if (nameEl) {
        nameEl.textContent = created ? getDisplayShapeName(shapeId) : '?';
        nameEl.classList.toggle('sky-bookmark-name-unknown', !created);
    }

    // K-32: тот же ряд граней, что на карточке атласа — видно, в каких цветах
    // фигура уже собрана. До первого создания фигуры все грани просто не горят.
    const facetsEl = document.getElementById('skyBookmarkFacets');
    if (facetsEl) facetsEl.replaceChildren(...Array.from(createFacetsRow(shapeId).children));

    const canvas = document.getElementById('skyBookmarkCanvas');
    const pattern = typeof SHAPE_PATTERNS !== 'undefined' ? SHAPE_PATTERNS[shapeId] : null;
    // K-18: тот же режим чертежа, что на карточке атласа — визуальная
    // когерентность одного состояния «не разгадано» на разных узлах.
    // K-30: CSS уже пиннит видимый размер (.sky-bookmark-canvas), но буфер
    // нужно досчитать под DPR — иначе чертёж в углу неба мылится сильнее всего.
    if (canvas && pattern) {
        sizeGlyphCanvas(canvas, 60);
        drawShapeGlyph(canvas, pattern, getShapeColor(shapeId), !created);
    }
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

/** K-26: во столько px книга уходит за нижний край экрана целиком. */
function bookTravelPx() {
    return window.innerHeight || document.documentElement.clientHeight || 800;
}

/**
 * K-26: довод жеста книги — от текущей позиции translateY плавно к цели
 * (или мгновенно при «уменьшить движение»), потом зовёт onSettled. Общая
 * точка для открытия и закрытия: раньше на отпускании transform сбрасывался
 * и hidden ставился в один тик без всякой доводки — движение обрывалось.
 */
function settleBookTransform(book, targetPx, onSettled) {
    if (!book) { onSettled(); return; }
    const finalTransform = targetPx ? `translateY(${targetPx}px)` : '';
    if (prefersReducedMotion()) {
        book.style.transition = '';
        book.style.transform = finalTransform;
        onSettled();
        return;
    }
    let done = false;
    const finish = () => {
        if (done) return;
        done = true;
        book.removeEventListener('transitionend', onEnd);
        clearTimeout(timer);
        book.style.transition = '';
        onSettled();
    };
    const onEnd = (event) => { if (event.target === book && event.propertyName === 'transform') finish(); };
    book.addEventListener('transitionend', onEnd);
    const timer = setTimeout(finish, BOOK_SETTLE_MS + 120);
    book.style.transition = `transform ${BOOK_SETTLE_MS}ms var(--ease)`;
    // Форсированный рефлоу — браузер обязан зафиксировать стартовую (тянутую
    // пальцем) позицию до смены на целевую, иначе переход схлопнется в один
    // кадр без анимации. rAF для этого не годится — в фоновой/скрытой вкладке
    // кадров нет вовсе, и жест завис бы там намертво.
    void book.offsetHeight;
    book.style.transform = finalTransform;
}

/**
 * K-26: тап по ленте и Enter — короткая дорога к открытию, но не должны
 * выглядеть рывком: страница едет с закрытой позиции тем же ходом, что и
 * потягивание. openBook() остаётся синхронным (нужно тестовому харнессу и
 * программным вызовам) — это чисто визуальная доводка поверх готового состояния.
 */
function openBookAnimated(cut) {
    const book = document.getElementById('book');
    const canAnimate = !!book && !prefersReducedMotion();
    if (canAnimate) {
        book.style.transition = 'none';
        book.style.transform = `translateY(${bookTravelPx()}px)`;
    }
    openBook(cut);
    if (!canAnimate) return;
    void book.offsetHeight; // рефлоу теперь, когда книга уже видима — фиксирует старт
    book.style.transition = `transform ${BOOK_SETTLE_MS}ms var(--ease)`;
    book.style.transform = '';
    const onEnd = (event) => {
        if (event.target !== book || event.propertyName !== 'transform') return;
        book.removeEventListener('transitionend', onEnd);
        book.style.transition = '';
    };
    book.addEventListener('transitionend', onEnd);
}

/**
 * Два жеста книги на одном обработчике, разведённые по оси (BOOK_AXIS_DECIDE_PX,
 * риск 1 дока K-28 — тот же приём, что уже развёл закрытие книги (вниз) и
 * потягивание ленты (вверх), см. setupRibbonPullGesture):
 *
 * — вертикаль: потягивание вниз закрывает книгу с любой страницы (риск 4
 *   дока K-06 — возврат на небо обязан быть таким же дешёвым, как вход).
 *   Тянут вниз в самом верху прокрутки страницы — закрытие; тянут в середине
 *   списка — обычная прокрутка, жест её не трогает.
 * — горизонталь (K-28): свайп листает страницу — swipeBookPage(), тот же
 *   переход, что у пейджер-кнопки в подвале, плюс переход в соседний раздел
 *   на краю текущего. Без протяжки страницы за пальцем — решение осознанно
 *   (см. «Согласованный план» дока K-28): раздел просто перерисовывается,
 *   как от кнопки.
 *
 * Мультитач и щипок зума (isMultiTouch) не считаются ни тем, ни другим жестом.
 */
function setupBookCloseGesture() {
    if (bookHandlersBound) return;
    const book = document.getElementById('book');
    const body = document.getElementById('bookBody');
    const ribbon = document.getElementById('skyRibbon');
    if (!book || !body) return;

    let startX = 0;
    let startY = 0;
    let axis = null; // 'vertical' | 'horizontal', решается на BOOK_AXIS_DECIDE_PX
    let closing = false;
    let tracking = false;

    const onStart = (event) => {
        if (isMultiTouch(event)) { tracking = false; return; }
        if (event.type === 'mousedown' && event.button !== 0) return;
        const p = getGesturePoint(event);
        if (!p) return;
        startX = p.clientX;
        startY = p.clientY;
        axis = null;
        closing = false;
        tracking = true;
    };

    const onMove = (event) => {
        if (!tracking || isMultiTouch(event)) return;
        const p = getGesturePoint(event);
        if (!p) return;
        const dx = p.clientX - startX;
        const dy = p.clientY - startY;

        if (!axis) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < BOOK_AXIS_DECIDE_PX) return;
            if (Math.abs(dx) > Math.abs(dy)) {
                axis = 'horizontal';
            } else {
                axis = 'vertical';
                closing = dy > 0 && body.scrollTop <= 0;
            }
        }

        if (axis === 'horizontal') {
            // K-28: страница не тянется за пальцем — только preventDefault,
            // чтобы жест не ушёл в браузер; сам переход — на отпускании.
            if (event.cancelable) event.preventDefault();
            return;
        }
        if (!closing) return;
        if (event.cancelable) event.preventDefault();
        book.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };

    const onEnd = (event) => {
        if (!tracking) return;
        tracking = false;
        const p = getGesturePoint(event);

        if (axis === 'horizontal') {
            const dx = p ? p.clientX - startX : 0;
            if (Math.abs(dx) >= BOOK_PAGE_SWIPE_MIN_PX) swipeBookPage(dx < 0 ? 1 : -1);
            axis = null;
            return;
        }

        const dy = p ? Math.max(0, p.clientY - startY) : 0;
        if (closing && dy >= BOOK_CLOSE_SWIPE_MIN_PX) {
            // K-26: довод — доезжаем вниз до конца тем же ходом, что вёл за
            // пальцем, и только потом прячем; раньше это обрывалось тут же.
            settleBookTransform(book, bookTravelPx(), () => closeBook());
        } else if (closing) {
            // ниже порога — страница падает обратно тем же доводом
            settleBookTransform(book, 0, () => {});
        } else {
            book.style.transform = '';
        }
        closing = false;
        axis = null;
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

/**
 * K-05/K-26: тянем ленту-закладку вверх — книга едет за пальцем той же
 * формулой, что и закрытие (setupBookCloseGesture), и на отпускании либо
 * доводится до конца, либо падает обратно. Открывается на последней высечке.
 */
function setupRibbonPullGesture(ribbon) {
    const book = document.getElementById('book');
    let startY = 0;
    let startX = 0;
    let tracking = false;
    let decided = false;
    let dragging = false;
    let pulled = false;

    const beginDrag = () => {
        if (!book) return;
        dragging = true;
        pulled = true; // жест пошёл — тап после него не должен сработать отдельно
        book.style.transition = '';
        book.hidden = false;
        renderBook();
        book.style.transform = `translateY(${bookTravelPx()}px)`;
    };

    const start = (event) => {
        if (isMultiTouch(event) || bookOpen) { tracking = false; return; }
        if (event.type === 'mousedown' && event.button !== 0) return;
        const p = getGesturePoint(event);
        if (!p) return;
        startY = p.clientY;
        startX = p.clientX;
        tracking = true;
        decided = false;
        dragging = false;
        pulled = false;
    };

    const move = (event) => {
        if (!tracking || bookOpen || isMultiTouch(event)) return;
        const p = getGesturePoint(event);
        if (!p) return;
        const dy = startY - p.clientY;
        const dx = Math.abs(p.clientX - startX);

        if (!decided) {
            if (Math.max(dy, dx) < BOOK_AXIS_DECIDE_PX) return;
            decided = true;
            if (dy <= 0 || dy <= dx) { tracking = false; return; } // не вверх — не наш жест
            beginDrag();
        }

        if (!dragging) return;
        if (event.cancelable) event.preventDefault();
        book.style.transform = `translateY(${Math.max(0, bookTravelPx() - dy)}px)`;
    };

    const end = (event) => {
        if (!tracking) { tracking = false; return; }
        tracking = false;
        if (!dragging) return;
        const p = getGesturePoint(event);
        const dy = p ? startY - p.clientY : 0;
        dragging = false;

        if (dy >= BOOK_OPEN_SWIPE_MIN_PX) {
            // K-26: довод — доезжаем вверх до конца тем же ходом, что вёл
            // за пальцем, и только потом открываем по-настоящему.
            settleBookTransform(book, 0, () => openBook());
        } else {
            // ниже порога — страница падает обратно, книга остаётся закрытой
            settleBookTransform(book, bookTravelPx(), () => { if (book) book.hidden = true; });
        }
    };

    ribbon.addEventListener('touchstart', start, { passive: true });
    ribbon.addEventListener('touchmove', move, { passive: false });
    ribbon.addEventListener('touchend', end);
    ribbon.addEventListener('touchcancel', end);
    ribbon.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);

    // Потянули — click по ленте под пальцем не должен сработать отдельно
    ribbon.addEventListener('click', (event) => {
        if (!pulled) return;
        pulled = false;
        event.stopPropagation();
        event.preventDefault();
    }, true);

    // Тап по ленте — короткая дорога, но с тем же доводом (K-26)
    ribbon.addEventListener('click', () => {
        if (bookOpen) return;
        openBookAnimated();
    });
}

function setupBookControls() {
    // K-05: лента — единая цель: тап, потягивание вверх или Enter открывают
    // книгу на той высечке, где игрок был в прошлый раз.
    document.getElementById('skyRibbon')?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openBookAnimated();
    });

    document.querySelectorAll('.book-tab').forEach(btn => {
        btn.addEventListener('click', () => switchBookCut(btn.dataset.cut));
    });

    // K-18: пейджер живёт в подвале книги, те же два узла на всех разворотах
    // (renderBookHead переставляет им data-pager/hidden). K-28: ведёт сквозной
    // swipeBookPage, а не stepBookPage — крутит и главы атласа/штампов, и
    // переходы между разделами, ровно как горизонтальный свайп.
    document.getElementById('bookFootPrev')?.addEventListener('click', (event) => {
        swipeBookPage(Number(event.currentTarget.dataset.dir));
    });
    document.getElementById('bookFootNext')?.addEventListener('click', (event) => {
        swipeBookPage(Number(event.currentTarget.dataset.dir));
    });

    // B-02: тумблер режима холста — тот же угол, где раньше жила кнопка отката (K-04)
    document.getElementById('obsModeConnectBtn')?.addEventListener('click', () => setObservatoryMode('connect'));
    document.getElementById('obsModeMoveBtn')?.addEventListener('click', () => setObservatoryMode('move'));

    // K-21: Enter коммитит и закрывает, Esc отменяет ввод (не коммитит) и
    // закрывает, потеря фокуса коммитит — тот же путь, что и Enter.
    const exLibrisRenameInput = document.getElementById('exLibrisRenameInput');
    if (exLibrisRenameInput) {
        // Enter/Esc зовут коммит/закрытие НАПРЯМУЮ, а не через .blur(): реальный
        // blur — это событие потери фокуса, и полагаться, что программный blur()
        // его вызовет, нельзя (в headless-браузере программный focus() не всегда
        // становится document.activeElement, и .blur() тогда молча ничего не
        // делает). blur() ниже — просто убрать курсор/клавиатуру, если фокус
        // всё-таки настоящий; сам путь Enter/Esc от этого не зависит.
        exLibrisRenameInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                commitObservatoryRenameField();
                closeObservatoryRenameField();
                exLibrisRenameInput.blur();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation(); // не даём window-хендлеру закрыть всю книгу
                closeObservatoryRenameField(); // без коммита — ввод отбрасывается
                exLibrisRenameInput.blur();
            }
        });
        // Реальная потеря фокуса (тап мимо поля) — коммитит тем же путём, что Enter.
        exLibrisRenameInput.addEventListener('blur', () => {
            commitObservatoryRenameField();
            closeObservatoryRenameField();
        });
    }

    setupBookCloseGesture();
}

function onGlobalPopupKeydown(event) {
    if (event.key === 'Escape') {
        closeBook();
        return;
    }
    if (!bookOpen) return;
    // K-28: клавиатура — тот же сквозной переход, что кнопка и свайп.
    if (event.key === 'ArrowLeft') swipeBookPage(-1);
    if (event.key === 'ArrowRight') swipeBookPage(1);
}


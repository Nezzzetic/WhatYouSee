// ui.js — общий UI книги и неба: счёт ✦ и полёт награды, имена и цвета фигур,
// глифы K-02, строки сцепок K-08, баннер V-16, лента и закладка на небе.
// Каркас книги — book.js, страницы — book*.js, по файлу на страницу (R-05).

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
 * V-20: цель у пульса — бусина корешка, пока книга открыта (была флажком
 * шкалы K-17); заодно проявляет счёт у бусины — «в момент получения очков»
 * из развилки 2 дока V-20, тот же showBookSpineScore(), что и касание нити.
 * U-31: на небе пульс — на знаке ленты, не на хвосте: хвост теперь несёт
 * протяжку (--ribbon-pull/--ribbon-follow), и анимация на нём же смотрелась
 * бы рывком поверх жеста.
 */
function pulseScoreDisplay() {
    if (bookOpen && typeof showBookSpineScore === 'function') showBookSpineScore();
    const el = (bookOpen && document.querySelector('#bookGauge .book-spine-bead'))
        || document.getElementById('ribbonSign');
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
 * K-17/V-20: тот же приём для бусины корешка. Шкала пересобирается на каждом
 * рендере книги (`renderBookGauge` чистит узел целиком), и на смене высечки
 * полёт мог бы застать её между двумя кадрами — кэш последнего ненулевого
 * замера закрывает и это, и ресайз.
 */
let lastGaugeFlightRect = null;

/**
 * Цель полёта награды — бусина корешка (V-20, была флажком шкалы K-17):
 * «число вылетает из клетки и уходит к корешку, растворяется в позолоте»
 * (концепт, Табл. III b). Лента-закладка осталась запасной целью: пока книга
 * закрыта, корешка на экране нет.
 *
 * K-04 целился в ленту потому, что корешка тогда не было видно вовсе — шкалу
 * закрашивала страница; с K-17 он виден, и цель вернулась туда, где ей место.
 */
function getClaimFlightTargetRect() {
    const bead = document.querySelector('#bookGauge .book-spine-bead');
    if (bead) {
        const rect = bead.getBoundingClientRect();
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
 *        покажет реальный `getMetaScore()` (S-03: ✦ больше не списываются —
 *        число только растёт).
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

/** Все двадцать пять имён кассы — чтобы опечатка в имени падала, а не молчала. */
const GLYPH_SIGNS = [
    'undo', 'knife', 'press', 'ribbon', 'tel', 'crescent', 'nightstar', 'spark',
    'gem', 'pillar', 'comet', 'loz', 'link', 'hand', 'pen', 'leaf', 'corona', 'arc', 'lock',
    // K-33: свой знак каждому цветовому квесту — предмет по мотиву цвета
    'drop', 'flame', 'ring', 'ball', 'wave',
    // U-31: два знака одной ленты — на предмете, не в строке, поэтому со
    // своим цветом вместо цвета строки (то же исключение, что раньше держал
    // только крестик закрытия, см. .ribbon-sign/.book-close-sign в style.css);
    // «stars» на книжной стороне сменил «nightstar» по фидбегу с устройства.
    'book', 'stars'
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
 *
 * V-19: `color` — либо один RGB (как раньше), либо массив из 2–4 RGB — тогда
 * штрихи и точки красятся линейным градиентом слева направо через canvas
 * `createLinearGradient`, цвета в переданном порядке. `blueprint` игнорирует
 * `color` целиком, как и раньше.
 *
 * V-22: `paper` — глиф лежит на тёплой бумаге книги: чертёж бледными чернилами
 * листа (PAPER_INK_FAINT_RGB), цвет — «чернилами» (paperInkGlyphColor). Окошко
 * закладки на небе зовёт без него — там цвета неба.
 */
function drawShapeGlyph(canvas, pattern, color, blueprint, paper = false) {
    if (paper && !blueprint) color = paperInkGlyphColor(color);
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

    const solidStyle = (rgb) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    let paintStyle;
    if (blueprint) {
        paintStyle = solidStyle(paper ? PAPER_INK_FAINT_RGB : INK_FAINT_RGB);
    } else if (Array.isArray(color[0])) {
        paintStyle = ctx.createLinearGradient(0, 0, w, 0);
        color.forEach((rgb, i) => paintStyle.addColorStop(color.length > 1 ? i / (color.length - 1) : 0, solidStyle(rgb)));
    } else {
        paintStyle = solidStyle(color);
    }

    ctx.clearRect(0, 0, w, h);

    const pts = pattern.stars.map(([nx, ny]) => [pad + nx * iw, pad + ny * ih]);

    // K-31: контур чертежа неразгаданной был бледен дважды — здесь и через
    // `.atlas-card-unknown` (снята). Альфа поднята с 0.7 до 0.85, вровень
    // с контуром точки ниже — сам чертёж теперь несёт весь контраст.
    ctx.strokeStyle = paintStyle;
    ctx.globalAlpha = blueprint ? 0.85 : 0.7;
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
    ctx.globalAlpha = 1;

    for (const [px, py] of pts) {
        if (blueprint) {
            ctx.beginPath();
            ctx.arc(px, py, dot, 0, Math.PI * 2);
            ctx.strokeStyle = paintStyle;
            ctx.globalAlpha = 0.85;
            ctx.lineWidth = Math.max(0.8, side * 0.013);
            ctx.stroke();
            ctx.globalAlpha = 1;
            continue;
        }
        ctx.beginPath();
        ctx.arc(px, py, dot, 0, Math.PI * 2);
        ctx.fillStyle = paintStyle;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, halo, 0, Math.PI * 2);
        ctx.fillStyle = paintStyle;
        ctx.globalAlpha = 0.15;
        ctx.fill();
        ctx.globalAlpha = 1;
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

/**
 * K-18: грань фигуры как искра, а не ромбик — тот же контур, что звезда на
 * небе (`drawSparkleShape`, skyRender.js, тот же `SPARK_WAIST`), но портированный
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
// V-19: ЦВЕТ ГЛИФА ПО ОГРАНКЕ — общий для карточки атласа и закладки на небе
// =============================================================================

/** U-09: цвет карточки — золото у огранённой фигуры, иначе цвет из SHAPES. */
const ATLAS_FACETED_COLOR = [255, 211, 92];

/**
 * V-19: цвета граней для глифа — те же RGB, что несёт CSS `.atlas-facet-*`
 * (K-01: канвас переменные не читает, дублируем числом). Ключи и их порядок
 * совпадают с `ACHIEVEMENT_COLOR_KEYS` (achievements.js) — красный/оранжевый/
 * жёлтый/белый/синий — порядок и определяет порядок цветов в градиенте.
 */
const ATLAS_FACET_GLYPH_COLORS = {
    red: [240, 122, 103],    // --star-garnet
    orange: [242, 162, 84],  // --star-amber
    yellow: [242, 201, 101], // --star-copper
    white: [237, 239, 245],  // --star-opal
    blue: [134, 200, 242]    // --star-ice
};

/**
 * V-22 (вариант B макета atlas-paper-variants): на тёплой бумаге книги фигура
 * рисуется «чернилами» — тем же тоном, что звезда на небе, но темнее, иначе
 * опал и медь на листе не видны. Те же значения несёт CSS: --star-* в области
 * .book (искры граней). Ключ — RGB неба через запятую; цвета, которых нет в
 * таблице (декоративный цвет SHAPES), темнеют общим правилом paperInkRgb.
 */
const PAPER_STAR_INK = {
    '240,122,103': [184, 67, 47],    // гранат
    '242,162,84': [165, 88, 26],     // янтарь
    '242,201,101': [134, 102, 26],   // медь
    '237,239,245': [94, 107, 128],   // опал
    '134,200,242': [47, 127, 181],   // лёд
    '255,211,92': [154, 106, 26]     // золото полной огранки (ATLAS_FACETED_COLOR)
};

function paperInkRgb(rgb) {
    const known = PAPER_STAR_INK[rgb.join(',')];
    if (known) return known;
    // Общее правило: светлота не выше 0.4, насыщенность — не выше 0.65.
    const [r, g, b] = rgb.map(v => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h /= 6;
    }
    const L = Math.min(l, 0.4), S = Math.min(s, 0.65);
    const q = L < 0.5 ? L * (1 + S) : L + S - L * S, p = 2 * L - q;
    const hue = t => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map(v => Math.round(v * 255));
}

/** V-22: цвет глифа (один RGB или массив для градиента V-19) — чернилами бумаги. */
function paperInkGlyphColor(color) {
    return Array.isArray(color[0]) ? color.map(paperInkRgb) : paperInkRgb(color);
}

/**
 * V-19: цвет глифа фигуры по её огранке. Полная огранка (5 граней) — золото,
 * как и раньше. Одна зажжённая грань — цвет этой грани. 2–4 грани — массив
 * цветов в фиксированном порядке `ACHIEVEMENT_COLOR_KEYS`, `drawShapeGlyph`
 * рисует его линейным градиентом. Фигура без единой грани (не должно
 * случаться у созданной — коммит зажигает грань всегда) откатывается на
 * декоративный цвет `SHAPES`, чтобы карточка не осталась совсем без цвета.
 */
function getShapeGlyphColor(shapeName) {
    if (typeof isShapeFaceted === 'function' && isShapeFaceted(shapeName)) return ATLAS_FACETED_COLOR;
    const keys = typeof ACHIEVEMENT_COLOR_KEYS !== 'undefined' ? ACHIEVEMENT_COLOR_KEYS : [];
    const lit = keys
        .filter(color => typeof isShapeFacetLit === 'function' && isShapeFacetLit(shapeName, color))
        .map(color => ATLAS_FACET_GLYPH_COLORS[color]);
    if (lit.length === 1) return lit[0];
    if (lit.length > 1) return lit;
    return getShapeColor(shapeName);
}

/**
 * S-03: строка замка с выделенным уровнем — «…at [level 4].» Слово и число
 * красятся золотом (`.book-lock-level`, правка заказчика 2026-09-10), остальное
 * остаётся текстом строки. Шаблон держит плейсхолдер {level}, а форма «уровень N»
 * — свой ключ `book.lockLevel` (в русском это падеж: «на уровне 4»).
 */
function fillLevelLockText(el, templateKey, level) {
    const MARK = '\u0000';
    const parts = t(templateKey, { level: MARK }).split(MARK);
    el.textContent = '';
    el.appendChild(document.createTextNode(parts[0] || ''));
    const span = document.createElement('span');
    span.className = 'book-lock-level';
    span.textContent = t('book.lockLevel', { n: level });
    el.appendChild(span);
    el.appendChild(document.createTextNode(parts.slice(1).join('')));
}

// =============================================================================
// V-16 — БАННЕР РАЗРЕЗА ГЛАВЫ: УЗКОЕ ИСКЛЮЧЕНИЕ ИЗ K-15
// =============================================================================
// Единственный тост в игре — вырос из V-16 (разрез главы атласа) в баннер
// уровня (U-29, решение заказчика): забор марки, поднявший `getPlayerLevel()`,
// достаточно важен, чтобы получить яркий отклик прямо в момент забора марки,
// внутри уже открытой книги. Одно окно на всё, что уровень открыл разом —
// главу атласа, главу Штампов, Экслибрис, — а на ступенях хвоста (5+, ничего
// не открывающих) то же окно несёт только поздравление с уровнем. Остальные
// события (огранка, особые цепочки) по-прежнему идут только строкой в ленте
// «Сегодня» + каплей сургуча (K-15) — это исключение их не отменяет.
//
// Состояние сессионное, вне сейва: узел — ребёнок #bookPage (не переживает
// закрытие книги, не трогается перерисовкой конкретных разделов renderBook()).
// Триггер — только claimAchievementStep (achievements.js): забор марки
// физически невозможен вне открытой книги и никогда не случается на путях
// загрузки сейва/дев-вайпа/дев-кнопки «+100 ✦» (та зовёт awardMetaScore
// напрямую), поэтому отдельный announce-флаг не нужен — прецедент V-16.

let levelBannerLevels = [];
let levelBannerUnlockKeys = [];
let levelBannerHideTimer = null;
let levelBannerShownAt = 0;
let levelBannerTapArmed = false;

/** Заголовок уровня(-ей) — одна ступень или список через запятую при мёрдже. */
function levelBannerTitleText(levels) {
    if (levels.length === 1) {
        const lv = levels[0];
        return t('book.levelBannerTitle', { n: lv, name: getLevelName(lv) });
    }
    const names = levels.map(lv => lv + ' — ' + getLevelName(lv)).join(', ');
    return t('book.levelBannerTitleMultiple', { names });
}

/**
 * Категория разблокировки по ключу вида `atlas:<idx>`/`stamps:<idx>`/`exlibris` —
 * решение заказчика 2026-09-14: строка общая («доступна новая страница атласа»/
 * «доступны новые достижения»), без названия конкретной главы. Несколько глав
 * атласа или штампов в одном мёрдже (span в несколько уровней) схлопываются
 * в одну строку категории, а не повторяются.
 */
function levelBannerUnlockCategory(key) {
    if (key.indexOf('atlas:') === 0) return 'atlas';
    if (key.indexOf('stamps:') === 0) return 'stamps';
    if (key === 'exlibris') return 'exlibris';
    return null;
}

/**
 * U-36: иконка строки разблокировки. Атлас — трафарет созвездия: чертёж первой
 * фигуры открывшейся главы, тем же режимом чертежа на бумаге, что у неразгаданной
 * карточки атласа (K-18). Штампы — кружок достижения, как собранная печать сцепки
 * (U-32/U-34) со знаком главы. Экслибрис — тот же кружок, но знак пера (K-21) на
 * волосяном кольце: он не «достижение», золотить его незачем.
 * `key` — первый ключ категории (`atlas:<idx>` / `stamps:<idx>` / `exlibris`).
 */
function levelBannerIconNode(category, key) {
    const px = LEVEL_BANNER_ICON_PX;
    const icon = document.createElement('span');
    icon.className = 'level-banner-icon';
    icon.setAttribute('aria-hidden', 'true');
    if (category === 'atlas') {
        const shapeId = (ATLAS_PAGES[Number(key.split(':')[1])] || [])[0];
        const pattern = (typeof SHAPE_PATTERNS !== 'undefined' && SHAPE_PATTERNS[shapeId]) || null;
        icon.classList.add('level-banner-icon-stencil');
        if (pattern) {
            const canvas = document.createElement('canvas');
            canvas.className = 'shape-glyph';
            sizeGlyphCanvas(canvas, px);
            drawShapeGlyph(canvas, pattern, INK_MUTED_RGB, true, true);
            icon.appendChild(canvas);
        }
        return icon;
    }
    if (category === 'stamps') {
        // Правка заказчика: не собранная печать, а кружок достижения со счётом
        // «0 / 5» — тот же узел, что у текущей печати сцепки (U-32): дуга + два числа.
        // Только что открытая глава — ни одной ступени ещё не взято.
        icon.classList.add('level-banner-icon-seal');
        icon.appendChild(createAchievementSealRing(0));
        icon.appendChild(createAchievementSealNumbers({ current: 0, target: LEVEL_BANNER_SEAL_STEPS }));
        return icon;
    }
    icon.classList.add('level-banner-icon-plain');
    icon.appendChild(glyphSign('pen', 20));
    return icon;
}

function levelBannerCategoryText(category) {
    if (category === 'atlas') return t('book.levelBannerUnlockAtlas');
    if (category === 'stamps') return t('book.levelBannerUnlockStamps');
    if (category === 'exlibris') return t('book.levelBannerUnlockExLibris');
    return '';
}

/**
 * Показать баннер. Батч: несколько уровней в одном заборе — один вызов с
 * массивом. Повторный клейм, пока баннер ещё виден, — мёрджит уровни и их
 * разблокировки в тот же баннер вместо второго; окно висит до тапа (U-36).
 */
function showLevelBanner(newLevels, newUnlockKeys) {
    if (!Array.isArray(newLevels) || newLevels.length === 0) return;
    // Баннер — поверх ОТКРЫТОЙ книги; в реальной игре забор вне книги
    // невозможен физически, а __test.claim() умеет забирать и мимо DOM (K-07).
    if (!bookOpen) return;
    const el = document.getElementById('levelBanner');
    const titleEl = document.getElementById('levelBannerTitle');
    const unlocksEl = document.getElementById('levelBannerUnlocks');
    if (!el || !titleEl || !unlocksEl) return;

    const mergedLevels = new Set(levelBannerLevels);
    for (const lv of newLevels) mergedLevels.add(lv);
    levelBannerLevels = [...mergedLevels].sort((a, b) => a - b);

    const mergedUnlocks = new Set(levelBannerUnlockKeys);
    for (const key of (newUnlockKeys || [])) mergedUnlocks.add(key);
    levelBannerUnlockKeys = [...mergedUnlocks];

    titleEl.textContent = levelBannerTitleText(levelBannerLevels);
    unlocksEl.innerHTML = '';
    const categories = [];
    const categoryKeys = {};
    for (const key of levelBannerUnlockKeys) {
        const cat = levelBannerUnlockCategory(key);
        if (cat && !categories.includes(cat)) {
            categories.push(cat);
            categoryKeys[cat] = key;
        }
    }
    for (const cat of categories) {
        const row = document.createElement('div');
        row.className = 'level-banner-unlock-row';
        row.appendChild(levelBannerIconNode(cat, categoryKeys[cat]));
        const text = document.createElement('span');
        text.className = 'level-banner-unlock-text';
        text.textContent = levelBannerCategoryText(cat);
        row.appendChild(text);
        unlocksEl.appendChild(row);
    }
    // Ступень хвоста ничего не открывает — список пуст и скрыт, баннер несёт
    // только поздравление с уровнем в заголовке.
    unlocksEl.hidden = categories.length === 0;

    el.hidden = false;
    // Форсированный рефлоу — тот же приём, что у книжных доводок K-26
    // (`void book.offsetHeight`), а не requestAnimationFrame: во вкладке,
    // которая не рендерится (свёрнута/не в фокусе), rAF может не выстрелить
    // вовсе, и переход застрянет с classList без -on навсегда.
    void el.offsetHeight;
    el.classList.add('level-banner-on');

    // U-36: таймера показа нет. Окно висит, пока игрок не тапнет куда угодно;
    // первые LEVEL_BANNER_MIN_MS тап его не закрывает. Слушатель ловит касание на
    // захвате и ничего не гасит — тап проходит к тому, во что попал.
    if (levelBannerHideTimer) {
        clearTimeout(levelBannerHideTimer);
        levelBannerHideTimer = null;
    }
    levelBannerShownAt = performance.now();
    if (!levelBannerTapArmed) {
        levelBannerTapArmed = true;
        document.addEventListener('pointerdown', onLevelBannerTap, true);
    }
}

function onLevelBannerTap() {
    if (performance.now() - levelBannerShownAt < LEVEL_BANNER_MIN_MS) return;
    dismissLevelBanner(false);
}

/** immediate=true — обрыв без доигрывания (закрытие книги); false — гаснет плавно. */
function dismissLevelBanner(immediate) {
    if (levelBannerTapArmed) {
        levelBannerTapArmed = false;
        document.removeEventListener('pointerdown', onLevelBannerTap, true);
    }
    if (levelBannerHideTimer) {
        clearTimeout(levelBannerHideTimer);
        levelBannerHideTimer = null;
    }
    levelBannerLevels = [];
    levelBannerUnlockKeys = [];
    const el = document.getElementById('levelBanner');
    if (!el || el.hidden) return;
    el.classList.remove('level-banner-on');
    if (immediate || prefersReducedMotion()) {
        el.hidden = true;
        return;
    }
    // Отложенное скрытие снимается показом нового окна: тап по готовой марке гасит
    // старое на pointerdown, а click тут же поднимает новое.
    levelBannerHideTimer = setTimeout(() => {
        levelBannerHideTimer = null;
        el.hidden = true;
    }, MOTION_SCENE_MS);
}

/**
 * K-05: единственный сигнал на небе. «В книге что-то есть» — готовая награда.
 * U-33 сняла второе условие K-15 (непрочитанное событие мира) — то же сведение,
 * что `todayHasSignal()` уже прошла в U-25.
 * K-37: и второе правило K-12 — марка в неразрезанной главе штампов в счёт не идёт:
 * капля зовёт только туда, где книга уже пускает. Считаем теми же двумя вопросами,
 * что горят на высечках («Сегодня» + открытые главы Штампов), а не сырым
 * `hasClaimableAchievements()` — иначе лента горела при пустой книге.
 */
function hasSkyWaxSignal() {
    return typeof todayHasSignal === 'function' && typeof stampsHaveClaimable === 'function'
        && (todayHasSignal() || stampsHaveClaimable());
}

/**
 * U-31: знак книги на небесной стороне ленты — погашен (--ink-faint) или
 * золотом с сиянием (--gold), когда есть что забрать. Замена капли сургуча;
 * ни числа, ни цвета тревоги.
 */
function updateRibbonSignal() {
    // K-04: заодно освежаем замер ленты — пока небо на экране, она измерима,
    // а к моменту полёта награды книга уже открыта и прячет её.
    getClaimFlightTargetRect();
    const sign = document.getElementById('ribbonSign');
    if (sign) sign.classList.toggle('is-lit', hasSkyWaxSignal());
    renderSkyBookmark();
}

/**
 * U-31: лента одна, две стороны — во время протяжки растёт вместе с пальцем,
 * без перехода (1:1, прямое управление). `el` — узел стороны (`#skyRibbon`
 * или `#bookCloseRibbon`), значения ставятся ему, а хвост (`.ribbon-tail`/
 * `.book-close-ribbon-tail`) читает их через CSS-переменные — они наследуются.
 * `stretchPx` — на сколько лента длиннее покоя (0…RIBBON_STRETCH_PX);
 * `followPx` — на сколько сторона сдвинута вместе с краем книги сверх этого.
 */
function setRibbonPull(el, stretchPx, followPx) {
    if (!el) return;
    el.style.setProperty('--ribbon-pull', `${stretchPx}px`);
    el.style.setProperty('--ribbon-follow', `${followPx}px`);
}

/**
 * Ниже порога протяжки — лента пружинит в покой сама, книга не двигалась.
 * Темп — `--t-micro` (тот же короткий отклик, что был у hover-сдвига хвоста),
 * не сценовый довод книги: это не общее с ней движение, а обрыв натяжения.
 */
function settleRibbonPull(el) {
    if (!el) return;
    const tail = el.querySelector('.ribbon-tail, .book-close-ribbon-tail');
    if (!tail || prefersReducedMotion()) {
        setRibbonPull(el, 0, 0);
        return;
    }
    tail.style.transition = 'height var(--t-micro) var(--ease), transform var(--t-micro) var(--ease)';
    void tail.offsetHeight;
    setRibbonPull(el, 0, 0);
    let done = false;
    const finish = () => {
        if (done) return;
        done = true;
        tail.removeEventListener('transitionend', finish);
        tail.style.transition = '';
    };
    tail.addEventListener('transitionend', finish);
    setTimeout(finish, 260);
}

/**
 * Обе стороны — в покой без перехода. Зовётся из `openBook()`/`closeBook()`
 * (харнесс, Escape, доводы жеста) — состояние ленты обязано быть чистым на
 * любом исходе, иначе книжная сторона рискует не появиться (риск дока).
 */
function resetRibbons() {
    ['skyRibbon', 'bookCloseRibbon'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const tail = el.querySelector('.ribbon-tail, .book-close-ribbon-tail');
        if (tail) tail.style.transition = '';
        setRibbonPull(el, 0, 0);
    });
}

/**
 * K-11: чертёж закладки-цели в верхнем левом углу неба — DOM-узел, как лента
 * (см. «Согласованный план» дока), не мировой объект на канвасе: ему незачем
 * ходить за зумом и паном, он стоит на месте экрана. Прячется, если закладки
 * нет, книга открыта (CSS-правило `.book-open-body .sky-bookmark`), игрок
 * в обсерватории — там это не его небо, — или идёт сцена завершения ночи
 * (V-13): решение заказчика (U-38), сцена гасит небо целиком, отметке
 * закладки не место в ней. Вызывается заново на входе и на выходе из сцены
 * (см. `skyEffects.js`), поэтому чертёж возвращается сразу же, как только
 * она кончилась — естественно или пропуском тапом.
 */
function renderSkyBookmark() {
    const el = document.getElementById('skyBookmark');
    if (!el) return;
    const shapeId = typeof getBookmarkedShape === 'function' ? getBookmarkedShape() : null;
    const inObservatory = typeof isObservatoryMode === 'function' && isObservatoryMode();
    const inFinale = typeof isLevelFinaleActive === 'function' && isLevelFinaleActive();
    el.hidden = !shapeId || inObservatory || inFinale;
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
    // V-19: тот же цвет/градиент огранки, что на карточке атласа (открытый
    // вопрос дока решён в пользу «менять заодно» — иначе чертёж на небе
    // и карточка одной и той же фигуры расходились бы цветом).
    if (canvas && pattern) {
        sizeGlyphCanvas(canvas, 60);
        drawShapeGlyph(canvas, pattern, created ? getShapeGlyphColor(shapeId) : getShapeColor(shapeId), !created);
    }
}

// =============================================================================
// U-32: СТРОКИ СЦЕПОК — общие для «Сегодня» (суточный квест) и Штампов
// =============================================================================
//
// Печать сцепки — круглая, 44 pt, пять на строку (по числу граней огранки).
// Прогресс — только текущего шага, не всей цепочки: счёт в шапке строки и
// полоска-бар K-08/U-24 сняты целиком, всё теперь внутри самого кольца.
// Красный сургуч «готово, прижми» ушёл — сигнал «готово» стал золотым
// (замкнутое кольцо + свечение), а не тревожным цветом (развилка 1 дока).

/**
 * U-32: прогресс текущего шага для печати. У бинарных условий (суточный
 * квест M-05/K-22 — `dailyEntry`/`dailyNight`) `getAchievementStepProgress`
 * честно отдаёт null (см. K-22) — печати нужно что-то нарисовать в кольце,
 * синтезируем «0 / 1» → «1 / 1» из самого `claimable` (развилка 4 дока).
 */
function getAchievementSealProgress(check, claimable) {
    const prog = getAchievementStepProgress(check);
    if (prog) return prog;
    return { current: claimable ? 1 : 0, target: 1 };
}

/**
 * Кольцо прогресса шага — SVG-дуга, растёт от 12 часов по часовой (rotate в CSS).
 * U-34: R = 20.8 — внешний край дуги готовой печати (штрих 2.4) ложится ровно
 * на край тела 44 px, как контур собранной/будущей; при 17.5 кольцо было на
 * 3.5 px меньше соседей и читалось другим, мелким кружком.
 */
function createAchievementSealRing(ratio) {
    const NS = 'http://www.w3.org/2000/svg';
    const SIZE = 44, R = 20.8;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'achv-seal-ring');
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const track = document.createElementNS(NS, 'circle');
    track.setAttribute('class', 'achv-seal-ring-track');
    track.setAttribute('cx', SIZE / 2);
    track.setAttribute('cy', SIZE / 2);
    track.setAttribute('r', R);
    svg.appendChild(track);

    const c = 2 * Math.PI * R;
    const fill = document.createElementNS(NS, 'circle');
    fill.setAttribute('class', 'achv-seal-ring-fill');
    fill.setAttribute('cx', SIZE / 2);
    fill.setAttribute('cy', SIZE / 2);
    fill.setAttribute('r', R);
    fill.setAttribute('stroke-dasharray', c.toFixed(2));
    fill.setAttribute('stroke-dashoffset', (c * (1 - Math.max(0, Math.min(1, ratio)))).toFixed(2));
    svg.appendChild(fill);
    return svg;
}

/**
 * Два числа внутри кольца — текущее крупнее, «/ нужно» мельче (риск дока).
 * Длинные пары («512 / 1000») сжимаются целиком через `-tight`, а не
 * переносятся — переноситься в кольце 44 px попросту некуда.
 */
function createAchievementSealNumbers(prog) {
    const wrap = document.createElement('span');
    wrap.className = 'achv-seal-num';
    if (String(prog.current).length + String(prog.target).length > 6) wrap.classList.add('achv-seal-num-tight');
    const cur = document.createElement('span');
    cur.className = 'achv-seal-num-cur';
    cur.textContent = String(Math.min(prog.current, prog.target));
    const req = document.createElement('span');
    req.className = 'achv-seal-num-req';
    req.textContent = ' / ' + prog.target;
    wrap.appendChild(cur);
    wrap.appendChild(req);
    return wrap;
}

/**
 * Одна печать сцепки. Три главных состояния и один служебный:
 *   собранная — латунь: заливка и контур золотом, знак цепочки золотом;
 *   текущая — тонкое кольцо, дуга прогресса, числа и подпись награды под ним,
 *     кольцо замыкается и светится, когда шаг готов забрать (`-current-ready`);
 *   будущая — серый кружок без числа и без замка;
 *   пустая (слот сверх длины цепочки, развилка 2 дока — суточная цепочка
 *     короче пяти) — тот же кружок, но заметно бледнее: ряд всегда из пяти.
 *
 * Прижимается сама печать — кнопки нет нигде, как и раньше (K-08).
 */
function createAchievementSeal(chain, stepIndex, p) {
    const slot = document.createElement('div');
    slot.className = 'achv-seal-slot';

    const body = document.createElement('div');
    body.className = 'achv-seal-body';
    slot.appendChild(body);

    const label = document.createElement('div');
    label.className = 'achv-seal-label';
    slot.appendChild(label);

    // K-22: суточная цепочка идёт тем же путём — stepIndex у неё выведен
    // recompute'ом из защёлок суток, «текущий» шаг всегда ровно один.
    const collected = stepIndex < p.stepIndex;
    const isCurrent = stepIndex === p.stepIndex;

    if (collected) {
        slot.classList.add('achv-seal-collected');
        body.appendChild(glyphSign(chain.sign || 'arc', 20));
        return slot;
    }

    if (!isCurrent) {
        slot.classList.add('achv-seal-future');
        return slot;
    }

    const reward = getAchievementChainStepReward(chain, stepIndex);
    const prog = getAchievementSealProgress(chain.steps[stepIndex].check, p.claimable);
    const ratio = prog.target > 0 ? prog.current / prog.target : 0;
    const ready = p.claimable;

    slot.classList.add('achv-seal-current');
    body.appendChild(createAchievementSealRing(ratio));
    body.appendChild(createAchievementSealNumbers(prog));
    // U-32: «take» капсом делает CSS (text-transform) — строка локали остаётся
    // нижним регистром и в ru («забрать»), как везде в игре.
    label.textContent = ready ? `${t('rewards.take')} ${reward} ✦` : `${reward} ✦`;

    if (ready) {
        slot.classList.add('achv-seal-current-ready');
        slot.dataset.chainId = chain.id;
        slot.setAttribute('role', 'button');
        slot.tabIndex = 0;
        slot.title = t('rewards.claim');
        const hit = document.createElement('span');
        hit.className = 'achv-seal-hit';
        hit.setAttribute('aria-hidden', 'true');
        slot.appendChild(hit);
        // A-03: по data-chain-id `claimAchievementStep` находит точку старта перелёта ✦
        slot.addEventListener('click', (e) => {
            e.stopPropagation();
            claimAchievementStep(chain.id);
        });
        slot.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            claimAchievementStep(chain.id);
        });
    } else {
        slot.title = t('rewards.claimIdle');
    }
    return slot;
}

/**
 * Пять печатей на строку всегда — столько же, сколько граней у фигуры атласа.
 * U-39: цепочка может задать `sealPositions` — на каких из пяти слотов стоят её
 * реальные шаги (по просьбе заказчика «Evening Rite» стоит на местах 2 и 4,
 * а не подряд у начала); без поля шаги идут по порядку с нулевого слота.
 */
function createAchievementSeals(chain, p) {
    const row = document.createElement('div');
    row.className = 'achv-row-seals';
    const total = chain.steps.length;
    for (let i = 0; i < 5; i++) {
        const stepIndex = chain.sealPositions ? chain.sealPositions.indexOf(i) : (i < total ? i : -1);
        if (stepIndex >= 0 && stepIndex < total) {
            row.appendChild(createAchievementSeal(chain, stepIndex, p));
            continue;
        }
        const empty = document.createElement('div');
        empty.className = 'achv-seal-slot achv-seal-empty';
        const body = document.createElement('div');
        body.className = 'achv-seal-body';
        empty.appendChild(body);
        const label = document.createElement('div');
        label.className = 'achv-seal-label';
        empty.appendChild(label);
        row.appendChild(empty);
    }
    return row;
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
 * K-08/U-32: достижение — сцепка печатей, как в альбоме филателиста. Одна
 * строка: имя, курсивное описание текущего шага под ним, и ряд из пяти
 * круглых печатей — прогресс виден в самом кольце текущей, счёта в шапке
 * и полоски прогресса больше нет (U-32 сняла оба — дублировали кольцо).
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
    row.className = 'achv-row' + (done ? ' achv-row-done' : '');
    row.dataset.chainId = chain.id;

    const title = document.createElement('div');
    title.className = 'achv-row-title';
    title.textContent = chain.title;
    row.appendChild(title);

    // K-29: описание строки — текущий шаг, а не вся цепочка (chain.desc печатал
    // оба шага «Вечернего обряда» разом); пройденная цепочка (stepIndex вне
    // steps) описания не показывает — печатать нечего, но строка не должна
    // схлопнуться по высоте (риск дока) — `descText` остаётся в разметке
    // пустым inline-узлом, а не исчезает вовсе.
    const stepEntry = chain.steps[p.stepIndex];
    const desc = document.createElement('div');
    desc.className = 'achv-row-desc';
    const descText = document.createElement('span');
    descText.className = 'achv-row-desc-text';
    descText.textContent = stepEntry ? stepEntry.desc : '';
    desc.appendChild(descText);
    row.appendChild(desc);

    row.appendChild(createAchievementSeals(chain, p));

    return row;
}

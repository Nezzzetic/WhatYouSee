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
 * K-17: цель у пульса та же, что у монеты, — флажок шкалы, пока книга открыта.
 * U-31: на небе пульс — на знаке ленты, не на хвосте: хвост теперь несёт
 * протяжку (--ribbon-pull/--ribbon-follow), и анимация на нём же смотрелась
 * бы рывком поверх жеста.
 */
function pulseScoreDisplay() {
    const el = (bookOpen && document.querySelector('#bookGauge .book-gauge-flag'))
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
    // только крестик закрытия, см. .ribbon-sign/.book-close-sign в style.css)
    'book'
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

    const solidStyle = (rgb) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    let paintStyle;
    if (blueprint) {
        paintStyle = solidStyle(INK_FAINT_RGB);
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
let levelBannerTimer = null;

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

function levelBannerCategoryText(category) {
    if (category === 'atlas') return t('book.levelBannerUnlockAtlas');
    if (category === 'stamps') return t('book.levelBannerUnlockStamps');
    if (category === 'exlibris') return t('book.levelBannerUnlockExLibris');
    return '';
}

/**
 * Показать баннер. Батч: несколько уровней в одном заборе — один вызов с
 * массивом. Повторный клейм, пока баннер ещё виден, — мёрджит уровни и их
 * разблокировки в тот же баннер и продлевает таймер вместо второго баннера.
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
    for (const key of levelBannerUnlockKeys) {
        const cat = levelBannerUnlockCategory(key);
        if (cat && !categories.includes(cat)) categories.push(cat);
    }
    for (const cat of categories) {
        const row = document.createElement('div');
        row.className = 'level-banner-unlock-row';
        row.textContent = levelBannerCategoryText(cat);
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

    if (levelBannerTimer) clearTimeout(levelBannerTimer);
    levelBannerTimer = setTimeout(
        () => dismissLevelBanner(false), LEVEL_BANNER_HOLD_MS
    );
}

/** immediate=true — обрыв без доигрывания (закрытие книги); false — гаснет плавно. */
function dismissLevelBanner(immediate) {
    if (levelBannerTimer) {
        clearTimeout(levelBannerTimer);
        levelBannerTimer = null;
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
    setTimeout(() => { el.hidden = true; }, MOTION_SCENE_MS);
}

/**
 * K-05: единственный сигнал на небе. «В книге что-то есть» — готовая награда.
 * U-33 сняла второе условие K-15 (непрочитанное событие мира) — то же сведение,
 * что `todayHasSignal()` уже прошла в U-25.
 */
function hasSkyWaxSignal() {
    return typeof hasClaimableAchievements === 'function' && hasClaimableAchievements();
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
    // V-19: тот же цвет/градиент огранки, что на карточке атласа (открытый
    // вопрос дока решён в пользу «менять заодно» — иначе чертёж на небе
    // и карточка одной и той же фигуры расходились бы цветом).
    if (canvas && pattern) {
        sizeGlyphCanvas(canvas, 60);
        drawShapeGlyph(canvas, pattern, created ? getShapeGlyphColor(shapeId) : getShapeColor(shapeId), !created);
    }
}

// =============================================================================
// K-08: СТРОКИ СЦЕПОК — общие для «Сегодня» (суточный квест) и Штампов
// =============================================================================

/**
 * K-08: счёт в шапке сцепки — «23 / 25», «ready» сургучом или «done», когда
 * цепочка пройдена целиком. У шагов суточного квеста считать нечего (условие
 * бинарное, K-22: `getAchievementStepProgress` не знает проверок `dailyEntry`/
 * `dailyNight` и честно отдаёт null) — слот остаётся пустым, а не прочерком
 * (U-30: прочерк читался как отдельная лишняя полоска).
 */
function buildAchievementHeadCount(chain, p, done) {
    if (done) return { text: t('rewards.headDone'), ready: false };
    if (p.claimable) return { text: t('rewards.headReady'), ready: true };
    const prog = getAchievementStepProgress(chain.steps[p.stepIndex].check);
    if (!prog) return { text: '', ready: false };
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

/**
 * U-24: заливка прогресса внутри текущего шага — «N из target» очков до
 * следующей марки, а не «шаг K из 5» (то уже видно клетками ниже). Короткая
 * полоска встаёт в конце строки описания, под счётом (два предыдущих места —
 * отдельной строкой под описанием, затем в шапке рядом со счётом — заказчик
 * поправил дважды по живому экрану до этой раскладки).
 *
 * Считается от того же чек-условия, что и `claimable` (`evaluateAchievementCheck`),
 * поэтому в момент готовности ratio сам приходит к 1 без отдельной ветки —
 * строка не дёргается, когда марка становится готова прижать (тот же принцип,
 * что уже чинила K-23 для другого сигнала).
 */
function createAchievementProgressBar(prog) {
    const bar = document.createElement('div');
    bar.className = 'achv-row-bar';
    const fill = document.createElement('div');
    fill.className = 'achv-row-bar-fill';
    const ratio = prog.target > 0 ? Math.max(0, Math.min(1, prog.current / prog.target)) : 0;
    fill.style.width = (ratio * 100).toFixed(1) + '%';
    bar.appendChild(fill);
    return bar;
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

    // U-24: текущий шаг читается один раз — бар в шапке и описание ниже
    // берут один и тот же stepEntry/prog, не пересчитывают их порознь.
    const stepEntry = chain.steps[p.stepIndex];
    const prog = stepEntry ? getAchievementStepProgress(stepEntry.check) : null;

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
    //
    // U-24: бар — в одной строке с описанием, под счётом (первая версия
    // ставила его в шапку рядом со счётом — по следующему фидбеку заказчика
    // перенесён сюда); только у цепочек с числовым прогрессом (суточный
    // квест и одношаговые условия дают null).
    const desc = document.createElement('div');
    desc.className = 'achv-row-desc';
    const descText = document.createElement('span');
    descText.className = 'achv-row-desc-text';
    descText.textContent = stepEntry ? stepEntry.desc : '';
    desc.appendChild(descText);
    if (prog) desc.appendChild(createAchievementProgressBar(prog));
    row.appendChild(desc);

    row.appendChild(createAchievementTiles(chain, p));

    return row;
}

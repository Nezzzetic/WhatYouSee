// sketch.js — p5.js entry point, main game loop

// =============================================================================
// SKY BACKGROUND
// =============================================================================

let nebulaBuffer = null;

function drawSkyGradient() {
    const ctx = drawingContext;
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    // K-01: ночь книги — глубже к низу. Числа те же, что --night-soft / --night.
    grad.addColorStop(0, `rgb(${NIGHT_SOFT_RGB.join(',')})`);
    grad.addColorStop(1, `rgb(${NIGHT_RGB.join(',')})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
}

function generateNebulaBuffer() {
    if (nebulaBuffer) {
        nebulaBuffer.remove();
        nebulaBuffer = null;
    }
    nebulaBuffer = createGraphics(width, height);
    nebulaBuffer.noStroke();
    const step = 3;
    for (let x = 0; x < width; x += step) {
        for (let y = 0; y < height; y += step) {
            const n = noise(x * 0.003, y * 0.003);
            if (n > 0.55) {
                const a = map(n, 0.55, 1.0, 0, 18);
                nebulaBuffer.fill(NEBULA_TINT_RGB[0], NEBULA_TINT_RGB[1], NEBULA_TINT_RGB[2], a);
                nebulaBuffer.rect(x, y, step, step);
            }
        }
    }
}

// =============================================================================
// IMAGE PRELOADING
// =============================================================================

let constellationImages = {};

// =============================================================================
// APP MODE (B-02)
// =============================================================================
//
// Обсерватория ЗАМЕНЯЕТ СОБОЙ игровое поле, а не живёт отдельным слоем поверх
// канваса. Камера у режимов общая (те же camX/camY/zoomLevel, тот же clampCamera),
// но своя позиция: переключатель прячет одну и достаёт другую — поле обязано
// вернуться ровно там, где его оставили.

let appMode = 'field';
let fieldCameraSlot = null;
let observatoryCameraSlot = null;

function getAppMode() {
    return appMode;
}

function isObservatoryMode() {
    return appMode === 'observatory';
}

function captureCameraSlot() {
    return { camX, camY, zoom: zoomLevel };
}

function restoreCameraSlot(slot) {
    if (!slot) {
        centerCamera();
        return;
    }
    camX = slot.camX;
    camY = slot.camY;
    zoomLevel = slot.zoom;
    clampZoomToField(); // экран мог повернуться, пока режим лежал в кармане
    clampCamera();
}

function setAppMode(mode) {
    if (mode !== 'field' && mode !== 'observatory') return false;
    if (appMode === mode) return false;
    if (mode === 'observatory' && !isObservatoryUnlocked()) return false;

    if (appMode === 'field') {
        // V-13: уход в обсерваторию посреди финала ночи — сцену доигрываем здесь.
        // В обсерватории draw() до updateLevelFinaleCamera не доходит, камера
        // сцены замирает, и по возвращении она дёрнулась бы из сохранённой точки
        // в свою интерполяцию. Доигранная сцена кладёт в слот честный обзор поля.
        if (typeof finishLevelFinaleNow === 'function') finishLevelFinaleNow();
        fieldCameraSlot = captureCameraSlot();
    } else {
        observatoryCameraSlot = captureCameraSlot();
    }

    // Незавершённый жест не должен доехать до другого мира
    currentLines = [];
    resetDragState();
    isPanning = false;
    isPinching = false;
    wasPinching = false;
    if (typeof resetObservatoryDragState === 'function') resetObservatoryDragState();

    appMode = mode;
    restoreCameraSlot(appMode === 'field' ? fieldCameraSlot : observatoryCameraSlot);

    if (typeof updateObservatoryUI === 'function') updateObservatoryUI();
    return true;
}

// =============================================================================
// SETUP
// =============================================================================

function getTopUIHeight() {
    return 0;
}

/**
 * K-05: полосы во всю ширину под небом больше нет — лента-закладка занимает
 * угол, и камера освободилась. Резервируется **только инсет системной панели**:
 * иначе на телефоне нижний край поля лежит под навигационной панелью.
 *
 * Меряется зазором под лентой (`innerHeight − ribbon.bottom`) — читать
 * `--safe-bottom` из JS нельзя, вычисленное значение кастомного свойства
 * остаётся неразвёрнутым `env(...)`. В браузере инсет нулевой, и резерв там
 * ровно ноль.
 *
 * Принятая цена: на минимальном зуме звезда в нижнем правом углу может
 * оказаться под лентой. Достаётся зумом и панорамой — на любом зуме крупнее
 * минимального угол уводится из-под ленты.
 */
let lastBottomInset = 0;

function getBottomUIHeight() {
    // K-13: холст встроенный в разворот страницы Ex Libris не делит экран
    // с лентой вообще — резервировать под неё нечего, вся высота канваса
    // и так уже ровно интерьер рамки (см. updateExLibrisEmbedding).
    if (typeof isExLibrisEmbedActive === 'function' && isExLibrisEmbedActive()) return 0;

    const ribbon = document.getElementById('skyRibbon');
    if (ribbon) {
        const rect = ribbon.getBoundingClientRect();
        // Книга открыта — лента скрыта; держим последний замер, чтобы камера
        // не прыгала на открытии и закрытии.
        if (rect.height > 0) {
            lastBottomInset = Math.max(0, Math.round(window.innerHeight - rect.bottom));
        }
    }
    return lastBottomInset;
}

/** Высота канваса, не перекрытая нижним UI. */
function getUsableViewHeight() {
    return Math.max(1, height - getBottomUIHeight());
}

/** Match p5 canvas size to the visible game area (e.g. after CSS margin for side HUD). */
function resizeGameCanvasToContainer() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    const w = Math.max(1, Math.floor(container.clientWidth));
    const h = Math.max(1, Math.floor(container.clientHeight));
    if (w !== width || h !== height) {
        resizeCanvas(w, h);
        generateNebulaBuffer();
    }
    updateMaxEdgeLengthFromCanvas();
    clampZoomToField();
    clampCamera();
}

// =============================================================================
// K-13: ЭКСЛИБРИС ВСТРОЕН В СТРАНИЦУ
// =============================================================================
//
// Обсерватория переросла полноэкранный режим (B-02→K-06): вместо отдельного
// мира на весь канвас она теперь гравюра, вклеенная в разворот книги. Приём —
// НЕ отдельная система клампов для уменьшенной области (о которой говорил
// risk 1 дока), а физический ресайз/репозиция самого #canvas-container поверх
// плейсхолдера страницы: p5 меняет width/height канваса по-настоящему, и вся
// существующая арифметика camera.js (клампы, getMinZoomLevel, мировые
// координаты мыши) продолжает работать без единой правки — она и так считает
// от фактического размера канваса, а не от размера окна.

/** Встроенный вид активен, когда страница «Ex Libris» открыта и небо — второе. */
function isExLibrisEmbedActive() {
    return typeof bookOpen !== 'undefined' && bookOpen && bookCut === 'exlibris'
        && appMode === 'observatory';
}

/**
 * Переносит #canvas-container (и, следом, сам p5-канвас) поверх
 * #exLibrisCanvasSlot — плейсхолдера, который только резервирует место в
 * вёрстке страницы. Зовётся из updateObservatoryUI() при каждой смене режима
 * и высечки книги, а также при повороте/ресайзе экрана.
 */
function updateExLibrisEmbedding() {
    const container = document.getElementById('canvas-container');
    const overlay = document.getElementById('exLibrisFrameOverlay');
    const slot = document.getElementById('exLibrisCanvasSlot');
    if (!container) return;

    const embed = isExLibrisEmbedActive() && slot && slot.offsetParent !== null;
    if (embed) {
        const rect = slot.getBoundingClientRect();
        container.classList.add('canvas-embedded');
        container.style.left = Math.round(rect.left) + 'px';
        container.style.top = Math.round(rect.top) + 'px';
        container.style.width = Math.round(rect.width) + 'px';
        container.style.height = Math.round(rect.height) + 'px';
        if (overlay) {
            overlay.classList.add('exlibris-frame-on');
            overlay.style.left = container.style.left;
            overlay.style.top = container.style.top;
            overlay.style.width = container.style.width;
            overlay.style.height = container.style.height;
        }
    } else {
        container.classList.remove('canvas-embedded');
        container.style.left = '';
        container.style.top = '';
        container.style.width = '';
        container.style.height = '';
        if (overlay) overlay.classList.remove('exlibris-frame-on');
    }
    resizeGameCanvasToContainer();
}

function setup() {
    const container = document.getElementById('canvas-container');
    const guessW = Math.max(1, Math.floor(container?.clientWidth || window.innerWidth * 0.6));
    const guessH = Math.max(1, Math.floor(container?.clientHeight || window.innerHeight));
    const canvas = createCanvas(guessW, guessH);
    canvas.parent('canvas-container');
    resizeGameCanvasToContainer();
    updateMaxEdgeLengthFromCanvas();
    generateNebulaBuffer();
    // K-01: канвас пишет тем же шрифтом, что и книга. Гротеска в игре нет.
    textFont("'EB Garamond', Georgia, 'Times New Roman', serif");

    for (const [name, info] of Object.entries(SHAPES)) {
        if (info.image) {
            const img = new Image();
            img.onload = () => { console.log('Constellation image loaded:', name, img.width + 'x' + img.height); };
            img.onerror = () => {
                console.warn('Failed to load constellation image:', name);
                delete constellationImages[name];
            };
            img.src = 'images/' + info.image;
            constellationImages[name] = img;
        }
    }

    loadProgression();
    // B-02: холст живёт своим ключом и переживает смену дня — поднимаем его
    // сразу после прогрессии (нужен playerId) и до генерации поля.
    initObservatory();

    if (!loadGame()) {
        startNewDailySky({ saveAfter: true });
    } else {
        // Повторное открытие: быстрый fade (уже работали с этим небом)
        skyStartTime = millis();
        skyFadeScale = 0.25;
        if (shouldLoadPictureField() && typeof console !== 'undefined' && console.warn) {
            console.warn('[picture] Загружено сохранение: поле-картинка не применена. Нажми «Сбросить небо» в dev-панели, чтобы перегенерировать.');
        }
    }

    centerCamera();

    updateScoreUI(0, '', 0);
    updateProgressionUI();
    closeBook();
    recomputeAchievementsClaimable();
    updateRibbonSignal();
    updateObservatoryUI();

    setupBookControls();
    const devControls = document.getElementById("devControls");
    const resetBtn = document.getElementById("resetButton");
    const fullResetBtn = document.getElementById("fullResetButton");
    const devNewDayBtn = document.getElementById("devNewDayButton");
    const devResetAchvBtn = document.getElementById("devResetAchievementsButton");
    // D-01: панель скрыта по умолчанию; ?dev=1 — форс-показ при загрузке
    if (!isDevModeEnabled()) {
        if (devControls) devControls.style.display = "none";
    }
    setupDevToggleButton();
    resetBtn?.addEventListener("click", onResetSky);
    fullResetBtn?.addEventListener("click", onFullReset);
    devNewDayBtn?.addEventListener("click", onDevNewDay);
    document.getElementById("devAddMetaButton")?.addEventListener("click", onDevAddMetaScore);
    devResetAchvBtn?.addEventListener("click", onDevResetAchievements);
    initDevPictureFieldFromUrl();
    populateDevPictureFieldSelect();
    document.getElementById("devPictureFieldShowBtn")?.addEventListener("click", onDevPictureFieldShow);
    document.getElementById("zoomInButton")?.addEventListener("click", () => zoomByStep(1));
    document.getElementById("zoomOutButton")?.addEventListener("click", () => zoomByStep(-1));

    window.addEventListener("keydown", onGlobalPopupKeydown);
}

// =============================================================================
// DRAW
// =============================================================================

function draw() {
    drawSkyGradient();
    if (nebulaBuffer) image(nebulaBuffer, 0, 0);

    // B-02: обсерватория — второй мир на том же канвасе. Ни счётчиков, ни
    // подписей черновика: здесь нечего считать.
    if (appMode === 'observatory') {
        drawObservatoryMode();
        return;
    }

    updateEdgePanDuringDraw(); // U-07: пан камеры, если палец у края во время рисования
    updateLevelFinaleCamera(); // V-13: отзум финала ночи — до отрисовки кадра
    drawFieldMode();
    drawDraftStarCountLabelScreen();
    drawFloatingScores();
    drawUndoMarkScreen(); // K-04: пометка корректора — поверх всего, что на небе
}

// =============================================================================
// WINDOW RESIZE
// =============================================================================

function windowResized() {
    if (typeof isExLibrisEmbedActive === 'function' && isExLibrisEmbedActive()) {
        // K-13: слот страницы мог сместиться/изменить размер вместе с окном —
        // пересчитываем прямоугольник заново, а не просто ресайзим канвас
        // на его прежнем месте.
        updateExLibrisEmbedding();
        return;
    }
    resizeGameCanvasToContainer();
}

// =============================================================================
// DEV PANEL TOGGLE (D-01)
// =============================================================================

let _devTapCount = 0;
let _devTapLastMs = 0;

function toggleDevControls() {
    const el = document.getElementById("devControls");
    if (!el) return;
    el.style.display = el.style.display === "none" ? "" : "none";
}

/** Невидимая кнопка в левом нижнем углу: тройной быстрый тап — показать/скрыть панель. */
function setupDevToggleButton() {
    const btn = document.getElementById("devToggleBtn");
    if (!btn) return;
    btn.addEventListener("click", () => {
        const now = Date.now();
        if (now - _devTapLastMs > DEV_TOGGLE_TAP_WINDOW_MS) _devTapCount = 0;
        _devTapCount++;
        _devTapLastMs = now;
        if (_devTapCount >= DEV_TOGGLE_TAP_COUNT) {
            _devTapCount = 0;
            toggleDevControls();
        }
    });
}

// =============================================================================
// MOUSE WHEEL ZOOM
// =============================================================================

function mouseWheel(event) {
    if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;

    const delta = event.delta > 0 ? -ZOOM_STEP : ZOOM_STEP;
    zoomAtScreenPoint(mouseX, mouseY, zoomLevel + delta);

    return false;
}

// =============================================================================
// RESET / NEW DAY
// =============================================================================

function resetFieldSessionState() {
    constellationArtRevealed = false;
    revealTime = 0;
    undoFloor = 0;

    totalScore = 0;
    constellations = [];
    uniqueShapesFound = new Set();
    bonusAwardedClasses = new Set();
    fieldGoalsAchieved = [false, false, false];
    fieldGoalRewardsClaimed = [false, false, false];
    floatingScores = [];
    if (typeof cancelUndoMark === 'function') cancelUndoMark(); // K-04: окна отмены у нового неба нет
    bestScore = 0;
    resetStarCountBonusState();
    resetRecordScoreBadge();
    atlasCollectedStarColors = new Map();
    if (typeof connectFeedbackState !== 'undefined' && connectFeedbackState instanceof Map) connectFeedbackState.clear();
    if (typeof cancelCommitWave === 'function') cancelCommitWave();
    if (typeof cancelLevelFinale === 'function') cancelLevelFinale();
    if (typeof resetPerNightAchievementFlags === 'function') resetPerNightAchievementFlags();
}

function regenerateFieldStarsAfterReset() {
    if (shouldLoadPictureField()) {
        generatePictureField();
        dailyTargetShapes = [];
        assignStarAppearDelays();
        generateBackgroundStars();
    } else {
        generateDailyField();
    }
}

function startNewDailySky(options) {
    const opts = options || {};
    closeBook();
    resetFieldSessionState();
    // M-05: суточные квесты обновляются вместе с небом. Здесь — потому что это
    // единственный путь «пришло новое небо»: первая загрузка дня, dev «новый
    // день», харнесс. `onResetSky` ниже эту функцию не зовёт намеренно —
    // он перегенерирует поле тех же суток, и квесты обязаны остаться забранными.
    if (typeof ensureDailyQuestsForToday === 'function') ensureDailyQuestsForToday();
    clearSave();

    regenerateFieldStarsAfterReset();
    skyStartTime = millis();
    skyFadeScale = 1.0;
    centerCamera();

    resetDragState();
    isPanning = false;

    updateScoreUI(0, '', 0);
    updateProgressionUI();
    recomputeAchievementsClaimable();
    updateRibbonSignal();

    if (opts.saveAfter !== false) {
        autoSave();
    }
}

function onResetSky() {
    closeBook();
    resetFieldSessionState();

    if (shouldLoadPictureField()) {
        generatePictureField();
        dailyTargetShapes = [];
        assignStarAppearDelays();
        generateBackgroundStars();
    } else {
        generateDailyField(); // включает штатный воскресный показ картинки
    }

    skyStartTime = millis();
    skyFadeScale = 1.0;
    centerCamera();
    resetDragState();
    isPanning = false;

    updateScoreUI(0, '', 0);
    updateProgressionUI();
    recomputeAchievementsClaimable();
    updateRibbonSignal();

    clearSave();
    autoSave();
}

function onDevNewDay() {
    incrementDevDayOffset();
    startNewDailySky({ saveAfter: true });
    if (typeof console !== 'undefined' && console.info) {
        console.info('[dev] Новый день. effectiveDate:', getEffectiveSkyDateInt(), 'targets:', getDailyTargetShapes());
    }
}

// C-02: админ-дропдаун выбора поля-картинки + кнопка «Показать».
// Пустое значение = «обычное поле» (снимает ручной override; в воскресенье
// вернётся штатная авто-картинка).

/** Если картинка активна через URL — отразить её в dev-состоянии при загрузке. */
function initDevPictureFieldFromUrl() {
    if (typeof getActivePictureFieldId !== 'function' || typeof setDevPictureFieldId !== 'function') return;
    const active = getActivePictureFieldId();
    if (active) setDevPictureFieldId(active);
}

function populateDevPictureFieldSelect() {
    const sel = document.getElementById("devPictureFieldSelect");
    if (!sel) return;
    if (typeof PICTURE_FIELD_IDS === 'undefined' || !Array.isArray(PICTURE_FIELD_IDS)) return;

    sel.innerHTML = "";
    const optNone = document.createElement("option");
    optNone.value = "";
    optNone.textContent = "— обычное поле —";
    sel.appendChild(optNone);

    for (const id of PICTURE_FIELD_IDS) {
        const pic = typeof getPictureFieldById === 'function' ? getPictureFieldById(id) : null;
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = pic ? pic.name : id;
        sel.appendChild(opt);
    }

    const current = typeof getDevPictureFieldId === 'function' ? getDevPictureFieldId() : null;
    sel.value = current || "";
}

function onDevPictureFieldShow() {
    const sel = document.getElementById("devPictureFieldSelect");
    if (!sel) return;
    const value = sel.value || null;
    if (typeof setDevPictureFieldId === 'function') setDevPictureFieldId(value);
    onResetSky();
}

/**
 * Dev: +100 ✦ ровно тем же путём, что забор награды за шаг цепочки —
 * `awardMetaScore` + хвост `claimAchievementStep` (achievements.js:904).
 * Отсюда бесплатно приезжают все побочные события: автооткрытие страницы
 * атласа с тостом, выдача звёзд обсерватории, тост об её открытии, пересчёт
 * забираемых шагов и тост «новое достижение доступно».
 *
 * Как и настоящий забор, поднимает undoFloor: событие необратимое.
 */
const DEV_META_SCORE_STEP = 100;

function onDevAddMetaScore() {
    const before = getMetaScore();

    // A-03: отклик забора приходится вешать отдельной строкой — эта функция
    // дублирует хвост `claimAchievementStep` руками, а не зовёт его. Иначе
    // dev-кнопка молча разошлась бы с боевым путём ровно там, где ей полагается
    // быть его точной копией (в том числе для калибровки звука и дуги).
    const fromRect = (function () {
        const btn = document.getElementById('devAddMetaButton');
        return btn ? btn.getBoundingClientRect() : null;
    })();
    if (typeof initAudio === 'function') initAudio();
    if (typeof playClaim === 'function') playClaim(DEV_META_SCORE_STEP);
    if (typeof flyClaimReward === 'function') flyClaimReward(fromRect, DEV_META_SCORE_STEP);

    awardMetaScore(DEV_META_SCORE_STEP);
    if (typeof raiseUndoFloor === 'function') raiseUndoFloor();
    recomputeAchievementsClaimable();
    saveProgression();

    updateProgressionUI();
    updateObservatoryUI();
    refreshBookIfOpen();
    updateRibbonSignal();

    if (typeof console !== 'undefined' && console.info) {
        console.info('[dev] +' + DEV_META_SCORE_STEP + ' ✦:', before, '→', getMetaScore(),
            '· за всё время:', getLifetimeMetaEarned(),
            '· звёзд обсерватории:', observatoryStars.length);
    }
}

function onDevResetAchievements() {
    if (typeof resetAchievementsForFullReset === 'function') resetAchievementsForFullReset();
    if (typeof resetPerNightAchievementFlags === 'function') resetPerNightAchievementFlags();
    saveProgression();
    recomputeAchievementsClaimable();
    updateRibbonSignal();
    refreshBookIfOpen();
    if (typeof console !== 'undefined' && console.info) console.info('[dev] Достижения сброшены');
}

/**
 * Полный сброс без вопросов: прогресс, поле, UI.
 * T-01: тот же путь использует `__test.reset()`, поэтому здесь есть хук
 * `beforeFieldRegen` — он срабатывает после сброса прогрессии, но ДО генерации
 * поля. Тестовый сценарий доводит им прогресс до нужного состояния (например,
 * открывает страницы атласа), чтобы дневные цели и видимость фигур считались
 * уже от него.
 */
function performFullReset(options) {
    const opts = options || {};

    closeBook();
    resetFieldSessionState();
    customTypes = [];

    resetProgressionForFullReset();
    // B-02: вайп забирает и холст. Отдельного confirm не заводим — тот, что уже
    // стоит в onFullReset, покрывает и обсерваторию (решение заказчика 2026-08-04).
    if (typeof resetObservatoryForFullReset === 'function') resetObservatoryForFullReset();
    appMode = 'field';
    fieldCameraSlot = null;
    observatoryCameraSlot = null;
    if (typeof opts.beforeFieldRegen === 'function') opts.beforeFieldRegen();
    // M-05: вайп обнулил блок суток вместе со всем остальным (date = 0) —
    // проставляем текущие сутки, иначе первый же коммит взвёл бы защёлку
    // в блоке несуществующего дня.
    if (typeof ensureDailyQuestsForToday === 'function') ensureDailyQuestsForToday();
    saveProgression();
    // Хук beforeFieldRegen (T-01) открывает страницы бесплатно, накопитель не
    // трогая, — после вайпа обсерватория обязана быть закрытой и пустой.
    // Вызов защитный: при lifetimeMetaEarned = 0 выдавать нечего.
    if (typeof grantObservatoryStarsDue === 'function') grantObservatoryStarsDue();

    regenerateFieldStarsAfterReset();
    skyStartTime = millis();
    skyFadeScale = 1.0;
    centerCamera();

    resetDragState();
    isPanning = false;

    updateScoreUI(0, '', 0);
    updateProgressionUI();
    recomputeAchievementsClaimable();
    updateRibbonSignal();
    updateObservatoryUI();

    clearSave();
    autoSave();
}

function onFullReset() {
    if (!confirm('Полный сброс удалит ВСЕ данные: очки, прогресс, уровень, пользовательские виды. Продолжить?')) return;
    performFullReset();
}

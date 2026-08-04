// sketch.js — p5.js entry point, main game loop

// =============================================================================
// SKY BACKGROUND
// =============================================================================

let nebulaBuffer = null;

function drawSkyGradient() {
    const ctx = drawingContext;
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#0A0F28');
    grad.addColorStop(1, '#000005');
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
                nebulaBuffer.fill(80, 60, 160, a);
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

    // Подсказки созвездий в обсерватории не нужны — фигур здесь нет
    setConstellationHintsPanelVisible(false);
    if (typeof updateObservatoryUI === 'function') updateObservatoryUI();
    updateUndoConstellationButtonState();
    return true;
}

// =============================================================================
// SETUP
// =============================================================================

function getTopUIHeight() {
    return 0;
}

/**
 * U-09: свёрнутая шторка закрывает нижнюю полосу канваса. Камера и минимальный
 * зум считаются от «рабочей» высоты — иначе нижний край поля навсегда остаётся
 * под UI и до тех звёзд не дотянуться.
 */
function getBottomUIHeight() {
    const peek = document.getElementById('peekBar');
    if (!peek) return 0;
    // Шторка открыта — свёрнутая полоса скрыта, но резерв оставляем прежний,
    // чтобы камера не прыгала при открытии и закрытии.
    const measured = peek.offsetHeight;
    return measured > 0 ? measured : BOTTOM_UI_FALLBACK_HEIGHT;
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
    }
    updateMaxEdgeLengthFromCanvas();
    clampZoomToField();
    clampCamera();
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
    textFont("system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif");

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
        if (shouldLoadMustachePracticeLevel() && typeof console !== 'undefined' && console.warn) {
            console.warn('[mustache=1] Загружено сохранение: эталон «Усы» не применён. Открой с ?dev=1 для кнопки «Сбросить небо», или удали ключ localStorage starsReborn_v03.');
        }
        if (shouldLoadPictureField() && typeof console !== 'undefined' && console.warn) {
            console.warn('[picture] Загружено сохранение: поле-картинка не применена. Нажми «Сбросить небо» в dev-панели, чтобы перегенерировать.');
        }
    }

    centerCamera();

    setConstellationHintsPanelVisible(false);

    updateScoreUI(0, '', 0);
    updateProgressionUI();
    initConstellationHints();
    closeSheet();
    recomputeAchievementsClaimable();
    updatePeekBar();

    updateUndoConstellationButtonState();
    updateObservatoryUI();

    setupSheetControls();
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
    devResetAchvBtn?.addEventListener("click", onDevResetAchievements);
    initDevPictureFieldFromUrl();
    populateDevPictureFieldSelect();
    document.getElementById("devPictureFieldShowBtn")?.addEventListener("click", onDevPictureFieldShow);
    document.getElementById("zoomInButton")?.addEventListener("click", () => zoomByStep(1));
    document.getElementById("zoomOutButton")?.addEventListener("click", () => zoomByStep(-1));

    document.getElementById("undoLastConstellationBtn")?.addEventListener("click", undoLastConstellation);

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
    drawFieldMode();
    drawDraftStarCountLabelScreen();
    drawFloatingScores();
}

// =============================================================================
// WINDOW RESIZE
// =============================================================================

function windowResized() {
    resizeGameCanvasToContainer();
    generateNebulaBuffer();
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
    bestScore = 0;
    levelCompletePointsAwarded = false;
    resetStarCountBonusState();
    resetRecordScoreBadge();
    atlasCollectedStarColors = new Map();
    if (typeof connectFeedbackState !== 'undefined' && connectFeedbackState instanceof Map) connectFeedbackState.clear();
    if (typeof resetPerNightAchievementFlags === 'function') resetPerNightAchievementFlags();
}

function regenerateFieldStarsAfterReset() {
    if (shouldLoadPictureField()) {
        generatePictureField();
        dailyTargetShapes = [];
        assignStarAppearDelays();
        generateBackgroundStars();
    } else if (shouldLoadMustachePracticeLevel()) {
        generateStarsMustachePractice();
        dailyTargetShapes = [];
    } else {
        generateDailyField();
    }
}

function startNewDailySky(options) {
    const opts = options || {};
    closeSheet();
    resetFieldSessionState();
    clearSave();

    regenerateFieldStarsAfterReset();
    skyStartTime = millis();
    skyFadeScale = 1.0;
    centerCamera();

    resetDragState();
    isPanning = false;

    updateScoreUI(0, '', 0);
    updateProgressionUI();
    refreshConstellationHints();
    recomputeAchievementsClaimable();
    updatePeekBar();
    updateUndoConstellationButtonState();

    if (opts.saveAfter !== false) {
        autoSave();
    }
}

function onResetSky() {
    closeSheet();
    resetFieldSessionState();

    if (shouldLoadPictureField()) {
        generatePictureField();
        dailyTargetShapes = [];
        assignStarAppearDelays();
        generateBackgroundStars();
    } else if (shouldLoadMustachePracticeLevel()) {
        generateStarsMustachePractice();
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
    refreshConstellationHints();
    recomputeAchievementsClaimable();
    updatePeekBar();
    updateUndoConstellationButtonState();

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

function onDevResetAchievements() {
    if (typeof resetAchievementsForFullReset === 'function') resetAchievementsForFullReset();
    if (typeof resetPerNightAchievementFlags === 'function') resetPerNightAchievementFlags();
    saveProgression();
    recomputeAchievementsClaimable();
    updatePeekBar();
    refreshSheetIfOpen();
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

    closeSheet();
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
    refreshConstellationHints();
    recomputeAchievementsClaimable();
    updatePeekBar();
    updateUndoConstellationButtonState();
    updateObservatoryUI();

    clearSave();
    autoSave();
}

function onFullReset() {
    if (!confirm('Полный сброс удалит ВСЕ данные: очки, прогресс, уровень, пользовательские виды. Продолжить?')) return;
    performFullReset();
}

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
// SETUP
// =============================================================================

function getTopUIHeight() {
    return 0;
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

    if (!loadGame()) {
        startNewDailySky({ saveAfter: true });
    } else {
        // Повторное открытие: быстрый fade (уже работали с этим небом)
        skyStartTime = millis();
        skyFadeScale = 0.25;
        if (shouldLoadMustachePracticeLevel() && typeof console !== 'undefined' && console.warn) {
            console.warn('[mustache=1] Загружено сохранение: эталон «Усы» не применён. Открой с ?dev=1 для кнопки «Сбросить небо», или удали ключ localStorage starsReborn_v02.');
        }
    }

    centerCamera();

    setConstellationHintsPanelVisible(false);

    updateScoreUI(0, '', 0);
    updateProgressionUI();
    initConstellationHints();
    hideAtlasOverlay();
    hideAchievementsOverlay();
    updateAtlasButtonState();
    recomputeAchievementsClaimable();
    updateAchievementsButtonState();

    updateUndoConstellationButtonState();

    document.getElementById("atlasBtn")?.addEventListener("click", showAtlasOverlay);
    document.getElementById("closeAtlasBtn")?.addEventListener("click", hideAtlasOverlay);
    document.getElementById("atlasOverlay")?.addEventListener("click", onAtlasOverlayClick);
    document.getElementById("achievementsBtn")?.addEventListener("click", showAchievementsOverlay);
    document.getElementById("closeAchievementsBtn")?.addEventListener("click", hideAchievementsOverlay);
    document.getElementById("achievementsOverlay")?.addEventListener("click", onAchievementsOverlayClick);
    document.getElementById("achievementsWindow")?.addEventListener("click", closeAllAchievementTooltips);
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
    document.getElementById("zoomInButton")?.addEventListener("click", () => zoomByStep(1));
    document.getElementById("zoomOutButton")?.addEventListener("click", () => zoomByStep(-1));

    document.getElementById("undoLastConstellationBtn")?.addEventListener("click", undoLastConstellation);

    window.addEventListener("keydown", onGlobalPopupKeydown);
}

// =============================================================================
// DRAW
// =============================================================================

function draw() {
    updateEdgePanDuringDraw(); // U-07: пан камеры, если палец у края во время рисования
    drawSkyGradient();
    if (nebulaBuffer) image(nebulaBuffer, 0, 0);
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
    if (typeof resetPerNightAchievementFlags === 'function') resetPerNightAchievementFlags();
}

function regenerateFieldStarsAfterReset() {
    if (shouldLoadMustachePracticeLevel()) {
        generateStarsMustachePractice();
        dailyTargetShapes = [];
    } else {
        generateDailyField();
    }
}

function startNewDailySky(options) {
    const opts = options || {};
    hideAtlasOverlay();
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
    updateAtlasButtonState();
    recomputeAchievementsClaimable();
    updateAchievementsButtonState();
    updateUndoConstellationButtonState();

    if (opts.saveAfter !== false) {
        autoSave();
    }
}

function onResetSky() {
    hideAtlasOverlay();
    resetFieldSessionState();

    if (shouldLoadMustachePracticeLevel()) {
        generateStarsMustachePractice();
        generateBackgroundStars();
    } else {
        seedSkyRandomForToday();
        generateStars();
        pickDailyTargets();
        if (INJECT_ANCHOR_STARS) {
            injectAnchorStarsForTargets(dailyTargetShapes); // dead code — INJECT_ANCHOR_STARS=false
        }
        assignStarAppearDelays();
        generateBackgroundStars();
    }

    skyStartTime = millis();
    skyFadeScale = 1.0;
    centerCamera();
    resetDragState();
    isPanning = false;

    updateScoreUI(0, '', 0);
    updateProgressionUI();
    refreshConstellationHints();
    updateAtlasButtonState();
    recomputeAchievementsClaimable();
    updateAchievementsButtonState();
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

function onDevResetAchievements() {
    if (typeof resetAchievementsForFullReset === 'function') resetAchievementsForFullReset();
    if (typeof resetPerNightAchievementFlags === 'function') resetPerNightAchievementFlags();
    saveProgression();
    recomputeAchievementsClaimable();
    updateAchievementsButtonState();
    const overlay = document.getElementById('achievementsOverlay');
    if (overlay && overlay.classList.contains('visible')) renderAchievementsOverlay();
    if (typeof console !== 'undefined' && console.info) console.info('[dev] Достижения сброшены');
}

function onFullReset() {
    if (!confirm('Полный сброс удалит ВСЕ данные: очки, прогресс, уровень, пользовательские виды. Продолжить?')) return;

    hideAtlasOverlay();
    resetFieldSessionState();
    customTypes = [];

    resetProgressionForFullReset();
    saveProgression();

    regenerateFieldStarsAfterReset();
    skyStartTime = millis();
    skyFadeScale = 1.0;
    centerCamera();

    resetDragState();
    isPanning = false;

    updateScoreUI(0, '', 0);
    updateProgressionUI();
    refreshConstellationHints();
    updateAtlasButtonState();
    recomputeAchievementsClaimable();
    updateAchievementsButtonState();
    updateUndoConstellationButtonState();

    clearSave();
    autoSave();
}

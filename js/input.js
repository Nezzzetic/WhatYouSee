// input.js — ввод на небе: мышь и касания, черновик созвездия под пальцем,
// пинч-зум и пан у края экрана (R-05).

// =============================================================================
// СОСТОЯНИЕ ЧЕРНОВИКА (жест протяжки)
// =============================================================================

let currentLine = null;
let currentLines = [];
let isDragging = false;
let currentStartStar = null;
let visitedStars = [];

let attachFlashStarId = null;
let attachFlashStartTime = 0;

/**
 * U-23: показ счётчика звёзд у пальца. Живёт вне сейва, как commitWave/undoMark —
 * состояние черновика не переживает перезагрузку по построению (drag её не
 * переживает), поэтому версии у поля нет и не будет.
 * null | { key, n, appearMs, changeMs }
 */
let draftCountLabel = null;

function resetDraftCountLabelState() {
    draftCountLabel = null;
}

/**
 * Ключ показа изменился (визиты / рёбра / подсказка атласа). `changeMs` двигается
 * всегда — он держит паузу до угасания. `appearMs` (старт fade-in) переезжает на
 * `now` — то есть анимация появления переигрывается — при смене самой цифры
 * (по прямому фидбеку заказчика 2026-09-06: каждая новая звезда должна быть
 * видна как отдельное появление числа). Если цифра та же, а поменялось что-то
 * ещё (замыкание кольца, подсказка атласа) — `appearMs` не трогаем, пока группа
 * ещё видна, иначе такая смена мигала бы с нуля вместо простого обновления.
 */
function noteDraftCountLabelChange(key, n) {
    const now = millis();
    let appearMs = now;
    if (draftCountLabel) {
        const nChanged = draftCountLabel.n !== n;
        if (!nChanged) {
            const reduced = typeof prefersReducedMotion === 'function' && prefersReducedMotion();
            // risePx = 0: только alpha важна здесь, подъём эта ветка не рисует.
            const anim = computeDraftCountLabelAnim(
                now - draftCountLabel.appearMs,
                now - draftCountLabel.changeMs,
                DRAFT_COUNT_LABEL_IN_MS, DRAFT_COUNT_LABEL_HOLD_MS, DRAFT_COUNT_LABEL_OUT_MS,
                reduced, 0
            );
            if (anim.alpha > 0) appearMs = draftCountLabel.appearMs; // ещё видна — fade-in не перезапускаем
        }
        // nChanged === true: appearMs остаётся now — цифра переигрывает появление.
    }
    draftCountLabel = { key, n, appearMs, changeMs: now };
}

let draftAtlasHintCacheKey = '';
let draftAtlasHintCacheLabel = null;

function clearDraftAtlasHintCache() {
    draftAtlasHintCacheKey = '';
    draftAtlasHintCacheLabel = null;
}

/** Имя фигуры из открытой страницы атласа, если черновик уже распознаётся (кэш по рёбрам). */
function getDraftUnlockedAtlasShapeHint() {
    if (!currentLines || currentLines.length === 0) return null;

    const starIds = new Set();
    for (const seg of currentLines) {
        starIds.add(seg.startId);
        starIds.add(seg.endId);
    }
    if (starIds.size < 3) return null;

    const key = currentLines.map(s => `${s.startId}-${s.endId}`).join('|')
        + ':' + [...starIds].sort((a, b) => a - b).join(',');
    if (key === draftAtlasHintCacheKey) return draftAtlasHintCacheLabel;

    draftAtlasHintCacheKey = key;
    draftAtlasHintCacheLabel = null;

    if (typeof recognizeShapeDetailed !== 'function') return null;

    let label = null;
    try {
        const recognition = recognizeShapeDetailed(currentLines, starIds);
        label = recognition && recognition.label;
    } catch (_) {
        return null;
    }

    if (!label || label === SHAPE_UNRECOGNIZED) return null;
    if (typeof isBuiltinShapeEnabled === 'function' && !isBuiltinShapeEnabled(label)) return null;
    if (typeof isShapeVisibleInAtlas !== 'function' || !isShapeVisibleInAtlas(label)) return null;
    if (isAtlasShapeAlreadyOnField(label)) return null;

    draftAtlasHintCacheLabel = label;
    return label;
}

// =============================================================================
// INPUT HANDLERS (p5.js)
// =============================================================================

/**
 * K-06: пока книга открыта, ПОЛЕ не рисует и не панорамируется. Только поле —
 * с K-13 книга открыта постоянно, пока мы в обсерватории (одна страница), и
 * вызывающий код обязан сам исключать обсерваторию до этой проверки, иначе
 * она гасит там весь ввод.
 */
function isBlockingOverlayOpen() {
    return typeof isBookOpen === 'function' && isBookOpen();
}

/** D-01: событие пришло с канваса, а не с DOM-кнопки/панели поверх него. */
function isPointerEventOnCanvas(event) {
    return !(event && event.target && event.target.tagName && event.target.tagName !== 'CANVAS');
}

function mousePressed(event) {
    initAudio();
    if (!isPointerEventOnCanvas(event)) return; // клики по HUD/панелям не рисуют и не панорамируют
    if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;

    // B-02/K-13: обсерватория — свой мир со своими правилами ввода. Ветка
    // ранняя, до любых полевых проверок (переименование, locked, bbox — там
    // ничего этого нет) И до isBlockingOverlayOpen(): тот гейт писан для поля
    // («книга открыта — не рисуем»), а с K-13 книга открыта ВСЕГДА, пока мы
    // в обсерватории (одна страница, вход больше не закрывает её сам) — если
    // не вынести проверку сюда, обсерватория не реагирует на ввод вообще.
    if (typeof isObservatoryMode === 'function' && isObservatoryMode()) {
        observatoryMousePressed();
        return;
    }

    if (isBlockingOverlayOpen()) return;

    // V-13: тап посреди финала ночи доигрывает сцену мгновенно и съедается
    // целиком — иначе он попал бы на голое звёздное поле сцены раньше, чем
    // созвездия успели родиться заново.
    if (isLevelFinaleActive()) {
        finishLevelFinaleNow();
        return;
    }

    // K-04: пометка корректора — единственный вход в отмену. Проверяется раньше
    // звёзд: она висит поверх неба четыре секунды, и тап по ней ничей больше.
    if (hitUndoMark(mouseX, mouseY)) {
        undoLastConstellation();
        return;
    }

    const fieldMouseX = mouseX / zoomLevel + camX;
    const fieldMouseY = mouseY / zoomLevel + camY;

    const clickedStar = getStarAt(fieldMouseX, fieldMouseY);
    if (clickedStar && !clickedStar.locked) {
        isDragging = true;
        currentStartStar = clickedStar;
        visitedStars = [clickedStar.id];
        currentLine = { startId: clickedStar.id };
    } else if (typeof isTutorialCameraLocked === 'function' && isTutorialCameraLocked()) {
        // O-01: шаг 1 — тап мимо звезды не начинает пан. Кадр стоит.
        return;
    } else {
        isPanning = true;
        panStartMouseX = mouseX;
        panStartMouseY = mouseY;
        panStartCamX = camX;
        panStartCamY = camY;
    }
}

function mouseDragged() {
    if (typeof isObservatoryMode === 'function' && isObservatoryMode()) {
        observatoryMouseDragged();
        return;
    }

    if (isPanning) {
        const dx = (mouseX - panStartMouseX) / zoomLevel;
        const dy = (mouseY - panStartMouseY) / zoomLevel;
        camX = panStartCamX - dx;
        camY = panStartCamY - dy;
        clampCamera();
        return;
    }

    if (!isDragging) return;

    const fieldMouseX = mouseX / zoomLevel + camX;
    const fieldMouseY = mouseY / zoomLevel + camY;

    const starAtCursor = getStarAt(fieldMouseX, fieldMouseY, { anchorStar: currentStartStar });
    if (starAtCursor && !starAtCursor.locked) {
        const starId = starAtCursor.id;
        const isNewStar = !visitedStars.includes(starId);
        const uniqueCount = visitedStars.length;

        if (isNewStar && uniqueCount >= MAX_STARS_PER_CONSTELLATION) {
            return;
        }

        if (currentStartStar && currentStartStar.id !== starId) {
            const alreadyHasEdge = currentLines.some(
                seg => (seg.startId === currentStartStar.id && seg.endId === starId) ||
                       (seg.startId === starId && seg.endId === currentStartStar.id)
            );
            if (!alreadyHasEdge &&
                canAddConstellationEdge(currentStartStar.id, starId, currentLines)) {
                currentLines.push({
                    startId: currentStartStar.id,
                    endId: starId
                });
                // A-06: высота звука растёт с числом рёбер черновика, а не звёзд —
                // иначе замыкание кольца (ребро в уже посещённую звезду) повторяло ноту
                playEdgeSnap(currentLines.length + 1);
                attachFlashStarId = starId;
                attachFlashStartTime = millis();
            }
        }

        currentStartStar = starAtCursor;
        if (isNewStar) {
            visitedStars.push(starId);
        }
        currentLine = { startId: starId };
    }
}

function mouseReleased() {
    if (typeof isObservatoryMode === 'function' && isObservatoryMode()) {
        observatoryMouseReleased();
        return;
    }

    if (isPanning) {
        isPanning = false;
        return;
    }

    if (isDragging) {
        const uniqueStarCount = visitedStars.length;
        if (uniqueStarCount >= MIN_STARS_PER_CONSTELLATION &&
            uniqueStarCount <= MAX_STARS_PER_CONSTELLATION &&
            currentLines.length >= 1 &&
            isDraftConstellationValid(currentLines)) {
            // M-04: лимит площади bbox снят — валидный черновик коммитится всегда.
            const payload = buildConstellationCommitPayload([...currentLines]);
            currentLines = [];
            if (payload) {
                commitConstellationFromPayload(payload);
            }
        } else {
            currentLines = [];
        }
        resetDragState();
    }
}

function resetDragState() {
    isDragging = false;
    currentStartStar = null;
    visitedStars = [];
    currentLine = null;
    clearDraftAtlasHintCache();
    resetDraftCountLabelState();
    attachFlashStarId = null;
}

// =============================================================================
// U-07 · EDGE-PANNING (пан камеры при рисовании у края экрана)
// =============================================================================

/**
 * Смещение камеры по одной оси (экранные px/кадр) с линейной рампой:
 * 0 у внутренней границы краевой полосы → EDGE_PAN_MAX_SPEED у самого края экрана.
 * pos — экранная координата пальца; size — width или height.
 */
function edgePanAxisDelta(pos, size) {
    const band = size * EDGE_PAN_ZONE_FRAC;
    if (band <= 0) return 0;
    if (pos < band) {
        const t = constrain((band - pos) / band, 0, 1); // глубже к краю → ближе к 1
        return -EDGE_PAN_MAX_SPEED * t;
    }
    if (pos > size - band) {
        const t = constrain((pos - (size - band)) / band, 0, 1);
        return EDGE_PAN_MAX_SPEED * t;
    }
    return 0;
}

/**
 * Тик каждый кадр из draw(): пока идёт активный drag РИСОВАНИЯ и палец у края —
 * плавно панорамируем камеру. Работает и когда палец неподвижен у края (touchMoved
 * не стреляет). После сдвига камеры дозахватываем звезду, оказавшуюся под пальцем.
 */
function updateEdgePanDuringDraw() {
    if (!isDragging || !currentStartStar) return; // только рисование цепочки
    if (isPanning || isPinching || wasPinching) return; // не конкурировать с пан/pinch
    // O-01: шаг 1 — кадр фиксирован. Без этого камера уезжала бы прямо во время
    // того самого жеста, которому тутор учит: пара стоит у нижнего края кадра.
    if (typeof isTutorialCameraLocked === 'function' && isTutorialCameraLocked()) return;
    if (typeof mouseX !== 'number' || typeof mouseY !== 'number') return;
    if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;

    const dxScreen = edgePanAxisDelta(mouseX, width);
    const dyScreen = edgePanAxisDelta(mouseY, height);
    if (dxScreen === 0 && dyScreen === 0) return;

    const beforeX = camX;
    const beforeY = camY;
    camX += dxScreen / zoomLevel;
    camY += dyScreen / zoomLevel;
    clampCamera(); // у края поля пан просто останавливается

    if (camX !== beforeX || camY !== beforeY) {
        // Камера сдвинулась — под пальцем могла оказаться новая звезда; переиспользуем
        // логику захвата цепочки из mouseDragged (currentStartStar/visitedStars/currentLines).
        mouseDragged();
    }
}

// =============================================================================
// TOUCH INPUT + PINCH ZOOM (U-05)
// =============================================================================

let isPinching = false;
let wasPinching = false; // pinch кончился, но пальцы ещё не все отпущены
let pinchStartDist = 0;
let pinchStartZoom = 1;
let pinchWorldX = 0; // мировая точка под midpoint на старте pinch — пришпилена к midpoint
let pinchWorldY = 0;

function enterPinchMode() {
    if (touches.length < 2) return;
    // Второй палец отменяет черновик/пан — подтверждено заказчиком
    currentLines = [];
    resetDragState();
    // B-02: в обсерватории отменяется и незавершённая протяжка/перенос звезды
    if (typeof resetObservatoryDragState === 'function') resetObservatoryDragState();
    isPanning = false;
    isPinching = true;
    const t0 = touches[0];
    const t1 = touches[1];
    pinchStartDist = Math.max(1e-3, Math.hypot(t1.x - t0.x, t1.y - t0.y));
    pinchStartZoom = zoomLevel;
    const midX = (t0.x + t1.x) / 2;
    const midY = (t0.y + t1.y) / 2;
    pinchWorldX = midX / zoomLevel + camX;
    pinchWorldY = midY / zoomLevel + camY;
}

function updatePinchMode() {
    if (touches.length < 2) return;
    // O-01: на шаге 1 тутора пинч входит и выходит как обычно (второй палец
    // по-прежнему отменяет черновик — это привычный отклик), но камеру не
    // двигает: ни зум, ни двухпальцевый пан.
    if (typeof isTutorialCameraLocked === 'function' && isTutorialCameraLocked()) return;
    const t0 = touches[0];
    const t1 = touches[1];
    const dist = Math.hypot(t1.x - t0.x, t1.y - t0.y);
    const midX = (t0.x + t1.x) / 2;
    const midY = (t0.y + t1.y) / 2;
    zoomLevel = constrain(pinchStartZoom * (dist / pinchStartDist), getMinZoomLevel(), MAX_ZOOM);
    // Стартовая мировая точка следует за midpoint → зум + двухпальцевый пан одновременно
    camX = pinchWorldX - midX / zoomLevel;
    camY = pinchWorldY - midY / zoomLevel;
    clampCamera();
    // O-01: пинч — вторая (и на телефоне единственная) точка, где игрок меняет
    // зум. Шаг «отзум» закрывается прямо в жесте, не дожидаясь кадра.
    if (typeof checkTutorialZoomStep === 'function') checkTutorialZoomStep();
}

function touchStarted(event) {
    initAudio();
    if (!isPointerEventOnCanvas(event)) return true; // HUD/оверлеи — браузеру
    // K-13: то же исключение, что в mousePressed — книга открыта постоянно,
    // пока мы в обсерватории, и общий гейт «книга открыта» её не касается.
    const inObservatory = typeof isObservatoryMode === 'function' && isObservatoryMode();
    if (!inObservatory && isBlockingOverlayOpen()) return true;
    if (touches.length >= 2) {
        enterPinchMode();
        return false;
    }
    if (wasPinching) return false; // после pinch ждём полного отпускания
    mousePressed(event);
    return false;
}

function touchMoved(event) {
    if (!isPointerEventOnCanvas(event)) return true;
    const inObservatory = typeof isObservatoryMode === 'function' && isObservatoryMode();
    if (!inObservatory && isBlockingOverlayOpen()) return true;
    if (touches.length >= 2) {
        if (!isPinching) {
            enterPinchMode();
        } else {
            updatePinchMode();
        }
        return false;
    }
    if (isPinching) {
        // Остался один палец — pinch закончен, рисование не начинаем
        isPinching = false;
        wasPinching = true;
        return false;
    }
    if (wasPinching) return false;
    mouseDragged();
    return false;
}

function touchEnded(event) {
    if (touches.length === 0) {
        if (isPinching || wasPinching) {
            isPinching = false;
            wasPinching = false;
            return false;
        }
        if (!isPointerEventOnCanvas(event)) return true;
        const inObservatory = typeof isObservatoryMode === 'function' && isObservatoryMode();
        if (!inObservatory && isBlockingOverlayOpen()) return true;
        mouseReleased();
        return false;
    }
    if (isPinching && touches.length < 2) {
        isPinching = false;
        wasPinching = true;
    }
    return false;
}

// =============================================================================
// КУРСОР (U-27: переименования на поле больше нет — было U-04)
// =============================================================================

/**
 * Возвращает созвездие, чей labelAnchor ближе всего к точке (fx, fy)
 * в пределах HIT_RADIUS world units.
 */
function mouseMoved() {
    // U-27: на поле переименовывать нечего — курсор всегда обычный (в обсерватории
    // тоже, там переименование своё, книжное, K-21).
    cursor(ARROW);
}

// drawing.js — Line drawing, drag-to-connect input handling, constellation commit

// =============================================================================
// DRAWING STATE
// =============================================================================

let currentLine = null;
let currentLines = [];
let isDragging = false;
let currentStartStar = null;
let visitedStars = [];

let attachFlashStarId = null;
let attachFlashStartTime = 0;

let undoFloor = 0; // min constellations count below which undo is blocked

function getDraftChainColorRgb() {
    if (!Array.isArray(visitedStars) || visitedStars.length === 0) {
        return LINE_COLOR.slice();
    }
    return colorValueToRgb(getMeanColorValue(visitedStars));
}

/** starId → RGB для вершин собранных атласных созвездий (до конца уровня). */
let atlasCollectedStarColors = new Map();

function assignConstellationImageTransform(constellation) {
    if (!constellation || !Array.isArray(constellation.lines) || constellation.lines.length === 0) {
        constellation.imageTransform = null;
        return;
    }
    const shapeName = constellation.shape || constellation.name;
    const shapeInfo = SHAPES[shapeName];
    if (!shapeInfo || !shapeInfo.image) {
        constellation.imageTransform = null;
        return;
    }
    try {
        constellation.imageTransform = computeImageTransform(constellation.lines, shapeName);
    } catch (e) {
        console.warn('imageTransform failed:', shapeName, e);
        constellation.imageTransform = null;
    }
}

function hasAtlasCollectedConstellationOnField() {
    return constellations.some(c => c && c.atlasCollected);
}

/** Уже есть созвездие с этой атласной фигурой (ignoreConstellation — не считать, напр. текущий коммит). */
function isAtlasShapeAlreadyOnField(shapeName, ignoreConstellation = null) {
    const normalized = normalizeShapeName(shapeName);
    if (!normalized || normalized === 'Фигура') return false;
    if (typeof isShapeOnAtlas === 'function' && !isShapeOnAtlas(normalized)) return false;

    const committed = Array.isArray(constellations) ? constellations : [];
    for (const c of committed) {
        if (!c || c === ignoreConstellation) continue;
        const cn = normalizeShapeName(c.shape || c.name);
        if (cn !== normalized) continue;
        if (typeof isShapeVisibleInAtlas === 'function' && !isShapeVisibleInAtlas(cn)) continue;
        return true;
    }
    return false;
}

/** Каталожное на поле: открытая страница атласа, форма «создана», ещё нет такой же на поле. */
function canCollectAtlasShapeOnField(shapeName) {
    const normalized = normalizeShapeName(shapeName);
    if (!normalized || !isShapeOnAtlas(normalized)) return false;
    if (!isShapeVisibleInAtlas(normalized)) return false;
    if (!isShapeCreated(normalized)) return false;
    return !isAtlasShapeAlreadyOnField(normalized);
}

/** Не больше одного atlasCollected на каждое имя (первое в порядке создания сохраняется). */
function normalizeAtlasCollectedOnField() {
    const keptNames = new Set();
    for (const c of constellations) {
        if (!c || !c.atlasCollected) continue;
        const shapeName = normalizeShapeName(c.shape || c.name);
        if (!isShapeCreated(shapeName)) {
            c.atlasCollected = false;
            c.collectedAtMs = 0;
            continue;
        }
        if (keptNames.has(shapeName)) {
            c.atlasCollected = false;
            c.collectedAtMs = 0;
        } else {
            keptNames.add(shapeName);
        }
    }
}

function recomputeAtlasCollectedStarColors() {
    const next = new Map();
    for (const c of constellations) {
        if (!c || !c.atlasCollected) continue;
        const shapeInfo = SHAPES[c.shape] || SHAPES[c.name] || SHAPES['Фигура'];
        const color = shapeInfo.color;
        for (const seg of c.lines || []) {
            if (!seg) continue;
            next.set(seg.startId, color);
            next.set(seg.endId, color);
        }
    }
    atlasCollectedStarColors = next;
}

// =============================================================================
// EDGE RULES (max length, no crossings)
// =============================================================================

const EDGE_ENDPOINT_EPS = 0.5;

function getSegmentEndpointsWorld(startStar, endStar) {
    const wb = nearestHorizontalCopy(endStar.x, endStar.y, startStar.x, startStar.y);
    return { ax: startStar.x, ay: startStar.y, bx: wb.x, by: wb.y };
}

function endpointsSharePoint(ax, ay, bx, by, cx, cy, dx, dy) {
    const pairs = [
        [ax, ay, cx, cy], [ax, ay, dx, dy],
        [bx, by, cx, cy], [bx, by, dx, dy]
    ];
    for (const [x1, y1, x2, y2] of pairs) {
        if (Math.hypot(x1 - x2, y1 - y2) <= EDGE_ENDPOINT_EPS) return true;
    }
    return false;
}

function segmentsProperlyIntersect(seg1, seg2) {
    if (endpointsSharePoint(seg1.ax, seg1.ay, seg1.bx, seg1.by, seg2.ax, seg2.ay, seg2.bx, seg2.by)) {
        return false;
    }
    return segmentsIntersect(seg1.ax, seg1.ay, seg1.bx, seg1.by, seg2.ax, seg2.ay, seg2.bx, seg2.by);
}

function collectCommittedSegmentEndpoints() {
    const segments = [];
    const committed = Array.isArray(constellations) ? constellations : [];
    for (const constellation of committed) {
        segments.push(...getConstellationSegmentsHorizWrap(constellation.lines));
    }
    return segments;
}

function wouldEdgeCrossExisting(startId, endId, draftLines) {
    const start = getStarById(startId);
    const end = getStarById(endId);
    if (!start || !end) return true;

    const newSeg = getSegmentEndpointsWorld(start, end);
    const existing = collectCommittedSegmentEndpoints();

    for (const seg of draftLines || []) {
        if (!seg) continue;
        if ((seg.startId === startId && seg.endId === endId) ||
            (seg.startId === endId && seg.endId === startId)) {
            continue;
        }
        const ds = getStarById(seg.startId);
        const de = getStarById(seg.endId);
        if (!ds || !de) continue;
        existing.push(getSegmentEndpointsWorld(ds, de));
    }

    for (const seg of existing) {
        if (segmentsProperlyIntersect(newSeg, seg)) return true;
    }
    return false;
}

function isEdgeLengthValid(startStar, endStar) {
    return horizontalWrapDist(startStar.x, startStar.y, endStar.x, endStar.y) <= getMaxEdgeLength() + 1e-6;
}

/** Конец резиновой линии: не дальше maxEdge от якоря, поворачивается по направлению курсора. */
function getClampedDragEndpointWorld(anchorStar, fieldMouseX, fieldMouseY) {
    const anchor = nearestHorizontalCopy(anchorStar.x, anchorStar.y, fieldMouseX, fieldMouseY);
    let ex = fieldMouseX;
    let ey = fieldMouseY;
    const dx = ex - anchor.x;
    const dy = ey - anchor.y;
    const len = Math.hypot(dx, dy);
    const maxLen = getMaxEdgeLength();
    if (len > maxLen && len > 1e-9) {
        const scale = maxLen / len;
        ex = anchor.x + dx * scale;
        ey = anchor.y + dy * scale;
    }
    return { ax: anchor.x, ay: anchor.y, bx: ex, by: ey };
}

function canAddConstellationEdge(startId, endId, draftLines) {
    const start = getStarById(startId);
    const end = getStarById(endId);
    if (!start || !end) return false;
    if (!isEdgeLengthValid(start, end)) return false;
    if (wouldEdgeCrossExisting(startId, endId, draftLines)) return false;
    return true;
}

function isValidEdgeBetweenStars(starA, starB) {
    if (!starA || !starB || starA.id === starB.id) return false;
    return canAddConstellationEdge(starA.id, starB.id, []);
}

function hasConnectablePair() {
    const playable = getPlayableStars();
    for (let i = 0; i < playable.length; i++) {
        for (let j = i + 1; j < playable.length; j++) {
            if (isValidEdgeBetweenStars(playable[i], playable[j])) return true;
        }
    }
    return false;
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

    if (!label || label === 'Фигура') return null;
    if (typeof isBuiltinShapeEnabled === 'function' && !isBuiltinShapeEnabled(label)) return null;
    if (typeof isShapeVisibleInAtlas !== 'function' || !isShapeVisibleInAtlas(label)) return null;
    if (isAtlasShapeAlreadyOnField(label)) return null;

    draftAtlasHintCacheLabel = label;
    return label;
}

function isDraftConstellationValid(lines) {
    if (!lines || lines.length < 1) return false;
    for (const seg of lines) {
        const start = getStarById(seg.startId);
        const end = getStarById(seg.endId);
        if (!start || !end || !isEdgeLengthValid(start, end)) return false;
    }
    const draftSegs = getConstellationSegmentsHorizWrap(lines);
    for (let i = 0; i < draftSegs.length; i++) {
        for (let j = i + 1; j < draftSegs.length; j++) {
            if (segmentsProperlyIntersect(draftSegs[i], draftSegs[j])) return false;
        }
    }
    for (const seg of lines) {
        if (wouldEdgeCrossExisting(seg.startId, seg.endId, lines)) return false;
    }
    return true;
}

// =============================================================================
// INPUT HANDLERS (p5.js)
// =============================================================================

/** Открыт ли поверх канваса модальный оверлей (атлас/достижения) — тогда игнорируем ввод по полю. */
function isBlockingOverlayOpen() {
    const ids = ['atlasOverlay', 'achievementsOverlay'];
    return ids.some(id => {
        const el = document.getElementById(id);
        return el && el.classList.contains('visible');
    });
}

/** D-01: событие пришло с канваса, а не с DOM-кнопки/панели поверх него. */
function isPointerEventOnCanvas(event) {
    return !(event && event.target && event.target.tagName && event.target.tagName !== 'CANVAS');
}

function mousePressed(event) {
    initAudio();
    if (!isPointerEventOnCanvas(event)) return; // клики по HUD/панелям не рисуют и не панорамируют
    if (isBlockingOverlayOpen()) return;
    if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;

    const fieldMouseX = mouseX / zoomLevel + camX;
    const fieldMouseY = mouseY / zoomLevel + camY;

    // U-04: тап по созвездию после раскрытия → переименование
    if (constellationArtRevealed) {
        const tapped = getConstellationAtFieldPoint(fieldMouseX, fieldMouseY);
        if (tapped) {
            openConstellationRenamePrompt(tapped);
            return;
        }
    }

    const clickedStar = getStarAt(fieldMouseX, fieldMouseY);
    if (clickedStar && !clickedStar.locked) {
        isDragging = true;
        currentStartStar = clickedStar;
        visitedStars = [clickedStar.id];
        currentLine = { startId: clickedStar.id };
    } else {
        isPanning = true;
        panStartMouseX = mouseX;
        panStartMouseY = mouseY;
        panStartCamX = camX;
        panStartCamY = camY;
    }
}

function mouseDragged() {
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
                // A-02: высота звука растёт с числом звёзд в цепочке
                playEdgeSnap(isNewStar ? uniqueCount + 1 : uniqueCount);
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
            if (getConstellationLinesBboxAreaFraction(currentLines) > MAX_CONSTELLATION_BBOX_AREA_FRACTION) {
                currentLines = [];
            } else {
                const payload = buildConstellationCommitPayload([...currentLines]);
                currentLines = [];
                if (payload) {
                    commitConstellationFromPayload(payload);
                }
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
}

function touchStarted(event) {
    initAudio();
    if (!isPointerEventOnCanvas(event)) return true; // HUD/оверлеи — браузеру
    if (isBlockingOverlayOpen()) return true;
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
    if (isBlockingOverlayOpen()) return true;
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
        if (isBlockingOverlayOpen()) return true;
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
// CONSTELLATION BUILD + COMMIT
// =============================================================================

function getConstellationLinesBboxAreaFraction(lines) {
    const starIds = new Set();
    for (const seg of lines) {
        starIds.add(seg.startId);
        starIds.add(seg.endId);
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const id of starIds) {
        const s = getStarById(id);
        if (!s) continue;
        minX = Math.min(minX, s.x);
        maxX = Math.max(maxX, s.x);
        minY = Math.min(minY, s.y);
        maxY = Math.max(maxY, s.y);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
        return 0;
    }
    const w = maxX - minX;
    const h = maxY - minY;
    const fieldArea = FIELD_WIDTH * FIELD_HEIGHT;
    if (fieldArea <= 0) return 0;
    return (w * h) / fieldArea;
}

/** @returns {{ lines, center, starIds, starCount, shape, recognizedClass } | null} */
function buildConstellationCommitPayload(lines) {
    const starIds = new Set();
    for (const seg of lines) {
        starIds.add(seg.startId);
        starIds.add(seg.endId);
    }

    let sumX = 0, sumY = 0, count = 0;
    for (const id of starIds) {
        const s = getStarById(id);
        if (s) { sumX += s.x; sumY += s.y; count++; }
    }
    if (count === 0) return null;

    const center = { x: sumX / count, y: sumY / count };
    const recognitionResult = recognizeShapeDetailed(lines, starIds);
    let shape = recognitionResult.label;
    let recognizedState = recognitionResult.state;
    let recognizedConfidence = recognitionResult.confidence || 0;
    let recognizedCandidates = Array.isArray(recognitionResult.candidates) ? [...recognitionResult.candidates] : [];

    recognizedCandidates = recognizedCandidates.filter(candidate => {
        if (!candidate || !candidate.label) return false;
        if (!isBuiltinShapeName(candidate.label)) return false;
        return isBuiltinShapeEnabled(candidate.label);
    });

    if (isBuiltinShapeName(shape) && !isBuiltinShapeEnabled(shape)) {
        shape = 'Фигура';
        recognizedState = 'fallback';
        recognizedCandidates = [];
    }
    const recognizedClass = shape;

    if (shape === 'Фигура') {
        const signature = computeConstellationSignature(lines, starIds);

        if (customTypes.length > 0) {
            const customMatch = findMatchingCustomTypeDetailed(signature);
            if (customMatch && customMatch.state === 'accept' && customMatch.name) {
                shape = customMatch.name;
                recognizedState = 'accept';
                recognizedConfidence = customMatch.score;
                recognizedCandidates = [{
                    label: customMatch.name,
                    score: customMatch.score,
                    isCustom: true
                }];
            }
        }
    }

    return {
        lines: [...lines],
        center,
        starIds,
        starCount: starIds.size,
        shape,
        recognizedClass,
        recognizedState,
        recognizedCandidates,
        recognizedConfidence
    };
}

function commitConstellationFromPayload(payload) {
    playCommit();
    const { lines, center, starIds, starCount, shape, recognizedClass } = payload;
    let finalShape = typeof clampShapeToAtlasVisibility === 'function'
        ? clampShapeToAtlasVisibility(shape)
        : shape;
    // M-02: запрет дублирующихся атласных имён на одном поле
    if (finalShape !== 'Фигура' && isAtlasShapeAlreadyOnField(finalShape)) {
        finalShape = 'Фигура';
    }
    const scoreClass = typeof clampShapeToAtlasVisibility === 'function'
        ? clampShapeToAtlasVisibility(recognizedClass || shape)
        : (recognizedClass || shape);

    for (const id of starIds) {
        const s = getStarById(id);
        if (s) s.locked = true;
    }

    if (!uniqueShapesFound.has(scoreClass)) {
        uniqueShapesFound.add(scoreClass);
    }
    bonusAwardedClasses.add(scoreClass);

    // S-01: первое создание фигуры фиксируется на коммите (сюрприз-имя,
    // первая копия сразу становится atlas-collected)
    if (finalShape !== 'Фигура' && isShapeVisibleInAtlas(finalShape) && !isShapeCreated(finalShape)) {
        markShapeCreated(finalShape);
    }

    const labelAnchor = computeConstellationLabelAnchor(lines, starIds, finalShape);
    const isAtlasCollect = canCollectAtlasShapeOnField(finalShape);
    const { isSpecial: isFirstStarCountOnField } = registerStarCountOnCommit(starCount);
    const displayName = finalShape === 'Фигура'
        ? pickFallbackName(constellations.map(c => c.name))
        : finalShape;
    const constellation = {
        lines,
        name: displayName,
        customName: null,   // U-04: пользовательское имя (перекрывает name при отображении)
        center,
        labelAnchor,
        starCount,
        shape: finalShape,
        recognizedClass: scoreClass,
        score: 0,
        isUniqueDiscovery: false,
        isFirstStarCountOnField,
        atlasCollected: isAtlasCollect,
        collectedAtMs: isAtlasCollect ? millis() : 0,
        imageTransform: null,
        lineColor: colorValueToRgb(getMeanColorValue([...starIds]))
    };
    if (isAtlasCollect) {
        assignConstellationImageTransform(constellation);
    }
    constellations.push(constellation);

    const floaterAnchor = labelAnchor || center;
    if (floaterAnchor) {
        pushConstellationSizeCommitFloater(
            floaterAnchor.x,
            floaterAnchor.y,
            starCount,
            isFirstStarCountOnField
        );
    }
    recomputeSuppressedStars();
    recomputeAtlasCollectedStarColors();

    updateScoreUI(0, finalShape, starCount);
    updateProgressionUI();
    onConstellationCreated(finalShape);

    updateUndoConstellationButtonState();

    if (typeof recordAchievementCommit === 'function') recordAchievementCommit(constellation);

    autoSave();

    tryRevealConstellationArtIfComplete();
}

function collectStarIdsFromLines(lines) {
    const ids = new Set();
    for (const seg of lines || []) {
        if (!seg) continue;
        ids.add(seg.startId);
        ids.add(seg.endId);
    }
    return ids;
}

function rebuildFieldShapeRewardsFromConstellations() {
    uniqueShapesFound.clear();
    bonusAwardedClasses.clear();
    for (const c of constellations) {
        const sc = c.recognizedClass || c.shape;
        if (sc) {
            uniqueShapesFound.add(sc);
            bonusAwardedClasses.add(sc);
        }
    }
}

function raiseUndoFloor() {
    undoFloor = Math.max(undoFloor, constellations.length);
    updateUndoConstellationButtonState();
}

function undoLastConstellation() {
    if (constellations.length <= undoFloor) return;
    const last = constellations.pop();

    for (const id of collectStarIdsFromLines(last.lines)) {
        const s = getStarById(id);
        if (s) s.locked = false;
    }

    totalScore -= (last.score || 0);
    if (totalScore < 0) totalScore = 0;

    if (typeof recordAchievementUndo === 'function') recordAchievementUndo(last);

    rebuildFieldShapeRewardsFromConstellations();
    normalizeAtlasCollectedOnField();
    rebuildStarCountStateFromConstellations();
    recomputeSuppressedStars();
    recomputeAtlasCollectedStarColors();

    // S-01: откат первого коммита фигуры невозможен (undoFloor поднят при
    // мгновенном клейме шага 1) — createdShapes здесь не трогаем; ночной
    // счётчик цепочки откатывается в recordAchievementUndo.

    const canContinue = !isLevelComplete();

    if (canContinue) {
        if (constellationArtRevealed) {
            constellationArtRevealed = false;
        }
    } else {
        tryRevealConstellationArtIfComplete();
    }

    updateBestScoreFromFieldScore();
    updateScoreUI(0, '', 0);
    updateProgressionUI();
    updateUndoConstellationButtonState();
    refreshConstellationHintsIfLevelComplete();
    updateAtlasButtonState();
    const atlasOverlay = document.getElementById('atlasOverlay');
    if (atlasOverlay && atlasOverlay.classList.contains('visible')) {
        renderAtlasOverlay();
    }
    autoSave();
}

function tryRevealConstellationArtIfComplete() {
    if (constellationArtRevealed) return;
    if (!isLevelComplete()) return;
    revealConstellationArt();
}

function revealConstellationArt() {
    if (constellationArtRevealed) return;
    playLevelComplete();
    constellationArtRevealed = true;
    revealTime = millis();
    raiseUndoFloor();

    for (const c of constellations) {
        const fallbackStarIds = collectStarIdsFromLines(c.lines);
        c.labelAnchor = computeConstellationLabelAnchor(c.lines, fallbackStarIds, c.name || c.shape);
        assignConstellationImageTransform(c);
    }
    recomputeAtlasCollectedStarColors();

    const { levelPts, total } = awardEndOfLevelPoints();

    if (typeof recordAchievementReveal === 'function') recordAchievementReveal();

    refreshConstellationHints();
    updateScoreUI(total, '', 0);
    updateProgressionUI();
    updateAtlasButtonState();
    showLevelCompleteToast(levelPts);
    autoSave();
}

function getConstellationStars(lines, starIds) {
    const stars = [];
    const visitedIds = new Set();

    if (starIds && typeof starIds[Symbol.iterator] === 'function') {
        for (const id of starIds) {
            if (visitedIds.has(id)) continue;
            const s = getStarById(id);
            if (!s) continue;
            visitedIds.add(id);
            stars.push(s);
        }
    } else {
        for (const seg of lines || []) {
            if (!seg) continue;
            if (!visitedIds.has(seg.startId)) {
                const start = getStarById(seg.startId);
                if (start) {
                    visitedIds.add(seg.startId);
                    stars.push(start);
                }
            }
            if (!visitedIds.has(seg.endId)) {
                const end = getStarById(seg.endId);
                if (end) {
                    visitedIds.add(seg.endId);
                    stars.push(end);
                }
            }
        }
    }

    return stars;
}

function getConstellationSegments(lines) {
    const segments = [];
    for (const seg of lines || []) {
        if (!seg) continue;
        const start = getStarById(seg.startId);
        const end = getStarById(seg.endId);
        if (!start || !end) continue;
        segments.push({ ax: start.x, ay: start.y, bx: end.x, by: end.y });
    }
    return segments;
}

/** Сегменты созвездия между фактическими позициями звёзд (wrap убран, см. P-01). */
function getConstellationSegmentsHorizWrap(lines) {
    const segments = [];
    for (const seg of lines || []) {
        if (!seg) continue;
        const start = getStarById(seg.startId);
        const end = getStarById(seg.endId);
        if (!start || !end) continue;
        const wb = nearestHorizontalCopy(end.x, end.y, start.x, start.y);
        segments.push({ ax: start.x, ay: start.y, bx: wb.x, by: wb.y });
    }
    return segments;
}

function pointInRect(px, py, rect) {
    return px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom;
}

function ccw(ax, ay, bx, by, cx, cy) {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
}

function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    return ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) &&
           ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy);
}

function segmentIntersectsRect(ax, ay, bx, by, rect) {
    if (pointInRect(ax, ay, rect) || pointInRect(bx, by, rect)) return true;
    return segmentsIntersect(ax, ay, bx, by, rect.left, rect.top, rect.right, rect.top) ||
           segmentsIntersect(ax, ay, bx, by, rect.right, rect.top, rect.right, rect.bottom) ||
           segmentsIntersect(ax, ay, bx, by, rect.right, rect.bottom, rect.left, rect.bottom) ||
           segmentsIntersect(ax, ay, bx, by, rect.left, rect.bottom, rect.left, rect.top);
}

function evaluateLabelCandidate(cx, y, labelHalfW, labelHalfH, segments) {
    const rect = {
        left: cx - labelHalfW,
        right: cx + labelHalfW,
        top: y - labelHalfH,
        bottom: y + labelHalfH
    };

    let intersections = 0;
    let minDistance = Infinity;
    for (const segment of segments) {
        if (segmentIntersectsRect(segment.ax, segment.ay, segment.bx, segment.by, rect)) {
            intersections++;
        }
        const d = distancePointToSegment(cx, y, segment.ax, segment.ay, segment.bx, segment.by);
        if (d < minDistance) minDistance = d;
    }

    return { intersections, minDistance };
}

// =============================================================================
// U-04: CONSTELLATION RENAMING AFTER REVEAL
// =============================================================================

/**
 * Возвращает созвездие, чей labelAnchor ближе всего к точке (fx, fy)
 * в пределах HIT_RADIUS world units.
 */
const CONSTELLATION_LABEL_HIT_RADIUS = 40;

function getConstellationAtFieldPoint(fx, fy) {
    let best = null;
    let bestDist = CONSTELLATION_LABEL_HIT_RADIUS;
    for (const c of constellations) {
        if (!c || !c.labelAnchor) continue;
        const dist = horizontalWrapDist(fx, fy, c.labelAnchor.x, c.labelAnchor.y);
        if (dist < bestDist) {
            bestDist = dist;
            best = c;
        }
    }
    return best;
}

function openConstellationRenamePrompt(constellation) {
    const current = constellation.customName || constellation.name;
    const result = prompt('Переименовать созвездие:', current);
    if (result === null || result.trim() === '') return;
    constellation.customName = result.trim();
    autoSave();
}

function mouseMoved() {
    if (!constellationArtRevealed) {
        cursor(ARROW);
        return;
    }
    const fieldMouseX = mouseX / zoomLevel + camX;
    const fieldMouseY = mouseY / zoomLevel + camY;
    const hit = getConstellationAtFieldPoint(fieldMouseX, fieldMouseY);
    cursor(hit ? 'text' : ARROW);
}

function computeConstellationLabelAnchor(lines, starIds, shapeName) {
    const stars = getConstellationStars(lines, starIds);
    if (stars.length === 0) return null;

    const segments = getConstellationSegmentsHorizWrap(lines);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    if (segments.length > 0) {
        for (const seg of segments) {
            minX = Math.min(minX, seg.ax, seg.bx);
            minY = Math.min(minY, seg.ay, seg.by);
            maxX = Math.max(maxX, seg.ax, seg.bx);
            maxY = Math.max(maxY, seg.ay, seg.by);
        }
    }
    if (!Number.isFinite(minX)) {
        for (const star of stars) {
            minX = Math.min(minX, star.x);
            minY = Math.min(minY, star.y);
            maxX = Math.max(maxX, star.x);
            maxY = Math.max(maxY, star.y);
        }
    }

    const safeMargin = 18;
    const cx = constrain((minX + maxX) / 2, safeMargin, FIELD_WIDTH - safeMargin);
    const labelText = typeof shapeName === 'string' && shapeName.trim().length > 0 ? shapeName.trim() : 'Созвездие';
    const estimatedLabelWidth = Math.max(72, labelText.length * 9);
    const labelHalfW = estimatedLabelWidth / 2;
    const labelHalfH = 11;

    const baseOffset = 36;
    const stepOffset = 22;
    const maxAttempts = 8;

    const candidates = [
        { side: 'above', direction: -1, startY: minY - baseOffset },
        { side: 'below', direction: 1, startY: maxY + baseOffset }
    ];

    const evaluated = [];
    for (const candidate of candidates) {
        let best = null;
        let y = candidate.startY;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const clampedY = constrain(y, safeMargin, FIELD_HEIGHT - safeMargin);
            const metrics = evaluateLabelCandidate(cx, clampedY, labelHalfW, labelHalfH, segments);
            const isCorrectSide = candidate.side === 'above' ? clampedY < minY : clampedY > maxY;
            const score = {
                side: candidate.side,
                x: cx,
                y: clampedY,
                intersections: metrics.intersections + (isCorrectSide ? 0 : 1000),
                minDistance: metrics.minDistance
            };
            if (!best ||
                score.intersections < best.intersections ||
                (score.intersections === best.intersections && score.minDistance > best.minDistance)) {
                best = score;
            }
            if (score.intersections === 0) break;
            y += candidate.direction * stepOffset;
        }
        if (best) evaluated.push(best);
    }

    if (evaluated.length === 0) {
        const yFall = constrain(minY - baseOffset, safeMargin, FIELD_HEIGHT - safeMargin);
        return { x: cx, y: yFall, side: 'above' };
    }
    evaluated.sort((a, b) => {
        if (a.intersections !== b.intersections) return a.intersections - b.intersections;
        return b.minDistance - a.minDistance;
    });
    const chosen = evaluated[0];
    return { x: chosen.x, y: chosen.y, side: chosen.side };
}

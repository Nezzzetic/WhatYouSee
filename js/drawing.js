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

// =============================================================================
// V-12 — ВОЛНА СОЗДАНИЯ СОЗВЕЗДИЯ
// =============================================================================
// Слот один: одновременно анимируется только последнее закоммиченное созвездие.
// Состояние живёт ВНЕ сейва (как atlasCollectedStarColors): после перезагрузки
// волна не проигрывается заново, версия сейва не поднимается.

let commitWave = null;  // { constellation, startMs, stepMs, edgeCount, starArrivalMs: Map }

/**
 * Шаг между стартами соседних рёбер. Длинное созвездие не растягивает волну —
 * шаг ужимается так, чтобы вся она уложилась в COMMIT_WAVE_TOTAL_MAX_MS.
 * Чистая функция: проверяется статикой без p5 и глобалов.
 */
function computeCommitWaveStep(edgeCount, edgeMs, stepMs, totalMaxMs) {
    if (edgeCount <= 1) return stepMs;
    const room = (totalMaxMs - edgeMs) / (edgeCount - 1);
    return Math.max(0, Math.min(stepMs, room));
}

/** Прогресс ребра с индексом i: 0 — ещё не начато, 1 — дочерчено. */
function computeCommitWaveEdgeProgress(elapsed, edgeIndex, stepMs, edgeMs) {
    if (edgeMs <= 0) return 1;
    const local = elapsed - edgeIndex * stepMs;
    if (local <= 0) return 0;
    if (local >= edgeMs) return 1;
    return local / edgeMs;
}

/** Вспышка звезды: 0 → 1 → 0 за flashMs от момента прихода волны. */
function computeCommitWaveFlash(elapsed, arrivalMs, flashMs) {
    if (flashMs <= 0) return 0;
    const local = elapsed - arrivalMs;
    if (local < 0 || local >= flashMs) return 0;
    return Math.sin((local / flashMs) * Math.PI);
}

/**
 * Общая длительность волны: последнее ребро дочерчено + хвост.
 * Хвост — максимум из вспышки последней звезды и проявления подписи, иначе
 * состояние гасло бы раньше, чем подпись доехала до полной яркости.
 */
function computeCommitWaveTotal(edgeCount, stepMs, edgeMs, tailMs) {
    if (edgeCount <= 0) return 0;
    return (edgeCount - 1) * stepMs + edgeMs + tailMs;
}

/**
 * Запускает волну по только что закоммиченному созвездию.
 * Порядок рёбер = порядок соединения игроком (currentLines пушится по ребру
 * за жест; харнесс отдаёт рёбра в порядке переданного списка).
 */
function startCommitWave(constellation) {
    if (!constellation || !Array.isArray(constellation.lines) || constellation.lines.length === 0) {
        commitWave = null;
        return;
    }
    const edgeCount = constellation.lines.length;
    const stepMs = computeCommitWaveStep(
        edgeCount, COMMIT_WAVE_EDGE_MS, COMMIT_WAVE_STEP_MS, COMMIT_WAVE_TOTAL_MAX_MS
    );

    // Звезда — конец нескольких рёбер вспыхивает один раз, по самому раннему приходу.
    const starArrivalMs = new Map();
    const arrive = (id, ms) => {
        const prev = starArrivalMs.get(id);
        if (prev === undefined || ms < prev) starArrivalMs.set(id, ms);
    };
    for (let i = 0; i < edgeCount; i++) {
        const seg = constellation.lines[i];
        if (!seg) continue;
        arrive(seg.startId, i * stepMs);
        arrive(seg.endId, i * stepMs + COMMIT_WAVE_EDGE_MS);
    }

    commitWave = {
        constellation,
        startMs: millis(),
        stepMs,
        edgeCount,
        starArrivalMs
    };
}

function cancelCommitWave() {
    commitWave = null;
}

/** Прошедшее время волны, или -1 если волны нет / она уже отыграла. */
function getCommitWaveElapsed() {
    if (!commitWave) return -1;
    const elapsed = millis() - commitWave.startMs;
    const tailMs = Math.max(COMMIT_WAVE_STAR_FLASH_MS, COMMIT_WAVE_LABEL_FADE_MS);
    const total = computeCommitWaveTotal(
        commitWave.edgeCount, commitWave.stepMs, COMMIT_WAVE_EDGE_MS, tailMs
    );
    if (elapsed < 0 || elapsed >= total) {
        commitWave = null;
        return -1;
    }
    return elapsed;
}

/** Прогресс ребра волнового созвездия; для всех прочих созвездий — 1. */
function getCommitWaveEdgeProgress(constellation, edgeIndex) {
    if (!commitWave || commitWave.constellation !== constellation) return 1;
    const elapsed = getCommitWaveElapsed();
    if (elapsed < 0) return 1;
    return computeCommitWaveEdgeProgress(elapsed, edgeIndex, commitWave.stepMs, COMMIT_WAVE_EDGE_MS);
}

/** true, если волна ещё не дошла до звезды — locked-вид пока не применяем. */
function isCommitWavePending(starId) {
    if (!commitWave) return false;
    const arrival = commitWave.starArrivalMs.get(starId);
    if (arrival === undefined) return false;
    const elapsed = getCommitWaveElapsed();
    if (elapsed < 0) return false;
    return elapsed < arrival;
}

/** Сила вспышки звезды в момент прихода волны: 0..1. */
function getCommitWaveStarFlash(starId) {
    if (!commitWave) return 0;
    const arrival = commitWave.starArrivalMs.get(starId);
    if (arrival === undefined) return 0;
    const elapsed = getCommitWaveElapsed();
    if (elapsed < 0) return 0;
    return computeCommitWaveFlash(elapsed, arrival, COMMIT_WAVE_STAR_FLASH_MS);
}

/**
 * Проявление подписи атласного созвездия: отсчитывается от конца волны, чтобы
 * имя не выскакивало вместе с коммитом. Для всех прочих созвездий — 1.
 */
function getCommitWaveLabelAlpha(constellation) {
    if (!commitWave || commitWave.constellation !== constellation) return 1;
    const elapsed = getCommitWaveElapsed();
    if (elapsed < 0) return 1;
    const waveEnd = (commitWave.edgeCount - 1) * commitWave.stepMs + COMMIT_WAVE_EDGE_MS;
    if (COMMIT_WAVE_LABEL_FADE_MS <= 0) return elapsed >= waveEnd ? 1 : 0;
    return Math.max(0, Math.min(1, (elapsed - waveEnd) / COMMIT_WAVE_LABEL_FADE_MS));
}

// =============================================================================
// V-13 — ФИНАЛ НОЧИ: ОТЗУМ И ПОСЛЕДОВАТЕЛЬНОЕ РОЖДЕНИЕ СОЗВЕЗДИЙ
// =============================================================================
// Сцена из двух движений: небо гаснет и камера едет к обзору всего поля, а следом
// созвездия рождаются заново по одному, в порядке создания игроком. Слот один,
// состояние живёт ВНЕ сейва (как commitWave): после F5 сцена не проигрывается,
// версия сейва не поднимается.
//
// Единица анимации — созвездие целиком, фейдом: на min-зуме, куда приезжает
// камера, отдельные рёбра не читаются, и волна по рёбрам (V-12) там пропала бы
// зря, а 30 × 300 мс в потолок не влезают.

let levelFinale = null; // { startMs, camFrom, stepMs, count, totalMs, order, starBirthMs }

/** Сглаживание отзума: кривая книги (K-01) — камера трогается сразу и мягко
 *  встаёт, без рывка на старте и на остановке. Кривая в игре одна: та же
 *  `--ease` в CSS и тот же `easeBook` во всех сценах канваса. */
function computeFinaleEase(t) {
    return easeBook(t);
}

/** Занавес в начале сцены: 1 → 0 за hideMs. Дальше созвездий не видно вовсе. */
function computeFinaleHideAlpha(elapsed, hideMs) {
    if (hideMs <= 0) return 0;
    if (elapsed <= 0) return 1;
    if (elapsed >= hideMs) return 0;
    return 1 - elapsed / hideMs;
}

/**
 * Проявление созвездия с индексом i: 0 — ещё не родилось, 1 — на полной яркости.
 * elapsed отсчитывается от НАЧАЛА ВОЛНЫ, а не от начала сцены.
 */
function computeFinaleBirthProgress(elapsed, index, stepMs, fadeMs) {
    const local = elapsed - index * stepMs;
    if (fadeMs <= 0) return local >= 0 ? 1 : 0;
    if (local <= 0) return 0;
    if (local >= fadeMs) return 1;
    return local / fadeMs;
}

/**
 * Полная длительность сцены: дольше всех живёт та фаза, что кончается позже.
 * minMs — пол от затемнения и отзума (на пустом небе волны нет вовсе).
 */
function computeFinaleTotal(count, stepMs, fadeMs, delayMs, minMs) {
    const wave = count > 0 ? delayMs + (count - 1) * stepMs + fadeMs : 0;
    return Math.max(minMs, wave);
}

/**
 * Запускает финал ночи. Порядок рождения = порядок создания игроком:
 * `constellations` уже лежит в нём, сортировать нечего.
 */
function startLevelFinale() {
    const list = Array.isArray(constellations) ? constellations : [];
    const count = list.length;
    // Шаг ужимается под потолок той же чистой функцией, что у волны создания:
    // «уложить count событий длиной fadeMs в отведённое время» — задача общая.
    const stepMs = computeCommitWaveStep(
        count, LEVEL_FINALE_FADE_MS, LEVEL_FINALE_STEP_MS,
        LEVEL_FINALE_TOTAL_MAX_MS - LEVEL_FINALE_WAVE_DELAY_MS
    );

    const order = new Map();        // созвездие → его индекс (без indexOf на каждом кадре)
    const starBirthMs = new Map();  // звезда → момент рождения её созвездия
    for (let i = 0; i < count; i++) {
        const c = list[i];
        if (!c) continue;
        order.set(c, i);
        const birthMs = LEVEL_FINALE_WAVE_DELAY_MS + i * stepMs;
        for (const id of collectStarIdsFromLines(c.lines)) {
            const prev = starBirthMs.get(id);
            if (prev === undefined || birthMs < prev) starBirthMs.set(id, birthMs);
        }
    }

    levelFinale = {
        startMs: millis(),
        camFrom: { camX, camY, zoom: zoomLevel },
        stepMs,
        count,
        order,
        starBirthMs,
        totalMs: computeFinaleTotal(
            count, stepMs, LEVEL_FINALE_FADE_MS, LEVEL_FINALE_WAVE_DELAY_MS,
            Math.max(LEVEL_FINALE_ZOOM_MS, LEVEL_FINALE_HIDE_MS)
        )
    };
}

/** Снять сцену без доигрывания (смена неба, откат) — камеру не трогаем. */
function cancelLevelFinale() {
    levelFinale = null;
}

/**
 * Тап посреди сцены: доигрываем мгновенно. Альфы обязаны вернуться в 1 —
 * иначе тап на 150-й мс погасил бы небо навсегда; это даёт снятие слота.
 * Камера доезжает туда же, куда ехала.
 */
function finishLevelFinaleNow() {
    if (!levelFinale) return;
    levelFinale = null;
    if (typeof centerCamera === 'function') centerCamera();
}

/** Прошедшее время сцены, или -1 если её нет / она уже отыграла. */
function getLevelFinaleElapsed() {
    if (!levelFinale) return -1;
    const elapsed = millis() - levelFinale.startMs;
    if (elapsed < 0 || elapsed >= levelFinale.totalMs) {
        levelFinale = null;
        return -1;
    }
    return elapsed;
}

function isLevelFinaleActive() {
    return getLevelFinaleElapsed() >= 0;
}

/** Видимость созвездия в сцене: гаснет, потом рождается. Вне сцены — 1. */
function getFinaleConstellationAlpha(constellation) {
    const elapsed = getLevelFinaleElapsed();
    if (elapsed < 0) return 1;
    const index = levelFinale.order.get(constellation);
    if (index === undefined) return 1; // созвездия в сцене нет — не наше дело
    if (elapsed < LEVEL_FINALE_HIDE_MS) {
        return computeFinaleHideAlpha(elapsed, LEVEL_FINALE_HIDE_MS);
    }
    return computeFinaleBirthProgress(
        elapsed - LEVEL_FINALE_WAVE_DELAY_MS, index, levelFinale.stepMs, LEVEL_FINALE_FADE_MS
    );
}

/**
 * Видимость ЗВЕЗДЫ в сцене — та же кривая, что у её созвездия: занавес гасит
 * созвездие целиком, рождение возвращает его целиком (правка заказчика).
 *
 * Звезда вне созвездий (свободная, подавленная, погасшая) возвращает 1 на всех
 * фазах: она не часть сцены. Гасить её вместе со всеми нельзя — вернуть её
 * потом было бы нечем, и в конце занавеса она скакнула бы из нуля в единицу.
 *
 * `star.locked` при этом выставлен как обычно: игровая логика (хит-тесты,
 * распознавание, откат) сцену не ждёт ни кадра — тот же инвариант, что в V-12.
 */
function getFinaleStarAlpha(starId) {
    const elapsed = getLevelFinaleElapsed();
    if (elapsed < 0) return 1;
    const birthMs = levelFinale.starBirthMs.get(starId);
    if (birthMs === undefined) return 1;
    if (elapsed < LEVEL_FINALE_HIDE_MS) {
        return computeFinaleHideAlpha(elapsed, LEVEL_FINALE_HIDE_MS);
    }
    // birthMs уже содержит лид-ин волны, поэтому индекс здесь нулевой.
    return computeFinaleBirthProgress(elapsed - birthMs, 0, levelFinale.stepMs, LEVEL_FINALE_FADE_MS);
}

/** Вспышка звезды в момент рождения её созвездия: 0..1 (огибающая V-12). */
function getFinaleStarFlash(starId) {
    const elapsed = getLevelFinaleElapsed();
    if (elapsed < 0) return 0;
    const birthMs = levelFinale.starBirthMs.get(starId);
    if (birthMs === undefined) return 0;
    return computeCommitWaveFlash(elapsed, birthMs, LEVEL_FINALE_STAR_FLASH_MS);
}

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
    if (!normalized || normalized === SHAPE_UNRECOGNIZED) return false;
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
            continue;
        }
        if (keptNames.has(shapeName)) {
            c.atlasCollected = false;
        } else {
            keptNames.add(shapeName);
        }
    }
}

function recomputeAtlasCollectedStarColors() {
    const next = new Map();
    for (const c of constellations) {
        if (!c || !c.atlasCollected) continue;
        const shapeInfo = SHAPES[c.shape] || SHAPES[c.name] || SHAPES[SHAPE_UNRECOGNIZED];
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

    if (!label || label === SHAPE_UNRECOGNIZED) return null;
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
/** U-09: пока шторка открыта, поле не рисует и не панорамируется. */
function isBlockingOverlayOpen() {
    return typeof isSheetOpen === 'function' && isSheetOpen();
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

    // B-02: обсерватория — свой мир со своими правилами ввода. Ветка ранняя,
    // до любых полевых проверок (переименование, locked, bbox — там ничего этого нет).
    if (typeof isObservatoryMode === 'function' && isObservatoryMode()) {
        observatoryMousePressed();
        return;
    }

    // V-13: тап посреди финала ночи доигрывает сцену мгновенно и съедается
    // целиком — иначе тот же тап тут же откроет переименование (U-04): оно висит
    // на первой же проверке после constellationArtRevealed, а он уже выставлен.
    if (isLevelFinaleActive()) {
        finishLevelFinaleNow();
        return;
    }

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
        shape = SHAPE_UNRECOGNIZED;
        recognizedState = 'fallback';
        recognizedCandidates = [];
    }
    const recognizedClass = shape;

    if (shape === SHAPE_UNRECOGNIZED) {
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
    if (finalShape !== SHAPE_UNRECOGNIZED && isAtlasShapeAlreadyOnField(finalShape)) {
        finalShape = SHAPE_UNRECOGNIZED;
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
    if (finalShape !== SHAPE_UNRECOGNIZED && isShapeVisibleInAtlas(finalShape) && !isShapeCreated(finalShape)) {
        markShapeCreated(finalShape);
    }

    const labelAnchor = computeConstellationLabelAnchor(lines, starIds, finalShape);
    const isAtlasCollect = canCollectAtlasShapeOnField(finalShape);
    const { isSpecial: isFirstStarCountOnField } = registerStarCountOnCommit(starCount);
    const displayName = finalShape === SHAPE_UNRECOGNIZED
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
        imageTransform: null,
        lineColor: colorValueToRgb(getMeanColorValue([...starIds]))
    };
    if (isAtlasCollect) {
        assignConstellationImageTransform(constellation);
    }
    constellations.push(constellation);

    // V-12: волна создания. Ставится до пересчётов и раскрытия — если этот же
    // коммит завершает уровень, revealConstellationArt её ниже отменит.
    startCommitWave(constellation);

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

    // V-12: иначе волна продолжила бы бежать по созвездию, которого уже нет.
    cancelCommitWave();
    // V-13: защитно. `undoFloor` поднят раскрытием, так что до сюда с активной
    // сценой не дойти, но сцена держит ссылки на созвездия — пусть падает первой.
    cancelLevelFinale();

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
    if (typeof refreshSheetIfOpen === 'function') refreshSheetIfOpen();
    autoSave();
}

/**
 * V-13: `animate = false` — раскрытие без сцены финала. Так его зовёт загрузка
 * сохранения: сцена принадлежит МОМЕНТУ завершения ночи, а не её состоянию,
 * и после F5 играться не должна. До V-13 на это работал только персист
 * `constellationArtRevealed` с ранним `return` — со сценой полагаться на него
 * нельзя, потому что путь «сейв на завершённом небе с revealed: false» существует.
 */
function tryRevealConstellationArtIfComplete(animate = true) {
    if (constellationArtRevealed) return;
    if (!isLevelComplete()) return;
    revealConstellationArt(animate);
}

function revealConstellationArt(animate = true) {
    if (constellationArtRevealed) return;
    playLevelComplete();
    // V-12: у раскрытия своя волна имён и свой стиль линий — волна создания
    // последнего созвездия отменяется, чтобы они не дрались за одни и те же рёбра.
    cancelCommitWave();
    constellationArtRevealed = true;
    revealTime = millis();
    raiseUndoFloor();

    for (const c of constellations) {
        const fallbackStarIds = collectStarIdsFromLines(c.lines);
        c.labelAnchor = computeConstellationLabelAnchor(c.lines, fallbackStarIds, c.name || c.shape);
        assignConstellationImageTransform(c);
    }
    recomputeAtlasCollectedStarColors();

    // V-13: сцена ставится ПОСЛЕ raiseUndoFloor и пересчёта якорей — окна
    // «сцена идёт, откат ещё жив» не возникает, а рождаться созвездия будут
    // уже с финальными подписями (они в сцене не видны, но считаются один раз).
    if (animate) startLevelFinale();

    // M-05: прямой выплаты за небо больше нет — раскрытие только взводит
    // защёлку суточного квеста, ✦ приходят обычным забором в Наградах.
    if (typeof recordAchievementReveal === 'function') recordAchievementReveal();

    refreshConstellationHints();
    updateScoreUI(0, '', 0);
    updateProgressionUI();
    if (typeof refreshSheetIfOpen === 'function') refreshSheetIfOpen();
    // V-13: тоста завершения ночи больше нет — он висел ровно в центре кадра,
    // куда приезжает камера, а роль сообщения забрала сама сцена.
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
    const current = constellation.customName || getConstellationDisplayName(constellation);
    // Промпт переводится, введённое игроком имя — нет (решение исполнителя L-01).
    const result = prompt(t('field.renamePrompt'), current);
    if (result === null || result.trim() === '') return;
    constellation.customName = result.trim();
    autoSave();
}

function mouseMoved() {
    // B-02: в обсерватории переименовывать нечего — курсор всегда обычный
    if (typeof isObservatoryMode === 'function' && isObservatoryMode()) {
        cursor(ARROW);
        return;
    }
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
    // L-01: ширину прикидываем по локализованной подписи — длина строк разная.
    const labelText = typeof shapeName === 'string' && shapeName.trim().length > 0
        ? shapeLabel(shapeName.trim())
        : t('field.constellation');
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

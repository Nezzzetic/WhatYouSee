// field.js — Field generation, star placement, background stars

// =============================================================================
// GLOBAL STATE
// =============================================================================

let fieldStars = [];
let fieldBackgroundStars = [];

// Fade-in звёзд при старте уровня
let skyStartTime = 0;   // millis() в момент генерации неба
let skyFadeScale = 1.0; // 1.0 = новое небо, 0.25 = повторное открытие

/** Max edge length in world units (= canvas height * 2/5); not affected by zoom. */
let maxEdgeLength = 0;

function updateMaxEdgeLengthFromCanvas() {
    const canvasH = typeof height === 'number' && height > 0 ? height : 1;
    maxEdgeLength = (canvasH * 2) / 5;
}

function getMaxEdgeLength() {
    if (maxEdgeLength > 0) return maxEdgeLength;
    const canvasH = typeof height === 'number' && height > 0 ? height : 1;
    return (canvasH * 2) / 5;
}

/** When false (фаза соединений): нейтральные линии; атласные коммиты — лайнарт, имя, подсветка. */
let constellationArtRevealed = true;
let revealTime = 0; // millis() момента reveal; 0 = уровень уже был завершён при загрузке

function getPlayableStars() {
    if (!Array.isArray(fieldStars)) return [];
    return fieldStars.filter(s => s && !s.locked && !s.suppressed && !s.extinguished);
}

function isLevelComplete() {
    const playable = getPlayableStars();
    if (playable.length <= 1) return true;
    return !hasConnectablePair();
}

function allStarsUnavailableForDrawing() {
    if (!Array.isArray(fieldStars) || fieldStars.length === 0) return false;
    for (const star of fieldStars) {
        if (!star) continue;
        if (!star.locked && !star.suppressed && !star.extinguished) return false;
    }
    return true;
}

// =============================================================================
// РАССТОЯНИЯ (P-01: поле ограничено по обеим осям, wrap убран полностью)
// =============================================================================

/**
 * Обычное евклидово расстояние между точками.
 * До P-01 здесь был периодический (wrap) расчёт по X — поле теперь ограничено
 * по обеим осям, так что имя сохранено (используется по всему коду), но
 * периодичность убрана.
 */
function horizontalWrapDist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
}

/**
 * До P-01 возвращала ближайшую периодическую копию точки по X (wrap).
 * Wrap убран — копий больше нет, возвращаем точку как есть.
 */
function nearestHorizontalCopy(px, py, targetX, targetY) {
    return { x: px, y: py };
}

// =============================================================================
// DAILY SKY (персональный seed: playerId + эффективная дата)
// =============================================================================

let dailyTargetShapes = [];

function hashStringToSeed(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h);
}

function getLocalCalendarSkyDateInt() {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** @deprecated use getEffectiveSkyDateInt */
function getLocalCalendarSkySeed() {
    return getLocalCalendarSkyDateInt();
}

function addDaysToSkyDateInt(dateInt, days) {
    const y = Math.floor(dateInt / 10000);
    const m = Math.floor((dateInt % 10000) / 100);
    const day = dateInt % 100;
    const date = new Date(y, m - 1, day);
    date.setDate(date.getDate() + days);
    return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

// T-01: единственный шов, через который тестовый харнесс (`?test=1`, testApi.js)
// фиксирует дату неба — от неё зависят раскладка поля, дневные цели и воскресная
// картинка. Вне харнесса всегда null, расчёт обычный (dev-режим ходит по дням
// через devDayOffset и этот шов не трогает).
let testSkyDateOverride = null;

function setTestSkyDateOverride(dateInt) {
    testSkyDateOverride = (typeof dateInt === 'number' && Number.isFinite(dateInt))
        ? Math.floor(dateInt)
        : null;
}

function getEffectiveSkyDateInt() {
    if (testSkyDateOverride !== null) return testSkyDateOverride;
    const offset = typeof getDevDayOffset === 'function' ? getDevDayOffset() : 0;
    if (offset <= 0) return getLocalCalendarSkyDateInt();
    return addDaysToSkyDateInt(getLocalCalendarSkyDateInt(), offset);
}

function getPersonalDailySeed() {
    ensurePlayerId();
    return hashStringToSeed(`${playerId}:${getEffectiveSkyDateInt()}`);
}

/** Вызывать сразу перед generateStars / generateBackgroundStars (p5 random). */
function seedSkyRandomForToday() {
    randomSeed(getPersonalDailySeed());
}

function shuffleArrayInPlace(arr, seedKey) {
    randomSeed(hashStringToSeed(seedKey));
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(random(0, i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
}

function pickDailyTargets() {
    let pool = getUncreatedUnlockedShapeNames();
    const effectiveDate = getEffectiveSkyDateInt();
    const seedKey = `${ensurePlayerId()}:${effectiveDate}:targets`;

    if (pool.length < 2) {
        const fallback = getUnlockedAtlasShapeNames();
        for (const name of fallback) {
            if (!pool.includes(name)) pool.push(name);
        }
    }

    shuffleArrayInPlace(pool, seedKey);

    dailyTargetShapes = pool.slice(0, Math.min(2, pool.length));
    return dailyTargetShapes;
}

function getDailyTargetShapes() {
    return dailyTargetShapes.slice();
}

function isDailyTargetShape(shapeName) {
    const normalized = typeof shapeName === 'string' ? shapeName.trim() : '';
    return dailyTargetShapes.includes(normalized);
}

function createAnchorFieldStar(id, x, y, anchorShape) {
    const star = createGeneratedFieldStar(id, x, y);
    star.isDailyAnchor = true;
    star.anchorShape = anchorShape;
    star.extinguished = false;
    return star;
}

function injectAnchorStarsForTargets(targets) {
    if (!Array.isArray(targets) || targets.length === 0) return;

    const effectiveDate = getEffectiveSkyDateInt();
    const minX = STAR_EDGE_MARGIN;
    const maxX = FIELD_WIDTH - STAR_EDGE_MARGIN;
    const minY = STAR_EDGE_MARGIN;
    const maxY = FIELD_HEIGHT - STAR_EDGE_MARGIN;

    for (let t = 0; t < targets.length; t++) {
        const shapeName = targets[t];
        const pattern = SHAPE_PATTERNS && SHAPE_PATTERNS[shapeName];
        if (!pattern || !Array.isArray(pattern.stars)) continue;

        const anchorSeed = hashStringToSeed(`${ensurePlayerId()}:${effectiveDate}:anchor:${shapeName}`);
        randomSeed(anchorSeed);
        const cx = random(minX + 180, maxX - 180);
        const cy = random(minY + 120, maxY - 120);
        const scale = random(200, 340);
        const yAnchor = 0.5;

        for (const pt of pattern.stars) {
            const px = pt[0];
            const py = pt[1];
            let x = cx + (px - 0.5) * scale;
            let y = cy + (py - yAnchor) * scale;

            let tooClose = false;
            for (const existing of fieldStars) {
                if (dist(x, y, existing.x, existing.y) < MIN_STAR_DISTANCE * 0.85) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) {
                x += random(-40, 40);
                y += random(-40, 40);
            }

            const id = fieldStars.length;
            fieldStars.push(createAnchorFieldStar(id, x, y, shapeName));
        }
    }

    recomputeSuppressedStars();
}

function generateDailyField() {
    // C-02: штатный воскресный показ (если нет ручного override — он выше по коду).
    const scheduledId = getScheduledPictureFieldId();
    if (scheduledId) {
        generatePictureField(scheduledId);
        dailyTargetShapes = [];
        assignStarAppearDelays();
        generateBackgroundStars();
        if (typeof console !== 'undefined' && console.info) {
            console.info('[picture] Воскресная картинка:', scheduledId);
        }
        return;
    }

    seedSkyRandomForToday();
    generateStars();
    pickDailyTargets();
    if (INJECT_ANCHOR_STARS) {
        injectAnchorStarsForTargets(dailyTargetShapes); // dead code — INJECT_ANCHOR_STARS=false
    }
    assignStarAppearDelays();
    generateBackgroundStars();

    if (typeof console !== 'undefined' && console.info) {
        console.info('[daily] effectiveDate:', getEffectiveSkyDateInt(), 'targets:', dailyTargetShapes);
    }
}

// =============================================================================
// STAR GENERATION (uniform distribution with min distance)
// =============================================================================

function createGeneratedFieldStar(id, x, y) {
    return {
        id,
        x,
        y,
        locked: false,
        suppressed: false,
        extinguished: random(1) < EXTINGUISHED_STAR_CHANCE,
        sizeFactor: random(STAR_SIZE_VARIATION_MIN, STAR_SIZE_VARIATION_MAX),
        colorValue: pickRandomStarColorValue()
    };
}

function isDevModeEnabled() {
    try {
        if (typeof window !== 'undefined' && window.location && window.location.search) {
            const q = new URLSearchParams(window.location.search);
            if (q.get('dev') === '1') return true;
        }
    } catch (e) { /* ignore */ }
    return false;
}

// =============================================================================
// PICTURE FIELD (C-02): поле из готовой раскладки позиций+цветов звёзд.
// Приоритет источника: dev-панель (devPictureFieldId) → URL ?picture=<id|index>.
// =============================================================================

/** Выбранная в dev-панели картинка (перебивает URL); null = не выбрана. */
let devPictureFieldId = null;

function setDevPictureFieldId(id) {
    devPictureFieldId = id || null;
}

function getDevPictureFieldId() {
    return devPictureFieldId;
}

/** Разбор ?picture=<id|index>: имя картинки, числовой индекс или пусто. */
function getPictureFieldIdFromUrl() {
    try {
        if (typeof window !== 'undefined' && window.location && window.location.search) {
            const raw = new URLSearchParams(window.location.search).get('picture');
            if (raw === null || raw === '') return null;
            if (typeof getPictureFieldById === 'function' && getPictureFieldById(raw)) return raw;
            if (Array.isArray(typeof PICTURE_FIELD_IDS !== 'undefined' ? PICTURE_FIELD_IDS : null)) {
                const idx = parseInt(raw, 10);
                if (Number.isInteger(idx) && idx >= 0 && idx < PICTURE_FIELD_IDS.length) {
                    return PICTURE_FIELD_IDS[idx];
                }
                if (PICTURE_FIELD_IDS.length > 0) return PICTURE_FIELD_IDS[0]; // ?picture=1/on/true
            }
        }
    } catch (e) { /* ignore */ }
    return null;
}

/** id активной картинки (dev имеет приоритет) или null. */
function getActivePictureFieldId() {
    if (devPictureFieldId && typeof getPictureFieldById === 'function' && getPictureFieldById(devPictureFieldId)) {
        return devPictureFieldId;
    }
    return getPictureFieldIdFromUrl();
}

function shouldLoadPictureField() {
    return getActivePictureFieldId() !== null;
}

function createPictureFieldStar(id, x, y, colorValue, extinguished) {
    return {
        id,
        x,
        y,
        locked: false,
        suppressed: false,
        extinguished: !!extinguished,
        sizeFactor: random(STAR_SIZE_VARIATION_MIN, STAR_SIZE_VARIATION_MAX),
        colorValue: normalizeStarColorValue(colorValue)
    };
}

/** Построить fieldStars из пресета картинки (позиции/цвета/extinguished фиксированы). */
function generatePictureField(pictureId) {
    const id = pictureId || getActivePictureFieldId();
    const pic = typeof getPictureFieldById === 'function' ? getPictureFieldById(id) : null;
    if (!pic || !Array.isArray(pic.stars) || pic.stars.length === 0) {
        // Нет валидной картинки — откат к обычной генерации.
        generateStars();
        return;
    }

    fieldStars = [];
    const usableW = FIELD_WIDTH - 2 * STAR_EDGE_MARGIN;
    const usableH = FIELD_HEIGHT - 2 * STAR_EDGE_MARGIN;

    for (let i = 0; i < pic.stars.length; i++) {
        const p = pic.stars[i];
        const nx = Math.max(0, Math.min(1, p.x));
        const ny = Math.max(0, Math.min(1, p.y));
        const wx = STAR_EDGE_MARGIN + nx * usableW;
        const wy = STAR_EDGE_MARGIN + ny * usableH;
        fieldStars.push(createPictureFieldStar(i, wx, wy, p.c, p.ext));
    }

    recomputeSuppressedStars();

    if (typeof console !== 'undefined' && console.info) {
        console.info('[picture] Поле-картинка:', id, '(', pic.name, ') звёзд:', fieldStars.length);
    }
}

// --- Штатный воскресный показ --------------------------------------------
// Каждое воскресенье процедурное поле заменяется случайной силуэтной картинкой.
// Выбор детерминирован по (playerId + воскресная дата), поэтому ресет/перезаход
// в тот же день дают ту же картинку. Ручной override (dev/URL) перебивает это
// выше по коду (см. shouldLoadPictureField в точках генерации).

const PICTURE_SUNDAY_ENABLED = true;

/** День недели эффективного неба: 0 = воскресенье. */
function getSkyWeekdayFromEffectiveDate() {
    const dateInt = getEffectiveSkyDateInt();
    const y = Math.floor(dateInt / 10000);
    const m = Math.floor((dateInt % 10000) / 100);
    const d = dateInt % 100;
    return new Date(y, m - 1, d).getDay();
}

/** id картинки для штатного показа (только по воскресеньям) или null. */
function getScheduledPictureFieldId() {
    if (!PICTURE_SUNDAY_ENABLED) return null;
    if (typeof PICTURE_FIELD_IDS === 'undefined' || !Array.isArray(PICTURE_FIELD_IDS) || PICTURE_FIELD_IDS.length === 0) return null;
    if (getSkyWeekdayFromEffectiveDate() !== 0) return null;
    const seed = hashStringToSeed(`${ensurePlayerId()}:${getEffectiveSkyDateInt()}:picture`);
    const idx = seed % PICTURE_FIELD_IDS.length;
    return PICTURE_FIELD_IDS[idx];
}

function generateStars() {
    fieldStars = [];
    const minX = STAR_EDGE_MARGIN;
    const maxX = FIELD_WIDTH - STAR_EDGE_MARGIN;
    const minY = STAR_EDGE_MARGIN;
    const maxY = FIELD_HEIGHT - STAR_EDGE_MARGIN;
    const maxAttempts = 500;

    for (let id = 0; id < TOTAL_STAR_COUNT; id++) {
        let placed = false;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const sx = random(minX, maxX);
            const sy = random(minY, maxY);

            let tooClose = false;
            for (let existing of fieldStars) {
                if (dist(sx, sy, existing.x, existing.y) < MIN_STAR_DISTANCE) {
                    tooClose = true;
                    break;
                }
            }

            if (!tooClose) {
                fieldStars.push(createGeneratedFieldStar(id, sx, sy));
                placed = true;
                break;
            }
        }

        if (!placed) {
            fieldStars.push(createGeneratedFieldStar(id, random(minX, maxX), random(minY, maxY)));
        }
    }

    recomputeSuppressedStars();
}

// =============================================================================
// STAR FADE-IN
// =============================================================================

/**
 * Пер-звёздный проход после позиционирования и до фоновых звёзд: задержка
 * появления и параметры дыхания (K-03). Одна точка входа на все пути генерации
 * поля — обычного, воскресной картинки и dev-сброса.
 */
function assignStarAppearDelays() {
    for (let i = 0; i < fieldStars.length; i++) {
        fieldStars[i].appearDelay = random(0, STAR_APPEAR_DELAY_MAX);
    }
    assignStarTwinkle();
}

// =============================================================================
// K-03: СПОКОЙНОЕ МЕРЦАНИЕ
// =============================================================================
// Дышат только крупные узлы — примерно каждый третий из играбельных; пыль
// неподвижна, а внутри готовой фигуры дыхание гаснет: оттиск сделан, гравюра
// не дышит. Это ещё и подсказка — где построено, там спокойно.

/**
 * Порог «крупного узла»: верхняя TWINKLE_SHARE часть разброса размеров.
 * Считается из STAR_SIZE_VARIATION_*, а не вбит числом, — поменяется разброс,
 * доля дышащих останется той же.
 */
function getTwinkleSizeThreshold() {
    const span = STAR_SIZE_VARIATION_MAX - STAR_SIZE_VARIATION_MIN;
    return STAR_SIZE_VARIATION_MIN + span * (1 - TWINKLE_SHARE);
}

/**
 * Дешёвый детерминированный шум 0..1 от места звезды. Именно от места, а не
 * через `random()`: лишний вызов сдвинул бы seeded-последовательность, и у уже
 * сгенерированных небес поехала бы раскладка фоновых звёзд.
 */
function starTwinkleNoise(star, salt) {
    const v = Math.sin(star.x * 12.9898 + star.y * 78.233 + salt) * 43758.5453;
    return v - Math.floor(v);
}

/** Назначить одной звезде период и фазу дыхания. `twinklePeriodMs = 0` — не дышит. */
function assignStarTwinkleTo(star) {
    if (!star) return;
    const sizeFactor = typeof star.sizeFactor === 'number' ? star.sizeFactor : 1;
    if (sizeFactor < getTwinkleSizeThreshold()) {
        star.twinklePeriodMs = 0;
        star.twinklePhaseMs = 0;
        return;
    }
    const span = TWINKLE_PERIOD_MAX_MS - TWINKLE_PERIOD_MIN_MS;
    star.twinklePeriodMs = TWINKLE_PERIOD_MIN_MS + starTwinkleNoise(star, 0) * span;
    // Своя фаза у каждой — иначе поле задышит в такт, одним общим пульсом.
    star.twinklePhaseMs = starTwinkleNoise(star, 17.13) * star.twinklePeriodMs;
}

function assignStarTwinkle() {
    for (let i = 0; i < fieldStars.length; i++) {
        assignStarTwinkleTo(fieldStars[i]);
    }
}

/** Дышит ли звезда прямо сейчас (крупный узел, свободна и не в фигуре). */
function isTwinklingStar(star) {
    return !!star
        && typeof star.twinklePeriodMs === 'number' && star.twinklePeriodMs > 0
        && !star.locked && !star.suppressed && !star.extinguished;
}

/**
 * Множитель яркости звезды в кадре: 1 − TWINKLE_AMP … 1. Единица = не дышит.
 * Косинус, а не синус, чтобы на стыке периода не было рывка.
 *
 * Со сценами V-12 и V-13 не спорит по построению: обе управляют альфой только
 * тех звёзд, что входят в созвездия, — а такие уже `locked` и не дышат.
 */
function getStarBreathFactor(star, nowMs) {
    if (!isTwinklingStar(star)) return 1;
    const u = ((nowMs % star.twinklePeriodMs) + star.twinklePhaseMs) / star.twinklePeriodMs;
    return 1 - TWINKLE_AMP * (0.5 - 0.5 * Math.cos(u * Math.PI * 2));
}

// =============================================================================
// BACKGROUND STARS
// =============================================================================

function generateBackgroundStars() {
    fieldBackgroundStars = [];
    for (let i = 0; i < BACKGROUND_STAR_COUNT; i++) {
        fieldBackgroundStars.push({
            x: random(0, FIELD_WIDTH),
            y: random(0, FIELD_HEIGHT),
            size: random(1, 2.5),
            alpha: random(40, 120),
            phase: random(TWO_PI)
        });
    }
}

// =============================================================================
// CAMERA INITIAL POSITION
// =============================================================================

function centerCamera() {
    // U-08: старт/ресет уровня и новое небо открываются в полном отзуме —
    // всё поле в кадре, игрок сам приближается при желании.
    zoomLevel = getMinZoomLevel();
    clampZoomToField();
    const usableH = typeof getUsableViewHeight === 'function' ? getUsableViewHeight() : height;
    camX = FIELD_WIDTH / 2 - (width / zoomLevel) / 2;
    // U-09: центрируем поле в полосе над свёрнутой шторкой, а не в полном канвасе
    camY = FIELD_HEIGHT / 2 - (usableH / zoomLevel) / 2;
    clampCamera();
}

// =============================================================================
// STAR LOOKUP HELPERS
// =============================================================================

function getStarById(id) {
    if (id < 0 || id >= fieldStars.length) return null;
    return fieldStars[id];
}

/**
 * @param {number} fieldX
 * @param {number} fieldY
 * @param {{ anchorStar?: object }} [options] — при жесте: только звёзды в радиусе ребра от якоря
 */
function getStarAt(fieldX, fieldY, options) {
    const CLICK_RADIUS = STAR_SIZE * STAR_HIT_RADIUS_MULT;
    const anchorStar = options && options.anchorStar ? options.anchorStar : null;
    const maxEdge = anchorStar ? getMaxEdgeLength() : Infinity;

    let best = null;
    let bestD = CLICK_RADIUS;
    for (let star of fieldStars) {
        if (!star || star.locked || star.suppressed || star.extinguished) continue;
        if (anchorStar && horizontalWrapDist(anchorStar.x, anchorStar.y, star.x, star.y) > maxEdge + 1e-6) {
            continue;
        }
        const d = horizontalWrapDist(fieldX, fieldY, star.x, star.y);
        if (d < bestD) {
            bestD = d;
            best = star;
        }
    }
    return best;
}

function distancePointToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq === 0) {
        return dist(px, py, ax, ay);
    }
    let t = ((px - ax) * abx + (py - ay) * aby) / abLenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + abx * t;
    const cy = ay + aby * t;
    return dist(px, py, cx, cy);
}

function collectConstellationStarIds(constellation) {
    const ids = new Set();
    for (const seg of constellation.lines || []) {
        ids.add(seg.startId);
        ids.add(seg.endId);
    }
    return ids;
}

/** Замкнутый n-угольник по рёбрам (все степени 2); иначе null. */
function tryGetClosedPolygonVertices(constellation) {
    const ids = collectConstellationStarIds(constellation);
    const n = ids.size;
    const lines = constellation.lines || [];
    if (n < 3 || lines.length !== n) return null;

    const adj = {};
    for (const id of ids) adj[id] = [];
    for (const seg of lines) {
        if (!ids.has(seg.startId) || !ids.has(seg.endId)) return null;
        adj[seg.startId].push(seg.endId);
        adj[seg.endId].push(seg.startId);
    }
    for (const id of ids) {
        if (adj[id].length !== 2) return null;
    }

    const startId = [...ids][0];
    const orderedIds = [startId];
    let prev = null;
    let cur = startId;
    for (let i = 1; i < n; i++) {
        const neighbors = adj[cur];
        const next = neighbors.find(nb => nb !== prev);
        if (next === undefined) return null;
        orderedIds.push(next);
        prev = cur;
        cur = next;
    }
    if (!adj[cur].includes(startId)) return null;

    const verts = [];
    for (const id of orderedIds) {
        const s = getStarById(id);
        if (!s) return null;
        verts.push({ x: s.x, y: s.y });
    }
    return verts;
}

function cross2(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Выпуклая оболочка; при < 3 вершинах после сжатия — null. */
function convexHull(points) {
    if (!points || points.length === 0) return null;
    const uniq = [];
    const seen = new Set();
    for (const p of points) {
        const key = `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniq.push({ x: p.x, y: p.y });
    }
    if (uniq.length < 3) return null;

    uniq.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
    const lower = [];
    for (const p of uniq) {
        while (lower.length >= 2 && cross2(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
            lower.pop();
        }
        lower.push(p);
    }
    const upper = [];
    for (let i = uniq.length - 1; i >= 0; i--) {
        const p = uniq[i];
        while (upper.length >= 2 && cross2(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
            upper.pop();
        }
        upper.push(p);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
}

function getConstellationInteriorPolygon(constellation) {
    const closed = tryGetClosedPolygonVertices(constellation);
    if (closed && closed.length >= 3) return closed;

    const ids = collectConstellationStarIds(constellation);
    const pts = [];
    for (const id of ids) {
        const s = getStarById(id);
        if (s) pts.push({ x: s.x, y: s.y });
    }
    return convexHull(pts);
}

function pointInPolygon(x, y, poly) {
    if (!poly || poly.length < 3) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x;
        const yi = poly[i].y;
        const xj = poly[j].x;
        const yj = poly[j].y;
        const denom = (yj - yi);
        const intersect = (yi > y) !== (yj > y) &&
            x < (denom === 0 ? xi : (xj - xi) * (y - yi) / denom + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function recomputeSuppressedStars() {
    const committedConstellations = Array.isArray(constellations) ? constellations : [];
    for (const star of fieldStars) {
        if (!star) continue;
        if (star.extinguished) {
            star.suppressed = false;
            continue;
        }
        if (star.locked) {
            star.suppressed = false;
            continue;
        }

        let suppressed = false;

        for (const neighbor of fieldStars) {
            if (!neighbor || !neighbor.locked) continue;
            if (dist(star.x, star.y, neighbor.x, neighbor.y) <= STAR_SUPPRESSION_LOCKED_RADIUS) {
                suppressed = true;
                break;
            }
        }

        if (!suppressed) {
            for (const constellation of committedConstellations) {
                for (const seg of constellation.lines || []) {
                    const start = getStarById(seg.startId);
                    const end = getStarById(seg.endId);
                    if (!start || !end) continue;
                    const lineDistance = distancePointToSegment(star.x, star.y, start.x, start.y, end.x, end.y);
                    if (lineDistance <= STAR_SUPPRESSION_LINE_RADIUS) {
                        suppressed = true;
                        break;
                    }
                }
                if (suppressed) break;
            }
        }

        if (!suppressed) {
            for (const constellation of committedConstellations) {
                const poly = getConstellationInteriorPolygon(constellation);
                if (poly && pointInPolygon(star.x, star.y, poly)) {
                    suppressed = true;
                    break;
                }
            }
        }

        star.suppressed = suppressed;
    }
}

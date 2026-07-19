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

function getEffectiveSkyDateInt() {
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

function shouldLoadMustachePracticeLevel() {
    if (typeof DEBUG_MUSTACHE_PRACTICE_FORCE !== 'undefined' && DEBUG_MUSTACHE_PRACTICE_FORCE) return true;
    try {
        if (typeof window !== 'undefined' && window.location && window.location.search) {
            const q = new URLSearchParams(window.location.search);
            if (q.get('mustache') === '1') return true;
        }
    } catch (e) { /* ignore */ }
    return false;
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

function createMustachePracticeAnchorStar(id, x, y) {
    return {
        id,
        x,
        y,
        locked: false,
        suppressed: false,
        extinguished: false,
        sizeFactor: 1.35,
        colorValue: pickRandomStarColorValue()
    };
}

/** Только 5 звёзд — эталонная M из SHAPE_PATTERNS «Усы» в центре поля (режим `?mustache=1`). */
function generateStarsMustachePractice() {
    const pattern = SHAPE_PATTERNS && SHAPE_PATTERNS['Усы'] && Array.isArray(SHAPE_PATTERNS['Усы'].stars)
        ? SHAPE_PATTERNS['Усы'].stars
        : [[0.05, 0.5], [0.26, 0.38], [0.5, 0.52], [0.74, 0.38], [0.95, 0.5]];
    const cx = FIELD_WIDTH / 2;
    const cy = FIELD_HEIGHT / 2;
    const scaleX = 520;
    const scaleY = 200;
    const yAnchor = 0.45;

    fieldStars = [];
    const nAnchor = Math.min(5, pattern.length);
    for (let id = 0; id < nAnchor; id++) {
        const px = pattern[id][0];
        const py = pattern[id][1];
        const x = cx + (px - 0.5) * scaleX;
        const y = cy + (py - yAnchor) * scaleY;
        fieldStars.push(createMustachePracticeAnchorStar(id, x, y));
    }

    recomputeSuppressedStars();

    if (typeof console !== 'undefined' && console.log) {
        console.log(
            '[mustache=1] На поле только 5 звёзд в центре. Соедините по порядку слева направо: 0→1→2→3→4 (4 отрезка), затем подтвердите созвездие.'
        );
    }
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

/** Назначить каждой звезде задержку появления (после позиционирования, до фоновых звёзд). */
function assignStarAppearDelays() {
    for (let i = 0; i < fieldStars.length; i++) {
        fieldStars[i].appearDelay = random(0, STAR_APPEAR_DELAY_MAX);
    }
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
    camX = FIELD_WIDTH / 2 - (width / zoomLevel) / 2;
    camY = FIELD_HEIGHT / 2 - (height / zoomLevel) / 2;
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
